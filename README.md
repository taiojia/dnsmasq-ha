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
┌──────────────────────┐  HTTP + Bearer token   ┌──────────────────────────┐
│  UI (TS, Vite+React) │ ─────────────────────► │  Agent (TS, Node)        │
│  runs on your laptop │ ◄───────────────────── │  systemd service on      │
└──────────────────────┘  status · deploy ·     │  each node               │
                           config (on demand)   │  (master + backup)       │
                                                └──────────────────────────┘
```

> The agent serves plain HTTP today; TLS is planned in a follow-up spec, so keep the agent on a trusted network (see [Security notes](#security-notes)).

### Requirements

- **Agent nodes**: Ubuntu Server, Node.js >= 18, root access (the agent runs `apt-get` and writes `/etc` configs)
- **UI**: any modern browser, Node.js >= 18 on the laptop

### Quick install

Two commands — one on each cluster node, one on your laptop:

```bash
# On each server node (master & backup):
curl -fsSL https://raw.githubusercontent.com/taiojia/dnsmasq-ha/master/scripts/install-agent.sh | bash

# On your laptop:
curl -fsSL https://raw.githubusercontent.com/taiojia/dnsmasq-ha/master/scripts/install-ui.sh | bash
```

- **Agent installer**: installs Node.js 20 if missing, deploys to `/opt/dnsmasq-ha`, registers a systemd service (`dnsmasq-ha-agent`), generates a token, and prints the node URL + token — paste those into the UI.
- **UI installer**: clones the repo to `~/.dnsmasq-ha`, builds the UI, and adds a `dnsmasq-ha-ui` launcher that serves it on `http://127.0.0.1:4173` and opens your browser.
- Re-running an installer upgrades in place and preserves the agent token.

Flags are passed through a pipe with `bash -s --`:

```bash
curl -fsSL https://raw.githubusercontent.com/taiojia/dnsmasq-ha/master/scripts/install-agent.sh | bash -s -- --port 9000 --token mysecret
```

| Flag | Applies to | Meaning |
|------|-----------|---------|
| `--token <tok>` | agent | Set the API token (generated on first install if omitted) |
| `--port <port>` | both | Agent port (default `8080`) / UI preview port (default `4173`) |
| `--dir <path>` | both | Install directory (`/opt/dnsmasq-ha` / `~/.dnsmasq-ha`) |
| `--ref <ref>` | both | Branch or tag to install (default `master`) |
| `--uninstall` | both | Agent: stop + remove service and env file · UI: remove launcher |
| `--purge` | both | With `--uninstall`: also delete the install directory (pass the same `--dir` used at install) |

### Manual setup — server (each node)

```bash
git clone https://github.com/taiojia/dnsmasq-ha.git
cd dnsmasq-ha
npm install

# Provide a token (or omit to have the agent generate one and log it):
export AGENT_TOKEN="pick-a-long-random-secret"
export AGENT_PORT=8080        # optional, default 8080
sudo -E npm run start:agent   # the agent needs root for apt and /etc writes
```

The agent must run as root. For a permanent setup, clone (or move) the repo to the path the unit expects — `/opt/dnsmasq-ha` below; adjust `WorkingDirectory` if you clone elsewhere — and use a systemd unit:

```ini
[Unit]
Description=dnsmasq-ha agent
Wants=network-online.target
After=network-online.target

[Service]
ExecStart=/usr/bin/npm run start:agent
WorkingDirectory=/opt/dnsmasq-ha
# Option A: keep the token in the unit file
Environment=AGENT_TOKEN=change-me
# Option B (recommended): keep it in a root-only env file instead, e.g.
#   sudo install -m 600 /dev/null /etc/dnsmasq-ha/agent.env
#   echo 'AGENT_TOKEN=change-me' | sudo tee /etc/dnsmasq-ha/agent.env
# then uncomment:
#EnvironmentFile=/etc/dnsmasq-ha/agent.env
Restart=always

[Install]
WantedBy=multi-user.target
```

If `AGENT_TOKEN` is not set, the agent reads `AGENT_TOKEN_FILE` (default `~/.dnsmasq-ha/agent-token`) or generates a 32-byte hex token, stores it with `0600` and logs it once — copy that value into the UI.

### Manual setup — laptop

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

Open the printed URL — `http://localhost:5173` for the dev server or `http://localhost:4173` for the production preview — then for each node click **Add a node** and enter the agent URL (`http://<node-ip>:8080`) and its token. From each node card you can:

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
- Tokens are compared in constant time (timing-safe); the token file is created with `0600`.
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
