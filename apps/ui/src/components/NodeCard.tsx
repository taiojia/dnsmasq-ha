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

  const stateBadge = (value: boolean | null, label: string) => (
    <span className={`badge ${value === true ? "ok" : value === false ? "bad" : "unknown"}`}>
      {label}: {value === true ? "yes" : value === false ? "no" : "unknown"}
    </span>
  );

  return (
    <article className="card node">
      <header className="node-header">
        <h2>
          {node.name} <span className="muted">{node.baseUrl}</span>
        </h2>
        <div className="actions">
          <button className="secondary" onClick={onEdit}>
            Edit
          </button>
          <button className="danger" onClick={onRemove}>
            Remove
          </button>
        </div>
      </header>

      <section className="status">
        <h3>
          Status{" "}
          <button className="link" onClick={() => void refresh()}>
            refresh
          </button>
        </h3>
        {statusError && <p className="error">{statusError}</p>}
        {status && (
          <div className="status-grid">
            <div>
              <strong>{status.hostname}</strong>{" "}
              <span className="muted">({status.platform})</span>
            </div>
            <div className="badges">
              {stateBadge(status.services.dnsmasq.active, "dnsmasq active")}
              {stateBadge(status.services.dnsmasq.enabled, "dnsmasq enabled")}
              {stateBadge(status.services.keepalived.active, "keepalived active")}
              {stateBadge(status.services.keepalived.enabled, "keepalived enabled")}
              <span className="badge info">role: {status.keepalivedState.toLowerCase()}</span>
              <span className="badge info">vip: {status.vip ?? "not configured"}</span>
            </div>
          </div>
        )}
      </section>

      <section className="deploy">
        <h3>Deploy</h3>
        <p className="muted">
          Installs dnsmasq + keepalived via apt, writes the {role} keepalived
          template if missing, then enables and starts both services. This can
          take a few minutes on first run.
        </p>
        <div className="actions">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "master" | "backup")}
            disabled={deploying}
          >
            <option value="master">master</option>
            <option value="backup">backup</option>
          </select>
          <button onClick={() => void runDeploy()} disabled={deploying}>
            {deploying ? "Deploying…" : `Deploy as ${role}`}
          </button>
        </div>
        {deployError && <p className="error">Deployment failed: {deployError}</p>}
        {deploySteps && (
          <ol className="steps">
            {deploySteps.map((step, index) => (
              <li key={index} className={step.ok ? "ok" : "bad"}>
                <code>{step.command}</code> — {step.ok ? "ok" : "failed"}
                {step.output && <pre>{step.output}</pre>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="config">
        <h3>Configuration</h3>
        <div className="actions">
          {(["keepalived", "dnsmasq"] as ServiceName[]).map((name) => (
            <button
              key={name}
              className={service === name ? "" : "secondary"}
              onClick={() => setService(name)}
            >
              {name === "keepalived" ? "keepalived.conf" : "dnsmasq.conf"}
            </button>
          ))}
        </div>
        <ConfigEditor key={service} client={client} service={service} />
      </section>
    </article>
  );
}
