import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import "./control-hint.css";

/** Shared help for native control surfaces, including controls inside portals. */
export function ControlHint({ children, content }: { children: ReactElement; content: ReactNode }) {
  const held = useRef(false);
  return (
    <Tooltip delayDuration={450}>
      <TooltipTrigger
        asChild
        onPointerDownCapture={() => {
          held.current = true;
        }}
        onPointerUpCapture={() => {
          held.current = false;
        }}
        onPointerCancel={() => {
          held.current = false;
        }}
        onLostPointerCapture={() => {
          held.current = false;
        }}
        onPointerMove={(event) => {
          if (held.current) event.preventDefault();
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" className="control-hint">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
