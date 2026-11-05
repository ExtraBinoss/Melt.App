import { SPATIAL_MATERIALS, SPATIAL_ENVIRONMENT_PRESETS } from "@musart/core";

/** Static native renders share one image; opening a catalog creates no GPU owner. */
export function CatalogSwatch({
  kind,
  index,
}: {
  kind: "materials" | "environments";
  index: number;
}) {
  const columns = 8;
  const count =
    kind === "materials" ? SPATIAL_MATERIALS.length : SPATIAL_ENVIRONMENT_PRESETS.length;
  const rows = Math.ceil(count / columns);
  return (
    <span
      aria-hidden
      className="studio-catalog-swatch"
      style={{
        backgroundImage: `url(${import.meta.env.BASE_URL}spatial/${kind}.webp)`,
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${((index % columns) / (columns - 1)) * 100}% ${(Math.floor(index / columns) / Math.max(1, rows - 1)) * 100}%`,
      }}
    />
  );
}
