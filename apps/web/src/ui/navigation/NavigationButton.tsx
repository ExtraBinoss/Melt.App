import type { ComponentProps } from "react";
import { Button } from "../../components/ui/button";
import { dialogLinkKeyDown, isPlainPrimaryClick } from "./activation";

/** Keep the native link and its media subtree stable through disabled/loading states. */
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
  return (
    <Button
      {...props}
      className={
        disabled ? `${props.className ?? ""} pointer-events-none opacity-50` : props.className
      }
      onPointerEnter={disabled ? undefined : onPrepare}
      onFocus={disabled ? undefined : onPrepare}
      asChild
    >
      <a
        href={href}
        role="button"
        aria-disabled={disabled || undefined}
        inert={disabled || undefined}
        tabIndex={disabled ? -1 : props.tabIndex}
        onKeyDown={dialogLinkKeyDown}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
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
