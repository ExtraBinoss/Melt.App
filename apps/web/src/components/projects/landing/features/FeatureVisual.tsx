import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { LandingVideo } from "../media/LandingVideo";
import media from "../media/manifest.json";
import effectsImage from "./assets/effects.webp";
import "./features.css";

const interfaces = {
  canvas: lazy(() =>
    import("./Illustrations").then((module) => ({ default: module.CanvasIllustration })),
  ),
  agent: lazy(() =>
    import("./Illustrations").then((module) => ({ default: module.AgentIllustration })),
  ),
  export: lazy(() =>
    import("./Illustrations").then((module) => ({ default: module.ExportIllustration })),
  ),
};
type InterfaceKind = keyof typeof interfaces;
/** Real product controls are admitted near the viewport; the artwork is available in server HTML. */
function ProductInterface({ kind }: { kind: InterfaceKind }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "180px" },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const Component = interfaces[kind];
  const clip = media[kind === "canvas" ? "bloom-windows" : "morphing-type"];
  const fallback = (
    <img
      className="feature-interface-poster"
      src={`${import.meta.env.BASE_URL}${clip.poster}`}
      width={clip.width}
      height={clip.height}
      loading="lazy"
      alt=""
    />
  );
  return (
    <div className="feature-interface" ref={host} data-feature-ui={kind}>
      <Suspense fallback={fallback}>{visible ? <Component /> : fallback}</Suspense>
    </div>
  );
}
function Clip({
  id,
  loopDelayMs = 0,
}: {
  id: "share-your-work" | "feature-timelapse";
  loopDelayMs?: number;
}) {
  const clip = media[id];
  return (
    <LandingVideo
      poster={`${import.meta.env.BASE_URL}${clip.poster}`}
      video={`${import.meta.env.BASE_URL}${clip.video}`}
      width={clip.width}
      height={clip.height}
      loopDelayMs={loopDelayMs}
    />
  );
}
const visuals = {
  canvas: () => <ProductInterface kind="canvas" />,
  effects: () => <img src={effectsImage} width={960} height={540} loading="lazy" alt="" />,
  motion: () => <Clip id="share-your-work" />,
  agent: () => <ProductInterface kind="agent" />,
  timelapse: () => <Clip id="feature-timelapse" loopDelayMs={2000} />,
  export: () => <ProductInterface kind="export" />,
};
export type LandingFeature = keyof typeof visuals;
export function FeatureVisual({ kind }: { kind: LandingFeature }) {
  const Visual = visuals[kind];
  const clip =
    kind === "motion"
      ? media["share-your-work"]
      : kind === "timelapse"
        ? media["feature-timelapse"]
        : null;
  const aspect = clip ? clip.width / clip.height : 960 / 540;
  return (
    <div
      className="landing-feature-artwork"
      data-video-slot={kind}
      aria-hidden="true"
      style={{ "--feature-media-aspect": aspect } as CSSProperties}
    >
      <Visual />
    </div>
  );
}
