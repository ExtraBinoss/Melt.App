import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../../state/contracts";
import type { LibraryItem } from "../../../services/projects/library/favorites";
import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import type { LibraryPreviewRequest } from "./links";
/** Resolve only one durable summary; never open or create a document while inspecting a URL. */
export function useLinkedPreview(
  request: LibraryPreviewRequest | null | undefined,
  services: EditorServices,
  inspect: (item: LibraryItem, open: () => void) => void,
  onOpen: ((item: LibraryItem) => void) | undefined,
  onError: ((error: unknown) => void) | undefined,
) {
  const { t } = useTranslation("libraryItem");
  const latest = useRef({ onOpen, onError });
  useLayoutEffect(() => {
    latest.current = { onOpen, onError };
  });
  useEffect(() => {
    if (!request) return;
    let alive = true;
    void (async () => {
      let item: LibraryItem;
      if (request.kind === "template") {
        const template = TEMPLATE_CATALOG.find((entry) => entry.id === request.id);
        if (!template) throw Error(t("failed"));
        item = {
          kind: "template",
          id: template.id,
          name: t(template.nameKey),
          mode: template.mode,
          preview: template.preview,
          width: template.width,
          height: template.height,
        };
      } else {
        const result = await services.listProjectPage({ ids: [request.id], limit: 1 });
        const project = result.projects.find((entry) => entry.id === request.id);
        if (!project) throw Error(t("failed"));
        const page = project.pages.find((entry) => entry.mode === "motion") ?? project.pages[0];
        item = {
          kind: "project",
          id: project.id,
          name: project.name,
          mode:
            project.mode ??
            (project.pages.some((entry) => entry.mode === "motion") ? "motion" : "static"),
          pageId: page?.id,
          preview: project.thumbnail,
          width: page?.width ?? project.width,
          height: page?.height ?? project.height,
        };
      }
      if (alive) inspect(item, () => latest.current.onOpen?.(item));
    })().catch((error: unknown) => {
      if (alive) latest.current.onError?.(error);
    });
    return () => {
      alive = false;
    };
  }, [request, services, inspect, t]);
}
