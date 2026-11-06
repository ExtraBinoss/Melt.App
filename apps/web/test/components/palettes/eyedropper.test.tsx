import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PaletteEyedropper } from "../../../src/components/palettes/PaletteEyedropper";
import { setup } from "../../support/ui";

afterEach(() => vi.unstubAllGlobals());

it("uses native sampling and cancels stale swatches or dismissed editors without applying late colors", async () => {
  vi.stubGlobal("isSecureContext", true);
  const requests: { signal: AbortSignal; resolve: (result: { sRGBHex: string }) => void }[] = [];
  vi.stubGlobal(
    "EyeDropper",
    class {
      open({ signal }: { signal: AbortSignal }) {
        return new Promise<{ sRGBHex: string }>((resolve) => requests.push({ signal, resolve }));
      }
    },
  );
  const d = setup(),
    picked = vi.fn();
  const view = d.mount(<PaletteEyedropper identity="first" disabled={false} onPick={picked} />);
  const sample = () => screen.getByRole("button", { name: "Prélever une couleur à l’écran" });
  fireEvent.click(sample());
  await act(async () => requests[0]!.resolve({ sRGBHex: "#123456" }));
  expect(picked).toHaveBeenCalledExactlyOnceWith("#123456");
  picked.mockClear();
  fireEvent.click(sample());
  view.rerender(<PaletteEyedropper identity="second" disabled={false} onPick={picked} />);
  expect(requests[1]!.signal.aborted).toBe(true);
  await act(async () => requests[1]!.resolve({ sRGBHex: "#654321" }));
  expect(picked).not.toHaveBeenCalled();
  expect(sample()).toBeEnabled();
  fireEvent.click(sample());
  view.unmount();
  expect(requests[2]!.signal.aborted).toBe(true);
  await act(async () => requests[2]!.resolve({ sRGBHex: "#abcdef" }));
  expect(picked).not.toHaveBeenCalled();
});
it("omits the pipette when native sampling is unavailable", () => {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("EyeDropper", undefined);
  setup().mount(<PaletteEyedropper identity="none" disabled={false} onPick={vi.fn()} />);
  expect(screen.queryByRole("button")).toBeNull();
});
