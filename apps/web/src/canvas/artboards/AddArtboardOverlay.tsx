import { useEffect, useRef, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import type { EnginePort } from "@musart/core";
import { IconButton } from "../../components/shared/IconButton";
import { bindArtboardAdd } from "./add-overlay";
import { insertArtboard } from "./insertion";
import type { WorkspaceSource } from "./workspace";
import type { ViewMotion } from "../viewport/motion";
import type { SceneController } from "../session/scene-controller";
import "../quick-add/messages";

export function AddArtboardOverlay({
  engine,
  controller,
  viewport,
  workspace,
  viewSource,
  onError,
}: {
  engine: EnginePort;
  controller: SceneController;
  viewport: RefObject<HTMLDivElement | null>;
  workspace: WorkspaceSource;
  viewSource: ViewMotion;
  onError?: (message: string) => void;
}) {
  const { t } = useTranslation(),
    button = useRef<HTMLButtonElement>(null),
    binding = useRef<ReturnType<typeof bindArtboardAdd> | null>(null);
  useEffect(() => {
    if (!viewport.current || !button.current) return;
    const owner = bindArtboardAdd({
      element: viewport.current,
      button: button.current,
      engine,
      controller,
      workspace,
      view: viewSource,
    });
    binding.current = owner;
    return () => {
      binding.current = null;
      owner.dispose();
    };
  }, [viewport, engine, controller, workspace, viewSource]);
  return (
    <IconButton
      type="button"
      ref={button}
      size="icon"
      className="canvas-add-artboard"
      data-testid="canvas-add-artboard"
      data-canvas-control
      data-visible="false"
      inert
      label={t("quickAdd:addArtboard")}
      onClick={() => {
        const candidate = binding.current?.take();
        if (!candidate) return;
        try {
          insertArtboard(
            engine,
            workspace.read(),
            candidate,
            `${t("composition")} ${engine.getSnapshot().project.pages.length + 1}`,
          );
        } catch (error) {
          console.error(error);
          onError?.(t("quickAdd:unavailable"));
        }
      }}
    >
      <Plus size={16} />
    </IconButton>
  );
}
