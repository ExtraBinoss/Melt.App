import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { atom } from "jotai";
import { expect, test, vi } from "vitest";
import { setup } from "../../../support/ui";
import { FavoritesOutletContext } from "../../../../src/components/projects/items/favorites-context";
import {
  ItemDialog,
  type LibrarySelection,
} from "../../../../src/components/projects/items/ItemDialog";
import "../../../../src/components/projects/items/messages";
const mocks = vi.hoisted(() => ({
  preload: vi.fn(async () => {}),
  release: vi.fn(),
  start: vi.fn(),
}));
vi.mock("../../../../src/bootstrap/preload", () => ({ preloadEditor: mocks.preload }));
vi.mock("../../../../src/components/projects/templates/motion-preview/deferred-preview", () => ({
  startDeferredPreview: () => {
    mocks.start();
    return {
      release: async () => {
        mocks.release();
      },
    };
  },
}));

test("opening a library item releases autoplay immediately and prepares code on intent", async () => {
  const d = setup(),
    open = vi.fn();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const selection = atom<LibrarySelection | null>({
    item: { kind: "template", id: "bloom-windows", name: "Bloom Windows", mode: "motion" },
    open,
    returnFocus: null,
  });
  // The observer reports the dialog preview visible while its Radix exit remains mounted.
  const observer = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    observe(target: Element) {
      this.callback(
        [{ target, isIntersecting: true, intersectionRatio: 1 }] as IntersectionObserverEntry[],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    constructor(private callback: IntersectionObserverCallback) {}
  } as unknown as typeof IntersectionObserver;
  try {
    d.mount(
      <FavoritesOutletContext
        value={{ items: [], saving: false, error: false, refresh: vi.fn(), toggle: vi.fn() }}
      >
        <ItemDialog selection={selection} services={d.services} busy={false} />
      </FavoritesOutletContext>,
    );
    const button = await screen.findByRole("button", { name: "Ouvrir dans Melt" });
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(/Une fleur/);
    expect(screen.queryByText(/Double.cliquez/)).toBeNull();
    expect(
      screen.getByRole("dialog").querySelector('[data-content-tag="effect:ascii"]'),
    ).not.toBeNull();
    fireEvent.pointerEnter(button);
    expect(mocks.preload).toHaveBeenCalled();
    await waitFor(() => expect(mocks.start).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(button);
    });
    expect(open).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalled();
  } finally {
    globalThis.IntersectionObserver = observer;
  }
});

test("saved projects share detected tags in their detail dialog without rereading originals", async () => {
  const d = setup();
  const selection = atom<LibrarySelection | null>({
    item: {
      kind: "project",
      id: "saved",
      name: "My art",
      mode: "static",
      tags: ["effect:blur", "layer:image"],
    },
    open: vi.fn(),
    returnFocus: null,
  });
  d.mount(
    <FavoritesOutletContext
      value={{ items: [], saving: false, error: false, refresh: vi.fn(), toggle: vi.fn() }}
    >
      <ItemDialog selection={selection} services={d.services} busy={false} />
    </FavoritesOutletContext>,
  );
  const dialog = await screen.findByRole("dialog", { name: "My art" });
  expect(dialog).toHaveAccessibleDescription("Votre projet enregistré, prêt à être retravaillé.");
  expect(dialog.querySelector('[data-content-tag="effect:blur"]')).toHaveTextContent("Flou");
  expect(dialog.querySelector('[data-content-tag="layer:image"]')).toHaveTextContent("Images");
  expect(d.services.listProjectPage).not.toHaveBeenCalled();
  expect(d.services.openProject).not.toHaveBeenCalled();
});
