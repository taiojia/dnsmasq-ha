# AGENTS.md

Guidance for human contributors and AI coding agents working in this repository.

> **Workflow principle:** Using GitHub Flow and Feature Spec to manage the branch and docs.

## Project Overview

**dnsmasq-ha** deploys [dnsmasq](https://thekelleys.org.uk/dnsmasq/doc.html) with high availability (keepalived VIP failover) and automatic recovery on Ubuntu Server. A basic cluster is one dnsmasq master and one dnsmasq backup node sharing a virtual IP (VIP).

The project is a TypeScript monorepo (npm workspaces, Node.js >= 18). Repository layout:

```
.
├── apps/
│   ├── agent/           # Fastify management agent, installed on each cluster node (systemd)
│   └── ui/              # React + Vite dashboard, runs on the operator's laptop
├── packages/
│   └── contract/        # Shared API contract: zod schemas, types, routes, default templates
├── scripts/             # One-command installers: install-agent.sh, install-ui.sh
├── docs/specs/          # Feature specs (see workflow below)
└── README.md
```

## Workflow: GitHub Flow

All changes — code, docs, and specs — go through [GitHub Flow](https://docs.github.com/en/get-started/using-github-flow):

1. **Branch** from the latest `master`. Use a short, descriptive name prefixed by type:
   - `feature/<topic>` — new functionality
   - `fix/<topic>` — bug fixes
   - `docs/<topic>` — documentation only
2. **Commit** small, focused changes with imperative subject lines, e.g. `Add keepalived priority tuning`.
3. **Open a Pull Request** against `master` early (drafts are welcome) and describe what changed and why.
4. **Review & iterate**: address feedback with additional commits on the same branch.
5. **Merge with a squash merge** (`gh pr merge --squash --delete-branch`) so each PR lands as exactly one commit on `master`; reference the PR number in the subject, e.g. `Add one-command installers for agent and UI (#4)`.
6. **Delete** the branch after merge (the flag above does it) and pull the updated `master` locally.

`master` must always remain deployable.

## Workflow: Feature Spec

Non-trivial changes are described by a **Feature Spec** before implementation:

- Location: `docs/specs/NNN-<feature-name>.md` with a zero-padded sequence number (e.g. `docs/specs/001-ts-rewrite.md`).
- Commit the spec on the same feature branch that implements the feature, or on its own `docs/<topic>` branch.
- Link the spec in the Pull Request description.
- Update the spec's status (`draft` → `accepted` → `implemented`) as work progresses; if a decision changes, mark the spec `superseded` and reference its replacement instead of silently diverging.

Use this template:

```markdown
# Spec NNN: <Feature name>

- Status: draft | accepted | implemented | superseded
- Branch/PR: <link>

## Problem
What problem are we solving and why now?

## Proposal
Intended behavior, design, and key decisions.

## Scope
In scope / out of scope.

## Acceptance Criteria
Testable conditions that must hold before merge.
```

Trivial changes (typos, one-line fixes, config tweaks) do not need a spec — a clear PR description is enough.

## Documentation

- Docs live with the code and are updated in the same PR as the change they describe.
- Keep `README.md` accurate for users (install and usage steps) and this file accurate for contributors and agents.
- When a decision conflicts with an existing spec, update the spec first.

## Code Notes for Agents

- npm workspaces: `apps/agent` and `apps/ui` consume `@dnsmasq-ha/contract` from its built `dist/`. A root `postinstall` script builds the contract — run `npm install` before any dev/start command on a fresh clone.
- **Define API changes in `packages/contract` first** (zod schemas, types, route constants, default templates), then implement them in the agent and UI. The contract is the single source of truth for both sides.
- The agent runs **as root** on target nodes (it executes `apt-get`, writes `/etc` configs) and listens on `0.0.0.0` by default so the UI can connect from another machine; the UI binds `127.0.0.1` locally. Auth is a Bearer token compared in constant time.
- Shell-outs use a fixed command allowlist (`apt-get`, `systemctl`) via `execFile` — never interpolate user input into shell strings, and never add commands built from request data.
- Installer scripts in `scripts/` must stay idempotent (re-run = in-place upgrade, agent token preserved), work when piped from `curl | bash` (never prompt on non-tty), and elevate with `sudo` internally only where needed.
- There is no test suite. Verify changes with `npm run build` (contract build + agent strict typecheck + UI build) and state in the PR how you verified behavior — e.g. a real install/upgrade/uninstall cycle on a systemd host, or an API smoke test with curl.
