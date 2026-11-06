# Public MCP, headless and creative resources

## Shared service and authentication

Provide one public MCP endpoint shared by customers. Each supported MCP client
connects through an OAuth authorization flow to the person's Melt account. The
client receives its own access credentials; users should not routinely copy a
shared server token into configuration files.

The Figma remote experience is the product reference: common endpoint, browser
sign-in, account permissions, plan-aware access and optional client skills. This
does not imply copying Figma's client allowlist, implementation language, rate
limits or undocumented server architecture.

Associate identity with each request, never a global mutable "current user".
Validate issuer, audience, expiration and granted scopes using the adopted MCP
authorization specification. Check actual project/workspace permissions and
subscription entitlements separately. A signed token is not proof that the
caller owns an arbitrary project ID or still has edit permission.

Reuse the application identity service. Keep grants, revocation and refresh-token
state in durable storage as required; use bounded caches rather than loading all
customers into process memory. Publish compatible OAuth discovery metadata and
support reconnect/re-authorization with understandable errors.

## Low-footprint implementation

Working preference: TypeScript with Bun, reusing the existing engine and schema
definitions. Hono is a possible HTTP framework, not a separate hosting requirement.
Choose it only if actual idle and concurrent-load measurements meet the budget.
Bun is not assumed to use less memory than Node for every workload.

Rust (`rmcp`) and the official Go SDK remain alternatives for a thin gateway if
they materially improve a measured constraint. Include the cost of maintaining
another language and any downstream TypeScript service in that comparison.

- Share the service across accounts; do not allocate one process per subscriber.
- Prefer request-scoped MCP HTTP operations over retaining unnecessary sessions.
- Share versioned catalog metadata; bound per-user caches, queues and concurrency.
- Paginate inspection results and return asset references instead of originals.
- Pool database connections; do not reserve one connection per signed-in account.
- Preserve compatibility with the MCP clients actually supported at launch.
- Keep Chrome, GPU textures and model inference out of the MCP gateway process.

A customer's model provider normally runs the agent. Serving tools does not
require Melt to pay for that model's reasoning. Optional Melt-hosted inference or
rendering needs a separately defined allowance.

## Discoverable public capabilities

An agent must be useful without reading source files or constructing commands
from TypeScript internals. Generate versioned schemas and catalogs from the
authoritative definitions. Every adapter should consume the same descriptions.

Proposed capability groups, not implemented tool names:

| Group               | Required behavior                                                                  |
| ------------------- | ---------------------------------------------------------------------------------- |
| Identity and access | Identify account/workspace, allowed operations and remaining allowances.           |
| Project discovery   | Paginated projects, compositions, layers and bounded structural inspection.        |
| Catalog discovery   | Search effects, parameters, fonts, models, templates, presets and bank media.      |
| Editing             | Validated atomic transactions with expected revision and idempotent operation IDs. |
| Creative recipes    | Retrieve a versioned creative instruction or apply an editable template/preset.    |
| Preview and export  | Submit exact-time render/export jobs and retrieve their real status/results.       |
| History             | Bounded action/version inspection and appropriately scoped undo when supported.    |

Each operation defines its input/output schema, permission requirements, byte
limits, cancellation, timeout and error behavior. Authenticated document editing
may work with no editor open because the cloud API runs the pure engine. Actual
pixel rendering and encoding still require an admitted browser runner.

## Headless distribution

Ship a runner/CLI that can be installed independently of the repository. It
connects to a published compatible application/render surface, authenticates,
opens a cloud project revision and uses the same public API. It must not need
source paths, test fixtures, arbitrary JavaScript evaluation or a Vite server.

Keep create/edit/evaluate operations independent of GPU initialization. Use real
Chrome with Three.js WebGPURenderer and the existing WebGL fallback for rendering.
Resolve actual font and media dependencies; an ordinary user's browser cache is
not a headless portability guarantee.

Pin application/catalog compatibility, project revision, exact Motion time,
assets and output settings for a job. Rendering must not author sampled Motion
keys. Verify output dimensions and completion, expose unsupported hardware and
encoding capabilities truthfully, and dispose browser/resources on cancellation.

Local/customer-operated runners keep Melt's infrastructure costs lower. Hosted
runners are an explicit optional capacity pool with bounded concurrency and
lifetime. Do not assume an active user Chrome can silently service remote jobs;
that capability requires user-visible opt-in and session ownership.

## Creative quality and WebMCP

Expose one creative catalog to the gallery and agents. Entries should include
prepared previews, compatible formats/effects, versioned IDs, editable semantic
slots, palette/typography guidance and source/license metadata where relevant.
Serve prepared previews; catalog scrolling/search must not create renderer jobs.

Recipes should encode useful art direction: composition hierarchy, typography,
spacing, palette, texture/effects and export constraints. The workflow is discover,
select a direction, fill slots, preview, inspect and revise. Avoid an enormous
unfiltered tool catalog or inventing a separate AI-only document format.

MCP tools/resources/prompts and optional installed client skills can distribute
these instructions. Some clients do not automatically consume every primitive;
important recipe discovery should remain available through explicit tools.

WebMCP is an additional adapter for an agent interacting with an open Melt page.
Register the same supported application capabilities through feature detection.
Browser/agent support is evolving; WebMCP is not the only route to paid MCP access
and is not a backend, account system or collaboration protocol.
