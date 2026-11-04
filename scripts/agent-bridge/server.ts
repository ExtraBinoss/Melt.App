import type { ServerWebSocket } from "bun";
import { timingSafeEqual } from "node:crypto";
import {
  BRIDGE_VERSION,
  MAX_MESSAGE_BYTES,
  MAX_PENDING,
  decodeMessage,
  encodeMessage,
  object,
  parseHello,
  parseRequest,
} from "../../apps/web/src/services/automation/bridge/protocol";

interface Peer {
  role?: "editor" | "agent";
  authTimer?: ReturnType<typeof setTimeout>;
}
const port = Number(process.env.MELT_AGENT_PORT ?? 6101);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid MELT_AGENT_PORT.");
const origins = new Set(
  (process.env.MELT_AGENT_ORIGINS ?? "http://127.0.0.1:6100,http://localhost:6100").split(","),
);
for (const origin of origins) {
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
    throw new Error("Origins must be exact HTTP origins.");
}
const token = [...crypto.getRandomValues(new Uint8Array(32))]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");
const peers = new Set<ServerWebSocket<Peer>>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const requestIds = new Set<string>();
const find = (role: "editor" | "agent") => [...peers].find((peer) => peer.data.role === role);
function send(peer: ServerWebSocket<Peer> | undefined, message: unknown) {
  if (!peer) return;
  if (peer.readyState !== 1 || peer.getBufferedAmount() > MAX_MESSAGE_BYTES * 2) {
    peer.close(1013, "Send queue is full");
    return;
  }
  peer.send(encodeMessage(message));
}
function rejectPending(message: string) {
  for (const [id, timer] of pending) {
    clearTimeout(timer);
    send(find("agent"), { kind: "response", id, ok: false, error: message });
  }
  pending.clear();
}
const server = Bun.serve<Peer>({
  hostname: "127.0.0.1",
  port,
  fetch(request, server) {
    const origin = request.headers.get("origin");
    if (new URL(request.url).pathname !== "/" || (origin !== null && !origins.has(origin)))
      return new Response("Forbidden", { status: 403 });
    if (peers.size >= 4) return new Response("Relay is full", { status: 503 });
    if (server.upgrade(request, { data: {} })) return;
    return new Response("WebSocket pairing required", { status: 426 });
  },
  websocket: {
    maxPayloadLength: MAX_MESSAGE_BYTES,
    backpressureLimit: MAX_MESSAGE_BYTES * 2,
    closeOnBackpressureLimit: true,
    idleTimeout: 0,
    open(peer) {
      peers.add(peer);
      peer.data.authTimer = setTimeout(() => peer.close(1008, "Pairing timed out"), 5000);
    },
    message(peer, raw) {
      try {
        if (typeof raw !== "string") throw new Error("Text JSON required.");
        const message = decodeMessage(raw);
        if (!peer.data.role) {
          const hello = parseHello(message);
          if (!timingSafeEqual(Buffer.from(hello.token), Buffer.from(token)) || find(hello.role))
            throw new Error("Invalid pairing or role already connected.");
          clearTimeout(peer.data.authTimer);
          peer.data.authTimer = undefined;
          peer.data.role = hello.role;
          if (hello.role === "agent") requestIds.clear();
          send(peer, { kind: "ready", version: BRIDGE_VERSION });
          const other = find(hello.role === "editor" ? "agent" : "editor");
          send(peer, { kind: "peer", connected: !!other });
          send(other, { kind: "peer", connected: true });
          return;
        }
        if (peer.data.role === "agent") {
          const request = parseRequest(message);
          if (requestIds.has(request.id) || requestIds.size >= 4096)
            throw new Error("Duplicate request ID or session limit reached; reconnect.");
          requestIds.add(request.id);
          if (!find("editor") || pending.size >= MAX_PENDING) {
            send(peer, {
              kind: "response",
              id: request.id,
              ok: false,
              error: !find("editor") ? "No editor is connected." : "Request queue is full.",
            });
            return;
          }
          pending.set(
            request.id,
            setTimeout(() => {
              pending.delete(request.id);
              send(find("agent"), {
                kind: "response",
                id: request.id,
                ok: false,
                error: "Editor response timed out; inspect the current session before retrying.",
              });
            }, 30_000),
          );
          send(find("editor"), request);
        } else {
          if (!object(message)) throw new Error("Invalid editor message.");
          if (message.kind === "session") {
            if (
              Object.keys(message).some((key) => !["kind", "session"].includes(key)) ||
              !object(message.session)
            )
              throw new Error("Invalid session metadata.");
            const session = message.session;
            const fields = ["projectId", "pageId", "revision", "selection", "canUndo", "canRedo"];
            if (
              Object.keys(session).some((key) => !fields.includes(key)) ||
              typeof session.projectId !== "string" ||
              typeof session.pageId !== "string" ||
              !Number.isSafeInteger(session.revision) ||
              !Array.isArray(session.selection) ||
              session.selection.length > 1000 ||
              !session.selection.every((id) => typeof id === "string" && id.length <= 160) ||
              typeof session.canUndo !== "boolean" ||
              typeof session.canRedo !== "boolean"
            )
              throw new Error("Invalid session metadata.");
            send(find("agent"), message);
            return;
          }
          if (
            message.kind !== "response" ||
            typeof message.id !== "string" ||
            typeof message.ok !== "boolean" ||
            Object.keys(message).some(
              (key) => !["kind", "id", "ok", "result", "error"].includes(key),
            ) ||
            (message.ok === false && typeof message.error !== "string")
          )
            throw new Error("Invalid editor response.");
          const timer = pending.get(message.id);
          if (!timer) return; // A timed-out request cannot satisfy a later request.
          clearTimeout(timer);
          pending.delete(message.id);
          send(find("agent"), message);
        }
      } catch (error) {
        peer.close(
          1008,
          (error instanceof Error ? error.message : "Invalid message").slice(0, 120),
        );
      }
    },
    close(peer) {
      clearTimeout(peer.data.authTimer);
      peers.delete(peer);
      if (peer.data.role) {
        rejectPending("Peer disconnected; inspect the current session before retrying.");
        send(find(peer.data.role === "editor" ? "agent" : "editor"), {
          kind: "peer",
          connected: false,
        });
      }
    },
  },
});
console.log(
  `Local agent relay: ws://127.0.0.1:${server.port}/\nPairing token: ${token}\nAllowed editor origins: ${[...origins].join(", ")}`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    rejectPending("Relay stopped.");
    for (const peer of peers) {
      clearTimeout(peer.data.authTimer);
      peer.close(1001, "Relay stopped");
    }
    void server.stop(true);
  });
