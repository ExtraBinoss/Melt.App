import { useCallback, useState } from "react";
import { Throbber } from "../../ui/throbber/Throbber";
import { MeltMark } from "../../../ui/brand/MeltMark";

/** Native motion preparation owns its own feedback; only idle cards use this placeholder. */
export function ProjectPreviewPlaceholder({
  pending,
  failed = false,
  idleFallback = false,
  label,
}: {
  pending: boolean;
  failed?: boolean;
  idleFallback?: boolean;
  label: string;
}) {
  const [idle, setIdle] = useState(true);
  const mount = useCallback((node: HTMLSpanElement | null) => {
    const surface = node?.closest(".motion-project-preview");
    if (!surface) return;
    const refresh = () => setIdle(surface.getAttribute("data-preview-status") === "idle");
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(surface, { attributes: true, attributeFilter: ["data-preview-status"] });
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={mount} className="project-preview-placeholder" aria-hidden>
      {failed ? (
        <span className="preview-pending">{label}</span>
      ) : idleFallback && !pending ? (
        <MeltMark size={40} />
      ) : (
        <Throbber active={pending && idle} variant="shimmer" size={40} label={label} decorative />
      )}
    </span>
  );
}
