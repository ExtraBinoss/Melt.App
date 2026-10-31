import { ShadowNode, PointShadowNode, PointLight, type NodeFrame, type Scene } from "three/webgpu";
import type { SpatialNativeLight } from "../SpatialResource";
type ShadowWithNode = SpatialNativeLight["shadow"] & { shadowNode?: ShadowNode };
/** Native shadow maps follow composition samples, including several exact samples in one RAF. */
class CompositionShadowNode extends ShadowNode {
  revision = 0;
  override updateBefore(frame: NodeFrame) {
    const sample = Object.create(frame) as NodeFrame;
    sample.frameId = this.revision;
    return super.updateBefore(sample);
  }
}
class CompositionPointShadowNode extends PointShadowNode {
  revision = 0;
  override updateBefore(frame: NodeFrame) {
    const sample = Object.create(frame) as NodeFrame;
    sample.frameId = this.revision;
    return super.updateBefore(sample);
  }
}
export class SharedShadows {
  private readonly nodes = new Map<
    SpatialNativeLight,
    CompositionShadowNode | CompositionPointShadowNode
  >();
  private revision = 0;
  sync(scene: Scene) {
    const active = new Set<SpatialNativeLight>();
    scene.traverse((object) => {
      const light = object as SpatialNativeLight;
      if (!light.shadow || !light.castShadow) return;
      active.add(light);
      if (!this.nodes.has(light)) {
        const node =
          light instanceof PointLight
            ? new CompositionPointShadowNode(light, null)
            : new CompositionShadowNode(light, null);
        this.nodes.set(light, node);
        (light.shadow as ShadowWithNode).shadowNode = node;
      }
    });
    for (const [light, node] of this.nodes)
      if (!active.has(light)) {
        if ((light.shadow as ShadowWithNode).shadowNode === node)
          delete (light.shadow as ShadowWithNode).shadowNode;
        node.dispose();
        this.nodes.delete(light);
      }
  }
  begin() {
    const revision = ++this.revision;
    for (const node of this.nodes.values()) node.revision = revision;
  }
  dispose() {
    for (const [light, node] of this.nodes) {
      if ((light.shadow as ShadowWithNode).shadowNode === node)
        delete (light.shadow as ShadowWithNode).shadowNode;
      node.dispose();
    }
    this.nodes.clear();
  }
}
