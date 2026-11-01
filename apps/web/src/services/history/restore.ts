import {
  createHistoryRestoration,
  diffReplayState,
  stateFromProject,
  type Asset,
  type Project,
  type RestoredHistory,
} from "@musart/core";
import type { IDBPDatabase } from "idb";
import type { StudioDatabase } from "../projects/database";
import { assertProjectWritable } from "../projects/lifecycle";
import { StaleProjectWriteError } from "../projects/writes/revision";
import { HISTORY_PAGE_SIZE } from "./model";

/** One consistent read; pages and the short engine stack bound retained metadata and originals. */
export async function restoreProjectHistory(
  db: IDBPDatabase<StudioDatabase>,
  project: Project,
  signal?: AbortSignal,
): Promise<RestoredHistory | undefined> {
  const tx = db.transaction([
    "projects",
    "preferences",
    "journalMeta",
    "journalBase",
    "journalEvents",
    "journalAssets",
  ]);
  const done = tx.done;
  try {
    signal?.throwIfAborted();
    await assertProjectWritable(tx.objectStore("preferences"), project.id);
    const storedProject = await tx.objectStore("projects").get(project.id);
    if (!storedProject) throw new Error("Saved project no longer exists.");
    const { assets: metadataAssets, replay: _replay, ...metadata } = storedProject.project;
    if (
      diffReplayState(
        { ...metadata, assetIds: Object.keys(metadataAssets) },
        stateFromProject(project),
      ).length
    )
      throw new StaleProjectWriteError(project.id);
    const meta = await tx.objectStore("journalMeta").get(project.id),
      base = await tx.objectStore("journalBase").get(project.id);
    if (!meta) {
      await done;
      return undefined;
    }
    if (!base) throw new Error("History base is missing.");
    if (
      !Number.isSafeInteger(meta.first) ||
      !Number.isSafeInteger(meta.next) ||
      meta.first < 0 ||
      meta.next < meta.first ||
      meta.next - meta.first !== meta.count ||
      meta.count > meta.limit
    )
      throw new Error("History count is inconsistent.");
    if (!meta.count) {
      await done;
      return undefined;
    }
    const restoration = createHistoryRestoration(base.state, base.pageId);
    let next = meta.first;
    while (next < meta.next) {
      signal?.throwIfAborted();
      const batch = await tx
        .objectStore("journalEvents")
        .getAll(
          IDBKeyRange.bound([project.id, next], [project.id, meta.next - 1]),
          HISTORY_PAGE_SIZE,
        );
      if (!batch.length) throw new Error("History entries are incomplete.");
      for (const entry of batch) {
        if (entry.sequence !== next++) throw new Error("History entries are incomplete.");
        restoration.append(entry.event);
      }
    }
    if (!restoration.matches(project) && !meta.enabled) {
      // Unrecorded edits deliberately have no durable undo counterpart.
      await done;
      return undefined;
    }
    const assets: Record<string, Asset> = { ...project.assets };
    for (const id of restoration.assetIds()) {
      signal?.throwIfAborted();
      if (Object.hasOwn(assets, id)) continue;
      const stored = await tx.objectStore("journalAssets").get([project.id, id]);
      if (!stored) throw new Error(`Missing history asset: ${id}`);
      Object.defineProperty(assets, id, { value: stored.asset, enumerable: true });
    }
    await done;
    return restoration.finish(project, assets);
  } catch (error) {
    await done.catch(() => undefined);
    throw error;
  }
}
