# Spec 003: UI visual design

- Status: accepted
- Branch/PR: `feature/ui-visual-design`

## Problem

The dashboard is functional but visually generic (default system font, flat pills, uniform cards). It does not read as a network operations instrument, and key domain facts — endpoints, VRRP role, VIP — are not visually differentiated from secondary content.

## Proposal

A visual redesign only — zero behavior or API changes. Design system: "network operations bench".

- Typography: IBM Plex Sans (UI) + IBM Plex Mono (endpoints, configs, commands), loaded from Google Fonts with system fallbacks.
- Palette: layered deep slate backgrounds; one teal accent for interaction; amber reserved exclusively for the VIP; green/red only for service state semantics.
- Node cards as "rack units": endpoint in mono in the header, service state as dot rows, `state MASTER|BACKUP` tag mirroring keepalived config language, deploy output as a terminal block, config editor as an inset code panel.
- Useful empty state: shows the agent install command instead of a bare message.
- Two-column responsive card grid on wide screens; visible keyboard focus; `prefers-reduced-motion` respected.

## Scope

- In scope: `apps/ui` styles.css rewrite, index.html (fonts + favicon), markup-only adjustments in App/NodeForm/NodeCard/ConfigEditor.
- Out of scope: any logic, API, or workflow change; new features; light theme.

## Acceptance Criteria

- `npm run build` passes (strict typecheck + vite build).
- All existing flows still work: add/edit/remove node, status fetch, deploy, config load/save.
- Verified visually via screenshots (empty state, connected node card) against a locally running agent.
- Fonts fall back gracefully offline; reduced-motion and keyboard focus respected.
