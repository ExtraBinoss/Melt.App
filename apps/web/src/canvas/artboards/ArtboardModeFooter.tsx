import { Fragment, memo, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { ModeIcon } from "../../components/motion/ModeIcon";
import { useSetAtom } from "jotai";
import type { EnginePort } from "@musart/core";
import { CompositionMode } from "../../components/motion/CompositionMode";
import { useEngineValue } from "../../state/session/editor";
import { createArtboardModeProjection } from "./mode-projection";
import { timelineOpenAtom } from "../../state/motion/timeline-state";
import { createViewportActions } from "../session/viewport-actions";
import type { View } from "../viewport/view";
import type { ArtboardWorkspace } from "./layout";
import { ArtboardPerformanceButton } from "../performance/ArtboardPerformanceButton";
import { useCompositionProfiler } from "../profiling/use-composition-profiler";
import {
  artboardFooterPosition,
  artboardFooterSmall,
  artboardPerformancePosition,
} from "./footer-layout";

export const ArtboardModeFooter = memo(
  function ArtboardModeFooter({
    engine,
    workspace,
    view,
  }: {
    engine: EnginePort;
    workspace: ArtboardWorkspace;
    view: View;
  }) {
    const select = useMemo(createArtboardModeProjection, []);
    const modes = useEngineValue(engine, select);
    const { t } = useTranslation("motion");
    const setOpen = useSetAtom(timelineOpenAtom);
    const fit = useRef<number | null>(null);
    const anchor = useRef<HTMLDivElement>(null);
    useCompositionProfiler(engine, anchor);
    useEffect(
      () => () => {
        if (fit.current !== null) cancelAnimationFrame(fit.current);
      },
      [],
    );
    return workspace.boards.map((board) => {
      const active = board.id === modes.pageId,
        pageMode = modes.pages.find((page) => page.id === board.id),
        mode = pageMode?.mode ?? "static";
      return (
        <Fragment key={board.id}>
          <div
            ref={workspace.boards[0]?.id === board.id ? anchor : undefined}
            className="artboard-mode-footer floating-panel"
            data-artboard-id={board.id}
            data-compact={board.width * view.zoom < 180}
            data-small={artboardFooterSmall(board, view)}
            data-active={active}
            data-canvas-control
            style={{ transform: artboardFooterPosition(board, workspace, view) }}
          >
            {active ? (
              <CompositionMode
                engine={engine}
                state={{
                  projectId: modes.projectId,
                  pageId: modes.pageId,
                  mode,
                  initialized: pageMode?.initialized ?? false,
                }}
                onMotionEnabled={() => {
                  setOpen(true);
                  if (fit.current !== null) cancelAnimationFrame(fit.current);
                  fit.current = requestAnimationFrame(() => {
                    fit.current = null;
                    createViewportActions(engine).run("fit");
                  });
                }}
              />
            ) : (
              <Button
                className="artboard-mode-activate"
                variant="ghost"
                onClick={() => engine.setPage(board.id)}
                aria-label={`${board.name} · ${t(mode)}`}
              >
                <ModeIcon mode={mode} size={16} />
                <span className="segmented-tab-label">{t(mode)}</span>
              </Button>
            )}
          </div>
          <div
            className="artboard-performance-footer floating-panel"
            data-artboard-id={board.id}
            data-small={artboardFooterSmall(board, view)}
            data-compact={board.width * view.zoom < 180}
            data-canvas-control
            style={{ transform: artboardPerformancePosition(board, workspace, view) }}
          >
            <ArtboardPerformanceButton engine={engine} compositionId={board.id} />
          </div>
        </Fragment>
      );
    });
  },
  (before, after) =>
    before.engine === after.engine &&
    before.workspace === after.workspace &&
    before.view.x === after.view.x &&
    before.view.y === after.view.y &&
    before.view.zoom === after.view.zoom,
);
