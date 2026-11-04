import type { CommandCommitInfo, EnginePort } from "@musart/core";
import { bridgeSession, handleBridgeRequest, type BridgeActivity } from "./session";
import {
  BRIDGE_VERSION,
  MAX_MESSAGE_BYTES,
  decodeMessage,
  encodeMessage,
  localEndpoint,
  object,
} from "./protocol";
import { commitTargetNames } from "./activity";

export interface BridgeState {
  status: "disconnected" | "connecting" | "connected" | "error";
  peerConnected: boolean;
  error?: string;
  logs: readonly BridgeActivity[];
}
export type BridgeSocketFactory = (endpoint: string) => WebSocket;
export function createAgentBridge(
  engine: EnginePort,
  socketFactory: BridgeSocketFactory = (endpoint) => new WebSocket(endpoint),
) {
  let state: BridgeState = { status: "disconnected", peerConnected: false, logs: [] };
  let socket: WebSocket | undefined;
  let stopEngine: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let activeRequest = false;
  let sequence = 0;
  const listeners = new Set<() => void>();
  const requests = new Set<string>();
  const publish = (patch: Partial<BridgeState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const log = (entry: Omit<BridgeActivity, "id" | "at">) =>
    publish({ logs: [...state.logs.slice(-99), { ...entry, id: ++sequence, at: Date.now() }] });
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    stopEngine?.();
    stopEngine = undefined;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
      socket = undefined;
    }
    requests.clear();
  };
  const send = (value: unknown) => {
    if (!socket || socket.readyState !== 1) throw new Error("Bridge is disconnected.");
    if (socket.bufferedAmount > MAX_MESSAGE_BYTES * 2)
      throw new Error("Bridge send queue is full.");
    socket.send(encodeMessage(value));
  };
  const fail = (message: string) => {
    cleanup();
    publish({ status: "error", peerConnected: false, error: message });
  };
  return {
    read: () => state,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect(endpoint: string, token: string) {
      if (disposed) throw new Error("Bridge has been disposed.");
      cleanup();
      try {
        if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Enter the relay's pairing token.");
        socket = socketFactory(localEndpoint(endpoint));
        publish({ status: "connecting", peerConnected: false, error: undefined });
        timer = setTimeout(() => fail("Relay authentication timed out."), 5000);
        socket.onopen = () => {
          try {
            send({ kind: "hello", version: BRIDGE_VERSION, role: "editor", token });
          } catch (error) {
            fail(error instanceof Error ? error.message : String(error));
          }
        };
        socket.onerror = () => fail("Unable to connect to the local relay.");
        socket.onclose = () => {
          cleanup();
          publish({ status: "disconnected", peerConnected: false });
        };
        socket.onmessage = (event) => {
          try {
            if (typeof event.data !== "string") throw new Error("Text JSON messages are required.");
            const value = decodeMessage(event.data);
            if (!object(value)) throw new Error("Invalid relay message.");
            if (value.kind === "ready" && value.version === BRIDGE_VERSION) {
              if (state.status !== "connecting")
                throw new Error("Unexpected authentication reply.");
              if (timer) clearTimeout(timer);
              timer = undefined;
              publish({ status: "connected" });
              let previous = bridgeSession(engine);
              const observed = engine as EnginePort & {
                subscribeCommitInfo?: (listener: (info: CommandCommitInfo) => void) => () => void;
              };
              const stopCommits = observed.subscribeCommitInfo?.((info) => {
                if (!activeRequest)
                  log({
                    source: "editor",
                    operation:
                      info.kind === "commit" ? info.types.slice(0, 8).join(", ") : info.kind,
                    targets: commitTargetNames(info),
                    revision: info.snapshot.revision,
                    ok: true,
                  });
              });
              const stopSession = engine.subscribe(() => {
                const current = bridgeSession(engine);
                if (
                  previous.revision !== current.revision ||
                  previous.projectId !== current.projectId ||
                  previous.pageId !== current.pageId ||
                  previous.selection.join("\0") !== current.selection.join("\0")
                ) {
                  if (!stopCommits && !activeRequest)
                    log({
                      source: "editor",
                      operation: "revision",
                      targets: [],
                      revision: current.revision,
                      ok: true,
                    });
                  try {
                    send({ kind: "session", session: current });
                  } catch (error) {
                    fail(error instanceof Error ? error.message : String(error));
                  }
                }
                previous = current;
              });
              stopEngine = () => {
                stopCommits?.();
                stopSession();
              };
              return;
            }
            if (state.status !== "connected") throw new Error("Relay is not authenticated.");
            if (value.kind === "peer" && typeof value.connected === "boolean") {
              publish({ peerConnected: value.connected });
              if (value.connected) send({ kind: "session", session: bridgeSession(engine) });
              return;
            }
            let reply;
            try {
              if (typeof value.id === "string" && requests.has(value.id))
                throw new Error("Duplicate request ID.");
              if (typeof value.id === "string") {
                if (requests.size >= 4096)
                  throw new Error("Session request limit reached; reconnect to continue.");
                requests.add(value.id);
              }
              activeRequest = true;
              const result = handleBridgeRequest(engine, value);
              reply = result.reply;
              if (result.activity) log({ source: "agent", ...result.activity });
            } catch (error) {
              reply = {
                kind: "response",
                id: typeof value.id === "string" ? value.id.slice(0, 160) : "invalid",
                ok: false,
                error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
              };
            } finally {
              activeRequest = false;
            }
            try {
              send(reply);
            } catch (error) {
              send({
                kind: "response",
                id: reply.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          } catch (error) {
            fail(error instanceof Error ? error.message : String(error));
          }
        };
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    },
    disconnect() {
      cleanup();
      publish({ status: "disconnected", peerConnected: false, error: undefined });
    },
    dispose() {
      cleanup();
      disposed = true;
      listeners.clear();
      state = { ...state, status: "disconnected", peerConnected: false };
    },
  };
}
export type AgentBridge = ReturnType<typeof createAgentBridge>;
const bridges = new WeakMap<EnginePort, AgentBridge>();
export function getAgentBridge(engine: EnginePort): AgentBridge {
  let bridge = bridges.get(engine);
  if (!bridge) {
    bridge = createAgentBridge(engine);
    bridges.set(engine, bridge);
  }
  return bridge;
}
