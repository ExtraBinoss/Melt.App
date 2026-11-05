import { useId } from "react";
import type { ReactNode } from "react";
import { IconButton } from "../../../components/shared/IconButton";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";

/** Closed tools are one quiet button; each owned surface opens only on deliberate input. */
export function StudioDock({
  title,
  icon,
  className,
  children,
}: {
  title: string;
  icon: ReactNode;
  className: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={`studio-dock ${className}`} data-canvas-control>
      <Popover modal={false}>
        <PopoverTrigger asChild>
          <IconButton
            label={title}
            tooltipSide={className === "studio-compositions" ? "bottom" : "top"}
            className="studio-dock-heading studio-surface"
            aria-controls={id}
          >
            {icon}
          </IconButton>
        </PopoverTrigger>
        <PopoverContent
          id={id}
          side={className === "studio-compositions" ? "bottom" : "top"}
          align={className === "studio-environment" ? "end" : "start"}
          collisionPadding={12}
          sideOffset={10}
          className={`studio-dock-content ${className}-content`}
          role="region"
          aria-label={title}
          initialFocus="content"
          data-canvas-control
        >
          <div className="studio-panel-title">{title}</div>
          {children}
        </PopoverContent>
      </Popover>
    </section>
  );
}
