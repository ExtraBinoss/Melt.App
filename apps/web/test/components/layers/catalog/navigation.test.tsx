import { expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { EffectCatalog } from "../../../../src/components/layers/catalog/EffectCatalog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../../src/components/ui/dropdown-menu";
import { setup } from "../../../support/ui";

test("bounded native rows expose the entire catalog through End/Home, arrows and repeated typeahead", async () => {
  const d = setup(),
    add = vi.fn();
  d.mount(
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent className="effect-catalog-menu">
        <EffectCatalog category="effect" onAdd={add} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  expect(document.querySelector('[data-effect-catalog-item="window-trails"]')).toBeNull();
  const search = screen.getByRole("searchbox");
  search.focus();
  fireEvent.keyDown(search, { key: "ArrowDown" });
  const first = (document.activeElement as HTMLElement).dataset.effectCatalogItem;
  expect(first).toBeTruthy();
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  await waitFor(() =>
    expect(document.activeElement).toHaveAttribute("data-effect-catalog-item", "transition"),
  );
  const last = document.activeElement as HTMLElement;
  expect(last.getAttribute("aria-posinset")).toBe(last.getAttribute("aria-setsize"));
  expect(screen.getAllByRole("menuitem").length).toBeLessThan(
    Number(last.getAttribute("aria-setsize")),
  );
  fireEvent.keyDown(last, { key: "Home" });
  await waitFor(() =>
    expect(document.activeElement).toHaveAttribute("data-effect-catalog-item", first!),
  );
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(document.activeElement).not.toHaveAttribute("data-effect-catalog-item", first!);
  fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
  expect(document.activeElement).toHaveAttribute("data-effect-catalog-item", first!);
  fireEvent.keyDown(document.activeElement!, { key: "t" });
  expect(document.activeElement).toHaveAttribute("data-effect-catalog-item", "thermal");
  for (
    let i = 0;
    i < Number(last.getAttribute("aria-setsize")) &&
    (document.activeElement as HTMLElement).dataset.effectCatalogItem !== "window-trails";
    i++
  )
    fireEvent.keyDown(document.activeElement!, { key: "t" });
  await waitFor(() =>
    expect(document.activeElement).toHaveAttribute("data-effect-catalog-item", "window-trails"),
  );
  expect(add).not.toHaveBeenCalled();
  fireEvent.keyDown(document.activeElement!, { key: "Enter" });
  expect(add).toHaveBeenCalledExactlyOnceWith("window-trails");
  expect(screen.queryByRole("menu")).toBeNull();
});
