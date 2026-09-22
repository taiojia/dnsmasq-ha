# Spec 001: TypeScript rewrite (agent + UI)

- Status: accepted
- Branch/PR: `feature/ts-rewrite`

## Problem

The current deployment tool is a Python 2 script (EOL since January 2020) that must be run manually on each node over SSH. There is no way to inspect or configure a running cluster, and Python 2 cannot be maintained going forward.

## Proposal

Rewrite the project entirely in TypeScript as three packages in one npm-workspaces monorepo. Single admin, no multi-tenancy. The operator installs the agent on the two cluster nodes, then the UI (run on the operator's laptop) is configured with each node's address + token and manages the servers from there.

- `apps/agent` — a Node.js service installed on each dnsmasq/keepalived node. Exposes an authenticated HTTP API (Bearer token):
  - `GET /api/v1/status` — hostname, service active/enabled state, keepalived configured state (MASTER/BACKUP), VIP
  - `POST /api/v1/deploy` — install dnsmasq + keepalived via apt for a given role (`master`/`backup`), write the role's keepalived template when the config file is missing, enable and start services
  - `GET /api/v1/config/:service` — read `/etc/dnsmasq.conf` or `/etc/keepalived/keepalived.conf`
  - `PUT /api/v1/config/:service` — atomically write the config, optionally restart the service
- `apps/ui` — a browser UI (React + Vite) run on the operator's laptop. Stores node entries (name, base URL, token) in localStorage, shows a status dashboard, runs deployments, and edits configs.
- `packages/contract` — shared zod schemas, TypeScript types, API route constants, and default config templates used by both sides.

Token handling: `AGENT_TOKEN` env var → `AGENT_TOKEN_FILE` (default `~/.dnsmasq-ha/agent-token`) → auto-generated (hex, 32 bytes), stored with `0600` and logged once. Comparison is timing-safe. The agent runs as root (needs apt and writes to `/etc`).

Out of scope for this spec: TLS (the token assumes a trusted LAN/VPN; tracked for a later spec), multi-user/role-based access, desktop packaging (Tauri), multi-cluster management, DNS record management UI.

## Scope

- In scope: monorepo scaffold, contract package, agent service with token auth, browser UI, embedded default config templates (replacing `conf/`), README rewrite, removal of the legacy Python 2 code.
- Out of scope: TLS/HTTPS, multi-user auth, metrics/monitoring, DNS record editing.

## Acceptance Criteria

- `npm install && npm run build` succeeds from the repo root.
- Agent rejects requests without a token or with a wrong token (401) and answers `GET /api/v1/status` with the correct token.
- `GET/PUT /api/v1/config/:service` maps `dnsmasq` → `/etc/dnsmasq.conf` and `keepalived` → `/etc/keepalived/keepalived.conf`; PUT is atomic and restarts the service when requested.
- `POST /api/v1/deploy` installs packages, writes the role's keepalived template only when the file is missing, and enables/starts both services; each step's command and output are returned.
- UI can store two nodes (URL + token), show status, deploy with a role, and edit both config files with save-and-restart.
- Legacy Python files and `conf/` templates are removed; README documents the new architecture and all docs/comments are in English.
