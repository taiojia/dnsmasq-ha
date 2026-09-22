/**
 * Node operations exposed by the agent: status reporting, deployment and
 * config management for dnsmasq and keepalived.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  type ConfigResponse,
  type DeployResponse,
  type DeployStep,
  DNSMASQ_TEMPLATE,
  KEEPALIVED_BACKUP_TEMPLATE,
  KEEPALIVED_MASTER_TEMPLATE,
  type PutConfigRequest,
  type PutConfigResponse,
  type Role,
  type ServiceName,
  type ServiceStatus,
  type StatusResponse,
} from "@dnsmasq-ha/contract";

import { run } from "./exec.js";

/** Well-known config file per managed service. */
const SERVICE_FILES: Record<ServiceName, string> = {
  dnsmasq: "/etc/dnsmasq.conf",
  keepalived: "/etc/keepalived/keepalived.conf",
};

/** Long timeout for apt operations; deployments can be slow on first run. */
const APT_TIMEOUT_MS = 600_000;

export class DeployError extends Error {
  constructor(public readonly steps: DeployStep[]) {
    super("Deployment failed");
    this.name = "DeployError";
  }
}

// ---------------------------------------------------------------------------
// Config file helpers
// ---------------------------------------------------------------------------

/** Read a managed config file; missing files yield `exists: false`. */
export async function getConfig(service: ServiceName): Promise<ConfigResponse> {
  const filePath = SERVICE_FILES[service];
  try {
    const content = await fsp.readFile(filePath, "utf8");
    return { service, path: filePath, exists: true, content };
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { service, path: filePath, exists: false, content: null };
    }
    throw err;
  }
}

/** Write a file atomically (write to a temp file, then rename over target). */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, content, { mode: 0o644 });
  await fsp.rename(tmp, filePath);
}

/**
 * Update a managed config file and optionally restart its service.
 * Throws when the restart fails so the caller can surface stderr.
 */
export async function putConfig(
  service: ServiceName,
  body: PutConfigRequest,
): Promise<PutConfigResponse> {
  const filePath = SERVICE_FILES[service];
  await atomicWrite(filePath, body.content);

  let restarted = false;
  if (body.restart) {
    const result = await run("systemctl", ["restart", service]);
    if (!result.ok) {
      const detail = (result.stderr || result.stdout || "unknown error").trim();
      throw new Error(`Failed to restart ${service}: ${detail}`);
    }
    restarted = true;
  }
  return { service, path: filePath, restarted };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function extractVip(keepalivedConfig: string): string | null {
  const block = /\bvirtual_ipaddress\s*\{([^}]*)\}/.exec(keepalivedConfig);
  if (!block) return null;
  const ip = /\b(\d{1,3}(?:\.\d{1,3}){3})(?:\/\d+)?/.exec(block[1] ?? "");
  return ip?.[1] ?? null;
}

function extractKeepalivedState(keepalivedConfig: string): StatusResponse["keepalivedState"] {
  const state = /^\s*state\s+(master|backup)\s*$/im.exec(keepalivedConfig);
  const value = state?.[1]?.toUpperCase();
  if (value === "MASTER" || value === "BACKUP") return value;
  return "UNKNOWN";
}

async function systemdIs(
  subcommand: "is-active" | "is-enabled",
  service: string,
  expected: string,
): Promise<boolean | null> {
  const result = await run("systemctl", [subcommand, service]);
  if (result.missing) return null;
  return result.stdout.trim() === expected;
}

async function serviceStatus(service: string): Promise<ServiceStatus> {
  const [active, enabled] = await Promise.all([
    systemdIs("is-active", service, "active"),
    systemdIs("is-enabled", service, "enabled"),
  ]);
  return { active, enabled };
}

/** Collect node status: services, keepalived role (as configured) and VIP. */
export async function getStatus(): Promise<StatusResponse> {
  const [dnsmasq, keepalived] = await Promise.all([
    serviceStatus("dnsmasq"),
    serviceStatus("keepalived"),
  ]);

  let keepalivedConfig = "";
  try {
    keepalivedConfig = await fsp.readFile(SERVICE_FILES.keepalived, "utf8");
  } catch {
    // Config not deployed yet — leave empty so state/VIP report UNKNOWN/null.
  }

  return {
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.arch()}`,
    services: { dnsmasq, keepalived },
    keepalivedState: extractKeepalivedState(keepalivedConfig),
    vip: extractVip(keepalivedConfig),
  };
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

function templateForRole(role: Role): string {
  return role === "master"
    ? KEEPALIVED_MASTER_TEMPLATE
    : KEEPALIVED_BACKUP_TEMPLATE;
}

/**
 * Deploy dnsmasq + keepalived for the given role:
 *   1. apt-get update
 *   2. apt-get install dnsmasq keepalived
 *   3. write the role's keepalived template (only when the file is missing)
 *   4. enable + start, then restart both services
 *
 * Each executed command is recorded so the UI can show what happened.
 */
export async function deploy(role: Role): Promise<DeployResponse> {
  const steps: DeployStep[] = [];

  const record = async (
    command: string,
    args: string[],
    timeoutMs?: number,
  ): Promise<boolean> => {
    const result = await run(command, args, timeoutMs);
    steps.push({
      command: [command, ...args].join(" "),
      ok: result.ok,
      output: `${result.stdout}${result.stderr}`.trim(),
    });
    return result.ok;
  };

  let ok = await record("apt-get", ["update"], APT_TIMEOUT_MS);
  if (ok) {
    ok = await record(
      "apt-get",
      ["install", "-y", "dnsmasq", "keepalived"],
      APT_TIMEOUT_MS,
    );
  }

  let configWritten = false;
  if (ok) {
    const keepalivedFile = SERVICE_FILES.keepalived;
    if (!fs.existsSync(keepalivedFile)) {
      await atomicWrite(keepalivedFile, templateForRole(role));
      configWritten = true;
    }
    ok = await record("systemctl", ["enable", "--now", "dnsmasq", "keepalived"]);
    if (ok) {
      ok = await record("systemctl", ["restart", "dnsmasq", "keepalived"]);
    }
  }

  if (!ok) {
    throw new DeployError(steps);
  }
  return { steps, configWritten };
}
