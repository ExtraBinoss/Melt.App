import {
  BRIDGE_VERSION,
  decodeMessage,
  encodeMessage,
  localEndpoint,
  object,
  parseRequest,
} from "../../apps/web/src/services/automation/bridge/protocol";

const operation = process.argv[2];
if (!operation)
  throw new Error(
    "Usage: MELT_AGENT_TOKEN=<token> bun scripts/agent-bridge/client.ts <session|snapshot|request.json>",
  );
const token = process.env.MELT_AGENT_TOKEN ?? "";
if (!/^[a-f0-9]{64}$/.test(token))
  throw new Error("Set MELT_AGENT_TOKEN to the relay pairing token.");
const request = parseRequest(
  operation === "session" || operation === "snapshot"
    ? { kind: "request", id: crypto.randomUUID(), operation }
    : await Bun.file(operation).json(),
);
const socket = new WebSocket(
  localEndpoint(process.env.MELT_AGENT_ENDPOINT ?? "ws://127.0.0.1:6101/"),
);
await new Promise<void>((resolve, reject) => {
  const finish = (error?: Error) => {
    clearTimeout(timer);
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    socket.close();
    if (error) reject(error);
    else resolve();
  };
  const timer = setTimeout(() => finish(new Error("Local agent request timed out.")), 35_000);
  socket.onopen = () =>
    socket.send(encodeMessage({ kind: "hello", version: BRIDGE_VERSION, role: "agent", token }));
  socket.onerror = () => finish(new Error("Could not connect to the local relay."));
  socket.onclose = (event) => finish(new Error(`Relay closed: ${event.reason || event.code}`));
  socket.onmessage = (event) => {
    try {
      if (typeof event.data !== "string") throw new Error("Expected JSON response.");
      const value = decodeMessage(event.data);
      if (!object(value)) throw new Error("Invalid relay response.");
      if (value.kind === "ready") socket.send(encodeMessage(request));
      if (value.kind === "response" && value.id === request.id) {
        console.log(JSON.stringify(value, null, 2));
        finish(value.ok === true ? undefined : new Error(String(value.error)));
      }
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  };
});
