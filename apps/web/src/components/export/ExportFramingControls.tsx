import type { Bounds, OutputFraming } from "@musart/core";
import { FramePresetPicker, type FrameChoice } from "../../ui/studio/framing/FramePresetPicker";

/** Export formats sample the captured window; they never resize or edit a composition. */
export function exportFraming(choice: FrameChoice, region?: Bounds): OutputFraming | undefined {
  if (choice.full && !region) return undefined;
  return { width: choice.width, height: choice.height, ...(region ? { region } : {}) };
}

export function ExportFramingControls(props: {
  value: FrameChoice;
  onChange: (value: FrameChoice) => void;
  bounds: { width: number; height: number };
  disabled?: boolean;
}) {
  return <FramePresetPicker {...props} />;
}
