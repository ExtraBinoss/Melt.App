import type { Asset, Project } from "../document/model";
import type { ReplayEvent, ReplayState } from "../animation/model";
import { applyReplayDelta, diffReplayState } from "../animation/delta";
import { projectFromReplayState } from "../animation/validation";
import { stateFromProject } from "../animation/state";
import { ensure } from "../errors";

export const ENGINE_HISTORY_LIMIT = 100;
export interface RestoredHistoryFrame {
  project: Project;
  pageId: string;
}
export interface RestoredHistory {
  pageId: string;
  past: readonly RestoredHistoryFrame[];
  future: readonly RestoredHistoryFrame[];
}
interface Frame {
  state: ReplayState;
  pageId: string;
}

/** Reduce paginated durable transitions without commands, publications or original bytes. */
export function createHistoryRestoration(
  initial: ReplayState,
  pageId: string,
  limit = ENGINE_HISTORY_LIMIT,
) {
  ensure(
    Number.isInteger(limit) && limit >= 1 && limit <= ENGINE_HISTORY_LIMIT,
    "INVALID_DOCUMENT",
    "Invalid restored history limit.",
  );
  let current: Frame = { state: initial, pageId };
  const past: Frame[] = [],
    future: Frame[] = [];
  const equal = (a: ReplayState, b: ReplayState) => diffReplayState(a, b).length === 0;
  const append = (stack: Frame[], frame: Frame) => {
    stack.push(frame);
    if (stack.length > limit) stack.shift();
  };
  return {
    append(event: ReplayEvent) {
      ensure(event.projectId === initial.id, "INVALID_DOCUMENT", "History project differs.");
      const next = {
        state:
          event.after ??
          applyReplayDelta(current.state, event.delta, { legacyObjectRemovals: true }),
        pageId: event.pageId,
      };
      ensure(next.state.id === initial.id, "INVALID_DOCUMENT", "History project differs.");
      switch (event.kind ?? "commit") {
        case "load":
          // A normal reopen is a checkpoint of the same document, not a new edit.
          if (!equal(current.state, next.state)) {
            past.length = 0;
            future.length = 0;
          }
          break;
        case "undo": {
          const previous = past.pop();
          if (previous && !equal(previous.state, next.state)) past.length = 0;
          // Pruning can remove the matching commit; its undo still proves this redo state.
          append(future, current);
          break;
        }
        case "redo": {
          const previous = future.pop();
          if (previous && !equal(previous.state, next.state)) future.length = 0;
          append(past, current);
          break;
        }
        case "commit":
          append(past, current);
          future.length = 0;
          break;
        default:
          ensure(false, "INVALID_DOCUMENT", "Invalid history transition.");
      }
      current = next;
    },
    assetIds() {
      return new Set([...past, ...future].flatMap((frame) => frame.state.assetIds));
    },
    matches(project: Project) {
      return equal(current.state, stateFromProject(project));
    },
    finish(project: Project, assets: Readonly<Record<string, Asset>>): RestoredHistory {
      ensure(
        equal(current.state, stateFromProject(project)),
        "INVALID_DOCUMENT",
        "Saved project differs from its retained history. Reopen after saving the project.",
      );
      const frame = (entry: Frame): RestoredHistoryFrame => ({
        project: {
          ...projectFromReplayState(entry.state, assets),
          ...(project.replay ? { replay: project.replay } : {}),
        },
        pageId: entry.pageId,
      });
      return { pageId: current.pageId, past: past.map(frame), future: future.map(frame) };
    },
  };
}
