import { isCommandType, type Command } from "@musart/core";

export const BRIDGE_VERSION = 1;
export const MAX_MESSAGE_BYTES = 262_144;
export const MAX_PENDING = 16;
export interface ExpectedSession {
  projectId: string;
  pageId: string;
  revision: number;
}
export type BridgeRequest = {
  kind: "request";
  id: string;
} & (
  | { operation: "session" }
  | { operation: "snapshot" }
  | { operation: "execute"; expected: ExpectedSession; command: Command }
  | { operation: "transaction"; expected: ExpectedSession; commands: Command[] }
  | { operation: "undo" | "redo"; expected: ExpectedSession }
  | { operation: "select"; expected: ExpectedSession; ids: string[] }
);
export interface BridgeReply {
  kind: "response";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("Unexpected protocol field.");
}
function boundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}
function safeJson(value: unknown, depth = 0): void {
  if (depth > 32) throw new Error("JSON nesting limit exceeded.");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Nonfinite number.");
  if (Array.isArray(value)) value.forEach((item) => safeJson(item, depth + 1));
  else if (object(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new Error("Unsafe JSON field.");
      safeJson(item, depth + 1);
    }
  }
}
export function decodeMessage(raw: string): unknown {
  if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES)
    throw new Error("Message size limit exceeded.");
  const value: unknown = JSON.parse(raw);
  safeJson(value);
  return value;
}
export function encodeMessage(value: unknown): string {
  const raw = JSON.stringify(value);
  if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES)
    throw new Error("Response size limit exceeded.");
  return raw;
}
export function parseHello(value: unknown): { role: "editor" | "agent"; token: string } {
  if (!object(value)) throw new Error("Authentication required.");
  keys(value, ["kind", "version", "role", "token"]);
  if (
    value.kind !== "hello" ||
    value.version !== BRIDGE_VERSION ||
    !["editor", "agent"].includes(String(value.role)) ||
    typeof value.token !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.token)
  )
    throw new Error("Invalid authentication.");
  return { role: value.role as "editor" | "agent", token: value.token };
}
export function parseRequest(value: unknown): BridgeRequest {
  if (!object(value) || value.kind !== "request" || !boundedString(value.id))
    throw new Error("Invalid request envelope.");
  const operation = value.operation;
  if (operation === "session" || operation === "snapshot") {
    keys(value, ["kind", "id", "operation"]);
    return value as BridgeRequest;
  }
  if (!["execute", "transaction", "select", "undo", "redo"].includes(String(operation)))
    throw new Error("Unknown operation.");
  const payload =
    operation === "execute"
      ? "command"
      : operation === "transaction"
        ? "commands"
        : operation === "select"
          ? "ids"
          : undefined;
  keys(value, ["kind", "id", "operation", "expected", ...(payload ? [payload] : [])]);
  const expected = value.expected;
  if (
    !object(expected) ||
    !boundedString(expected.projectId) ||
    !boundedString(expected.pageId) ||
    !Number.isSafeInteger(expected.revision) ||
    Number(expected.revision) < 0
  )
    throw new Error("Expected project, page and revision are required.");
  keys(expected, ["projectId", "pageId", "revision"]);
  const command = (item: unknown) => {
    if (!object(item) || !isCommandType(item.type)) throw new Error("Invalid engine command.");
    // Domain payloads are validated atomically by the authoritative engine handlers.
  };
  if (operation === "execute") command(value.command);
  if (operation === "transaction") {
    if (!Array.isArray(value.commands) || value.commands.length < 1 || value.commands.length > 128)
      throw new Error("Expected 1–128 commands.");
    value.commands.forEach(command);
  }
  if (
    operation === "select" &&
    (!Array.isArray(value.ids) || value.ids.length > 1000 || !value.ids.every(boundedString))
  )
    throw new Error("Invalid selection IDs.");
  return value as BridgeRequest;
}
export function localEndpoint(input: string): string {
  const url = new URL(input);
  if (
    url.protocol !== "ws:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Use a loopback ws:// endpoint without credentials or query parameters.");
  return url.href;
}
