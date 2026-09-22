import { useEffect, useState } from "react";

import { loadNodes, saveNodes } from "./storage";
import type { StoredNode } from "./types";
import { NodeCard } from "./components/NodeCard";
import { NodeForm } from "./components/NodeForm";

const AGENT_INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/taiojia/dnsmasq-ha/master/scripts/install-agent.sh | bash";

export default function App() {
  const [nodes, setNodes] = useState<StoredNode[]>(() => loadNodes());
  const [editing, setEditing] = useState<StoredNode | null>(null);

  useEffect(() => {
    saveNodes(nodes);
  }, [nodes]);

  const upsert = (node: StoredNode) => {
    setNodes((prev) =>
      prev.some((n) => n.id === node.id)
        ? prev.map((n) => (n.id === node.id ? node : n))
        : [...prev, node],
    );
    setEditing(null);
  };

  const remove = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  return (
    <main className="container">
      <header className="topbar">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#0d141e" />
            <circle cx="9" cy="16" r="4" fill="#2fc6b0" />
            <path d="M13 16h6" stroke="#2fc6b0" strokeWidth="2" />
            <circle cx="23" cy="16" r="3.5" fill="none" stroke="#8ca0b3" strokeWidth="2" />
          </svg>
          <span className="brand-name">dnsmasq-ha</span>
        </div>
        <p className="tagline">Two-node DNS failover control</p>
      </header>

      <NodeForm
        key={editing?.id ?? "new"}
        initial={editing}
        onSubmit={upsert}
        onCancel={editing ? () => setEditing(null) : undefined}
      />

      {nodes.length === 0 ? (
        <div className="empty card">
          <p className="empty-title">No nodes connected yet</p>
          <p className="muted">
            Install the agent on each server, then add its address and token
            above.
          </p>
          <pre className="command">{AGENT_INSTALL_CMD}</pre>
        </div>
      ) : (
        <section className="nodes">
          {nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              onEdit={() => setEditing(node)}
              onRemove={() => remove(node.id)}
            />
          ))}
        </section>
      )}
    </main>
  );
}
