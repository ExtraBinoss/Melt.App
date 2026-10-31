import { expect, test } from "vitest";
import { i18n } from "../../../src/state/i18n";
import { supportedLocales } from "../../../src/state/i18n/locales";
import { messages as vector } from "../../../src/components/properties/vector/messages";
import { messages as fonts } from "../../../src/components/properties/fonts/messages";
import { messages as artboards } from "../../../src/canvas/artboards/messages";
import { messages as quickAdd } from "../../../src/canvas/quick-add/messages";
import { messages as startup } from "../../../src/bootstrap/messages";
import { messages as items } from "../../../src/components/projects/items/messages";
import { resources as templates } from "../../../src/components/projects/templates/messages";
import { messages as previews } from "../../../src/components/projects/templates/motion-preview/messages";
import { messages as historyNotice } from "../../../src/components/notifications/history/messages";
import { messages as preferences } from "../../../src/components/projects/preferences/messages";
import { messages as motion } from "../../../src/components/motion/messages";

function leaves(value: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof item === "string"
        ? [[path, item]]
        : Object.entries(leaves(item as Record<string, unknown>, path));
    }),
  );
}
const complete = {
  historyNotice,
  vectorEditor: vector,
  fonts,
  artboards,
  quickAdd,
  startup,
  libraryItem: items,
  templates,
  motionPreview: previews,
};
const modeKeys = [
  "mode",
  "static",
  "motion",
  "enableTitle",
  "enableDescription",
  "groupCount",
  "yes",
  "no",
  "changed",
  "failed",
];

test("the edited interfaces have complete resources in every enabled locale, without losing interpolation", () => {
  for (const [namespace, resource] of Object.entries({ ...complete, motion })) {
    const english = leaves(resource.en),
      keys = namespace === "motion" ? modeKeys : Object.keys(english);
    for (const { code } of supportedLocales) {
      expect(resource[code], `${namespace}:${code}`).toBeDefined();
      const translated = leaves(resource[code]!);
      if (namespace !== "motion") expect(Object.keys(translated).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        const text = translated[key];
        expect(text?.trim(), `${namespace}:${code}:${key}`).toBeTruthy();
        expect(text?.match(/{{[^}]+}}/g)?.sort() ?? [], `${namespace}:${code}:${key}`).toEqual(
          english[key]!.match(/{{[^}]+}}/g)?.sort() ?? [],
        );
        const options = { lng: code, index: 2, count: 3, name: "Demo", font: "Inter" };
        expect(i18n.t(`${namespace}:${key}`, options), `${namespace}:${code}:${key}`).toBe(
          i18n.services.interpolator.interpolate(text!, options, code, {}),
        );
      }
    }
  }
});

test("mode names agree between the canvas and library filters in every language", () => {
  for (const { code } of supportedLocales)
    for (const key of ["static", "motion"]) {
      expect(i18n.t(`templates:${key}`, { lng: code })).toBe(
        i18n.t(`motion:${key}`, { lng: code }),
      );
    }
});

const canvasCopy = [
  "newText",
  "selectImageFirst",
  "canvas",
  "toolHint",
  "dropImages",
  "composition",
  "fontFamily",
  "close",
  "rotate",
  "resize",
  "zoomIn",
  "zoomOut",
  "resetView",
];
const commonJson = import.meta.glob("../../../src/state/i18n/locales/common/*.json", {
  eager: true,
  import: "default",
});
test("canvas hints and font labels resolve from the saved locale instead of local fallbacks", () => {
  for (const { code } of supportedLocales) {
    const resource = commonJson[`../../../src/state/i18n/locales/common/${code}.json`] as Record<
      string,
      string
    >;
    for (const key of canvasCopy) {
      expect(resource[key]?.trim(), `${code}:${key}`).toBeTruthy();
      expect(i18n.t(key, { lng: code })).toBe(resource[key]);
    }
  }
});

const locks = import.meta.glob("../../../src/components/layers/locales/*.json", {
  eager: true,
  import: "default",
});
test("locked-state decoration uses a real translation in every supported locale", () => {
  for (const { code } of supportedLocales) {
    const resource = locks[`../../../src/components/layers/locales/${code}.json`] as Record<
      string,
      string
    >;
    expect(resource.lockedState?.trim()).toBeTruthy();
  }
});

test("the optional zoom UI preference is translated in every enabled locale", () => {
  for (const { code } of supportedLocales) {
    for (const key of [
      "showCanvasZoom",
      "showCanvasZoomDescription",
      "marqueeContain",
      "marqueeContainDescription",
      "marqueeExample",
      "marqueeTouch",
      "marqueeEnclose",
    ] as const) {
      const value = preferences[code]?.[key];
      expect(typeof value).toBe("string");
      expect(i18n.t(`preferences:${key}`, { lng: code })).toBe(value);
    }
  }
});
