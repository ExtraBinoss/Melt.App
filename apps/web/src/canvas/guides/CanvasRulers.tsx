import { useMemo, type ComponentProps } from "react";
import { useEngineValue } from "../../state/session/editor";
import { Rulers } from "./Rulers";
import { useWorkspaceMode } from "../../ui/studio/workspace-mode";

/** Ruler visibility updates independently of the canvas geometry and selection subscribers. */
export function CanvasRulers(props: ComponentProps<typeof Rulers>) {
  const studio = useWorkspaceMode() === "studio";
  const visible = useEngineValue(props.engine, (snapshot) =>
    Boolean(snapshot.project.pages.find((page) => page.id === snapshot.pageId)?.rulers),
  );
  const rulers = visible && !studio;
  const page = useMemo(() => ({ ...props.page, rulers }), [props.page, rulers]);
  return <Rulers {...props} page={page} />;
}
