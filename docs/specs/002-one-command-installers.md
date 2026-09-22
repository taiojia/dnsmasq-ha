# Spec 002: One-command installers (agent + UI)

- Status: accepted
- Branch/PR: `feature/one-command-installers`

## Problem

Setting up a cluster currently requires ~10 manual steps: installing Node.js on Ubuntu nodes (not preinstalled), cloning the repo, `npm install`, exporting a token, hand-writing a systemd unit — then cloning again on the laptop for the UI. This is too much friction for the product's own good.

## Proposal

Two self-contained bash scripts in `scripts/`, installable via `curl | bash` from the repo itself (no extra infrastructure — `raw.githubusercontent.com/taiojia/dnsmasq-ha/master/...`):

```bash
# Server node (master & backup):
curl -fsSL https://raw.githubusercontent.com/taiojia/dnsmasq-ha/master/scripts/install-agent.sh | bash
# Laptop:
curl -fsSL https://raw.githubusercontent.com/taiojia/dnsmasq-ha/master/scripts/install-ui.sh | bash
```

Both scripts are idempotent (re-run = safe upgrade), elevate with `sudo` internally only where needed, and support `bash -s -- <flags>`.

### `install-agent.sh`

1. Verify git + Node >= 18; auto-install Node 20 via NodeSource when missing/stale (Ubuntu 22.04 ships Node 12).
2. Clone (first run) or fetch + hard-reset (upgrade) the repo to `/opt/dnsmasq-ha` (overridable `--dir`), then `npm ci` (postinstall builds the contract).
3. Write `/etc/dnsmasq-ha/agent.env` (`0600` dir `0700`) with a generated 32-byte hex token on first run; upgrades preserve the existing token unless `--token` is given. `AGENT_PORT` default `8080`.
4. Write `/etc/systemd/system/dnsmasq-ha-agent.service` (`Wants=network-online.target`, `EnvironmentFile`, `Restart=always`, resolved absolute `npm` path) → `daemon-reload` → `enable --now` → restart on upgrade.
5. Print a summary: detected node IP, agent URL, current token, and next steps for the UI.
6. Flags: `--token`, `--port`, `--dir`, `--ref <branch|tag>` (pin), `--purge`, `--uninstall` (disables + removes service and env file; install dir kept unless `--purge`; never prompts on non-tty).

### `install-ui.sh`

1. Verify Node >= 18 (auto-install via NodeSource on Linux with a notice; on macOS delegate to Homebrew if present, otherwise print instructions).
2. Clone/update the repo to `~/.dnsmasq-ha` (`--dir` override) → `npm ci` → `npm run build`.
3. Create launcher `~/.local/bin/dnsmasq-ha-ui`: starts `vite preview` (port 4173, `--port` override) bound to `127.0.0.1` and auto-opens the browser (`xdg-open`/`open`, best effort).
4. Flags: `--port`, `--dir`, `--ref`, `--purge`, `--uninstall`.

### Explicitly out of scope (future specs)

- Prebuilt standalone agent binary (Bun-compiled) + GitHub Actions release pipeline — would remove the server-side Node dependency entirely; the script interface stays the same.
- Agent-served UI (open `http://<node>:8080/` directly, no laptop installer).
- TLS.

## Scope

- In scope: `scripts/install-agent.sh`, `scripts/install-ui.sh`, spec, README "Quick install" section ahead of the manual steps.
- Out of scope: binary releases, agent-served UI, TLS, Windows support, changes to the agent/UI runtime code.

## Acceptance Criteria

- Both scripts pass `bash -n` and run under `set -euo pipefail`.
- On a systemd host: `install-agent.sh` (with `--dir`/`--port` overrides) ends with the service `active`; `GET /api/v1/status` answers 401 without the token and 200 with the token from the env file; a second run upgrades in place keeping the token; `--uninstall` removes the unit and env file and leaves no running service.
- `install-ui.sh` produces a launcher that serves the built UI on the chosen port (verified via HTTP 200) and `--uninstall` removes it.
- Token survives upgrades (regression check), is regenerated only on first install or `--token`.
- README documents both one-liners, flags, and the `bash -s --` argument pattern.
