// shadcn/ui, MIT. Source: https://ui.shadcn.com/r/styles/new-york-v4/kbd.json
import { Children, Fragment } from "react";
import { cn } from "./utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border border-border bg-muted px-1 font-sans text-xs font-medium text-foreground select-none",
        "[&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      dir="ltr"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    >
      {Children.toArray(children)
        .filter(Boolean)
        .map((child, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <span
                data-slot="kbd-separator"
                aria-hidden="true"
                className="text-muted-foreground text-[10px]"
              >
                +
              </span>
            )}
            {child}
          </Fragment>
        ))}
    </kbd>
  );
}

export { Kbd, KbdGroup };
