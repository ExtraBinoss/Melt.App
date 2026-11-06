// shadcn/ui popover/select styling, MIT. Focus and dismissal use genuine Radix primitives.
import {
  Activity,
  useSyncExternalStore,
  createContext,
  useCallback,
  useContext,
  useRef,
  useLayoutEffect,
  type ReactNode,
  type KeyboardEvent,
  type ComponentProps,
} from "react";
import { Popover as Primitive } from "radix-ui";
import * as RovingFocus from "@radix-ui/react-roving-focus";
import { CheckIcon } from "lucide-react";
import { PopoverContent, PopoverTrigger } from "../popover";
import { DropdownChevron } from "../../shared/DropdownChevron";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { bindSelectScroll } from "./scroll";
import { menuPointerUpCapture } from "../menu/pointer";
import { cn } from "../utils";
import { SelectLabel } from "./label";
import "./scroll.css";

const noPortalEvents = () => () => {};
const clientPortal = () => document.body;
const serverPortal = () => undefined;

const Choice = createContext<(value: string) => void>(() => {});
export function FieldMenu({
  prewarm = false,
  cacheKey = 0,
  label,
  value,
  open,
  disabled,
  onOpenChange,
  onValueChange,
  trigger,
  children,
  className,
  contentClassName,
  side,
  onFocus,
  onKeyDown,
  onCloseAutoFocus,
  id,
  contentAttributes,
}: {
  prewarm?: boolean;
  cacheKey?: number;
  label: string;
  value: string;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  side?: "top" | "right" | "bottom" | "left";
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onCloseAutoFocus: (event: Event) => void;
  id?: string;
  contentAttributes?: Record<`data-${string}`, string | boolean | undefined>;
}) {
  // Small finite menus are prepared at hidden priority and retained for subsequent openings.
  // Activity removes their effects/listeners while hidden; large catalogs stay lazy.
  const retained = prewarm;
  const portal = useSyncExternalStore<HTMLElement | undefined>(
    noPortalEvents,
    clientPortal,
    serverPortal,
  );
  const actions = useRef({ onValueChange, onOpenChange });
  useLayoutEffect(() => {
    actions.current = { onValueChange, onOpenChange };
  });
  const choose = useCallback((next: string) => {
    actions.current.onValueChange(next);
    actions.current.onOpenChange(false);
  }, []);
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const content = useRef<HTMLDivElement | null>(null);
  const pendingFocus = useRef<{ view: Window; frame: number } | null>(null);
  const search = useRef({ text: "", at: 0 });
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    content.current = node;
    if (!node) {
      const pending = pendingFocus.current;
      if (pending) pending.view.cancelAnimationFrame(pending.frame);
      pendingFocus.current = null;
      search.current = { text: "", at: 0 };
    }
  }, []);
  const viewportRef = useCallback((node: HTMLDivElement | null) => {
    cleanup.current?.();
    cleanup.current = undefined;
    const popup = node?.closest<HTMLElement>('[data-slot="select-content"]');
    if (node && popup) cleanup.current = bindSelectScroll(node, popup);
  }, []);
  function focusAfterLayout() {
    const node = content.current,
      view = node?.ownerDocument.defaultView;
    if (!node || !view) return;
    const previous = pendingFocus.current;
    if (previous) previous.view.cancelAnimationFrame(previous.frame);
    // Floating UI settles its size/position microtasks before this layout frame.
    pendingFocus.current = {
      view,
      frame: view.requestAnimationFrame(() => {
        pendingFocus.current = null;
        if (
          content.current !== node ||
          node.dataset.state !== "open" ||
          node.contains(node.ownerDocument.activeElement)
        )
          return;
        const selected =
          node.querySelector<HTMLElement>(
            '[role="option"][aria-selected="true"]:not([disabled])',
          ) ??
          node.querySelector<HTMLElement>('[role="option"]:not([disabled])') ??
          node;
        selected.focus({ preventScroll: true });
      }),
    };
  }
  function typeahead(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.key.length !== 1 ||
      event.key === " " ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const previous = search.current;
    const text = event.timeStamp - previous.at < 1000 ? previous.text + event.key : event.key;
    search.current = { text, at: event.timeStamp };
    const query = (text === event.key.repeat(text.length) ? event.key : text).toLocaleLowerCase();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]:not([disabled])'),
    );
    const current = items.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLElement);
    const start = text.length > 1 && query.length > 1 ? current : current + 1;
    const ordered = [...items.slice(Math.max(0, start)), ...items.slice(0, Math.max(0, start))];
    const match = ordered.find((item) =>
      item.textContent?.trim().toLocaleLowerCase().startsWith(query),
    );
    if (match) {
      event.preventDefault();
      match.focus();
    }
  }
  return (
    <Primitive.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        data-slot="select-trigger"
        data-size="default"
        data-placeholder={value === "" ? "" : undefined}
        onFocus={onFocus}
        onPointerDown={(event) => {
          if (event.button !== 0 || event.ctrlKey || disabled) return;
          event.preventDefault();
          onOpenChange(!open);
        }}
        onClick={(event) => {
          if (event.detail !== 0) event.preventDefault();
        }}
        onKeyDown={(event) => {
          onKeyDown(event);
          if (
            !event.defaultPrevented &&
            open &&
            ["Home", "End", "ArrowDown", "ArrowUp"].includes(event.key)
          ) {
            const items = Array.from(
              content.current?.querySelectorAll<HTMLElement>('[role="option"]:not([disabled])') ??
                [],
            );
            const selected = Math.max(
              0,
              items.findIndex((item) => item.getAttribute("aria-selected") === "true"),
            );
            const index =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (selected + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
            if (items[index]) {
              event.preventDefault();
              const pending = pendingFocus.current;
              if (pending) pending.view.cancelAnimationFrame(pending.frame);
              pendingFocus.current = null;
              items[index].focus({ preventScroll: true });
            }
          }
          if (!event.defaultPrevented && event.key === "ArrowDown") {
            event.preventDefault();
            onOpenChange(true);
          }
        }}
        className={cn(
          "group/select-trigger flex h-9 w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 data-[state=open]:bg-accent disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
          className,
        )}
      >
        <span
          data-slot="select-value"
          style={{ pointerEvents: "none" }}
          className="flex min-w-0 items-center gap-2 overflow-hidden text-ellipsis"
        >
          {typeof trigger === "string" ? <SelectLabel text={trigger} /> : trigger}
        </span>
        <DropdownChevron className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <Choice.Provider value={choose}>
        <Activity key={cacheKey} mode={open ? "visible" : "hidden"}>
          <RovingFocus.Root asChild orientation="vertical" loop>
            <PopoverContent
              forceMount={retained ? true : undefined}
              portalContainer={retained ? portal : undefined}
              aria-hidden={!open || undefined}
              inert={!open}
              ref={contentRef}
              data-slot="select-content"
              role="listbox"
              aria-label={label}
              side={side ?? "bottom"}
              align="start"
              sideOffset={4}
              data-canvas-control
              data-keybinding-capture
              {...contentAttributes}
              onPointerUpCapture={menuPointerUpCapture()}
              onCloseAutoFocus={onCloseAutoFocus}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                focusAfterLayout();
              }}
              onKeyDown={typeahead}
              className={cn("select-scroll-content p-0", contentClassName)}
              style={{
                width: "var(--radix-popover-trigger-width)",
                minWidth:
                  "min(calc(100dvw - 20px), max(var(--radix-popover-trigger-width), var(--select-menu-min-width, 0px)))",
                maxWidth: "calc(100dvw - 20px)",
              }}
            >
              <ScrollShadow className="select-scroll-shadow">
                <div
                  ref={viewportRef}
                  data-slot="select-viewport"
                  data-radix-select-viewport=""
                  className="w-full min-w-0 overflow-y-auto p-1"
                >
                  {children}
                </div>
              </ScrollShadow>
            </PopoverContent>
          </RovingFocus.Root>
        </Activity>
      </Choice.Provider>
    </Primitive.Root>
  );
}
export function FieldMenuOption({
  value,
  selected,
  disabled,
  children,
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onClick,
  ...props
}: Omit<ComponentProps<"button">, "value"> & { value: string; selected: boolean }) {
  const choose = useContext(Choice);
  const pressed = useRef(false);
  return (
    <RovingFocus.Item asChild focusable={!disabled} active={selected}>
      <button
        {...props}
        type="button"
        role="option"
        aria-selected={selected}
        disabled={disabled}
        data-disabled={disabled ? "" : undefined}
        data-state={selected ? "checked" : "unchecked"}
        data-slot="select-item"
        onPointerMove={(event) => {
          onPointerMove?.(event);
          if (
            !event.defaultPrevented &&
            !disabled &&
            event.pointerType === "mouse" &&
            event.currentTarget.ownerDocument.activeElement !== event.currentTarget
          )
            event.currentTarget.focus({ preventScroll: true });
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          pressed.current = event.button === 0;
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          if (event.button === 0 && !event.defaultPrevented && !pressed.current)
            event.currentTarget.click();
          pressed.current = false;
        }}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && !disabled) choose(value);
        }}
        className="relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pe-8 ps-2 text-start text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate">
          {typeof children === "string" ? <SelectLabel text={children} /> : children}
        </span>
        {selected && (
          <span
            data-slot="select-item-indicator"
            className="absolute end-2 flex size-3.5 items-center justify-center"
          >
            <CheckIcon className="size-4" />
          </span>
        )}
      </button>
    </RovingFocus.Item>
  );
}
