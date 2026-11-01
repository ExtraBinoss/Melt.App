import {
  projectSceneMotionProperties,
  sceneAnimationTarget,
  sceneMotionAddress,
  isPublishedComposition,
  type Composition,
  type SceneMotionPropertyTarget,
} from "@musart/core";
export function sceneTimelineProperties(page: Composition) {
  return [
    ...projectSceneMotionProperties(page, { kind: "camera", compositionId: page.id }),
    ...projectSceneMotionProperties(page, { kind: "environment", compositionId: page.id }),
    ...(page.spatial?.lights.flatMap((light) =>
      projectSceneMotionProperties(page, {
        kind: "light",
        compositionId: page.id,
        lightId: light.id,
      }),
    ) ?? []),
  ];
}

const presence = new WeakMap<Composition, ReadonlySet<string>>();
/** Inspector transport ticks consult metadata only; action point arrays are never projected here. */
export function hasSceneMotionKeys(page: Composition, target: SceneMotionPropertyTarget): boolean {
  const published = isPublishedComposition(page);
  let addresses = published ? presence.get(page) : undefined;
  if (!addresses) {
    const found = new Set<string>();
    for (const property of page.motion?.sceneProperties ?? [])
      if (property.keyframes.length) found.add(sceneMotionAddress(property.target));
    for (const animation of page.motion?.sceneAnimations ?? [])
      for (const channel of animation.preset.channels)
        found.add(sceneMotionAddress(sceneAnimationTarget(animation.owner, channel.target)));
    addresses = found;
    if (published) presence.set(page, addresses);
  }
  return addresses.has(sceneMotionAddress(target));
}
