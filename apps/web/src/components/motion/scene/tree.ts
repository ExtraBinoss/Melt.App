import {
  projectSceneMotionProperties,
  projectSceneAnimationProperties,
  projectSceneMotionAnimations,
  resolveSceneMotionProperty,
  type Composition,
  type EffectType,
  type SceneAnimationOwner,
  type SceneMotionAnimation,
  type SceneMotionPropertyTrack,
} from "@musart/core";

export type SceneSubject = "camera" | "environment" | "light" | "compositionEffect";
type Common = {
  key: string;
  depth: number;
  owner: SceneAnimationOwner;
  subject: SceneSubject;
  effectType?: EffectType;
  lightIndex?: number;
  lightType?: string;
  animations: readonly SceneMotionAnimation[];
};
export type SceneTimelineRow = Common &
  (
    | {
        kind: "scene";
        expandable: boolean;
        expanded: boolean;
        properties: readonly SceneMotionPropertyTrack[];
      }
    | {
        kind: "sceneProperty";
        property: SceneMotionPropertyTrack;
        continuous: boolean;
        animation?: SceneMotionAnimation;
      }
  );

/** Scene owners share the temporal surface without manufacturing layer/occurrence records. */
export function projectSceneTimelineRows(
  page: Composition,
  collapsed: ReadonlySet<string>,
  details: boolean,
): SceneTimelineRow[] {
  if (page.motion?.mode !== "motion") return [];
  if (
    !page.spatial &&
    !page.layers.some((layer) => layer.spatial?.enabled) &&
    !page.motion.sceneProperties?.length &&
    !page.motion.sceneAnimations?.length &&
    !page.effects?.length
  )
    return [];
  const spatial = !!page.spatial || page.layers.some((layer) => layer.spatial?.enabled);
  const subjects: {
    subject: SceneSubject;
    owner: SceneAnimationOwner;
    effectType?: EffectType;
    lightIndex?: number;
    lightType?: string;
  }[] = [
    ...(["camera", "environment"] as const).flatMap((kind) =>
      spatial ||
      page.motion?.sceneProperties?.some(({ target }) => target.kind === kind) ||
      page.motion?.sceneAnimations?.some(({ owner }) => owner.kind === kind)
        ? [{ subject: kind, owner: { kind, compositionId: page.id } }]
        : [],
    ),
    ...(page.effects ?? []).map((effect) => ({
      subject: "compositionEffect" as const,
      owner: { kind: "compositionEffect" as const, compositionId: page.id, effectId: effect.id },
      effectType: effect.type,
    })),
    ...(page.spatial?.lights.map((light, lightIndex) => ({
      subject: "light" as const,
      owner: { kind: "light" as const, compositionId: page.id, lightId: light.id },
      lightIndex,
      lightType: light.type,
    })) ?? []),
  ];
  return subjects.flatMap(({ subject, owner, lightIndex, lightType, effectType }) => {
    const key = `scene:${subject}:${owner.kind === "light" ? owner.lightId : owner.kind === "compositionEffect" ? owner.effectId : page.id}`;
    const properties = projectSceneMotionProperties(page, owner).filter(
      (property) =>
        property.target.kind === subject ||
        (subject === "compositionEffect" && property.target.kind === "compositionEffectSetting"),
    );
    const animations = projectSceneMotionAnimations(page, owner);
    const sources = new Map(
      projectSceneAnimationProperties(page, owner).map((source) => [
        source.property.id,
        source.animation,
      ]),
    );
    const common = { owner, subject, lightIndex, lightType, effectType, animations, depth: 0 };
    const expanded = !collapsed.has(key);
    const rows: SceneTimelineRow[] = [
      {
        ...common,
        key,
        kind: "scene",
        properties,
        expandable: !!properties.length || !!animations.length,
        expanded,
      },
    ];
    if (details && expanded)
      for (const property of properties)
        rows.push({
          ...common,
          key: property.id,
          depth: 1,
          kind: "sceneProperty",
          property,
          animation: sources.get(property.id),
          continuous:
            resolveSceneMotionProperty(page, property.target)?.interpolation === "continuous",
        });
    return rows;
  });
}
