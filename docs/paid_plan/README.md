# Paid cloud, agents and collaboration plan

Status: agreed product direction and proposed technical design, recorded on
2026-11-06. This directory is a planning checkpoint, not an implementation or
deployment report. New instructions supersede the decisions recorded here.

## Reading order

1. [Product and subscriptions](product.md): paid access, trial, storage and media limits.
2. [Cloud architecture](architecture.md): authority, adapters and persistence contracts.
3. [MCP and headless](mcp-headless.md): public tools, authentication, runner and creative library.
4. [Collaboration](collaboration.md): WebSocket, WebRTC, STUN/TURN and concurrent edits.
5. [Storage and history](storage-history.md): accounting, retention and optimization.
6. [Delivery](delivery.md): implementation milestones, focused checks and open decisions.
7. [References](references.md): official documentation used in the discussion.

## Accepted direction

| Topic               | Decision                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business model      | Paid application, with an email-account free trial; no permanent free editor tier.                                                                                                             |
| Trial and price     | Three days and EUR 8/month were discussed. Keep them as working assumptions; final duration, restrictions, taxes and billing unit remain to be specified.                                      |
| Project count       | No fixed count cap in the intended paid offer. The earlier idea of 1,000 projects is superseded. Storage and resource allowances still apply.                                                  |
| Cloud ownership     | One authoritative cloud project identity, shared by Classic, Studio, agents and headless runners. Local storage becomes a cache/recovery mechanism.                                            |
| Database            | Persist projects and account metadata through a provider-neutral adapter. Neon is a possible starting provider, not a core dependency or an assumption of permanently free production hosting. |
| Files               | Store immutable media through a separate object-storage adapter; keep frequently changing document data separate from originals.                                                               |
| MCP                 | One shared authenticated remote service. Prefer TypeScript on Bun when a measured, bounded implementation meets the memory budget. Rust and Go remain alternatives, not requirements.          |
| Headless            | Use the existing engine and real Chrome, distributed so customers do not need the repository source or a development server.                                                                   |
| Creative assistance | Make templates, presets, asset catalogs and reusable creative instructions discoverable to agents and people.                                                                                  |
| Collaboration       | WebSocket for authoritative changes; prefer direct WebRTC for transient presence/previews, with STUN and an evaluated TURN or WebSocket fallback.                                              |
| Efficiency          | Bound active state, media admission, history and background jobs. Analyze measured storage/history costs before optimizing them.                                                               |

## Existing foundations and gaps

Already present:

- Pure TypeScript document engine, validated commands and atomic transactions.
- Shared Classic/Studio documents, Three.js rendering, Motion evaluation and portable exports.
- Local persistence separates manifests, originals and durable history.
- Repository CLI supports create/apply/evaluate/render/screenshot; browser automation is opt-in.
- Local WebSocket bridge supports an editor/agent pair, expected revisions and bounded requests.

Still to build:

- Accounts, subscription enforcement, cloud persistence and migration.
- Public versioned capability schemas and a packaged headless runner.
- Remote OAuth MCP, cloud project operations and creative-resource discovery.
- Multiple participants, reconnect reconciliation and actor-aware undo.
- Media/storage allowances, retention policy and measured production cost budgets.

Existing entry points are documented in [headless](../guides/headless.md),
[agent bridge](../guides/agent-bridge.md), [contracts](../architecture/contracts.md),
[history](../architecture/history.md) and [storage diagnostics](../performance/storage.md).
Those describe current behavior; this plan describes future behavior. In particular,
cloud authority is not available today, and existing local projects must not be
removed before a verified migration exists.

No infrastructure provisioning, runtime replacement, billing activation or project
migration is authorized merely by this documentation checkpoint.
