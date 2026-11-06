import { useEffect, useId, useMemo, useRef } from "react";
import { atom, useAtom } from "jotai";
import type { ReactNode } from "react";
import { IconButton } from "../../../components/shared/IconButton";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";

/** Closed tools are one quiet button; each owned surface opens only on deliberate input. */
export function StudioDock({
  title,
  icon,
  className,
  children,
  headerAction,
  openRequest,
}: {
  title: string;
  icon: ReactNode;
  className: string;
  children: ReactNode;
  headerAction?: ReactNode;
  openRequest?: object | null;
}) {
  const id = useId();
  const openAtom = useMemo(() => atom(false), []);
  const [open, setOpen] = useAtom(openAtom);
  const requested = useRef(false);
  useEffect(() => {
    if (openRequest) {
      requested.current = true;
      setOpen(true);
    }
  }, [openRequest, setOpen]);
  return (
    <section className={`studio-dock ${className}`} data-canvas-control>
      <Popover
        modal={false}
        open={open}
        onOpenChange={(value) => {
          requested.current = false;
          setOpen(value);
        }}
      >
        <PopoverTrigger asChild>
          <IconButton
            label={title}
            tooltipSide="top"
            className="studio-dock-heading studio-surface"
            aria-controls={id}
          >
            {icon}
          </IconButton>
        </PopoverTrigger>
        <PopoverContent
          id={id}
          side="top"
          align={className === "studio-environment" ? "end" : "start"}
          collisionPadding={12}
          sideOffset={10}
          className={`studio-dock-content ${className}-content`}
          role="region"
          aria-label={title}
          initialFocus="content"
          onOpenAutoFocus={(event) => {
            // A requested child editor owns focus; the enclosing dock must not steal it.
            if (requested.current) event.preventDefault();
            requested.current = false;
          }}
          data-canvas-control
        >
          <div className="studio-panel-title">
            <span>{title}</span>
            {headerAction}
          </div>
          {children}
        </PopoverContent>
      </Popover>
    </section>
  );
}
