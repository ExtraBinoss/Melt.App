import type { EnginePort, Layer } from "@musart/core";
import {
  captureMotionEdit,
  isMotionEditCurrent,
  motionLayerCommands,
  motionPreviewPatch,
} from "../../state/session/motion-edit";

/** A native text draft owns one authoring origin and never writes per keystroke. */
export function createCanvasTextSession(
  engine: EnginePort,
  layer: Layer,
  preview: (patch: Partial<Layer>) => void,
  clear: () => void,
) {
  const origin = captureMotionEdit(engine, {
    kind: "layer",
    layerId: layer.id,
    property: "text",
  });
  let closed = false,
    text = layer.text;
  const current = () => {
    const snapshot = engine.getSnapshot();
    return (
      !closed &&
      snapshot.project === origin.snapshot.project &&
      snapshot.pageId === origin.snapshot.pageId &&
      snapshot.revision === origin.snapshot.revision &&
      snapshot.selection.length === 1 &&
      snapshot.selection[0] === layer.id &&
      isMotionEditCurrent(engine, origin)
    );
  };
  function cancel() {
    if (closed) return;
    closed = true;
    clear();
  }
  return {
    layer,
    current,
    cancel,
    preview(value: string) {
      if (!current()) return cancel();
      text = value;
      preview(motionPreviewPatch(engine, origin, [layer.id], { text }));
    },
    commit() {
      if (!current()) return cancel();
      const commands =
        text === layer.text ? [] : motionLayerCommands(engine, origin, [layer.id], { text });
      cancel();
      if (commands.length) engine.transaction(commands);
    },
  };
}
export type CanvasTextSession = ReturnType<typeof createCanvasTextSession>;
