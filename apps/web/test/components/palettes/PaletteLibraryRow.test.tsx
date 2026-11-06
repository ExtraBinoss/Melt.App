import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { PaletteRecord } from "../../../src/services/palettes/library";
import { PaletteLibraryRow } from "../../../src/components/palettes/PaletteLibraryRow";
import "../../../src/components/palettes/messages";

const palette: PaletteRecord = {
  id: "brand",
  name: "Brand",
  revision: "revision-1",
  colors: [{ id: "ink", name: "Ink", value: "#264653" }],
};
function observeVisibility() {
  const observers: { show: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn(function (callback: IntersectionObserverCallback) {
      const observer = { observe: vi.fn(), disconnect: vi.fn() };
      observers.push({
        show: () =>
          callback(
            [{ isIntersecting: true }] as IntersectionObserverEntry[],
            observer as unknown as IntersectionObserver,
          ),
        disconnect: observer.disconnect,
      });
      return observer;
    }),
  );
  return observers;
}
afterEach(() => vi.unstubAllGlobals());

test("reads only intersecting rows and keeps swatch identity and row selection", async () => {
  const observers = observeVisibility();
  const readPalette = vi.fn(async () => palette),
    onUse = vi.fn(),
    onActivate = vi.fn();
  render(
    <div className="palette-library-list">
      <PaletteLibraryRow
        summary={palette}
        selected={false}
        busy={false}
        canLink
        readPalette={readPalette}
        onUse={onUse}
        onActivate={onActivate}
        onEdit={vi.fn()}
      />
    </div>,
  );
  expect(readPalette).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Brand", exact: true })).toBeDisabled();
  await act(async () => observers[0]!.show());
  expect(readPalette).toHaveBeenCalledExactlyOnceWith("brand");
  fireEvent.click(screen.getByRole("button", { name: "Ink #264653", exact: true }));
  expect(onUse).toHaveBeenCalledWith(palette.colors[0], false);
  fireEvent.click(screen.getByRole("button", { name: "Brand", exact: true }));
  expect(onActivate).toHaveBeenCalledWith(palette);
  expect(observers[0]!.disconnect).toHaveBeenCalled();
});

test("discards old revision and unmounted reads without showing stale swatches", async () => {
  const observers = observeVisibility();
  let finishOld!: (record: PaletteRecord) => void;
  let finishCurrent!: (record: PaletteRecord) => void;
  const readPalette = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<PaletteRecord>((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<PaletteRecord>((resolve) => {
          finishCurrent = resolve;
        }),
    );
  const props = {
    summary: palette,
    selected: false,
    busy: false,
    canLink: true,
    readPalette,
    onUse: vi.fn(),
    onActivate: vi.fn(),
    onEdit: vi.fn(),
  };
  const view = render(<PaletteLibraryRow {...props} />);
  await act(async () => observers[0]!.show());
  view.rerender(<PaletteLibraryRow {...props} summary={{ ...palette, revision: "revision-2" }} />);
  await act(async () => finishOld(palette));
  expect(screen.queryByRole("button", { name: "Ink #264653", exact: true })).toBeNull();
  await act(async () => observers[1]!.show());
  view.unmount();
  await act(async () => finishCurrent({ ...palette, revision: "revision-2" }));
  expect(observers[1]!.disconnect).toHaveBeenCalled();
});

test("reports missing and concurrently changed payloads", async () => {
  const observers = observeVisibility();
  const props = {
    summary: palette,
    selected: false,
    busy: false,
    canLink: false,
    readPalette: vi.fn(async () => ({ ...palette, revision: "newer" })),
    onUse: vi.fn(),
    onActivate: vi.fn(),
    onEdit: vi.fn(),
  };
  const view = render(<PaletteLibraryRow {...props} />);
  await act(async () => observers[0]!.show());
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Ink #264653", exact: true })).toBeNull();
  view.rerender(
    <PaletteLibraryRow
      {...props}
      summary={{ ...palette, revision: "missing" }}
      readPalette={vi.fn(async () => {
        throw Error("Palette no longer exists.");
      })}
    />,
  );
  await act(async () => observers[1]!.show());
  expect(screen.getByRole("alert")).toHaveTextContent("Palette no longer exists.");
});
