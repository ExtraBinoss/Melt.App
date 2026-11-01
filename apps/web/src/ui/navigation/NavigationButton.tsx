import type { ComponentProps } from "react";
import { Button } from "../../components/ui/button";
import { dialogLinkKeyDown, isPlainPrimaryClick } from "./activation";

/** A real href works before hydration; primary client activation keeps app routing. */
export function NavigationButton({
  href,
  onNavigate,
  onPrepare,
  children,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "asChild"> & {
  href: string;
  onNavigate?: () => void;
  onPrepare?: () => void;
}) {
  const prepare = { onPointerEnter: onPrepare, onFocus: onPrepare };
  if (disabled)
    return (
      <Button {...props} disabled>
        {children}
      </Button>
    );
  return (
    <Button {...props} {...prepare} asChild>
      <a
        href={href}
        role="button"
        onKeyDown={dialogLinkKeyDown}
        onClick={(event) => {
          if (onNavigate && isPlainPrimaryClick(event)) {
            event.preventDefault();
            onNavigate();
          }
        }}
      >
        {children}
      </a>
    </Button>
  );
}
