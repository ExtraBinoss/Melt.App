# Sources and existing implementation references

Recorded on 2026-11-06 from the planning discussion and public documentation.
Provider prices, quotas, protocol versions and experimental browser support can
change; recheck them before implementing, purchasing or publishing an offer.

## Existing Melt contracts

- [Architecture](../architecture/contracts.md): engine, renderer and UI ownership.
- [History](../architecture/history.md): journal/asset separation, transactions and retention.
- [Storage diagnostics](../performance/storage.md): compare-and-swap, accounting and bounded access.
- [Headless guide](../guides/headless.md): existing repository CLI and current export limits.
- [Local agent bridge](../guides/agent-bridge.md): authentication, expected revisions and pairing limits.
- [Effect SDK](../effects/sdk_effects/README.md): common effect authoring and parameter definitions.
- [Cloudflare deployment](../deployment/cloudflare.md): current deployment integration, not a commitment to that provider for every future service.

The future paid/cloud model intentionally changes current local ownership. It
does not claim that those changes already exist or silently revise the current
portable document contract.

## MCP, Figma and runtime choices

- [MCP transports](https://modelcontextprotocol.io/specification/latest/basic/transports): standard HTTP and stdio bindings; custom WebSocket transport is not automatically interoperable.
- [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization): OAuth-based HTTP authorization and resource metadata.
- [Figma remote installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/): shared remote endpoint, browser sign-in and client skills.
- [Figma permissions and limits](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/): access follows account/file permissions and plan limits.
- [Official Rust MCP SDK](https://github.com/modelcontextprotocol/rust-sdk): `rmcp` is an available alternative, not evidence of measured Melt memory use.
- [Official Go MCP SDK](https://github.com/modelcontextprotocol/go-sdk): another possible gateway implementation.
- [WebMCP implementation status](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md): evolving browser/agent support.
- [MCP versus WebMCP](https://developer.chrome.google.cn/docs/ai/webmcp/compare-mcp?hl=en): backend integration versus tools in an open web page.

Figma's public integration documentation does not establish its server language,
per-user memory cost, internal process layout or hosting bill. Reuse the customer
connection model rather than inventing an infrastructure comparison.

## Data and hosting

- [Neon pricing](https://neon.com/pricing): current database, compute, object-storage and other allowances. A Neon project is a backend resource container, not a Melt creation.
- [Railway pricing](https://docs.railway.com/pricing/plans): an example of container CPU, memory, storage and egress charges.
- [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets): long-lived request timeouts, billing and multi-instance coordination considerations.
- [Durable Object WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/): an optional room-hosting optimization behind a provider adapter.
- [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/): duration and request costs must be considered separately.

Provider-specific cost examples from the conversation are illustrative, not Melt
benchmarks. This plan intentionally avoids freezing numerical provider allowances
into customer entitlements.

## Peer connections and CRDTs

- [WebRTC data channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels): arbitrary application data rather than mandatory canvas video streaming.
- [WebRTC protocols](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols): ICE, STUN and TURN roles.
- [TURN server](https://webrtc.org/getting-started/turn-server): a relay carries traffic when a direct path is unavailable.
- [Cloudflare TURN](https://developers.cloudflare.com/realtime/turn/): an example managed relay offering, not a selected provider.
- [Yjs update API](https://docs.yjs.dev/api/document-updates): compressed update operations and their garbage-collection limitations.
- [Yjs selective undo](https://docs.yjs.dev/api/undo-manager): relevant to a possible text binding, not a replacement for Melt's collaborative document policy.
- [y-webrtc](https://github.com/yjs/y-webrtc): peer transport and topology tradeoffs.
