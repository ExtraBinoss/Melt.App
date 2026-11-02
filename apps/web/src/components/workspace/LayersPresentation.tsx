import { memo, useDeferredValue, useLayoutEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import type { Composition, EnginePort, Project } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { CanonicalOrigin } from "../../state/session/canonical-presentation";
import { createRenderActivity } from "../../services/session/render-activity";
import { LayersPanel } from "../layers/LayersPanel";
import { usePresentedHistory } from "./use-presented-history";

export interface LayersPresentationModel {
  page: Composition;
  project: Project;
  selection: string[];
  historyNavigation: boolean;
  origin: CanonicalOrigin;
}

/** Keep restored row wrappers out of the urgent canonical frame and yield their adoption to input. */
export const LayersPresentation = memo(function LayersPresentation({
  engine,
  model,
  services,
  run,
}: {
  engine: EnginePort;
  model: LayersPresentationModel;
  services: EditorServices;
  run: (action: () => void) => void;
}) {
  const presented = usePresentedHistory(
    engine,
    model,
    model.historyNavigation ? model.origin : null,
  );
  const deferred = useDeferredValue(presented);
  const [retained, setRetained] = useState(model);
  // Ordinary edits and owner changes publish immediately. Never re-adopt an older deferred
  // model after an intervening selection, page replacement or fresh row action.
  const shown = !model.historyNavigation ? model : deferred === presented ? presented : retained;
  if (retained !== shown) setRetained(shown);
  const pending = shown !== model;
  useLayoutEffect(() => {
    if (pending) return createRenderActivity(engine).holdForeground();
  }, [engine, pending]);
  function guard(event: SyntheticEvent) {
    if (!pending) return;
    const native = event.nativeEvent;
    if (
      native instanceof KeyboardEvent &&
      (native.ctrlKey || native.metaKey) &&
      ["z", "y"].includes(native.key.toLowerCase())
    )
      return;
    event.preventDefault();
    event.stopPropagation();
  }
  return (
    <div
      style={{ display: "contents" }}
      data-layers-presentation
      aria-busy={pending}
      onPointerDownCapture={guard}
      onPointerUpCapture={guard}
      onClickCapture={guard}
      onKeyDownCapture={guard}
      onKeyUpCapture={guard}
      onBeforeInputCapture={guard}
      onChangeCapture={guard}
      onContextMenuCapture={guard}
      onBlurCapture={guard}
      onDragStartCapture={guard}
      onDragOverCapture={guard}
      onDropCapture={guard}
      onFocusCapture={(event) => {
        if (!pending) return;
        guard(event);
        if (event.target instanceof HTMLElement) event.target.blur();
      }}
    >
      <LayersPanel
        engine={engine}
        services={services}
        page={shown.page}
        project={shown.project}
        selection={shown.selection}
        run={run}
      />
    </div>
  );
});
