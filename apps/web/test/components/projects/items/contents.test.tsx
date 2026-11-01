import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import { messages } from "../../../../src/components/projects/items/contents/messages";
import { TEMPLATE_CATALOG } from "../../../../src/services/projects/templates/catalog";
import { ContentTags } from "../../../../src/components/projects/items/contents/ContentTags";
import { useItemTags } from "../../../../src/components/projects/items/contents/use-item-tags";
import type { LibraryItem } from "../../../../src/services/projects/library/favorites";
import type { ProjectLibraryPage } from "../../../../src/state/contracts";
import { projectSummary } from "../../../support/projects";
import { setup } from "../../../support/ui";

test("every template description and content label exists in all twelve languages without fallback", () => {
  const flatten = (value: object, prefix = ""): string[] =>
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string" ? [`${prefix}${key}`] : flatten(entry, `${prefix}${key}.`),
    );
  const keys = flatten(messages.en);
  expect(Object.keys(messages)).toHaveLength(12);
  for (const [language, resource] of Object.entries(messages)) {
    expect(flatten(resource).sort(), language).toEqual([...keys].sort());
    for (const key of keys)
      expect(i18n.getResource(language, "libraryContents", key), `${language}:${key}`).toEqual(
        expect.stringMatching(/\S/),
      );
    for (const template of TEMPLATE_CATALOG)
      expect(
        i18n.getResource(language, "libraryContents", template.descriptionKey.split(":")[1]!),
        `${language}:${template.id}`,
      ).toEqual(expect.stringMatching(/\S/));
  }
});

test("renders a compact inventory and exposes the remaining localized tags", () => {
  setup().mount(<ContentTags tags={["effect:blur", "layer:image", "feature:motion"]} limit={2} />);
  expect(screen.getByRole("list", { name: "Ce qui est utilisé" })).toHaveTextContent("Flou");
  expect(screen.getByText("+1")).toHaveAttribute("title", "Motion");
  expect(screen.getByText("Images")).toHaveAttribute("data-content-tag", "layer:image");
});

test("old favorites fetch one summary, discard obsolete results and report real failures", async () => {
  const d = setup();
  const resolve: ((value: ProjectLibraryPage) => void)[] = [];
  vi.mocked(d.services.listProjectPage).mockImplementation(
    () => new Promise((done) => resolve.push(done)),
  );
  const first: LibraryItem = { kind: "project", id: "first", name: "First", mode: "static" };
  const second = { ...first, id: "second" };
  const view = renderHook(({ item }) => useItemTags(item, d.services), {
    initialProps: { item: first },
  });
  expect(d.services.listProjectPage).toHaveBeenCalledWith({ ids: ["first"], limit: 1 });
  view.rerender({ item: second });
  await act(async () =>
    resolve[0]!({
      projects: [{ ...projectSummary(), id: "first", tags: ["layer:text"] }],
      before: null,
    }),
  );
  expect(view.result.current.tags).toBeUndefined();
  await act(async () =>
    resolve[1]!({
      projects: [{ ...projectSummary(), id: "second", tags: ["effect:blur"] }],
      before: null,
    }),
  );
  expect(view.result.current.tags).toEqual(["effect:blur"]);
  const error = Error("storage unavailable"),
    log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(d.services.listProjectPage).mockRejectedValue(error);
  view.rerender({ item: { ...first, id: "third" } });
  await waitFor(() => expect(view.result.current.failed).toBe(true));
  expect(log).toHaveBeenCalledWith("[Melt project contents failed]", { projectId: "third", error });
  view.rerender({ item: { ...second, tags: ["layer:image"] } });
  expect(view.result.current).toEqual({ tags: ["layer:image"], failed: false });
  expect(d.services.listProjectPage).toHaveBeenCalledTimes(3);
  view.unmount();
});
