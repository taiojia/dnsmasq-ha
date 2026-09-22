/**
 * Token handling for the agent API.
 *
 * Resolution order:
 *   1. AGENT_TOKEN environment variable
 *   2. AGENT_TOKEN_FILE (default: ~/.dnsmasq-ha/agent-token)
 *   3. Auto-generate a 32-byte hex token, persist it with 0600 and log it once
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_TOKEN_FILE = path.join(
  os.homedir(),
  ".dnsmasq-ha",
  "agent-token",
);

/** Load the API token from env/file or generate and persist a new one. */
export function loadOrCreateToken(env: NodeJS.ProcessEnv = process.env): {
  token: string;
  source: "env" | "file" | "generated";
  file: string | null;
} {
  const fromEnv = env.AGENT_TOKEN?.trim();
  if (fromEnv) {
    return { token: fromEnv, source: "env", file: null };
  }

  const file = env.AGENT_TOKEN_FILE?.trim() || DEFAULT_TOKEN_FILE;
  try {
    const fromFile = fs.readFileSync(file, "utf8").trim();
    if (fromFile) {
      return { token: fromFile, source: "file", file };
    }
  } catch {
    // Fall through to generation.
  }

  const generated = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${generated}\n`, { mode: 0o600 });
  return { token: generated, source: "generated", file };
}

/** Build a timing-safe token verifier. */
export function createVerifier(token: string): (provided: string) => boolean {
  const expected = crypto.createHash("sha256").update(token).digest();
  return (provided: string) => {
    const actual = crypto.createHash("sha256").update(provided).digest();
    return crypto.timingSafeEqual(expected, actual);
  };
}
