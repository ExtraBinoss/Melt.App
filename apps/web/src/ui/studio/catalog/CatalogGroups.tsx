import { useState, type ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../../components/ui/accordion";
import {
  useProjectPreference,
  useProjectPreferences,
} from "../../../components/workspace/preferences/context";
import "./catalog.css";

export interface CatalogGroup {
  id: string;
  label: string;
  count: number;
}

/** Missing preferences keep every category discoverable, including newly added ones. */
export function catalogOpenGroups(
  kind: string,
  groups: readonly CatalogGroup[],
  stored: Readonly<Record<string, boolean>> | undefined,
): string[] {
  return groups.filter(({ id }) => stored?.[`${kind}:${id}`] !== false).map(({ id }) => id);
}

export function CatalogGroups({
  kind,
  groups,
  children,
}: {
  kind: "material" | "environment";
  groups: readonly CatalogGroup[];
  children: (id: string) => ReactNode;
}) {
  const preferences = useProjectPreferences();
  const stored = useProjectPreference("studioCatalogOpen");
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const value = catalogOpenGroups(kind, groups, preferences ? stored : local);
  return (
    <Accordion
      type="multiple"
      className="studio-catalog-groups"
      value={value}
      onValueChange={(open) => {
        const next = { ...(preferences?.read("studioCatalogOpen") ?? local) };
        for (const group of groups) next[`${kind}:${group.id}`] = open.includes(group.id);
        if (preferences) preferences.commit("studioCatalogOpen", next);
        else setLocal(next);
      }}
    >
      {groups.map((group) => (
        <AccordionItem key={group.id} value={group.id}>
          <AccordionTrigger>
            <span>{group.label}</span>
            <span className="studio-catalog-count" aria-hidden>
              {group.count}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="studio-catalog-grid" role="group" aria-label={group.label}>
              {children(group.id)}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
