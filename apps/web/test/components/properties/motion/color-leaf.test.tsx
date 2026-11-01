import { Suspense, startTransition, useState, type ComponentProps } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { createEffect } from "@musart/core";
import type { ColorPalette } from "../../../../src/components/properties/color/ColorPalette";
import { ColorControl } from "../../../../src/components/properties/ColorControl";
import { MotionColorControl } from "../../../../src/components/properties/motion/MotionColorControl";
import { Inspector } from "../../../../src/components/properties/Inspector";
import { previewAtom, useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";

const observed = vi.hoisted(() => ({ palette: vi.fn() }));
vi.mock("../../../../src/components/properties/color/ColorPalette", async (original) => {
  const actual = await original<{ ColorPalette: typeof ColorPalette }>();
  return {
    ...actual,
    ColorPalette: (props: ComponentProps<typeof ColorPalette>) => {
      observed.palette(props.value);
      return <actual.ColorPalette {...props} />;
    },
  };
});
afterEach(() => vi.unstubAllGlobals());

function mount() {
  const data = setup(),
    preview = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn();
  function Live() {
    const snapshot = useEngine(data.engine),
      layer = snapshot.project.pages[0]!.layers[0]!;
    return (
      <MotionColorControl
        engine={data.engine}
        target={{ kind: "layer", layerId: layer.id, property: "fill" }}
        identity={layer.id}
        label="Fill"
        value={layer.fill}
        onPreview={(value) => preview(value, layer.x)}
        onCommit={(value) => {
          commit(value, layer.x);
          if (data.engine.getSnapshot().project !== snapshot.project) return;
          data.engine.execute({ type: "updateLayers", ids: [layer.id], patch: { fill: value } });
        }}
        onCancel={() => cancel(layer.x)}
      />
    );
  }
  const view = data.mount(<Live />);
  return { ...data, view, preview, commit, cancel };
}

test("transform/effect history preserves the real palette without renders and publishes fresh commit guards", () => {
  const d = mount(),
    field = screen.getByLabelText("Couleur hexadécimale");
  observed.palette.mockClear();
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 40 } }));
  act(() =>
    d.engine.execute({
      type: "updateLayers",
      ids: [d.rectangle.id],
      patch: { effects: [createEffect("contrast")] },
    }),
  );
  act(() => d.engine.undo());
  act(() => d.engine.redo());
  expect(observed.palette).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Couleur hexadécimale")).toBe(field);
  fireEvent.change(field, { target: { value: "#aabbcc" } });
  expect(d.preview).toHaveBeenLastCalledWith("#aabbcc", 40);
  fireEvent.blur(field);
  expect(d.commit).toHaveBeenCalledExactlyOnceWith("#aabbcc", 40);
  expect(field).toHaveValue("#AABBCC");
  expect(observed.palette).toHaveBeenLastCalledWith("#aabbcc");
  act(() => d.engine.undo());
  expect(field).toHaveValue("#3366FF");
  expect(observed.palette).toHaveBeenLastCalledWith("#3366ff");
  act(() => d.engine.redo());
  expect(field).toHaveValue("#AABBCC");
  expect(observed.palette).toHaveBeenLastCalledWith("#aabbcc");
  expect(observed.palette).toHaveBeenCalled();
});

test("native same-prop sampling stays visible until adoption and retires on canonical or owner change", async () => {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "EyeDropper",
    class {
      open = vi.fn().mockResolvedValue({ sRGBHex: "#ff6600" });
    },
  );
  const commit = vi.fn(),
    preview = vi.fn(),
    cancel = vi.fn();
  const control = (value: string, identity = "owner:a") => (
    <ColorControl
      value={value}
      identity={identity}
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />
  );
  const view = setup().mount(control("#3366ff80"));
  const sample = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Prélever une couleur à l’écran" }));
    await waitFor(() => expect(observed.palette).toHaveBeenLastCalledWith("#ff660080"));
  };
  await sample();
  expect(commit).toHaveBeenLastCalledWith("#ff660080");
  view.rerender(control("#3366ff80"));
  expect(observed.palette).toHaveBeenLastCalledWith("#ff660080");
  view.rerender(control("#ff660080"));
  view.rerender(control("#3366ff80"));
  expect(observed.palette).toHaveBeenLastCalledWith("#3366ff80");
  await sample();
  view.rerender(control("#3366ff80", "owner:b"));
  expect(observed.palette).toHaveBeenLastCalledWith("#3366ff80");
  expect(screen.getByLabelText("Couleur hexadécimale")).toHaveValue("#3366FF80");
});

test("same-color unrelated edits invalidate a dirty draft before latest callbacks can adopt it", () => {
  const d = mount(),
    field = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(field, { target: { value: "#123456" } });
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 80 } }));
  expect(field).toHaveValue("#3366FF");
  expect(d.cancel).toHaveBeenCalled();
  fireEvent.blur(field);
  expect(d.commit).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe("#3366ff");
});

test("a real Inspector preserves ordinary ruler metadata during a color draft but ruler history cancels", () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  function Live() {
    const snapshot = useEngine(d.engine),
      page = snapshot.project.pages[0]!;
    return (
      <Inspector
        engine={d.engine}
        page={page}
        assets={snapshot.project.assets}
        selected={page.layers.filter((layer) => snapshot.selection.includes(layer.id))}
        run={d.run}
      />
    );
  }
  d.mount(<Live />);
  const field = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(field, { target: { value: "#123456" } });
  observed.palette.mockClear();
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  expect(d.store.get(previewAtom)).toMatchObject({ patch: { fill: "#123456" } });
  expect(observed.palette).not.toHaveBeenCalled();
  expect(field).toHaveValue("#123456");
  fireEvent.blur(field);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe("#123456");
  expect(d.run).toHaveBeenCalledTimes(1);
  fireEvent.change(field, { target: { value: "#abcdef" } });
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: false } }));
  expect(field).toHaveValue("#ABCDEF");
  act(() => d.engine.undo());
  expect(field).toHaveValue("#123456");
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.blur(field);
  expect(d.run).toHaveBeenCalledTimes(1);
});

test("same-ID load cancels drafts, aborts sampling and rejects a late native result", async () => {
  let resolve!: (value: { sRGBHex: string }) => void, signal!: AbortSignal;
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
  const d = mount(),
    field = screen.getByLabelText("Couleur hexadécimale");
  const original = structuredClone(d.engine.getSnapshot().project);
  fireEvent.change(field, { target: { value: "#123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Prélever une couleur à l’écran" }));
  act(() => d.engine.load(original));
  expect(signal.aborted).toBe(true);
  expect(field.isConnected).toBe(false);
  expect(screen.getByLabelText("Couleur hexadécimale")).toHaveValue("#3366FF");
  fireEvent.blur(field);
  await act(async () => {
    resolve({ sRGBHex: "#ff0000" });
  });
  expect(d.commit).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().project).toEqual(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(screen.getByRole("button", { name: "Prélever une couleur à l’écran" })).toBeEnabled();
});

test("an abandoned concurrent render cannot publish callback adapters", async () => {
  const d = setup(),
    preview = vi.fn();
  let update!: () => void,
    resolve!: () => void,
    blocked = true;
  const ready = new Promise<void>((done) => {
    resolve = done;
  });
  function Wait({ version }: { version: number }) {
    if (version && blocked) throw ready;
    return null;
  }
  function Live() {
    const [version, setVersion] = useState(0);
    update = () => startTransition(() => setVersion(1));
    return (
      <Suspense fallback="Loading">
        <MotionColorControl
          value="#3366ff"
          label="Fill"
          onPreview={(value) => preview(value, version)}
          onCommit={vi.fn()}
          onCancel={vi.fn()}
        />
        <Wait version={version} />
      </Suspense>
    );
  }
  d.mount(<Live />);
  const field = screen.getByLabelText("Couleur hexadécimale");
  act(() => update());
  fireEvent.change(field, { target: { value: "#123456" } });
  expect(preview).toHaveBeenLastCalledWith("#123456", 0);
  await act(async () => {
    blocked = false;
    resolve();
    await ready;
  });
  fireEvent.change(field, { target: { value: "#abcdef" } });
  expect(preview).toHaveBeenLastCalledWith("#abcdef", 1);
});
