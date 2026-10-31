import { useSyncExternalStore } from "react";
import { Play, Pause } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { NumberInput } from "../../components/shared/NumberInput";
import type { ToolController } from "./controller";
export function ToolTransport({
  controller,
  disabled,
}: {
  controller: ToolController;
  disabled: boolean;
}) {
  const { t } = useTranslation("tools");
  const transport = useSyncExternalStore(
    controller.transport.subscribe,
    controller.transport.read,
    controller.transport.read,
  );
  return (
    <div className="tool-transport">
      <Button
        size="icon-sm"
        variant="outline"
        disabled={disabled}
        aria-label={t(transport.playing ? "pause" : "play")}
        onClick={() => controller.play(!transport.playing)}
      >
        {transport.playing ? <Pause size={14} /> : <Play size={14} />}
      </Button>
      <NumberInput
        label={t("seek")}
        value={transport.time}
        min={0}
        max={transport.duration}
        unit="s"
        decimalScale={2}
        disabled={disabled}
        onStart={controller.beginSeek}
        onPreview={controller.seek}
        onCommit={controller.commitSeek}
        onCancel={controller.cancelSeek}
      />
    </div>
  );
}
