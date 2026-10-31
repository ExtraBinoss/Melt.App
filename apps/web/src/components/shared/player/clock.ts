/** Fixed-width tenths keep short motion clips readable without shifting the controls. */
export function playerTime(seconds: number) {
  const tenth = Math.max(0, Math.floor((Number.isFinite(seconds) ? seconds : 0) * 10));
  const minutes = Math.floor(tenth / 600);
  return `${minutes}:${String(Math.floor(tenth / 10) % 60).padStart(2, "0")}.${tenth % 10}`;
}

/** Accept seconds or minute/hour timecodes without accepting malformed or negative values. */
export function parsePlayerTime(value: string): number | null {
  const parts = value.trim().split(":");
  if (!parts.length || parts.length > 3 || parts.some((part) => !/^\d+(?:\.\d+)?$/u.test(part)))
    return null;
  const values = parts.map(Number);
  if (
    values.some((value) => !Number.isFinite(value)) ||
    values.slice(1).some((value) => value >= 60) ||
    values.slice(0, -1).some((value) => !Number.isInteger(value))
  )
    return null;
  const time = values.reduce((total, value) => total * 60 + value, 0);
  return Number.isFinite(time) ? time : null;
}
