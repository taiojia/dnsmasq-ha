import { useEffect, useState } from "react";

import { loadNodes, saveNodes } from "./storage";
import type { StoredNode } from "./types";
import { NodeCard } from "./components/NodeCard";
import { NodeForm } from "./components/NodeForm";

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
      <header>
        <h1>dnsmasq-ha</h1>
        <p className="subtitle">
          High-availability dnsmasq cluster management — configure the address
          and token of each node's agent, then deploy and manage it from here.
        </p>
      </header>

      <NodeForm
        key={editing?.id ?? "new"}
        initial={editing}
        onSubmit={upsert}
        onCancel={editing ? () => setEditing(null) : undefined}
      />

      {nodes.length === 0 ? (
        <p className="empty">
          No nodes configured yet. Add the agent address and token of your
          master and backup nodes above.
        </p>
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
