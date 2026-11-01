/** Bounded, copyable browser diagnostics. No renderer/device handles enter a report. */
export type PerformanceEnvironment = Readonly<Record<string, string | number | boolean>>;

export function capturePerformanceEnvironment(value: unknown): PerformanceEnvironment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (
    entries.length > 96 ||
    entries.some(
      ([key, item]) =>
        !key ||
        key.length > 80 ||
        !(
          typeof item === "boolean" ||
          (typeof item === "string" && item.length <= 2048) ||
          (typeof item === "number" && Number.isFinite(item) && item >= 0)
        ),
    )
  )
    return null;
  return Object.freeze(Object.fromEntries(entries));
}
