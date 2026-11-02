import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import {
  accentIds,
  accentTokens,
  accentBootstrapScript,
  isAccent,
  paintAccent,
} from "../../../src/ui/brand/accents";

const rgb = (hex: string) => hex.match(/[a-f\d]{2}/gi)!.map((part) => parseInt(part, 16) / 255);
function contrast(a: string, b: string) {
  const luminance = (color: string) =>
    rgb(color)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i]!, 0);
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}
function hover(color: string, background: string) {
  return (
    "#" +
    rgb(color)
      .map((v, i) =>
        Math.round((v * 0.9 + rgb(background)[i]! * 0.1) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
for (const accent of accentIds)
  for (const dark of [false, true]) {
    test(`${accent} ${dark ? "dark" : "light"} keeps text, selected fills, hover labels and focus rings readable`, () => {
      const tokens = accentTokens(accent, dark);
      const backgrounds = dark
        ? ["#222222", "#262626", "#2A2A2A", "#2D2D2D", "#303030", "#343434"]
        : ["#FBFBFC", "#FFFFFF", "#F0F1F4", "#ECEEF3", "#EDEEF1", "#EEEEEE"];
      for (const background of backgrounds) {
        expect(contrast(tokens["--primary"]!, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens["--ring"]!, background)).toBeGreaterThanOrEqual(3);
        expect(
          contrast(tokens["--action-foreground"]!, hover(tokens["--action"]!, background)),
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(tokens["--primary-foreground"]!, tokens["--primary"]!),
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens["--action-foreground"]!, tokens["--action"]!)).toBeGreaterThanOrEqual(
        4.5,
      );
    });
  }
test("only curated palette IDs are accepted and the pre-hydration script uses the same palette", () => {
  for (const value of [null, "__proto__", "constructor", "#00ff00", "invalid", {}])
    expect(isAccent(value)).toBe(false);
  const root = document.createElement("html");
  root.classList.add("dark");
  paintAccent(root, "green");
  expect(root.style.getPropertyValue("--primary")).toBe(accentTokens("green", true)["--primary"]);
  expect(root.dataset.accent).toBe("green");
  expect(accentBootstrapScript).toContain("musart.accent.v1");
  expect(accentBootstrapScript).toContain(accentTokens("green", true)["--primary"]);
});

test("pre-hydration tokens validate storage and still paint a safe default if storage is blocked", () => {
  const original = document.documentElement.getAttribute("style");
  const dark = document.documentElement.classList.contains("dark");
  try {
    document.documentElement.classList.add("dark");
    localStorage.setItem("musart.accent.v1", "green");
    runInNewContext(accentBootstrapScript, { document, localStorage });
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      accentTokens("green", true)["--primary"],
    );
    localStorage.setItem("musart.accent.v1", "__proto__");
    runInNewContext(accentBootstrapScript, { document, localStorage });
    expect(document.documentElement.dataset.accent).toBe("violet");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw Error("Blocked");
    });
    runInNewContext(accentBootstrapScript, { document, localStorage });
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      accentTokens("violet", true)["--primary"],
    );
  } finally {
    vi.restoreAllMocks();
    localStorage.removeItem("musart.accent.v1");
    document.documentElement.classList.toggle("dark", dark);
    if (original === null) document.documentElement.removeAttribute("style");
    else document.documentElement.setAttribute("style", original);
    delete document.documentElement.dataset.accent;
  }
});
