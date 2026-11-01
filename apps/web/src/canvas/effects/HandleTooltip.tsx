import { useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import type { RadialHandle } from "./radial-geometry";

/** Help state belongs to the hovered handle, outside the imperative gesture/paint boundary. */
export function HandleTooltip({
  handle,
  hint,
  children,
}: {
  handle: RadialHandle;
  hint: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={500}>
      <TooltipTrigger asChild>
        <g
          data-handle-anchor={handle}
          data-canvas-control
          onPointerDownCapture={() => setOpen(false)}
          onKeyDownCapture={() => setOpen(false)}
        >
          {children}
        </g>
      </TooltipTrigger>
      <TooltipContent side="top">{hint}</TooltipContent>
    </Tooltip>
  );
}
