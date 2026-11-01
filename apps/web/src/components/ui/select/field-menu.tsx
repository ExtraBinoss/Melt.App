// shadcn/ui select/dropdown-menu styling, MIT; genuine Radix nonmodal menu semantics.
// A local single-choice listbox must not acquire body scroll/pointer locks or inject viewport CSS.
import {
  useCallback,
  useRef,
  type ReactNode,
  type KeyboardEvent,
  type ComponentProps,
} from "react";
import { DropdownMenu as Primitive } from "radix-ui";
import { CheckIcon } from "lucide-react";
import { DropdownMenuContent, DropdownMenuTrigger } from "../dropdown-menu";
import { DropdownChevron } from "../../shared/DropdownChevron";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { bindSelectScroll } from "./scroll";
import { cn } from "../utils";
import "./scroll.css";

export function FieldMenu({
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
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const viewportRef = useCallback((node: HTMLDivElement | null) => {
    cleanup.current?.();
    cleanup.current = undefined;
    const content = node?.closest<HTMLElement>('[data-slot="select-content"]');
    if (node && content) cleanup.current = bindSelectScroll(node, content);
  }, []);
  return (
    <Primitive.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        id={id}
        disabled={disabled}
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        data-slot="select-trigger"
        data-size="default"
        data-placeholder={value === "" ? "" : undefined}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
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
          {trigger}
        </span>
        <DropdownChevron className="size-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-slot="select-content"
        role="listbox"
        aria-labelledby={undefined}
        aria-label={label}
        side={side ?? "bottom"}
        align="start"
        loop
        data-canvas-control
        data-keybinding-capture
        {...contentAttributes}
        onCloseAutoFocus={onCloseAutoFocus}
        onFocus={(event) => {
          if (event.target !== event.currentTarget) return;
          const content = event.currentTarget;
          const selected = content.querySelector<HTMLElement>(
            '[role="option"][aria-selected="true"]:not([data-disabled])',
          );
          if (selected) {
            event.preventDefault();
            selected.focus();
          }
        }}
        className={cn("select-scroll-content p-0", contentClassName)}
        style={{
          width: "var(--radix-dropdown-menu-trigger-width)",
          minWidth: "var(--radix-dropdown-menu-trigger-width)",
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
            <Primitive.RadioGroup value={value} onValueChange={onValueChange}>
              {children}
            </Primitive.RadioGroup>
          </div>
        </ScrollShadow>
      </DropdownMenuContent>
    </Primitive.Root>
  );
}
export function FieldMenuOption({
  value,
  selected,
  children,
  ...props
}: ComponentProps<typeof Primitive.RadioItem> & { selected: boolean }) {
  return (
    <Primitive.RadioItem
      value={value}
      role="option"
      aria-selected={selected}
      data-slot="select-item"
      {...props}
      className="relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
      <span className="min-w-0 truncate">{children}</span>
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <Primitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </Primitive.ItemIndicator>
      </span>
    </Primitive.RadioItem>
  );
}
