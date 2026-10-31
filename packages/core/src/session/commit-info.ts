import type { Command, Layer } from "../document/model";
/** Bounded field names only, independent of payload size or layer count. */
export function committedLayerFields(commands: readonly Command[]): readonly (keyof Layer)[] {
  const fields = new Set<keyof Layer>();
  const add = (patch: Partial<Layer>) => {
    for (const key of Object.keys(patch)) fields.add(key as keyof Layer);
  };
  for (const command of commands) {
    if (command.type === "updateLayers") add(command.patch);
    else if (command.type === "updateLayerPatches")
      for (const edit of command.patches) add(edit.patch);
  }
  return [...fields];
}
