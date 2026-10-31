import { assertText } from "./guards";

/** Candidate 0 keeps the requested name; persistence reserves the first available candidate. */
export function projectNameCandidate(name: string, index: number): string {
  assertText(name);
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError("Invalid name increment.");
  if (index === 0) return name;
  const suffix = ` ${index}`;
  let base = name.slice(0, 256 - suffix.length);
  // Do not split a UTF-16 surrogate pair when making room for the suffix.
  if (/[\uD800-\uDBFF]$/.test(base)) base = base.slice(0, -1);
  return base + suffix;
}
