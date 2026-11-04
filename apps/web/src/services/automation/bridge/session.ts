import type { CommandCommitInfo, EnginePort } from "@musart/core";
import { parseRequest, type BridgeReply } from "./protocol";
import { commitTargetNames } from "./activity";

export function bridgeSession(engine: EnginePort) {
  const state = engine.getSnapshot();
  return {
    projectId: state.project.id,
    pageId: state.pageId,
    revision: state.revision,
    selection: [...state.selection],
    canUndo: state.canUndo,
    canRedo: state.canRedo,
  };
}
/** A document view for deliberate inspection, without binary originals or replay journals. */
function inspect(engine: EnginePort) {
  const state = engine.getSnapshot();
  const { assets, replay: _replay, ...project } = state.project;
  return { ...bridgeSession(engine), project: { ...project, assetIds: Object.keys(assets) } };
}
export interface BridgeActivity {
  id: number;
  at: number;
  source: "agent" | "editor";
  operation: string;
  targets: string[];
  revision: number;
  ok: boolean;
  error?: string;
}
export function handleBridgeRequest(
  engine: EnginePort,
  input: unknown,
): {
  reply: BridgeReply;
  activity?: Omit<BridgeActivity, "id" | "at" | "source">;
} {
  const request = parseRequest(input);
  if (request.operation === "session")
    return { reply: { kind: "response", id: request.id, ok: true, result: bridgeSession(engine) } };
  if (request.operation === "snapshot")
    return { reply: { kind: "response", id: request.id, ok: true, result: inspect(engine) } };
  const before = engine.getSnapshot();
  const page = before.project.pages.find((item) => item.id === before.pageId);
  const commands =
    request.operation === "execute"
      ? [request.command]
      : request.operation === "transaction"
        ? request.commands
        : [];
  const targetIds = new Set<string>();
  for (const command of commands) {
    if ("ids" in command) command.ids.forEach((id) => targetIds.add(id));
    if ("id" in command && typeof command.id === "string") targetIds.add(command.id);
    if ("targetId" in command && typeof command.targetId === "string")
      targetIds.add(command.targetId);
    if ("sourceId" in command && typeof command.sourceId === "string")
      targetIds.add(command.sourceId);
    if ("layerId" in command && typeof command.layerId === "string") targetIds.add(command.layerId);
    if ("trackId" in command) {
      const track = page?.motion?.tracks.find((track) => track.id === command.trackId);
      if (track) targetIds.add(track.layerId);
    }
    if ("patches" in command) command.patches.forEach((patch) => targetIds.add(patch.id));
    if ("layers" in command) command.layers.forEach((layer) => targetIds.add(layer.id));
  }
  if (request.operation === "select") request.ids.forEach((id) => targetIds.add(id));
  const added = commands.flatMap((command) => ("layers" in command ? command.layers : []));
  const targets = [...targetIds]
    .slice(0, 12)
    .map(
      (id) =>
        page?.layers.find((layer) => layer.id === id)?.name ??
        added.find((layer) => layer.id === id)?.name ??
        id,
    );
  const operation = commands.length
    ? commands
        .map((command) => command.type)
        .slice(0, 8)
        .join(", ")
    : request.operation;
  let stopCommit: (() => void) | undefined;
  try {
    const expected = request.expected;
    if (
      expected.projectId !== before.project.id ||
      expected.pageId !== before.pageId ||
      expected.revision !== before.revision
    )
      throw new Error("Stale session: request the current session before editing.");
    if (request.operation === "undo" || request.operation === "redo") {
      const observed = engine as EnginePort & {
        subscribeCommitInfo?: (listener: (info: CommandCommitInfo) => void) => () => void;
      };
      stopCommit = observed.subscribeCommitInfo?.((info) =>
        targets.push(...commitTargetNames(info)),
      );
    }
    if (request.operation === "execute") engine.execute(request.command);
    else if (request.operation === "transaction") engine.transaction(request.commands);
    else if (request.operation === "select") engine.select(request.ids);
    else if (request.operation === "undo") engine.undo();
    else engine.redo();
    return {
      reply: { kind: "response", id: request.id, ok: true, result: bridgeSession(engine) },
      activity: { operation, targets, revision: engine.getSnapshot().revision, ok: true },
    };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    return {
      reply: { kind: "response", id: request.id, ok: false, error: message },
      activity: {
        operation,
        targets,
        revision: engine.getSnapshot().revision,
        ok: false,
        error: message,
      },
    };
  } finally {
    stopCommit?.();
  }
}
