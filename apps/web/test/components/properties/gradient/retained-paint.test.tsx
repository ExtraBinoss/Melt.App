import { useLayoutEffect } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RetainedPaint } from "../../../../src/components/properties/gradient/retained-paint";
import { ColorControl } from "../../../../src/components/properties/ColorControl";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../src/components/ui/popover";
import { setup } from "../../../support/ui";

afterEach(() => vi.unstubAllGlobals());

test("only visited paint mounts; hiding preserves idle DOM/state while disconnecting effects", () => {
  let active = 0;
  const mounts = vi.fn();
  function Resource() {
    mounts();
    useLayoutEffect(() => {
      active++;
      return () => {
        active--;
      };
    }, []);
    return <input aria-label="Retained paint value" defaultValue="canonical" />;
  }
  const view = setup().mount(
    <RetainedPaint visible={false}>
      <Resource />
    </RetainedPaint>,
  );
  expect(mounts).not.toHaveBeenCalled();
  expect(active).toBe(0);
  view.rerender(
    <RetainedPaint visible>
      <Resource />
    </RetainedPaint>,
  );
  const input = screen.getByRole("textbox", { name: "Retained paint value" });
  fireEvent.change(input, { target: { value: "remembered" } });
  expect(active).toBe(1);
  view.rerender(
    <RetainedPaint visible={false}>
      <Resource />
    </RetainedPaint>,
  );
  expect(input.isConnected).toBe(true);
  expect(input).not.toBeVisible();
  expect(active).toBe(0);
  view.rerender(
    <RetainedPaint visible>
      <Resource />
    </RetainedPaint>,
  );
  expect(screen.getByRole("textbox", { name: "Retained paint value" })).toBe(input);
  expect(input).toHaveValue("remembered");
  expect(active).toBe(1);
  view.unmount();
  expect(active).toBe(0);
});

test("a focused color draft is cancelled and discarded instead of returning as hidden stale state", () => {
  const preview = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn();
  const control = (
    <ColorControl value="#3366ff" onPreview={preview} onCommit={commit} onCancel={cancel} />
  );
  const view = setup().mount(<RetainedPaint visible>{control}</RetainedPaint>);
  const input = screen.getByLabelText("Couleur hexadécimale");
  act(() => input.focus());
  fireEvent.change(input, { target: { value: "#abcdef" } });
  view.rerender(<RetainedPaint visible={false}>{control}</RetainedPaint>);
  expect(input.isConnected).toBe(false);
  expect(cancel).toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  view.rerender(<RetainedPaint visible>{control}</RetainedPaint>);
  expect(screen.getByLabelText("Couleur hexadécimale")).toHaveValue("#3366FF");
});

test("owner changes release the previous cache and never prepare an unvisited replacement", () => {
  const view = setup().mount(
    <RetainedPaint key="page:a" visible>
      <input aria-label="Owner" defaultValue="a" />
    </RetainedPaint>,
  );
  const first = screen.getByLabelText("Owner");
  view.rerender(
    <RetainedPaint key="page:a" visible={false}>
      <input aria-label="Owner" defaultValue="a" />
    </RetainedPaint>,
  );
  expect(first.isConnected).toBe(true);
  view.rerender(
    <RetainedPaint key="page:b" visible={false}>
      <input aria-label="Owner" defaultValue="b" />
    </RetainedPaint>,
  );
  expect(first.isConnected).toBe(false);
  expect(screen.queryByLabelText("Owner")).toBeNull();
  view.rerender(
    <RetainedPaint key="page:b" visible>
      <input aria-label="Owner" defaultValue="b" />
    </RetainedPaint>,
  );
  expect(screen.getByLabelText("Owner")).toHaveValue("b");
});

test("an open genuine portal is disposed on hide and does not reappear when the editor returns", () => {
  function Editor() {
    return (
      <Popover>
        <PopoverTrigger>Open paint</PopoverTrigger>
        <PopoverContent aria-label="Paint portal">Popup</PopoverContent>
      </Popover>
    );
  }
  const view = setup().mount(
    <RetainedPaint visible>
      <Editor />
    </RetainedPaint>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open paint" }));
  expect(screen.getByRole("dialog", { name: "Paint portal" })).toBeVisible();
  view.rerender(
    <RetainedPaint visible={false}>
      <Editor />
    </RetainedPaint>,
  );
  expect(screen.queryByRole("dialog", { name: "Paint portal" })).toBeNull();
  view.rerender(
    <RetainedPaint visible>
      <Editor />
    </RetainedPaint>,
  );
  expect(screen.queryByRole("dialog", { name: "Paint portal" })).toBeNull();
});

test("hiding aborts native sampling and a late result cannot commit or leave the restored control busy", async () => {
  let resolve!: (value: { sRGBHex: string }) => void;
  let signal!: AbortSignal;
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "EyeDropper",
    class {
      open(options: { signal: AbortSignal }) {
        signal = options.signal;
        return new Promise<{ sRGBHex: string }>((done) => {
          resolve = done;
        });
      }
    },
  );
  const commit = vi.fn();
  const control = (
    <ColorControl value="#3366ff" onPreview={vi.fn()} onCommit={commit} onCancel={vi.fn()} />
  );
  const view = setup().mount(<RetainedPaint visible>{control}</RetainedPaint>);
  const input = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.click(screen.getByRole("button", { name: "Prélever une couleur à l’écran" }));
  view.rerender(<RetainedPaint visible={false}>{control}</RetainedPaint>);
  expect(signal.aborted).toBe(true);
  expect(input.isConnected).toBe(false);
  await act(async () => {
    resolve({ sRGBHex: "#ff0000" });
  });
  expect(commit).not.toHaveBeenCalled();
  view.rerender(<RetainedPaint visible>{control}</RetainedPaint>);
  expect(screen.getByLabelText("Couleur hexadécimale")).toHaveValue("#3366FF");
  expect(screen.getByRole("button", { name: "Prélever une couleur à l’écran" })).toBeEnabled();
});
