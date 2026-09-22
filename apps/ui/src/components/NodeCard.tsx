import { useEffect, useMemo, useState } from "react";

import {
  type DeployStep,
  type ServiceName,
  type StatusResponse,
} from "@dnsmasq-ha/contract";

import { AgentClient, ApiError, describeError } from "../api";
import type { StoredNode } from "../types";
import { ConfigEditor } from "./ConfigEditor";

interface Props {
  node: StoredNode;
  onEdit: () => void;
  onRemove: () => void;
}

/** Word for a boolean service state: yes / no / unknown. */
function stateWord(value: boolean | null): string {
  return value === true ? "yes" : value === false ? "no" : "unknown";
}

/** Dot class for a boolean service state: green / red / quiet. */
function dotClass(value: boolean | null): string {
  return value === true ? "dot ok" : value === false ? "dot bad" : "dot";
}

/** Dashboard card for one node: status, deploy controls and config editors. */
export function NodeCard({ node, onEdit, onRemove }: Props) {
  const client = useMemo(
    () => new AgentClient(node.baseUrl, node.token),
    [node.baseUrl, node.token],
  );

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [role, setRole] = useState<"master" | "backup">("master");
  const [deploying, setDeploying] = useState(false);
  const [deploySteps, setDeploySteps] = useState<DeployStep[] | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

  const [service, setService] = useState<ServiceName>("keepalived");

  const refresh = async () => {
    setStatusError(null);
    try {
      setStatus(await client.status());
    } catch (err) {
      setStatus(null);
      setStatusError(describeError(err));
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const runDeploy = async () => {
    setDeploying(true);
    setDeployError(null);
    setDeploySteps(null);
    try {
      const result = await client.deploy(role);
      setDeploySteps(result.steps);
      await refresh();
    } catch (err) {
      setDeployError(describeError(err));
      // Surface the per-command step log returned by a failed deployment.
      const steps =
        err instanceof ApiError
          ? (err.body as { steps?: DeployStep[] } | undefined)?.steps
          : undefined;
      if (steps && steps.length > 0) setDeploySteps(steps);
    } finally {
      setDeploying(false);
    }
  };

  const endpoint = node.baseUrl.replace(/^https?:\/\//, "");

  return (
    <article className="card node">
      <header className="node-head">
        <div className="node-id">
          <h2>{node.name}</h2>
          <code className="endpoint">{endpoint}</code>
        </div>
        <div className="actions">
          <button className="ghost" onClick={onEdit}>
            Edit
          </button>
          <button className="danger" onClick={onRemove}>
            Remove
          </button>
        </div>
      </header>

      <div className="node-body">
        <section className="block">
          <div className="status-head">
            <h3>Status</h3>
            <button className="link" onClick={() => void refresh()}>
              refresh
            </button>
          </div>
          {statusError && <p className="error">{statusError}</p>}
          {!status && !statusError && (
            <p className="connecting">Connecting…</p>
          )}
          {status && (
            <>
              <div className="svc">
                <span className={dotClass(status.services.dnsmasq.active)} />
                <span className="svc-name">dnsmasq</span>
                <span className="svc-state">
                  {status.services.dnsmasq.active
                    ? "running"
                    : status.services.dnsmasq.active === false
                      ? "stopped"
                      : "unknown"}
                </span>
                <span className="svc-state off">
                  enabled: {stateWord(status.services.dnsmasq.enabled)}
                </span>
              </div>
              <div className="svc">
                <span className={dotClass(status.services.keepalived.active)} />
                <span className="svc-name">keepalived</span>
                <span className="svc-state">
                  {status.services.keepalived.active
                    ? "running"
                    : status.services.keepalived.active === false
                      ? "stopped"
                      : "unknown"}
                </span>
                <span className="svc-state off">
                  enabled: {stateWord(status.services.keepalived.enabled)}
                </span>
              </div>
              <div className="cluster-meta">
                <span
                  className={`role-tag ${status.keepalivedState.toLowerCase()}`}
                >
                  state {status.keepalivedState}
                </span>
                <span className="vip">
                  <span className="dot amber" />
                  {status.vip ?? <span className="unset">no VIP configured</span>}
                </span>
              </div>
            </>
          )}
        </section>

        <section className="block">
          <h3>Deploy</h3>
          <div className={`deploy-row${deploying ? " deploying" : ""}`}>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "master" | "backup")}
              disabled={deploying}
              aria-label="Deploy role"
            >
              <option value="master">master</option>
              <option value="backup">backup</option>
            </select>
            <button onClick={() => void runDeploy()} disabled={deploying}>
              {deploying && <span className="pulse-dot" aria-hidden="true" />}
              {deploying ? "Deploying…" : `Deploy as ${role}`}
            </button>
          </div>
          <p className="deploy-note">
            Installs dnsmasq and keepalived, writes the {role} keepalived
            template if missing, then enables and starts both services. First
            run can take a few minutes.
          </p>
          {deployError && <p className="error">Deployment failed: {deployError}</p>}
          {deploySteps && (
            <div className="terminal">
              {deploySteps.map((step, index) => (
                <div
                  key={index}
                  className={`term-row ${step.ok ? "ok" : "bad"}`}
                >
                  <span className="mark">{step.ok ? "ok" : "failed"}</span>
                  <span className="cmd">  $ {step.command}</span>
                  {step.output && <pre>{step.output}</pre>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="block">
          <h3>Configuration</h3>
          <div className="tabs">
            {(["keepalived", "dnsmasq"] as ServiceName[]).map((name) => (
              <button
                key={name}
                className={`tab${service === name ? " active" : ""}`}
                onClick={() => setService(name)}
              >
                {name === "keepalived" ? "keepalived.conf" : "dnsmasq.conf"}
              </button>
            ))}
          </div>
          <ConfigEditor key={service} client={client} service={service} />
        </section>
      </div>
    </article>
  );
}
