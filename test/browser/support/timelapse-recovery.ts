import { evaluateReplay, stateFromProject } from "../../../packages/core/src/index";
import { openStudioDatabase } from "../../../apps/web/src/services/projects/database";
import { HistoryStore } from "../../../apps/web/src/services/history/store";
import type {} from "../../../apps/web/src/services/automation/automation";

/** Install a genuine older-format journal through the normal atomic history writer. */
export async function installLegacyHistory(broken = false) {
  const source = await window.musart!.historyReplay();
  const db = await openStudioDatabase("musart-studio");
  const store = new HistoryStore(async () => db);
  let modified = 0;
  try {
    let meta = await store.clear(source.initial, source.pageId),
      previous = 0;
    for (const original of source.events) {
      const event = structuredClone(original);
      if (!event.after) {
        event.delta.unshift({ op: "remove", path: ["pages", 0, "layers", 0, "fillGradient"] });
        if (broken && !modified)
          event.delta.push({
            op: "set",
            path: ["pages", 0, "layers", 0, "missingContainer", "child"],
            value: 1,
          });
        modified++;
      }
      const project = evaluateReplay(source, original.at);
      meta = await store.append(project.id, event, {}, project.updatedAt, original.at - previous, {
        expectedNext: meta.next,
        current: stateFromProject(project),
      });
      previous = original.at;
    }
    if (!modified) throw new Error("The witness must contain non-checkpoint history edits.");
    return { modified, count: meta.count };
  } finally {
    db.close();
  }
}
