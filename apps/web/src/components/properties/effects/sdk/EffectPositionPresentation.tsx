import { createContext, useState } from "react";
import type { ReactNode } from "react";
import type { Effect } from "@musart/core";
import { createPositionPresentation } from "./position-presentation";

export const EffectPositionContext = createContext<ReturnType<
  typeof createPositionPresentation
> | null>(null);

/** One owner connects its pad and numeric leaves; pointer moves do not rerender controls. */
export function EffectPositionPresentation({
  effect,
  children,
}: {
  effect: Effect;
  children: (publish: (x: number, y: number) => void) => ReactNode;
}) {
  const [source] = useState(() => createPositionPresentation(effect));
  return <EffectPositionContext value={source}>{children(source.publish)}</EffectPositionContext>;
}
