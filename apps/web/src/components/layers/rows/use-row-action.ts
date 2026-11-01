import { useCallback, useLayoutEffect, useRef } from "react";

/** Retain a row control without letting an abandoned render replace its canonical owner. */
export function useRowAction(action: () => void): () => void {
  const committed = useRef(action);
  useLayoutEffect(() => {
    committed.current = action;
  }, [action]);
  return useCallback(() => committed.current(), []);
}
