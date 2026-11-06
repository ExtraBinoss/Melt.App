import { useSyncExternalStore } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../shared/IconButton";
import { usePaletteEngine } from "./PaletteProvider";

const noSubscription = () => () => {};
/** Only these controls subscribe to document history availability. */
export function PaletteHistoryButtons({
  busy,
  canUndo,
  canRedo,
  onMove,
  beforeDocumentHistory,
}: {
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onMove: (direction: -1 | 1) => void;
  beforeDocumentHistory: () => void;
}) {
  const { t } = useTranslation("palettes");
  const engine = usePaletteEngine();
  const availability = useSyncExternalStore(
    engine?.subscribe ?? noSubscription,
    () => {
      const snapshot = engine?.getSnapshot();
      return (snapshot?.canUndo ? 1 : 0) | (snapshot?.canRedo ? 2 : 0);
    },
    () => 0,
  );
  function move(direction: -1 | 1) {
    if (direction === -1 ? canUndo : canRedo) onMove(direction);
    else if (engine) {
      beforeDocumentHistory();
      if (direction === -1) engine.undo();
      else engine.redo();
    }
  }
  return (
    <>
      <IconButton
        label={t("historyUndo")}
        tooltipSide="top"
        disabled={busy || !(canUndo || availability & 1)}
        onClick={() => move(-1)}
      >
        <Undo2 size={16} />
      </IconButton>
      <IconButton
        label={t("historyRedo")}
        tooltipSide="top"
        disabled={busy || !(canRedo || availability & 2)}
        onClick={() => move(1)}
      >
        <Redo2 size={16} />
      </IconButton>
    </>
  );
}
