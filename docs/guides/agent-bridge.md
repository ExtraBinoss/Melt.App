# Local live agent bridge

The optional local bridge lets an authenticated agent edit the project that is open in the editor. It uses the existing `EnginePort`, the same validated commands, atomic transactions and undo history as manual edits. The activity popover shows actual command results and targeted layer names. It never moves focus or selection to imitate an agent cursor.

## Pair the editor

Start the app and relay in separate terminals, from the repository root:

```sh
bun dev
bun scripts/agent-bridge/server.ts
```

The relay prints its loopback WebSocket endpoint and a new 64-character pairing token. In the editor, open **Agent**, enter the endpoint and token, and choose **Connect**. The editor does not connect until this action. It shows a separate waiting state until an authenticated agent joins. **Disconnect**, leaving the editor, and relay shutdown close the connection and release listeners. Pairing information is kept in memory, and the token input is cleared after connecting.

The bridge works in the ordinary editor; `?automation=1` is unnecessary. Switching between Classic and Studio shares the same engine and bridge store. Local edits remain available during pairing and can invalidate an agent's expected revision.

The relay binds only `127.0.0.1`, defaults to port `6101`, and permits editor origins `http://127.0.0.1:6100` and `http://localhost:6100`. To use another development origin or port, set exact origins and a port before starting it:

```sh
MELT_AGENT_PORT=6102 MELT_AGENT_ORIGINS=http://localhost:6200 bun scripts/agent-bridge/server.ts
```

The editor endpoint must be `ws://` on `127.0.0.1`, `localhost` or `::1`, without credentials or query parameters. Origin checks apply to browser clients; nonbrowser agents may omit Origin, but still require the pairing token. There is one authenticated editor and one authenticated agent per relay. An unpaired connection is closed after five seconds.

## Call it from the command line

Set the token in your terminal and inspect the current session:

```sh
export MELT_AGENT_TOKEN='<token printed by relay>'
bun scripts/agent-bridge/client.ts session
bun scripts/agent-bridge/client.ts snapshot
```

`MELT_AGENT_ENDPOINT` overrides the default `ws://127.0.0.1:6101/`. Each CLI invocation pairs, performs one request, prints the real response and disconnects. A rejected command exits unsuccessfully.

`session` returns the small current session: `projectId`, `pageId`, `revision`, selection and undo/redo availability. `snapshot` is an explicit inspection view: the session plus the project, pages and layers, with `assetIds` replacing binary asset originals and without the replay journal. This view is not a portable project archive. Use existing project export to obtain original assets. No complete project or assets are cloned on each editor event.

Copy the current session's three expected fields into a command request such as `artifacts/agent-request.json`:

```json
{
  "kind": "request",
  "id": "rename-unique-1",
  "operation": "execute",
  "expected": { "projectId": "project-id", "pageId": "page-id", "revision": 12 },
  "command": { "type": "renameProject", "name": "Agent design" }
}
```

```sh
bun scripts/agent-bridge/client.ts artifacts/agent-request.json
```

Use `transaction` with a `commands` array for related edits. All commands succeed as one undo entry, or the document remains unchanged. `undo` and `redo` carry only `expected`; `select` adds an `ids` array. Selection is changed only by an explicit `select` request. All writes require the current project, page and revision; a stale or cross-project request fails. After a timeout or a local edit, inspect the session before deciding whether to retry with a new request ID.

## Long-lived agent protocol

Use a standard WebSocket client. First send:

```json
{ "kind": "hello", "version": 1, "role": "agent", "token": "<64-character token>" }
```

Wait for `{ "kind": "ready", "version": 1 }` before sending requests. A `peer` message reports editor presence. The editor sends `session` messages when the session changes; these contain metadata only. Each request has a unique `id` and receives:

```json
{
  "kind": "response",
  "id": "rename-unique-1",
  "ok": true,
  "result": {
    "projectId": "...",
    "pageId": "...",
    "revision": 13,
    "selection": [],
    "canUndo": true,
    "canRedo": false
  }
}
```

Failures return `ok: false` and an `error` string. A successful transport response means the engine operation completed; it does not claim a disk save, GPU render or export. No remote JavaScript, model credentials, shell commands or arbitrary evaluation are accepted. The relay is a command transport, not a model provider.

Messages and responses are limited to 256 KiB. There are at most 16 pending requests, 128 commands per transaction, 100 activity entries and 4096 distinct request IDs per connection. Reconnect after reaching the request limit. The relay rejects reused IDs, oversized or malformed JSON, unknown operations and unrecognized envelope fields. Domain command payloads are validated by the existing engine. There is no offline request queue or automatic reconnect. A disconnected or timed-out edit must be reconciled against the current session before retrying.

## Browser and headless adapters

`createAgentBridge(engine)` in `apps/web/src/services/automation/bridge/store.ts` creates a disposable browser transport around an existing `EnginePort`. It exposes `connect(endpoint, token)`, `disconnect()`, `read()`, `subscribe(listener)` and `dispose()`. `getAgentBridge(engine)` shares a store between editor UI and automation adapters; adapters must disconnect on teardown. Connect is explicit, including when invoked through an opt-in automation API.

The transport requires no Bun or Node imports. Its pure protocol and request handler live beside it. The Bun relay and CLI live separately under `scripts/agent-bridge/`. Headless callers should use the running editor transport when they want edits to appear live; the existing offline `headless apply` workflow remains available for editing project files through the same document engine.
