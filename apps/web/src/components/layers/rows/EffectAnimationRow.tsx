import { Activity, Film } from "lucide-react";
import { useSetAtom } from "jotai";
import type { EnginePort } from "@musart/core";
import type { ProjectTreeEntry } from "../tree/project";
import { EffectPopover } from "../attachments/EffectPopover";
import { CompositionEffectPopover } from "../composition/CompositionEffectPopover";
import { effectMotionNavigation } from "../../properties/effects/effect-motion/navigation";
import { animationPresentation } from "../../motion/animations/presentation";
import { timelineOpenAtom } from "../../../state/motion/timeline-state";
import { Button } from "../../ui/button";
import { activateLayerPage } from "../tree/activation";
export function EffectAnimationRow({
  engine,
  entry,
  top,
  run,
}: {
  engine: EnginePort;
  entry: Extract<ProjectTreeEntry, { kind: "effect-animation" }>;
  top: number;
  run: (task: () => void) => void;
}) {
  const showTimeline = useSetAtom(timelineOpenAtom);
  const { page, layer, effectId, child } = entry;
  const trigger = (
    <Button
      variant="ghost"
      className="attachment-name"
      onClick={() => {
        if (!activateLayerPage(engine, page)) return;
        engine.select(layer ? [layer.id] : []);
        if (child.animationId) {
          animationPresentation(engine).set({ selected: child.animationId, details: true });
          showTimeline(true);
        }
        effectMotionNavigation(engine).open({
          layersOnly: true,
          pageId: page.id,
          effectId,
          ...(child.animationId ? { animationId: child.animationId } : {}),
          ...(child.action ? { action: child.action } : {}),
        });
      }}
    >
      {child.animationId ? <Film size={12} aria-hidden /> : <Activity size={12} aria-hidden />}
      <span>{child.name}</span>
    </Button>
  );
  return (
    <div
      role="treeitem"
      aria-level={entry.depth + 1}
      data-effect-animation={child.id}
      data-layer-tree-key={entry.key}
      className="layer-attachment-row"
      style={{ position: "absolute", top, left: 0, right: 0, paddingLeft: 12 + entry.depth * 16 }}
      onDragOver={(event) => event.stopPropagation()}
      onDrop={(event) => event.stopPropagation()}
    >
      {layer ? (
        <EffectPopover engine={engine} page={page} layer={layer} effectId={effectId} run={run}>
          {trigger}
        </EffectPopover>
      ) : (
        <CompositionEffectPopover engine={engine} page={page} effectId={effectId} run={run}>
          {trigger}
        </CompositionEffectPopover>
      )}
    </div>
  );
}
