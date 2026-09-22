import type { StoredNode } from "./types";

const STORAGE_KEY = "dnsmasq-ha-nodes";

/** Load the configured nodes from localStorage. */
export function loadNodes(): StoredNode[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StoredNode[]) : [];
  } catch {
    return [];
  }
}

/** Persist the configured nodes to localStorage. */
export function saveNodes(nodes: StoredNode[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
}
