import { memo, type DragEvent } from "react";
import { PinOff, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../shared/IconButton";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../ui/context-menu";
import type { DockDragHandlers } from "./use-dock-drag";

/** Each pin follows only its own label, availability and drag presentation. */
export const PinnedCommand = memo(function PinnedCommand({
  id,
  label,
  shortcut,
  disabled,
  Icon,
  dragging,
  position,
  start,
  over,
  cancel,
  drop,
  run,
  unpin,
}: DockDragHandlers & {
  id: string;
  label: string;
  shortcut?: string;
  disabled: boolean;
  Icon: LucideIcon;
  dragging: boolean;
  position?: "before" | "after";
  drop: (event: DragEvent<HTMLElement>) => void;
  run: (id: string) => void;
  unpin: (id: string, label: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ContextMenu onOpenChange={(open) => open && cancel()}>
      <ContextMenuTrigger asChild>
        <div
          data-dock-command={id}
          data-dragging={dragging || undefined}
          data-dock-drop-position={position}
          tabIndex={disabled ? 0 : -1}
          role="group"
          aria-label={t("dock:options", { name: label })}
          aria-haspopup="menu"
          draggable
          onDragStartCapture={(event) => start(event, id)}
          onDragOver={(event) => over(event, id)}
          onDrop={drop}
          onDragEndCapture={cancel}
          onKeyDown={(event) => {
            if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
            event.preventDefault();
            event.stopPropagation();
            const bounds = event.currentTarget.getBoundingClientRect();
            event.currentTarget.dispatchEvent(
              new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: bounds.right,
                clientY: bounds.top + bounds.height / 2,
              }),
            );
          }}
        >
          <IconButton label={label} disabled={disabled} shortcut={shortcut} onClick={() => run(id)}>
            <Icon strokeWidth={1.65} />
          </IconButton>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="floating-panel">
        <ContextMenuItem onSelect={() => unpin(id, label)}>
          <PinOff size={14} />
          {t("dock:unpin", { name: label })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
