# Storage, history and operating costs

## Separate count, bytes and active memory

Paid accounts may create projects without a fixed count cap, within their
subscription storage/resource allowances. A database stores inactive records on
disk; the MCP/room service does not keep every account and project in RAM.

Neon "projects" are backend resource containers, not Melt compositions. One
database can hold many customer project records. Provider free allowances are a
bootstrap option, not a promise that a paid product's infrastructure remains free.

Keep these categories separate:

- Small project listing/account/permission metadata.
- Current document data and immutable revision/checkpoint metadata.
- Original media and derived thumbnails, proxies and prepared effect inputs.
- Retained history, exports, abandoned uploads and temporary jobs.

Project count alone cannot bound cost. As an illustration, 1,000 projects with
10 MB of distinct originals each consume roughly 10 GB before versions or other
derivatives. This is an arithmetic example, not a measured average Melt project.

## Usage accounting

Define a durable usage ledger for the billing owner. Track actual bytes and
explicit reservations incrementally; listing projects or displaying a quota must
not scan all originals, journals or historical versions.

Specify which categories count toward the user allowance, which are service
overhead, and how team/shared-bank assets are treated. Usage records require
idempotent adjustments for upload finalization, reference changes, pruning and
deletion. Check concurrency atomically so simultaneous uploads cannot both spend
the same remaining allowance. Expire abandoned reservations safely.

Deduplicate immutable originals where authorized and useful. Preserve asset
ownership/access isolation; knowing a content hash must not grant access to a
different customer's private file. Keep references from live documents, retained
versions and active jobs until their lifetimes actually end.

Cloud adapter requirements are in [architecture](architecture.md). The current
portable/archive adapter and engine asset representation stay compatible; cloud
URLs are not substituted blindly into existing core fields.

## History efficiency

Reuse the current separation of manifests, original assets, undo metadata and
durable journal. Keep one completed transaction per gesture; transient previews,
presence, selection and viewport navigation are not document history.

Use bounded journal pages, meaningful deltas and sparse checkpoints. Store an
original once rather than duplicating binary data inside every event or snapshot.
Compact and prune only according to a published retention policy, with reference
checks and a verified recovery endpoint.

Preserve exact authored Motion semantics. Storage optimization must not replace
intentional keys with coarse sampling, record one key per playback frame, flatten
effects or change historical rendering without an explicit document operation.

Collaborative history needs actor and operation identities in addition to current
single-editor undo semantics. See [collaboration](collaboration.md).

## Analyze before optimizing

The user is interested in analyzing project histories to identify waste. Start
with bounded aggregate diagnostics:

- Bytes per current document, delta, checkpoint, original and derivative.
- Operation categories, gesture transaction counts and save frequency.
- Duplicate originals, repeated no-op changes and checkpoint amplification.
- History read/write volume, restore latency and cache residency.
- Active rooms, request/queue peaks and preview versus durable message traffic.
- Render/inference duration, output bytes and cancellation cleanup.

Do not collect raw images, text, complete commands or private project histories
merely to measure storage efficiency. If a later feature inspects creative content
or trains from customer work, specify that separate purpose and permission first.

Offline analysis should produce reports and proposed optimizations. Do not
silently rewrite user documents or prune retained versions based on an AI guess.
Verify semantic equivalence and restore/export behavior before changing a storage
representation. Keep logical payload size distinct from actual provider allocation.

## Cost model and runtime selection

Budget at least application/MCP CPU and memory, active-room lifetimes, database
compute and storage, object storage, network egress, TURN relay traffic, processing
jobs, observability and backups. Payment and model-provider costs are separate.

An always-on shared container can have predictable base resources. Other cloud
containers bill allocated/used resources over time; an open WebSocket may keep an
instance active. WebSocket itself does not imply universal per-message pricing.
Account for the chosen provider rather than copying another provider's estimate.

Direct WebRTC avoids routing that application traffic through Melt's server.
Signaling still has a cost, and selected TURN paths carry relayed bytes. Frequent
messages, polling, timers and retained I/O can prevent serverless room hibernation.
Assets and render outputs can outweigh cursor payloads.

Before choosing Bun/Node, Rust/Go or a hosting provider, measure the complete
supported service: idle/warm RSS, peak RSS, active requests and connections,
representative document sizes, CPU, cold start, queues and cleanup after load.
Include caches and any downstream runtime. Do not invent a per-user RAM figure
or start one browser/process for every subscriber.

No hosting price, storage quota or EUR 8/month margin has been validated for this
plan. Preserve the measurements and selected limits when those decisions are made.
