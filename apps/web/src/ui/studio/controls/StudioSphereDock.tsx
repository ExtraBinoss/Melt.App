import { useId } from "react";
import type { ReactNode } from "react";
import { Button } from "../../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";
import "../catalog/scene-controls.css";

/** Atlas-backed closed controls share the catalogs' native sphere renders. */
export function StudioSphereDock({
  title,
  icon,
  className,
  disabled = false,
  disabledHint,
  children,
}: {
  title: string;
  icon: ReactNode;
  className: "studio-material" | "studio-environment";
  disabled?: boolean;
  disabledHint?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={`studio-dock ${className}`} data-canvas-control>
      <Popover modal={false} open={disabled ? false : undefined}>
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
                  className="studio-dock-heading studio-surface studio-sphere-trigger"
                  aria-label={title}
                  aria-controls={id}
                  disabled={disabled}
                >
                  {icon}
                </Button>
              </PopoverTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{disabled ? disabledHint : title}</TooltipContent>
        </Tooltip>
        <PopoverContent
          id={id}
          side="top"
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
    </section>
  );
}
