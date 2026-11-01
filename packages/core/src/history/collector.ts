import type { Composition, Layer, Project } from "../document/model";
import { freezeValue } from "../document/immutable";
import { isMotionTime, motionTimeToSeconds } from "../motion/time";
import type {
  HistoryAction,
  HistoryChange,
  HistoryDescription,
  HistoryOwner,
  HistoryPropertyChange,
  HistoryPropertyTarget,
  HistoryValue,
} from "./model";
import { getHistoryPropertyDefinition } from "./properties";

export const HISTORY_CHANGE_LIMIT = 64;
export const HISTORY_STRING_LIMIT = 120;
export function historyValue(value: unknown): HistoryValue {
  if (typeof value === "string") {
    let text = "",
      length = 0;
    for (const character of value) {
      if (length++ === HISTORY_STRING_LIMIT)
        return { kind: "scalar", value: text, truncated: true };
      text += character;
    }
    return { kind: "scalar", value: text };
  }
  if (typeof value === "number" || typeof value === "boolean") return { kind: "scalar", value };
  if (isMotionTime(value)) return { kind: "scalar", value: motionTimeToSeconds(value) };
  return { kind: "missing" };
}
function same(a: HistoryValue, b: HistoryValue): boolean {
  return (
    a.kind === b.kind &&
    (a.kind !== "scalar" ||
      (b.kind === "scalar" && a.value === b.value && a.truncated === b.truncated))
  );
}
function address(
  target: HistoryPropertyTarget,
  context?: "keyframe" | "animation",
  location?: { at: number; trackId?: string | undefined },
): string {
  return JSON.stringify([target.owner, target.property, context, location?.at, location?.trackId]);
}
/** Transaction-local accumulator. It retains only bounded detached values, never document objects. */
export class HistoryCollector {
  private readonly changes = new Map<string, HistoryChange>();
  private pending: (() => void)[] = [];
  private readonly pendingKeys = new Set<string>();
  private overflow = false;
  begin(): void {
    this.pending = [];
    this.pendingKeys.clear();
  }
  watch(
    target: HistoryPropertyTarget,
    read: () => unknown,
    expected: unknown,
    context?: "keyframe" | "animation",
    location?: { at: number; trackId?: string | undefined },
  ): void {
    const key = address(target, context, location);
    if (this.pendingKeys.has(key)) return;
    const original = read(),
      before = historyValue(original),
      planned = historyValue(expected);
    if (
      same(before, planned) &&
      !(before.kind === "scalar" && before.truncated && original !== expected)
    )
      return;
    if (
      !this.changes.has(key) &&
      this.changes.size + [...this.pendingKeys].filter((key) => !this.changes.has(key)).length >=
        HISTORY_CHANGE_LIMIT
    ) {
      this.overflow = true;
      return;
    }
    this.pendingKeys.add(key);
    // Large strings are only compared during this command; the closure is released by finish().
    this.pending.push(() => {
      const current = read(),
        after = historyValue(current);
      if (
        same(before, after) &&
        !(before.kind === "scalar" && before.truncated && original !== current)
      )
        return;
      const existing = this.changes.get(key);
      if (!existing && this.changes.size >= HISTORY_CHANGE_LIMIT) {
        this.overflow = true;
        return;
      }
      this.changes.set(key, {
        kind: "property",
        target: { owner: { ...target.owner }, property: target.property } as HistoryPropertyTarget,
        before: existing?.kind === "property" ? existing.before : before,
        after,
        ...(context ? { context } : {}),
        ...(location
          ? {
              at: location.at,
              ...(location.trackId !== undefined ? { trackId: location.trackId } : {}),
            }
          : {}),
      });
    });
  }
  action(action: HistoryAction, owner: HistoryOwner): void {
    const key = JSON.stringify([owner, action]);
    if (this.changes.has(key)) return;
    if (this.changes.size >= HISTORY_CHANGE_LIMIT) {
      this.overflow = true;
      return;
    }
    this.changes.set(key, { kind: "action", action, owner: { ...owner } });
  }
  finish(): void {
    for (const emit of this.pending) emit();
    this.pending = [];
    this.pendingKeys.clear();
  }
  snapshot(): HistoryDescription {
    return freezeValue({ changes: [...this.changes.values()], additionalChanges: this.overflow });
  }
}
export interface HistoryContext {
  readonly project: Project;
  readonly page: Composition;
  readonly history: HistoryCollector;
  layers(page?: Composition): ReadonlyMap<string, Layer>;
}
/** One index per draft layer array, reused throughout scalar command batches. */
export function historyContexts(project: Project, history: HistoryCollector) {
  const indexes = new Map<
    Composition,
    { array: Layer[]; length: number; byId: Map<string, Layer> }
  >();
  const layers = (page: Composition) => {
    let index = indexes.get(page);
    if (!index || index.array !== page.layers || index.length !== page.layers.length) {
      index = {
        array: page.layers,
        length: page.layers.length,
        byId: new Map(page.layers.map((layer) => [layer.id, layer])),
      };
      indexes.set(page, index);
    }
    return index.byId;
  };
  return (pageId: string): HistoryContext => {
    const page = project.pages.find((page) => page.id === pageId)!;
    return { project, page, history, layers: (target = page) => layers(target) };
  };
}
export function layerOwner(
  page: Composition,
  layerId: string,
): Extract<HistoryOwner, { kind: "layer" }> {
  return { kind: "layer", compositionId: page.id, layerId };
}
export function motionOwner(
  page: Composition,
  entity: Extract<HistoryOwner, { kind: "motion" }>["entity"],
  ids: {
    trackId?: string | undefined;
    keyframeId?: string | undefined;
    animationId?: string | undefined;
  } = {},
): Extract<HistoryOwner, { kind: "motion" }> {
  return {
    kind: "motion",
    compositionId: page.id,
    entity,
    ...(ids.trackId !== undefined ? { trackId: ids.trackId } : {}),
    ...(ids.keyframeId !== undefined ? { keyframeId: ids.keyframeId } : {}),
    ...(ids.animationId !== undefined ? { animationId: ids.animationId } : {}),
  };
}
export type HistoryCapture = (() => void) | void;
export type HistoryHandlers = {
  [K in import("../document/model").Command["type"]]: (
    context: HistoryContext,
    command: Extract<import("../document/model").Command, { type: K }>,
  ) => HistoryCapture;
};
export type PropertyContext = HistoryPropertyChange["context"];
export function readPath(value: unknown, property: string): unknown {
  for (const key of property.split(".")) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
/** Callers supply domain-allowlisted keys; the registry rejects unavailable effect settings. */
export function watchFields(
  context: HistoryContext,
  owner: HistoryOwner,
  properties: readonly string[],
  read: () => unknown,
  expected: unknown,
  intent?: PropertyContext,
): void {
  for (const property of properties) {
    const target = { owner, property } as HistoryPropertyTarget;
    if (getHistoryPropertyDefinition(target))
      context.history.watch(
        target,
        () => readPath(read(), property),
        readPath(expected, property),
        intent,
      );
  }
}
