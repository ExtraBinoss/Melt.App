import { useCallback, useLayoutEffect, useState } from "react";
import type { EditorRuntime } from "../services/session/runtime";
import type { StudioRouting } from "../state/contracts";
import { StudioSessionOwner } from "./studio-session-owner";

/** Render the library independently; acquire one real engine only when an operation needs it. */
export function useStudioSession(
  routing: StudioRouting | undefined,
  report: (error: unknown) => void,
) {
  const [owner] = useState(() => new StudioSessionOwner(routing));
  const [runtime, setRuntime] = useState<EditorRuntime | null>(null);
  useLayoutEffect(() => {
    owner.reporter(report);
  });
  useLayoutEffect(() => {
    owner.connect();
    return () => owner.close();
  }, [owner]);
  const ensureRuntime = useCallback(() => owner.runtime(), [owner]);
  const publishRuntime = useCallback(
    (result: EditorRuntime) => {
      if (owner.accepts(result)) setRuntime(result);
    },
    [owner],
  );
  return { runtime, services: owner.services, ensureRuntime, publishRuntime, peek: owner.peek };
}
