import { useId } from "react";
import type { FillGradient } from "@musart/core";
/** SVG uses the same normalized ellipse and full-artboard linear projection as native paint. */
export function PresetSwatch({ gradient }: { gradient: FillGradient }) {
  const id = useId();
  const radians = (gradient.angle * Math.PI) / 180;
  const dx = Math.cos(radians),
    dy = Math.sin(radians);
  const span = Math.abs(dx) * 160 + Math.abs(dy) * 100;
  const stops = gradient.stops.map((stop, index) => (
    <stop key={index} offset={stop.offset} stopColor={stop.color} />
  ));
  return (
    <svg viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {gradient.kind === "radial" ? (
          <radialGradient
            id={id}
            gradientUnits={
              gradient.radialShape === "circle" ? "userSpaceOnUse" : "objectBoundingBox"
            }
            cx={(gradient.centerX ?? 0.5) * (gradient.radialShape === "circle" ? 160 : 1)}
            cy={(gradient.centerY ?? 0.5) * (gradient.radialShape === "circle" ? 100 : 1)}
            r={(gradient.radius ?? 0.5) * (gradient.radialShape === "circle" ? 100 : 1)}
            colorInterpolation="sRGB"
          >
            {stops}
          </radialGradient>
        ) : (
          <linearGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            colorInterpolation="sRGB"
            x1={80 - (dx * span) / 2}
            y1={50 - (dy * span) / 2}
            x2={80 + (dx * span) / 2}
            y2={50 + (dy * span) / 2}
          >
            {stops}
          </linearGradient>
        )}
      </defs>
      <rect width="160" height="100" fill={`url(#${id})`} />
    </svg>
  );
}
