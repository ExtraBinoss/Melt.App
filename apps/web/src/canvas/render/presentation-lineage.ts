import type { Asset, Composition } from "@musart/core";
import type { PresentationInput, PreviewRequest } from "./frame-request";
interface CurrentFrame {
  page: Composition;
  assets: Record<string, Asset>;
  playback?: boolean;
  presentation?: PresentationInput;
}
/** A continuation permits an older real frame; it never relabels its canonical ticket. */
export function continuesPresentation(
  request: PreviewRequest,
  current: CurrentFrame | null,
): boolean {
  if (
    !current ||
    request.page.id !== current.page.id ||
    request.assets !== current.assets ||
    !request.origin ||
    !current.presentation ||
    request.origin.projectId !== current.presentation.origin.projectId
  )
    return false;
  if (
    request.continuation &&
    !current.playback &&
    request.continuation ===
      (current.presentation.canonical
        ? current.presentation.continuation
        : current.presentation.preview
          ? current.presentation.baseContinuation
          : undefined)
  )
    return request.origin.revision <= current.presentation.origin.revision;
  return (
    request.origin.revision === current.presentation.origin.revision &&
    Boolean(
      (request.playback && current.playback) ||
      (request.preview &&
        !current.playback &&
        current.presentation.canonical === false &&
        request.preview === current.presentation.preview),
    )
  );
}

/** A preview clear and its verified commit are synchronous. Cancellation still
 * rejects presentation immediately; only aborting its canonical predecessor waits.
 */
export function abortSupersededPresentation(
  request: PreviewRequest,
  presentation: PresentationInput | undefined,
  abort: AbortController | null,
  canPresent: () => boolean,
): void {
  if (canPresent()) return;
  if (
    request.continuation &&
    presentation?.canonical &&
    presentation.baseContinuation === request.continuation
  )
    queueMicrotask(() => {
      if (!canPresent()) abort?.abort();
    });
  else abort?.abort();
}
