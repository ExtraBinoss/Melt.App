import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { backgroundLayer, type EnginePort } from "@musart/core";
import { Popover, PopoverAnchor, PopoverContent } from "../../components/ui/popover";
import type { SearchItem } from "../../components/search/catalog/model";
import { searchCatalogAtom } from "../../components/search/catalog/session";
import { PalettePanel } from "../../components/shared/motion/PalettePanel";
import { createCommandPort } from "../../state/keybindings/command-port";
import { isCommandId } from "../../state/keybindings/registry";
import { createLibraryActions } from "../../components/assets/library-actions";
import { toolAtom } from "../../state/session/editor";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
  type GestureOrigin,
} from "../interaction/gesture-origin";
import { clientToPage } from "../viewport/view";
import type { ViewSource } from "../viewport/motion";
import type { WorkspaceSource } from "../artboards/workspace";
import { artboardAt } from "../artboards/layout";
import { sourceGeometry } from "../selection/frame-geometry";
import { canvasHit } from "../selection/hit";
import { useWorkspaceMode } from "../../ui/studio/workspace-mode";
import type { SceneController } from "../session/scene-controller";
import { QuickAddMenu } from "./QuickAddMenu";
import { createQuickLayer, isQuickLayerAction } from "./layers";
import "./messages";
import "./quick-add.css";

interface InsertSession {
  origin: GestureOrigin;
}
export function QuickAdd({
  engine,
  viewport,
  workspace,
  viewSource,
  controller,
  onError,
}: {
  engine: EnginePort;
  viewport: RefObject<HTMLDivElement | null>;
  workspace: WorkspaceSource;
  viewSource: ViewSource;
  controller: SceneController;
  onError?: (message: string) => void;
}) {
  const { t } = useTranslation(),
    setTool = useSetAtom(toolAtom);
  const studio = useWorkspaceMode() === "studio";
  const reduced = Boolean(useReducedMotion());
  const catalog = useAtomValue(searchCatalogAtom(engine));
  const content = useRef<HTMLDivElement>(null);
  const position = useRef({ x: 0, y: 0 });
  // Radix retains this virtual anchor while closed. Update its coordinates before
  // mounting content so its first positioning pass cannot use the previous (0, 0).
  const anchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => new DOMRect(position.current.x, position.current.y, 0, 0),
      },
    }),
    [],
  );
  const commands = useMemo(() => createCommandPort(engine), [engine]);
  const handoff = useRef(false);
  const showing = useRef(false);
  const [session, setSession] = useState<InsertSession | null>(null);
  useLayoutEffect(() => {
    showing.current = Boolean(session);
  }, [session]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const open = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        controller.read().playback ||
        (event.target instanceof Element && event.target.closest("[data-canvas-control]"))
      )
        return;
      const rect = element.getBoundingClientRect(),
        layout = workspace.read();
      if (event.defaultPrevented) return;
      const point = clientToPage(
        { x: event.clientX, y: event.clientY },
        rect,
        viewSource.read(),
        layout,
      );
      const frame = controller.read(),
        board = layout.boards.find((item) => item.id === frame.page.id),
        underPointer = artboardAt(layout, point);
      if (underPointer && underPointer.id !== frame.page.id) return;
      if (board && (studio || underPointer)) {
        const hit = canvasHit(
          frame.page,
          { x: point.x - board.x, y: point.y - board.y },
          true,
          sourceGeometry(controller),
          studio,
        );
        if (hit && hit.layer.id !== backgroundLayer(frame.page)?.id) return;
      }
      event.preventDefault();
      position.current = { x: event.clientX, y: event.clientY };
      setSession({
        origin: captureGestureOrigin(engine),
      });
    };
    const close = () => setSession(null);
    const stopEngine = engine.subscribe(() =>
      setSession((current) =>
        current && !isGestureOriginCurrent(engine, current.origin) ? null : current,
      ),
    );
    const stopScene = controller.subscribe(() => {
      const next = Boolean(controller.read().playback);
      if (next) close();
    });
    element.addEventListener("dblclick", open);
    element.addEventListener("wheel", close);
    return () => {
      element.removeEventListener("dblclick", open);
      element.removeEventListener("wheel", close);
      stopEngine();
      stopScene();
    };
  }, [engine, viewport, workspace, viewSource, controller, studio]);
  function run(item: SearchItem) {
    if (item.disabled) return;
    if (
      !session ||
      !isGestureOriginCurrent(engine, session.origin) ||
      controller.read().playback ||
      !isCommandId(item.id)
    ) {
      setSession(null);
      return;
    }
    const action = item.target.kind === "action" ? item.target.action : undefined;
    try {
      if (action && isQuickLayerAction(action)) {
        const snapshot = engine.getSnapshot(),
          page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
        const layer = createQuickLayer(action, page, t("newText"));
        engine.execute({ type: "addLayers", layers: [layer] });
        engine.select([layer.id]);
        setTool("pointer");
      } else {
        if (!commands.run(item.id)) throw new Error(t("quickAdd:unavailable"));
        if (action === "toolShape") {
          handoff.current = true;
          if (!createLibraryActions(engine).open()) {
            handoff.current = false;
            throw new Error(t("quickAdd:unavailable"));
          }
        }
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    }
    setSession(null);
  }
  return (
    <>
      <Popover
        open={Boolean(session)}
        onOpenChange={(open) => {
          if (!open) setSession(null);
        }}
      >
        <PopoverAnchor virtualRef={anchor} />
        <PopoverContent
          asChild
          ref={content}
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="quick-add-popover"
          data-canvas-control
          aria-label={t("quickAdd:title")}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (showing.current) return;
            const focused = document.activeElement;
            if (
              !handoff.current &&
              (focused === document.body || content.current?.contains(focused))
            )
              viewport.current?.focus({ preventScroll: true });
            handoff.current = false;
          }}
        >
          <PalettePanel reduced={reduced} waitForPlacement>
            <QuickAddMenu engine={engine} catalog={catalog} translate={t} onChoose={run} />
          </PalettePanel>
        </PopoverContent>
      </Popover>
    </>
  );
}
