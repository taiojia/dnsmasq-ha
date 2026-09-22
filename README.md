# dnsmasq-ha

dnsmasq failover (keepalived) with a TypeScript management stack.

### Overview

This project deploys [dnsmasq](https://thekelleys.org.uk/dnsmasq/doc.html) with high availability and automatic recovery via keepalived VIP failover. A basic cluster is one dnsmasq **master** and one dnsmasq **backup** node sharing a virtual IP (VIP). This is only for Ubuntu Server.

The project is a TypeScript monorepo with three packages:

| Package | Purpose |
|---------|---------|
| `apps/agent` | Authenticated management agent installed on each cluster node |
| `apps/ui` | Browser UI run on the operator's laptop |
| `packages/contract` | Shared API contract (zod schemas, types, routes, default templates) |

### Architecture

```
┌──────────────────────┐   HTTPS/WSS + token    ┌─────────────────────────┐
│  UI (TS, Vite+React) │ ─────────────────────► │  Agent (TS, Node)       │
│  runs on your laptop │ ◄───────────────────── │  systemd service on     │
└──────────────────────┘   live status stream    │  each node (master+backup)│
                                                 └─────────────────────────┘
```

### Requirements

- **Agent nodes**: Ubuntu Server, Node.js >= 18, root access (the agent runs `apt-get` and writes `/etc` configs)
- **UI**: any modern browser, Node.js >= 18 on the laptop

### Server setup (each node)

```bash
git clone https://github.com/taiojia/dnsmasq-ha.git
cd dnsmasq-ha
npm install

# Provide a token (or omit to have the agent generate one and log it):
export AGENT_TOKEN="pick-a-long-random-secret"
export AGENT_PORT=8080        # optional, default 8080
npm run start:agent
```

The agent must run as root. For a permanent setup use a systemd unit:

```ini
[Unit]
Description=dnsmasq-ha agent
After=network-online.target

[Service]
ExecStart=/usr/bin/npm run start:agent
WorkingDirectory=/opt/dnsmasq-ha
Environment=AGENT_TOKEN=change-me
Restart=always

[Install]
WantedBy=multi-user.target
```

If `AGENT_TOKEN` is not set, the agent reads `AGENT_TOKEN_FILE` (default `~/.dnsmasq-ha/agent-token`) or generates a 32-byte hex token, stores it with `0600` and logs it once — copy that value into the UI.

### Client setup (your laptop)

```bash
git clone https://github.com/taiojia/dnsmasq-ha.git
cd dnsmasq-ha
npm install
npm run dev:ui
```

To serve a production build of the UI instead of the dev server:

```bash
npm run build
npm run preview -w @dnsmasq-ha/ui
```

Open the printed URL (default `http://localhost:5173`), then for each node click **Add a node** and enter the agent URL (`http://<node-ip>:8080`) and its token. From each node card you can:

- **Deploy** dnsmasq + keepalived as `master` or `backup` (installs packages, writes the role's keepalived template if missing, enables and starts services)
- **Edit** `keepalived.conf` and `dnsmasq.conf` with save-and-restart
- **Monitor** service state, configured keepalived role and VIP

### API

All endpoints require `Authorization: Bearer <token>`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/status` | Hostname, service active/enabled state, keepalived role (as configured), VIP |
| POST | `/api/v1/deploy` | `{ "role": "master" \| "backup" }` — install and start services |
| GET | `/api/v1/config/:service` | Read `dnsmasq` or `keepalived` config |
| PUT | `/api/v1/config/:service` | `{ "content": "...", "restart": true }` — atomic write + restart |

### Security notes

- The agent is root-equivalent: keep it on a trusted LAN/VPN only. Never expose the port to the public internet.
- Tokens are compared timing-safe; the token file is created with `0600`.
- TLS is planned in a follow-up spec (see `docs/specs/`).

### Development

```bash
npm install
npm run build        # build contract, typecheck agent, build UI
npm run dev:agent    # agent with watch mode
npm run dev:ui       # Vite dev server
```

Workflow and contribution conventions are documented in [AGENTS.md](AGENTS.md); feature specs live in [docs/specs/](docs/specs/).

### License

[MIT](LICENSE)
