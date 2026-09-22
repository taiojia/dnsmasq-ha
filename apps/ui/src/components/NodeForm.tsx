import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type { StoredNode } from "../types";

interface Props {
  initial: StoredNode | null;
  onSubmit: (node: StoredNode) => void;
  onCancel?: () => void;
}

/** Add or edit a cluster node (agent address + token). */
export function NodeForm({ initial, onSubmit, onCancel }: Props) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");

  useEffect(() => {
    setName(initial?.name ?? "");
    setBaseUrl(initial?.baseUrl ?? "");
    setToken(initial?.token ?? "");
  }, [initial]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const url = baseUrl.trim().replace(/\/+$/, "");
    if (!url || !token.trim()) return;
    let displayName = name.trim();
    if (!displayName) {
      try {
        displayName = new URL(url).hostname;
      } catch {
        displayName = url;
      }
    }
    onSubmit({
      id: initial?.id ?? crypto.randomUUID(),
      name: displayName,
      baseUrl: url,
      token: token.trim(),
    });
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{initial ? `Edit node: ${initial.name}` : "Add a node"}</h2>
      <div className="form-grid">
        <label>
          Name <span className="muted">(optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="master"
          />
        </label>
        <label>
          Agent URL
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://192.168.1.10:8080"
            required
          />
        </label>
        <label>
          Token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="agent token"
            required
          />
        </label>
      </div>
      <div className="actions">
        <button type="submit">{initial ? "Save node" : "Add node"}</button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
