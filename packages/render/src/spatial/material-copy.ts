import { type Material, type NodeMaterial, Texture } from "three/webgpu";
/** Three's NodeMaterial.copy calls .copy on existing values, including borrowed textures/nodes.
 * Detach those references first: synchronizing a private material must never mutate its source.
 */
export function copySpatialMaterial<T extends Material>(destination: T, source: Material): T {
  const to = destination as unknown as Record<string, unknown>;
  const from = source as unknown as Record<string, unknown>;
  if ((destination as unknown as NodeMaterial).isNodeMaterial) {
    for (const key of Object.keys(destination)) {
      const value = to[key];
      if (
        value instanceof Texture ||
        (value && typeof value === "object" && "isNode" in value) ||
        (value && from[key] === null)
      )
        to[key] = null;
    }
  }
  destination.copy(source);
  return destination;
}
