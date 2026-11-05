import { expect, it } from "vitest";
import { applyMotionFrame, evaluateMotion, SCENE_MOTION_ANIMATION_PRESETS } from "@musart/core";
import { createSceneAnimationPreviewDocument } from "../../../../src/components/motion/animations/scene-preview-document";

it.each(SCENE_MOTION_ANIMATION_PRESETS)(
  "samples the real native scene action for $id without generated keys",
  (preset) => {
    const program = createSceneAnimationPreviewDocument(preset, preset.duration);
    expect(program.composition.layers).toHaveLength(2);
    expect(program.composition.layers.every((layer) => layer.spatial?.enabled)).toBe(true);
    expect(program.composition.motion?.sceneAnimations).toHaveLength(1);
    expect(program.composition.motion?.sceneProperties ?? []).toEqual([]);
    const original = structuredClone(program.composition);
    const sample = (value: number) => {
      const plan = evaluateMotion(program, { value, rate: 1000 });
      expect(plan.values).toEqual([]);
      expect(plan.sceneValues).toHaveLength(preset.channels.length);
      return applyMotionFrame(program, plan).spatial;
    };
    const first = sample(0);
    expect(sample(preset.duration / 2)).not.toEqual(first);
    expect(program.composition).toEqual(original);
    expect(program.composition.motion?.tracks.every((track) => track.properties.length === 0)).toBe(
      true,
    );
  },
);
