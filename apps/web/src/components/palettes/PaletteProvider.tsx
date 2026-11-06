import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { EnginePort } from "@musart/core";
const PaletteContext = createContext<EnginePort | undefined>(undefined);
export function PaletteProvider({ engine, children }: { engine: EnginePort; children: ReactNode }) {
  return <PaletteContext.Provider value={engine}>{children}</PaletteContext.Provider>;
}
export function usePaletteEngine() {
  return useContext(PaletteContext);
}
