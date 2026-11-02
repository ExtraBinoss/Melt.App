import { useCallback, useLayoutEffect, useRef } from "react";

/** Retain a row control without letting an abandoned render replace its canonical owner. */
export function useRowAction<Args extends unknown[]>(
  action: (...args: Args) => void,
): (...args: Args) => void {
  const committed = useRef(action);
  useLayoutEffect(() => {
    committed.current = action;
  }, [action]);
  return useCallback((...args: Args) => committed.current(...args), []);
}
