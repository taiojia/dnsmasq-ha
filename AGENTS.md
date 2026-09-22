# AGENTS.md

Guidance for human contributors and AI coding agents working in this repository.

> **Workflow principle:** Using GitHub Flow and Feature Spec to manage the branch and docs.

## Project Overview

**dnsmasq-ha** deploys [dnsmasq](https://thekelleys.org.uk/dnsmasq/doc.html) with high availability (keepalived VIP failover) and automatic recovery on Ubuntu Server. A basic cluster is one dnsmasq master and one dnsmasq backup node sharing a virtual IP (VIP).

Repository layout:

```
.
├── dnsmasq-ha.py        # Entry point: sudo python dnsmasq-ha.py <master|backup>
├── command.py           # Thin subprocess wrapper (Command class)
├── conf/
│   ├── keepalived.conf.master   # keepalived config for the master node (edit the VIP)
│   └── keepalived.conf.backup   # keepalived config for the backup node (edit the VIP)
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
5. **Merge** to `master` after approval; keep history readable.
6. **Delete** the branch after merge and pull the updated `master` locally.

`master` must always remain deployable.

## Workflow: Feature Spec

Non-trivial changes are described by a **Feature Spec** before implementation:

- Location: `docs/specs/NNN-<feature-name>.md` with a zero-padded sequence number (e.g. `docs/specs/001-vip-health-check.md`).
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
- Keep `README.md` accurate for users (deployment steps) and this file accurate for contributors and agents.
- When a decision conflicts with an existing spec, update the spec first.

## Code Notes for Agents

- The code is legacy **Python 2** (tab-indented, `print` statements). Match the existing style; do not mix Python 3-only syntax into changes that are not a deliberate port.
- Reuse `Command.execute()` / `Command.execute_get_output()` from `command.py` for shell-outs instead of calling `subprocess` directly.
- Config templates under `conf/` are copied verbatim onto target systems — keep edits minimal and well commented.
- There is no test suite. State in the PR how you verified a change (e.g. dry-run of the deployment logic on a test node).
