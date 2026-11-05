import type { ReactNode } from "react";
import type { Composition, EnginePort, SessionSnapshot, OutputFraming } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
export interface ExportPaneProps {
  engine: EnginePort;
  origin: SessionSnapshot;
  page: Composition;
  selection: readonly string[];
  centerSelection?: boolean;
  framing?: OutputFraming;
  controls: ReactNode;
  services: EditorServices;
  previewActive?: boolean;
  onClose: () => void;
}
