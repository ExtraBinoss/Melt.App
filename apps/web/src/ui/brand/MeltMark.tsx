import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { bindHoverPreview } from "../../components/shared/preview/hover-preview";
import type { BrandState } from "./dahlia";
import type { BrandActivity } from "./playback";
import { brand } from "./config";
import raster from "./assets/raster-manifest.json";
import "./brand.css";

const AnimatedLogo = lazy(() =>
  import("./MeltLogo").then(({ MeltLogo }) => ({ default: MeltLogo })),
);
const idleSource = `${import.meta.env.BASE_URL}${brand.assets.idle}?v=${raster.files["melt-idle.webp"].slice(0, 12)}`;

/** Native first paint; the SVG engine is acquired only for an actual animation. */
export function MeltMark({
  size = 30,
  className = "",
  interactive = false,
  state = "idle",
  activity,
  loading = "eager",
}: {
  size?: number;
  className?: string;
  interactive?: boolean;
  state?: BrandState;
  activity?: BrandActivity;
  loading?: "eager" | "lazy";
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [retained, setRetained] = useState(false);
  const animated = state !== "idle" || hovered;
  const ready = useCallback((value: boolean) => {
    if (host.current) host.current.dataset.ready = String(value);
  }, []);
  useEffect(() => {
    if (!interactive) return;
    const owner = host.current?.closest<HTMLElement>("a,button") ?? host.current;
    if (!owner) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const preview = bindHoverPreview(owner, {
      onChange(target) {
        clearTimeout(timer);
        setHovered(Boolean(target));
        if (target) setRetained(true);
        else timer = setTimeout(() => setRetained(false), 160);
      },
    });
    return () => {
      preview.dispose();
      clearTimeout(timer);
    };
  }, [interactive]);
  return (
    <span
      ref={host}
      className={`melt-mark ${className}`}
      style={{ width: size, height: size }}
      data-motion={animated}
      data-state={state}
      aria-hidden
    >
      <img src={idleSource} alt="" width={size} height={size} loading={loading} draggable={false} />
      {(animated || retained) && (
        <span className="melt-mark-animation">
          <Suspense fallback={null}>
            <AnimatedLogo
              size={size}
              state={state}
              activity={activity}
              interactive={interactive}
              onReady={ready}
            />
          </Suspense>
        </span>
      )}
    </span>
  );
}
