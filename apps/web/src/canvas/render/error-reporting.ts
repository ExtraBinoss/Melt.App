import type { EnginePort } from "@musart/core";
import { ERROR_NOTICE_MS } from "../../components/notifications/EditorNotice";
import { publishEditorNotice } from "../../components/notifications/source";
import { errorDiagnostics } from "../../components/notifications/diagnostics";

/** Keep one bounded failure identity, even when a failed display is requested repeatedly. */
export function createRendererErrorReporter(
  engine: EnginePort | undefined,
  notify: () => ((message: string, details?: string) => void) | undefined,
  now: () => number = Date.now,
): (message: string, details?: string) => void {
  let previous: { message: string; details: string; time: number } | undefined;
  return (message, details = errorDiagnostics(message)) => {
    const time = now();
    if (
      previous?.message === message &&
      previous.details === details &&
      time - previous.time < ERROR_NOTICE_MS
    )
      return;
    previous = { message, details, time };
    const callback = notify();
    if (callback) callback(message, details);
    else if (engine) publishEditorNotice(engine, { message, details, error: true });
    else console.error("[Melt renderer]", details);
  };
}
