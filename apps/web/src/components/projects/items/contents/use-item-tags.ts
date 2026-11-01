import { useEffect, useState } from "react";
import type { ProjectContentTag } from "@musart/core";
import type { LibraryItem } from "../../../../services/projects/library/favorites";
import type { EditorServices } from "../../../../state/contracts";
import { templateContentTags } from "../../../../services/projects/templates/contents";

/** Stale favorites resolve one small summary; original media and history are never opened. */
export function useItemTags(item: LibraryItem | undefined, services: EditorServices) {
  const [resolved, setResolved] = useState<{
    id: string;
    tags?: readonly ProjectContentTag[];
    failed?: boolean;
  } | null>(null);
  useEffect(() => {
    if (!item || item.kind !== "project" || item.tags) return;
    let active = true;
    void services.listProjectPage({ ids: [item.id], limit: 1 }).then(
      ({ projects }) => {
        if (active) setResolved({ id: item.id, tags: projects[0]?.tags });
      },
      (error: unknown) => {
        if (active) {
          console.error("[Melt project contents failed]", { projectId: item.id, error });
          setResolved({ id: item.id, failed: true });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [item, services]);
  const current = item?.kind === "project" && resolved?.id === item.id ? resolved : null;
  return {
    tags: item?.kind === "template" ? templateContentTags(item.id) : (item?.tags ?? current?.tags),
    failed: !item?.tags && current?.failed === true,
  };
}
