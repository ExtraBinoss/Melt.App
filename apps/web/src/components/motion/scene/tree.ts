import {
  projectSceneMotionProperties,
  projectSceneAnimationProperties,
  projectSceneMotionAnimations,
  resolveSceneMotionProperty,
  type Composition,
  type SceneAnimationOwner,
  type SceneMotionAnimation,
  type SceneMotionPropertyTrack,
} from "@musart/core";

export type SceneSubject = "camera" | "environment" | "light";
type Common = {
  key: string;
  depth: number;
  owner: SceneAnimationOwner;
  subject: SceneSubject;
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
    !page.motion.sceneAnimations?.length
  )
    return [];
  const subjects: {
    subject: SceneSubject;
    owner: SceneAnimationOwner;
    lightIndex?: number;
    lightType?: string;
  }[] = [
    { subject: "camera", owner: { kind: "camera", compositionId: page.id } },
    { subject: "environment", owner: { kind: "environment", compositionId: page.id } },
    ...(page.spatial?.lights.map((light, lightIndex) => ({
      subject: "light" as const,
      owner: { kind: "light" as const, compositionId: page.id, lightId: light.id },
      lightIndex,
      lightType: light.type,
    })) ?? []),
  ];
  return subjects.flatMap(({ subject, owner, lightIndex, lightType }) => {
    const key = `scene:${subject}:${owner.kind === "light" ? owner.lightId : page.id}`;
    const properties = projectSceneMotionProperties(page, owner).filter(
      (property) => property.target.kind === subject,
    );
    const animations = projectSceneMotionAnimations(page, owner);
    const sources = new Map(
      projectSceneAnimationProperties(page, owner).map((source) => [
        source.property.id,
        source.animation,
      ]),
    );
    const common = { owner, subject, lightIndex, lightType, animations, depth: 0 };
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
