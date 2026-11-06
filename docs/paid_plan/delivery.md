# Delivery sequence and decisions still needed

All milestones below are pending. Documentation does not mean a capability is
implemented. Keep localhost:6100 available and preserve unrelated working changes.

## 1. Account and persistence contracts

Define the cloud document/revision model, billing owner, permissions, object IDs
and database/object-storage ports. Select initial providers behind those ports.
Define migration from existing local projects and a portable export/restore path.

Acceptance: a versioned project with real media round-trips through the adapter;
stale writes, duplicate operations and deletion races are rejected or reconciled
correctly. Missing/corrupt media is reported. Listing does not read originals.

## 2. Paid access and cloud saving

Implement email accounts, the trial state and subscription entitlements. Define
the real allowance table before enabling billing. Add cloud save/open, bounded
usage accounting, upload admission and recovery behavior.

Acceptance: Classic and Studio reopen the same persisted identity; a failed save
cannot display a successful cloud acknowledgment. Trial/paid/quota states are
enforced server-side. No current project is deleted during migration failure.

## 3. Public authoring and packaged headless

Publish generated schemas/capabilities and implement bounded inspection, editing,
catalog and exact-time job APIs. Distribute a runner that uses the published app
without source checkout. Preserve existing core and rendering behavior.

Acceptance: an external caller discovers allowed parameters, edits a cloud project
transactionally, renders it in real Chrome and obtains a verified artifact using
only the distribution and public API. Cover errors, cancellation and resource
cleanup. Video and selection export remain explicit pending capabilities until
their public runner paths are implemented and verified.

## 4. Remote MCP and creative workflows

Wrap the public API in a shared MCP HTTP service with OAuth discovery and per-user
authorization. Prefer TypeScript/Bun after a focused footprint measurement. Add
versioned creative recipes, templates/presets and prepared asset previews. Add
WebMCP as a compatible optional browser adapter.

Acceptance: two accounts use the same endpoint without crossing projects or
permissions; expiration/revocation and subscription restrictions work. A client
can create a useful editable composition from a recipe, preview and revise it
without reading repository internals. Bounded requests remain bounded under load.

## 5. Authoritative live rooms

Add multiple human/agent participants, committed-operation distribution, durable
idempotency, reconnect catch-up and an explicit conflict policy. Start with a
defined small-team scope. Deliver actor-aware undo before claiming ordinary
multi-user undo is supported.

Acceptance: independent edits reconcile, conflicting edits have a deterministic
outcome, reconnect does not duplicate writes, and undo preserves another actor's
later work. Verify permissions and restart/broadcast recovery.

## 6. Direct presence and preview transport

Add authenticated WebRTC signaling and STUN, then select TURN and/or WebSocket
fallback. Keep temporary messages disposable and final edits authoritative.

Acceptance: direct, relayed/fallback and failed-connectivity paths preserve the
same committed result; participant cleanup, packet loss and stale previews are
handled. Measure bytes, frame pacing and room costs under the supported room size.

## Focused verification ownership

Run relevant tests per milestone, serially and within the workstation CPU/memory
budget. Browser checks are required for rendering, native gestures and decoded
exports. A documentation-only update needs link/content review and repository
rules, not builds, GPU workloads or coverage campaigns.

When implementation is delegated, assign one writer per file and one integrated
validation owner. Run a representative service footprint/cost experiment when
selecting the runtime; do not repeat unrelated full gates for every adapter edit.

## Open decisions

- Final monthly price, currency/tax presentation, billing owner/unit and Teams offer.
- Final trial duration, feature limits, card requirement and expiration behavior.
- Included storage, add-ons, media limits, version retention and processing credits.
- Read/export access, grace period and deletion policy after payment stops.
- First database/object-store/auth/billing providers and migration guarantees.
- Bun versus Node deployment and the measured threshold that would justify Rust/Go.
- Supported MCP clients/protocol compatibility and initial public tool surface.
- Customer/local runner distribution and hosted browser-job pricing/capabilities.
- Collaboration room size, conflict/undo policy and any later Yjs text binding.
- STUN/TURN providers, WebSocket fallback and supported container networking.
- Offline editing scope and pending-change recovery semantics.
- Storage/history diagnostic consent boundaries and opt-in content-analysis features.

The retired 1,000-project cap, permanent free editor access, a mandatory Rust
rewrite and mandatory provider-specific persistence are not pending requirements.
