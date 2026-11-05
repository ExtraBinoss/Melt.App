import { useId } from "react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { CatalogPreviewBoundary, useCatalogPreviewBoundary } from "./use-catalog-preview";
import "../../ui/studio/catalog/scene-controls.css";

/** Atlas-backed closed controls share the catalogs' native sphere renders. */
export function SceneSpherePopover({
  presentation = "studio",
  title,
  icon,
  className,
  disabled = false,
  disabledHint,
  children,
  open,
  onOpenChange,
}: {
  presentation?: "classic" | "studio";
  title: string;
  icon: ReactNode;
  className: "studio-material" | "studio-environment";
  disabled?: boolean;
  disabledHint?: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const id = useId();
  const previews = useCatalogPreviewBoundary();
  return (
    <section
      className={`${presentation === "studio" ? "studio-dock" : "spatial-sphere-control"} ${className}`}
      data-canvas-control
    >
      <CatalogPreviewBoundary value={previews}>
        <Popover
          modal={false}
          open={disabled ? false : open}
          onOpenChange={(next) => {
            if (!next) previews.cancel();
            onOpenChange?.(next);
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="studio-sphere-trigger-wrap"
                tabIndex={disabled ? 0 : undefined}
                role={disabled ? "group" : undefined}
                aria-label={disabled ? title : undefined}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className={
                      presentation === "studio"
                        ? "studio-dock-heading studio-surface studio-sphere-trigger"
                        : "studio-catalog-trigger"
                    }
                    aria-label={title}
                    aria-controls={id}
                    disabled={disabled}
                  >
                    {icon}
                    {presentation === "classic" && <span>{title}</span>}
                  </Button>
                </PopoverTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{disabled ? disabledHint : title}</TooltipContent>
          </Tooltip>
          <PopoverContent
            id={id}
            side={presentation === "studio" ? "top" : "left"}
            align={className === "studio-environment" ? "end" : "start"}
            collisionPadding={12}
            sideOffset={10}
            className={`studio-sphere-content ${className}-content`}
            role="region"
            aria-label={title}
            initialFocus="content"
            data-canvas-control
          >
            {children}
          </PopoverContent>
        </Popover>
      </CatalogPreviewBoundary>
    </section>
  );
}
