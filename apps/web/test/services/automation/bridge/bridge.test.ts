import { describe, expect, it } from "vitest";
import { createLayer, createProject, EditorEngine } from "@musart/core";
import { createAgentBridge } from "../../../../src/services/automation/bridge/store";
import {
  bridgeSession,
  handleBridgeRequest,
} from "../../../../src/services/automation/bridge/session";
import {
  BRIDGE_VERSION,
  MAX_MESSAGE_BYTES,
  decodeMessage,
  localEndpoint,
  parseHello,
  parseRequest,
} from "../../../../src/services/automation/bridge/protocol";

const token = "a".repeat(64);
class Socket {
  readyState = 1;
  bufferedAmount = 0;
  closed = false;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    this.closed = true;
  }
  receive(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
function setup() {
  const engine = new EditorEngine();
  const socket = new Socket();
  const bridge = createAgentBridge(engine, () => socket as unknown as WebSocket);
  bridge.connect("ws://127.0.0.1:6101/", token);
  socket.onopen?.();
  return { engine, socket, bridge };
}
function edit(engine: EditorEngine, extra = {}) {
  const { projectId, pageId, revision } = bridgeSession(engine);
  return {
    kind: "request",
    id: "edit-1",
    operation: "execute",
    expected: { projectId, pageId, revision },
    command: { type: "renameProject", name: "Agent change" },
    ...extra,
  };
}
describe("local agent protocol boundary", () => {
  it("requires an explicit loopback endpoint and strict authentication envelope", () => {
    expect(localEndpoint("ws://localhost:6101/")).toBe("ws://localhost:6101/");
    for (const endpoint of [
      "ws://example.com/",
      "wss://127.0.0.1/",
      "ws://127.0.0.1/?token=secret",
      "ws://user@127.0.0.1/",
    ])
      expect(() => localEndpoint(endpoint)).toThrow();
    expect(parseHello({ kind: "hello", version: BRIDGE_VERSION, role: "agent", token })).toEqual({
      role: "agent",
      token,
    });
    expect(() =>
      parseHello({ kind: "hello", version: BRIDGE_VERSION, role: "agent", token: "bad" }),
    ).toThrow();
    expect(() =>
      parseHello({
        kind: "hello",
        version: BRIDGE_VERSION,
        role: "agent",
        token,
        eval: "alert(1)",
      }),
    ).toThrow();
  });
  it("bounds and rejects unsafe, unknown and incomplete wire messages", () => {
    expect(() => decodeMessage(`"${"x".repeat(MAX_MESSAGE_BYTES)}"`)).toThrow("size");
    expect(() => decodeMessage('{"__proto__":{"polluted":true}}')).toThrow("Unsafe");
    expect(() =>
      parseRequest({
        kind: "request",
        id: "x",
        operation: "execute",
        command: { type: "renameProject", name: "x" },
      }),
    ).toThrow();
    expect(() =>
      parseRequest({ kind: "request", id: "x", operation: "session", eval: "x" }),
    ).toThrow();
    const engine = new EditorEngine();
    expect(() => parseRequest(edit(engine, { command: { type: "eval", code: "x" } }))).toThrow();
  });
});
describe("validated live engine session", () => {
  it("rejects stale revisions, pages and projects without mutating", () => {
    const engine = new EditorEngine();
    const request = edit(engine);
    engine.execute({ type: "renameProject", name: "Human change" });
    expect(handleBridgeRequest(engine, request).reply).toMatchObject({
      ok: false,
      error: expect.stringContaining("Stale"),
    });
    const fresh = edit(engine);
    expect(
      handleBridgeRequest(engine, { ...fresh, expected: { ...fresh.expected, pageId: "other" } })
        .reply.ok,
    ).toBe(false);
    engine.load(createProject({ name: "Another project" }));
    expect(handleBridgeRequest(engine, fresh).reply.ok).toBe(false);
    expect(engine.getSnapshot().project.name).toBe("Another project");
  });
  it("applies atomic transactions, reports failures and uses real selection and undo/redo", () => {
    const engine = new EditorEngine();
    const layer = createLayer("rectangle", { name: "Hero" });
    engine.execute({ type: "addLayers", layers: [layer] });
    const run = (operation: string, extra = {}) =>
      handleBridgeRequest(engine, edit(engine, { operation, ...extra, command: undefined }));
    // Strict envelopes do not silently accept payloads from another operation.
    expect(() => run("undo")).toThrow("Unexpected");
    const request = (operation: string, extra = {}) => {
      const { expected } = edit(engine);
      return handleBridgeRequest(engine, {
        kind: "request",
        id: crypto.randomUUID(),
        operation,
        expected,
        ...extra,
      });
    };
    const bad = request("transaction", {
      commands: [
        { type: "updateLayers", ids: [layer.id], patch: { x: 40 } },
        { type: "updateLayers", ids: ["missing"], patch: { y: 50 } },
      ],
    });
    expect(bad.reply.ok).toBe(false);
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(layer.x);
    const good = request("transaction", {
      commands: [
        { type: "updateLayers", ids: [layer.id], patch: { x: 40 } },
        { type: "updateLayers", ids: [layer.id], patch: { y: 50 } },
      ],
    });
    expect(good.reply.ok).toBe(true);
    expect(good.activity?.targets).toEqual(["Hero"]);
    request("select", { ids: [layer.id] });
    expect(engine.getSnapshot().selection).toEqual([layer.id]);
    request("undo");
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(layer.x);
    request("redo");
    expect(engine.getSnapshot().project.pages[0]!.layers[0]).toMatchObject({ x: 40, y: 50 });
  });
  it("provides deliberate snapshots without originals and metadata without cloning the document", () => {
    const engine = new EditorEngine();
    const session = bridgeSession(engine);
    session.selection.push("foreign");
    expect(engine.getSnapshot().selection).toEqual([]);
    const reply = handleBridgeRequest(engine, {
      kind: "request",
      id: "inspect",
      operation: "snapshot",
    }).reply;
    expect(reply).toMatchObject({ ok: true, result: { project: { assetIds: [] } } });
    expect((reply.result as { project: object }).project).not.toHaveProperty("assets");
  });
});
describe("opt-in browser bridge lifecycle", () => {
  it("authenticates before commands, logs actual layer targets and never duplicates a request", () => {
    const { engine, bridge, socket } = setup();
    expect(bridge.read().status).toBe("connecting");
    expect(socket.sent[0]).toEqual({
      kind: "hello",
      version: BRIDGE_VERSION,
      role: "editor",
      token,
    });
    socket.receive({ kind: "ready", version: BRIDGE_VERSION });
    socket.receive({ kind: "peer", connected: true });
    const layer = createLayer("rectangle", { name: "Hero" });
    engine.execute({ type: "addLayers", layers: [layer] });
    engine.select([]);
    engine.execute({ type: "updateLayers", ids: [layer.id], patch: { y: 33 } });
    expect(bridge.read().logs.at(-1)).toMatchObject({ source: "editor", targets: ["Hero"] });
    const request = edit(engine, {
      command: { type: "updateLayers", ids: [layer.id], patch: { x: 42 } },
    });
    socket.receive(request);
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(42);
    expect(bridge.read().logs.at(-1)).toMatchObject({
      source: "agent",
      targets: ["Hero"],
      ok: true,
    });
    socket.receive({
      ...request,
      expected: { ...request.expected, revision: engine.getSnapshot().revision },
    });
    expect(socket.sent.at(-1)).toMatchObject({ ok: false, error: "Duplicate request ID." });
    bridge.dispose();
  });
  it("rejects unauthenticated commands and cleans transport callbacks on disconnect", () => {
    const { engine, bridge, socket } = setup();
    const original = engine.getSnapshot().project.name;
    socket.receive(edit(engine));
    expect(bridge.read().status).toBe("error");
    expect(engine.getSnapshot().project.name).toBe(original);
    expect(socket.closed).toBe(true);
    expect(socket.onmessage).toBeNull();
    bridge.dispose();
    expect(() => bridge.connect("ws://127.0.0.1:6101/", token)).toThrow("disposed");
  });
  it("bounds live logs and releases engine subscriptions on disposal", () => {
    const { engine, bridge, socket } = setup();
    socket.receive({ kind: "ready", version: BRIDGE_VERSION });
    for (let index = 0; index < 110; index++)
      engine.execute({ type: "renameProject", name: `Name ${index}` });
    expect(bridge.read().logs).toHaveLength(100);
    const count = socket.sent.length;
    bridge.dispose();
    engine.execute({ type: "renameProject", name: "After disposal" });
    expect(socket.sent).toHaveLength(count);
    expect(socket.onmessage).toBeNull();
  });
  it("publishes current page and selection metadata without creating revision edits", () => {
    const { engine, bridge, socket } = setup();
    socket.receive({ kind: "ready", version: BRIDGE_VERSION });
    const layer = createLayer("rectangle");
    engine.execute({ type: "addLayers", layers: [layer] });
    const revision = engine.getSnapshot().revision;
    engine.select([]);
    expect(socket.sent.at(-1)).toMatchObject({
      kind: "session",
      session: { selection: [], revision },
    });
    expect(engine.getSnapshot().revision).toBe(revision);
    bridge.disconnect();
    const count = socket.sent.length;
    engine.select([layer.id]);
    expect(socket.sent).toHaveLength(count);
    expect(bridge.read().status).toBe("disconnected");
    bridge.dispose();
  });
});
