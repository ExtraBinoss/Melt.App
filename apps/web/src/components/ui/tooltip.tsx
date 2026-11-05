// shadcn/ui, MIT. Source: https://ui.shadcn.com/r/styles/new-york-v4/tooltip.json
"use client";

import * as React from "react";
import { useWorkspaceTheme } from "../../ui/brand/WorkspaceTheme";
import { cn } from "./utils";
import { Tooltip as TooltipPrimitive } from "radix-ui";

function TooltipProvider({
  delayDuration = 0,
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      disableHoverableContent={disableHoverableContent}
      {...props}
    />
  );
}

const VisitedTooltip = React.createContext(true);
function Tooltip({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [visited, setVisited] = React.useState(Boolean(open || defaultOpen));
  if (open && !visited) setVisited(true);
  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      {...props}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(next) => {
        if (next) setVisited(true);
        onOpenChange?.(next);
      }}
    >
      <VisitedTooltip value={visited}>{children}</VisitedTooltip>
    </TooltipPrimitive.Root>
  );
}

function TooltipTrigger({
  onFocus,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
      onFocus={(event) => {
        onFocus?.(event);
        // Radix focus scopes autofocus overlay controls. Keep their focus and
        // accessible names without treating that handoff as a tooltip request.
        event.preventDefault();
      }}
    />
  );
}

function TooltipContent({
  className,
  sideOffset = 8,
  children,
  forceMount,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const workspaceTheme = useWorkspaceTheme();
  const visited = React.useContext(VisitedTooltip);
  // Unvisited help owns no portal/presence controller tree. Visited help retains Radix exit behavior.
  if (!visited && !forceMount) return null;
  return (
    <TooltipPrimitive.Portal forceMount={forceMount}>
      <TooltipPrimitive.Content
        forceMount={forceMount}
        data-slot="tooltip-content"
        data-workspace-theme={workspaceTheme}
        sideOffset={sideOffset}
        className={cn(
          "themed-tooltip z-50 w-fit max-w-72 origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] leading-4 text-balance text-popover-foreground shadow-md duration-100 fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
