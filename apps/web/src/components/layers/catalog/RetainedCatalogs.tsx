import { Activity, useState, type ComponentProps } from "react";
import { EffectCatalog } from "./EffectCatalog";
import type { EffectCategory } from "./model";

/** Visit one category before retaining it; opening a panel must not prepare its unused siblings. */
export function RetainedCatalogs(props: ComponentProps<typeof EffectCatalog>) {
  const [visited, setVisited] = useState<EffectCategory[]>([props.category]);
  if (!visited.includes(props.category)) setVisited([...visited, props.category]);
  return visited.map((category) => (
    <Activity
      key={`${category}:${props.initialQuery ?? ""}`}
      mode={category === props.category ? "visible" : "hidden"}
    >
      <EffectCatalog category={category} onAdd={props.onAdd} initialQuery={props.initialQuery} />
    </Activity>
  ));
}
