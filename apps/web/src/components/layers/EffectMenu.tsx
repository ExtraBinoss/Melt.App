import { useTranslation } from "react-i18next";
import {
  startTransition,
  useId,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import { ChevronRight } from "lucide-react";
import type { EffectType } from "@musart/core";
import "../properties/effects/library-messages";
import "../motion/transitions/messages";
import {
  DropdownMenuSub,
  DropdownMenuGroup,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuPortal,
} from "../ui/dropdown-menu";
import { useOverlayEntrance } from "../shared/overlays/use-overlay-entrance";
import { useHoverDismiss } from "../shared/overlays/use-hover-dismiss";
import type { EffectCategory } from "./catalog/model";
import { RetainedCatalogs } from "./catalog/RetainedCatalogs";

/** One native submenu owns both catalogs, so changing category retains its surface and focus scope. */
export function EffectMenu({
  onAdd,
  libraryRequest = 0,
}: {
  onAdd: (type: EffectType) => void;
  libraryRequest?: number;
}) {
  const { t, i18n } = useTranslation();
  const [category, setCategory] = useState<EffectCategory>("effect");
  const [open, setOpen] = useState(false);
  const change = useOverlayEntrance(setOpen);
  useEffect(() => {
    if (libraryRequest <= 0) return;
    // Root menu autofocus must finish before its submenu takes focus.
    const frame = requestAnimationFrame(() => {
      setCategory("effect");
      change(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [libraryRequest, change]);
  const trigger = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const choices = useRef<HTMLDivElement>(null);
  const pointerKind = useRef<EffectCategory | null>(null);
  const focus = useRef<{ category: EffectCategory; intent: "trigger" | "content" } | null>(null);
  const hover = useHoverDismiss(open, () => change(false), trigger, panel);
  const panelId = useId();
  useLayoutEffect(() => {
    if (!open) {
      pointerKind.current = null;
      focus.current = null;
    }
  }, [open]);
  useLayoutEffect(() => {
    const request = focus.current;
    if (!open || !request || request.category !== category) return;
    // Radix registers its new anchor and runs open autofocus during this commit.
    // Restore the requested target after that work, without an old anchor dismissing the panel.
    const frame = requestAnimationFrame(() => {
      if (focus.current !== request) return;
      focus.current = null;
      const node = request.intent === "content" ? panel.current : trigger.current;
      if (node?.isConnected) node.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [category, open]);
  function mode(value: "pointer" | "keyboard") {
    const node = choices.current;
    if (node && node.dataset.inputMode !== value) node.dataset.inputMode = value;
  }
  function keyboard() {
    pointerKind.current = null;
    focus.current = null;
    mode("keyboard");
    hover.cancel();
  }
  function show(next: EffectCategory, intent: "trigger" | "content") {
    hover.cancel();
    focus.current = { category: next, intent };
    startTransition(() => {
      setCategory(next);
      change(true);
    });
  }
  function point(kind: EffectCategory, event: PointerEvent<HTMLDivElement>) {
    hover.enter(event);
    if (event.pointerType !== "mouse" || event.buttons > 1) return;
    mode("pointer");
    // Native move is authoritative even if a concurrent trigger replacement swallowed enter.
    // Deduplicate observed intent, not the possibly older category currently rendered by React.
    if (pointerKind.current === kind) {
      if (
        event.currentTarget === trigger.current &&
        event.currentTarget.ownerDocument.activeElement !== event.currentTarget
      )
        event.currentTarget.focus({ preventScroll: true });
      return;
    }
    pointerKind.current = kind;
    if (!open || category === kind) event.currentTarget.focus({ preventScroll: true });
    show(kind, "trigger");
  }
  return (
    <DropdownMenuSub open={open} onOpenChange={setOpen}>
      <DropdownMenuGroup
        ref={choices}
        className="effect-menu-choices"
        data-input-mode="keyboard"
        onKeyDownCapture={keyboard}
      >
        {(["effect", "adjustment"] as const).map((kind) => {
          const current = category === kind;
          const label = t(kind === "effect" ? "addEffect" : "addAdjustment");
          const props = {
            textValue: label,
            className: "h-8",
            "data-effect-menu-category": kind,
            "aria-haspopup": "menu" as const,
            "aria-expanded": open && current,
            "aria-controls": open && current ? panelId : undefined,
            onPointerEnter: (event: PointerEvent<HTMLDivElement>) => point(kind, event),
            onPointerLeave: (event: PointerEvent<HTMLDivElement>) => {
              hover.leave(event);
              // This menu owns pointer intent. Native leave would focus the parent using
              // a diagonal corridor whose delayed pointer tracking we bypass above.
              if (event.pointerType === "mouse" && event.buttons <= 1) event.preventDefault();
            },
            onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
              point(kind, event);
              // Explicit sibling choices use their own pointer intent, without Radix's stale
              // diagonal corridor or a second delayed opening timer.
              if (event.pointerType === "mouse" && event.buttons <= 1) event.preventDefault();
            },
            onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
              if (!current && event.key === (i18n.dir() === "rtl" ? "ArrowLeft" : "ArrowRight")) {
                event.preventDefault();
                show(kind, "content");
              }
            },
          };
          return current ? (
            <DropdownMenuSubTrigger key={kind} ref={trigger} {...props}>
              {label}
            </DropdownMenuSubTrigger>
          ) : (
            <DropdownMenuItem
              key={kind}
              {...props}
              onSelect={(event) => {
                event.preventDefault();
                show(kind, "content");
              }}
            >
              {label}
              <ChevronRight className="ml-auto size-4" />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuGroup>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          ref={panel}
          id={panelId}
          alignOffset={category === "adjustment" ? -32 : 0}
          className="effect-catalog-menu"
          onPointerEnter={(event) => {
            hover.enter(event);
            focus.current = null;
          }}
          onPointerLeave={hover.leave}
          onKeyDownCapture={keyboard}
        >
          <RetainedCatalogs category={category} onAdd={onAdd} />
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
