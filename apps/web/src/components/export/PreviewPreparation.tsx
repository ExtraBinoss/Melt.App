import { Throbber } from "../ui/throbber/Throbber";
import "./preview-preparation.css";

/** Shared canvas-style feedback; readiness follows decoded pixels, never an artificial timer. */
export function PreviewPreparation({
  ready,
  failed,
  label,
  failure,
}: {
  ready: boolean;
  failed?: boolean;
  label: string;
  failure: string;
}) {
  return (
    <div
      className="export-preview-preparation"
      data-ready={ready && !failed}
      aria-hidden={(ready && !failed) || undefined}
    >
      <Throbber size={56} variant="shimmer" active={!ready && !failed} label={label} />
      {failed && <p role="alert">{failure}</p>}
    </div>
  );
}
