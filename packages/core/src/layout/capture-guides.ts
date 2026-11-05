import { ensure } from "../errors";
import { assertBoolean, assertNumber, assertRecord, assertText } from "../document/guards";

export function validateCaptureGuides(value: unknown): void {
  assertRecord(value);
  const fields = [
    "preset",
    "width",
    "height",
    "full",
    "visible",
    "color",
    "center",
    "safeArea",
    "margin",
  ];
  ensure(
    Object.keys(value).length === fields.length &&
      Object.keys(value).every((key) => fields.includes(key)),
    "INVALID_DOCUMENT",
    "Invalid capture guide fields",
  );
  assertText(value.preset, 100);
  for (const side of ["width", "height"]) {
    assertNumber(value[side], 1, 16384);
    ensure(
      Number.isInteger(value[side]),
      "INVALID_DOCUMENT",
      "Capture dimensions must be integer pixels",
    );
  }
  assertNumber(value.margin, 0, 40);
  for (const field of ["full", "visible", "center"]) assertBoolean(value[field]);
  ensure(
    typeof value.color === "string" && ["cyan", "magenta", "lime", "white"].includes(value.color),
    "INVALID_DOCUMENT",
    "Invalid guide color",
  );
  ensure(
    typeof value.safeArea === "string" && ["format", "custom", "none"].includes(value.safeArea),
    "INVALID_DOCUMENT",
    "Invalid guide margin mode",
  );
}
