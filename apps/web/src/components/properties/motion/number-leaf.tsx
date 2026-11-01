import { isValidElement, memo, type ReactNode } from "react";
import {
  ArrowLeftRight,
  ArrowUpDown,
  MoveHorizontal,
  MoveVertical,
  Pencil,
  Radius,
  RotateCw,
} from "lucide-react";
import { NumberInput, type NumberInputProps } from "../../shared/NumberInput";

const icons = new Set<unknown>([
  ArrowLeftRight,
  ArrowUpDown,
  MoveHorizontal,
  MoveVertical,
  Pencil,
  Radius,
  RotateCw,
]);

/** Only known presentation icons/intrinsics with equal props qualify; opaque nodes retain normal identity checks. */
function sameLabel(a: ReactNode, b: ReactNode, depth = 0): boolean {
  if (Object.is(a, b)) return true;
  if (depth > 4) return false;
  if (Array.isArray(a) && Array.isArray(b))
    return (
      a.length <= 16 &&
      a.length === b.length &&
      a.every((item, index) => sameLabel(item, b[index], depth + 1))
    );
  if (
    !isValidElement<Record<string, unknown>>(a) ||
    !isValidElement<Record<string, unknown>>(b) ||
    a.type !== b.type ||
    a.key !== b.key ||
    (typeof a.type !== "string" && !icons.has(a.type))
  )
    return false;
  const keys = Object.keys(a.props);
  return (
    keys.length === Object.keys(b.props).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b.props, key) &&
        (key === "children"
          ? sameLabel(a.props.children as ReactNode, b.props.children as ReactNode, depth + 1)
          : Object.is(a.props[key], b.props[key])),
    )
  );
}

/** Value changes are already painted by presentation; all other native input behavior stays explicit. */
function sameNumberProps(before: NumberInputProps, after: NumberInputProps, includeValue: boolean) {
  const keys = Object.keys(before) as (keyof NumberInputProps)[];
  return (
    keys.length === Object.keys(after).length &&
    keys.every(
      (key) =>
        Object.hasOwn(after, key) &&
        (key === "value" && !includeValue
          ? true
          : key === "scrubLabel"
            ? sameLabel(before.scrubLabel, after.scrubLabel)
            : Object.is(before[key], after[key])),
    )
  );
}
export const MotionNumberLeaf = memo(NumberInput, (before, after) =>
  sameNumberProps(before, after, false),
);
/** Mobile slider extents can depend on value, even when presentation already painted its thumb. */
export const MobileMotionNumberLeaf = memo(NumberInput, (before, after) =>
  sameNumberProps(before, after, true),
);
