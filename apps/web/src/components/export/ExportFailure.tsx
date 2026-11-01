import { CopyButton } from "../ui/copy-button";
import { formatUiError } from "../../state/i18n/errors/format";

/** Keep diagnostics useful without copying documents, original media or unbounded error graphs. */
export function exportErrorDetails(error: unknown, context = "Export"): string {
  const lines = [context],
    seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; current !== undefined && depth < 8 && !seen.has(current); depth++) {
    seen.add(current);
    if (current instanceof Error) {
      lines.push(current.stack || `${current.name}: ${current.message}`);
      current = current.cause;
    } else {
      lines.push(formatUiError(current));
      break;
    }
  }
  return lines.join("\n\nCaused by:\n").slice(0, 16384);
}

export function ExportFailure({
  error,
  message,
  context,
}: {
  error: unknown;
  message: string;
  context?: string;
}) {
  if (error === null || error === undefined) return null;
  return (
    <div className="export-failure" role="alert">
      <div>
        <strong>{message}</strong>
        <p>{error instanceof Error ? error.message : formatUiError(error)}</p>
      </div>
      <CopyButton text={exportErrorDetails(error, context)} />
    </div>
  );
}
