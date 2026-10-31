/** Fixed-width tenths keep short motion clips readable without shifting the controls. */
export function playerTime(seconds: number) {
  const tenth = Math.max(0, Math.floor((Number.isFinite(seconds) ? seconds : 0) * 10));
  const minutes = Math.floor(tenth / 600);
  return `${minutes}:${String(Math.floor(tenth / 10) % 60).padStart(2, "0")}.${tenth % 10}`;
}
