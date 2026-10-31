import type { ReactNode } from "react";
import type { Composition, EnginePort, SessionSnapshot } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
export interface ExportPaneProps {
  engine: EnginePort;
  origin: SessionSnapshot;
  page: Composition;
  selection: readonly string[];
  centerSelection?: boolean;
  controls: ReactNode;
  services: EditorServices;
  previewActive?: boolean;
  onClose: () => void;
}
