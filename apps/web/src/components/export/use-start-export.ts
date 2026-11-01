import { getExportJobs, type ExportKind } from "../../services/export/jobs";
import { backgroundExportGate } from "../../services/export/background";
import type { ExportPaneProps } from "./workspace-model";
import type { ExportSizeKey } from "../../services/export/measurements";
export function useStartExport(
  { engine, origin, page }: Pick<ExportPaneProps, "engine" | "origin" | "page">,
  kind: ExportKind,
  sizeKey?: ExportSizeKey,
) {
  return (
    task: (work: {
      signal: AbortSignal;
      progress: (fraction: number) => void;
      estimate: (bytes: number) => void;
      beforeFrame: () => Promise<void>;
    }) => Promise<void | { bytes: number }>,
  ) => {
    getExportJobs(engine).start(
      { kind, projectId: origin.project.id, name: page.name, sizeKey },
      async ({ signal, progress, estimate }) => {
        const gate = backgroundExportGate(signal);
        try {
          return await task({ signal, progress, estimate, beforeFrame: gate.beforeFrame });
        } finally {
          gate.dispose();
        }
      },
    );
  };
}
