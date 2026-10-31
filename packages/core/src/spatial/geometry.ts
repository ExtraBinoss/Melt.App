import type { Composition, Layer } from "../document/model";
import { layerTransform, multiplyMatrices, transformPoint, type Matrix } from "../layers/geometry";
import { spatialSourceBounds } from "./bounds/definitions";
import { projectSpatialBounds } from "./bounds/project";
import {
  SPATIAL_IDENTITY,
  multiplySpatial,
  spatialPose,
  spatialTranslation,
  type SpatialMatrix,
} from "./matrix";

/** Stable layout plane: camera orbit changes the view, never the objects' world positions. */
export const SPATIAL_LAYOUT_SPAN = 9 * Math.tan((35 * Math.PI) / 360);
export class SpatialGeometry {
  private readonly layers: ReadonlyMap<string, Layer>;
  private children: Map<string, Layer[]> | null = null;
  private readonly layout = new Map<string, Matrix>();
  private readonly roots = new Map<string, SpatialMatrix>();
  private readonly anchors = new Map<string, SpatialMatrix>();
  constructor(
    readonly page: Composition,
    layers?: ReadonlyMap<string, Layer>,
  ) {
    this.layers = layers ?? new Map(page.layers.map((layer) => [layer.id, layer]));
  }
  layoutMatrix(id: string): Matrix {
    const cached = this.layout.get(id);
    if (cached) return cached;
    const layer = this.layers.get(id)!;
    const local = layerTransform(layer);
    const result = layer.parentId
      ? multiplyMatrices(this.layoutMatrix(layer.parentId), local)
      : local;
    this.layout.set(id, result);
    return result;
  }
  private inherited(layer: Layer): SpatialMatrix {
    if (!layer.parentId) return SPATIAL_IDENTITY;
    const parent = this.layers.get(layer.parentId)!;
    if (parent.spatial?.enabled && parent.spatial.source === "group") {
      const pivot = parent.spatial.pivot ?? [0, 0, 0];
      return multiplySpatial(
        this.worldMatrix(parent.id),
        spatialTranslation(-pivot[0]!, -pivot[1]!, -pivot[2]!),
      );
    }
    return this.inherited(parent);
  }
  /** Parent frame of the editable TRS; retained bases preserve shear when ungrouping. */
  anchorMatrix(id: string): SpatialMatrix {
    const cached = this.anchors.get(id);
    if (cached) return cached;
    const layer = this.layers.get(id)!,
      s = layer.spatial!;
    let local: SpatialMatrix;
    if (s.source === "group") {
      const p = s.pivot ?? [0, 0, 0];
      local = spatialTranslation(p[0]!, p[1]!, p[2]!);
    } else {
      const [a, b, c, d, e, f] = this.layoutMatrix(id),
        viewport = this.page.spatial?.viewport;
      const height = viewport?.height ?? this.page.height,
        width = viewport?.width ?? this.page.width;
      const unit = SPATIAL_LAYOUT_SPAN / height,
        scale = layer.height / height;
      const center = transformPoint([a, b, c, d, e, f], {
        x: layer.width / 2,
        y: layer.height / 2,
      });
      local = [
        a * scale,
        -b * scale,
        0,
        0,
        -c * scale,
        d * scale,
        0,
        0,
        0,
        0,
        scale,
        0,
        (center.x + (viewport?.x ?? 0) - width / 2) * unit,
        (height / 2 - center.y - (viewport?.y ?? 0)) * unit,
        0,
        1,
      ];
    }
    const result = multiplySpatial(
      multiplySpatial(this.inherited(layer), local),
      s.basis ?? SPATIAL_IDENTITY,
    );
    this.anchors.set(id, result);
    return result;
  }
  worldMatrix(id: string): SpatialMatrix {
    const cached = this.roots.get(id);
    if (cached) return cached;
    const result = multiplySpatial(
      this.anchorMatrix(id),
      spatialPose(this.layers.get(id)!.spatial!),
    );
    this.roots.set(id, result);
    return result;
  }
  /** Conservative projected source bounds; pixel tests still belong to the renderer. */
  projectedBounds(id: string): import("../layers/geometry").Bounds {
    const layer = this.layers.get(id)!;
    if (layer.kind === "group") {
      if (!this.children) {
        this.children = new Map();
        for (const child of this.page.layers)
          if (child.parentId) {
            const siblings = this.children.get(child.parentId) ?? [];
            siblings.push(child);
            this.children.set(child.parentId, siblings);
          }
      }
      const children = (this.children.get(id) ?? []).filter(
        (l) => l.spatial?.enabled || l.kind === "group",
      );
      return unionSpatialBounds(children.map((l) => this.projectedBounds(l.id)));
    }
    return projectSpatialBounds(this.page, this.worldMatrix(id), spatialSourceBounds(layer));
  }
}
export function unionSpatialBounds(
  bounds: readonly { x: number; y: number; width: number; height: number }[],
) {
  if (!bounds.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...bounds.map((b) => b.x)),
    y = Math.min(...bounds.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...bounds.map((b) => b.x + b.width)) - x,
    height: Math.max(...bounds.map((b) => b.y + b.height)) - y,
  };
}
