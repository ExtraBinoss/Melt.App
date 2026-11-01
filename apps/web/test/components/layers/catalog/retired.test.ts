import { expect, it } from "vitest";
import { effectCatalogEntries } from "../../../../src/components/layers/catalog/model";
import { SEARCH_COMMAND_IDS } from "../../../../src/components/search/catalog/items";
import { BINDING_COMMANDS } from "../../../../src/state/keybindings/registry";
it("excludes retired effects from all discovery surfaces", () => {
  expect(
    effectCatalogEntries("effect", (key) => key, "en").some(
      (item) => item.type === "time-warp-scan",
    ),
  ).toBe(false);
  expect(SEARCH_COMMAND_IDS).not.toContain("effect:time-warp-scan");
  expect(BINDING_COMMANDS.some((item) => item.id === "effect:time-warp-scan")).toBe(false);
});
