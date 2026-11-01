import { useRouter } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { isPlainPrimaryClick } from "./activation";

/** Native links share the opening reveal without loading the editor on public pages. */
export function TransitionLink({
  href,
  revealTarget,
  onClick,
  ...props
}: ComponentProps<"a"> & { href: string; revealTarget: string }) {
  const router = useRouter({ warn: false });
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          !router ||
          !isPlainPrimaryClick(event) ||
          (props.target && props.target !== "_self") ||
          props.download !== undefined
        )
          return;
        const destination = new URL(href, window.location.href);
        if (
          destination.origin !== window.location.origin ||
          (destination.pathname === window.location.pathname &&
            destination.search === window.location.search)
        )
          return;
        // Read before the overlay changes the DOM; keyboard activation starts at its link.
        const box = event.detail === 0 ? event.currentTarget.getBoundingClientRect() : undefined;
        const point = box
          ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
          : { x: event.clientX, y: event.clientY };
        event.preventDefault();
        void import("../../components/projects/opening/navigation")
          .then(({ revealNavigation }) =>
            revealNavigation(
              async () => {
                await router.navigate({ href });
                if (!destination.hash)
                  document.querySelector(".public-page")?.scrollTo({ top: 0, behavior: "instant" });
              },
              revealTarget,
              point,
            ),
          )
          .catch((error: unknown) => console.error("[Melt navigation]", error));
      }}
    />
  );
}
