import { useEffect, useState } from "react";

import {
  type ConfigResponse,
  DNSMASQ_TEMPLATE,
  KEEPALIVED_MASTER_TEMPLATE,
  type ServiceName,
} from "@dnsmasq-ha/contract";

import { AgentClient, describeError } from "../api";

interface Props {
  client: AgentClient;
  service: ServiceName;
}

/** Default content offered when the config file does not exist yet. */
function defaultTemplate(service: ServiceName): string {
  return service === "dnsmasq"
    ? DNSMASQ_TEMPLATE
    : KEEPALIVED_MASTER_TEMPLATE;
}

/** Load, edit and save one config file, restarting its service on save. */
export function ConfigEditor({ client, service }: Props) {
  const [content, setContent] = useState("");
  const [path, setPath] = useState("");
  const [exists, setExists] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    setError(null);
    client
      .getConfig(service)
      .then((config: ConfigResponse) => {
        if (cancelled) return;
        setPath(config.path);
        setExists(config.exists);
        setContent(config.content ?? defaultTemplate(service));
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, service]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await client.putConfig(service, content);
      setExists(true);
      setPath(result.path);
      setMessage(
        `Saved ${result.path}` +
          (result.restarted ? " and restarted the service" : ""),
      );
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editor">
      {loading ? (
        <p className="connecting">Loading configuration…</p>
      ) : (
        <>
          {!exists && (
            <p className="warning">
              {path} does not exist on the node yet — prefilled with a default
              template. Saving will create it.
            </p>
          )}
          <div className="editor-panel">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              rows={18}
              aria-label={`${service} configuration`}
            />
          </div>
          <div className="editor-actions">
            <button
              onClick={() => void save()}
              disabled={saving || !content.trim()}
            >
              {saving ? "Saving…" : "Save & restart service"}
            </button>
            {message && <span className="success">{message}</span>}
            {error && <span className="error">{error}</span>}
          </div>
          {exists && <p className="editor-path">{path}</p>}
        </>
      )}
    </div>
  );
}
