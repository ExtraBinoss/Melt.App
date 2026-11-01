import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MoveHorizontal } from "lucide-react";
import { MotionNumberInput } from "../../../../src/components/properties/motion/MotionNumberInput";
import { useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";
import { MobileControlsContext } from "../../../../src/components/workspace/mobile/use-mobile";

const renders = vi.hoisted(() => ({ number: vi.fn() }));
vi.mock("../../../../src/components/shared/NumberInput", async (original) => {
  const module = await original<typeof import("../../../../src/components/shared/NumberInput")>();
  return {
    NumberInput: (props: Parameters<typeof module.NumberInput>[0]) => {
      renders.number();
      return <module.NumberInput {...props} />;
    },
  };
});

function fixture() {
  const d = setup(),
    cancel = vi.fn(),
    preview = vi.fn(),
    commit = vi.fn();
  function Host() {
    const snapshot = useEngine(d.engine);
    const id = snapshot.selection[0] ?? d.rectangle.id;
    const layer = snapshot.project.pages[0]!.layers.find((item) => item.id === id)!;
    return (
      <MotionNumberInput
        engine={d.engine}
        target={{ kind: "layer", layerId: id, property: "x" }}
        identity={layer}
        label="X"
        scrubLabel={
          <span>
            <MoveHorizontal size={13} />
            <span>X</span>
          </span>
        }
        value={layer.x}
        resetValue={() => layer.width / 10}
        onPreview={preview}
        onCancel={cancel}
        onCommit={(x) => {
          commit(x);
          if (d.engine.getSnapshot() === snapshot)
            d.engine.execute({ type: "updateLayers", ids: [id], patch: { x } });
        }}
      />
    );
  }
  renders.number.mockClear();
  const view = d.mount(<Host />);
  return { ...d, cancel, preview, commit, view };
}

test("canonical history retains the numeric leaf and focus while latest callbacks commit and reset once", () => {
  const d = fixture();
  const input = screen.getByRole("textbox", { name: "X" });
  input.focus();
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.text.id], patch: { x: 123 } }));
  act(() => d.engine.undo());
  act(() => d.engine.redo());
  expect(renders.number).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(input);
  expect(screen.getByRole("textbox", { name: "X" })).toBe(input);
  fireEvent.change(input, { target: { value: "50" } });
  fireEvent.blur(input);
  expect(d.commit).toHaveBeenCalledExactlyOnceWith(50);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(50);
  expect(renders.number).toHaveBeenCalledTimes(1);
  act(() => d.engine.undo());
  expect(input).toHaveValue("20");
  expect(d.engine.getSnapshot().project.pages[0]!.layers[1]!.x).toBe(123);
  act(() => d.engine.redo());
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { width: 800 } }),
  );
  fireEvent.doubleClick(screen.getByRole("button", { name: "Ajuster X" }));
  expect(d.commit).toHaveBeenLastCalledWith(80);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(80);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(50);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.width).toBe(800);
});

test("ordinary ruler metadata preserves a draft, while ruler undo/redo cancels same-value drafts", () => {
  const d = fixture();
  const input = screen.getByRole("textbox", { name: "X" });
  fireEvent.change(input, { target: { value: "123" } });
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  expect(input).toHaveValue("123");
  expect(d.cancel).not.toHaveBeenCalled();
  expect(renders.number).toHaveBeenCalledTimes(1);
  fireEvent.blur(input);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(123);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.rulers).toBe(true);
  expect(input).toHaveValue("20");
  fireEvent.change(input, { target: { value: "99" } });
  act(() => d.engine.undo());
  expect(input).toHaveValue("20");
  const calls = d.commit.mock.calls.length;
  fireEvent.blur(input);
  expect(d.commit).toHaveBeenCalledTimes(calls);
  fireEvent.change(input, { target: { value: "88" } });
  act(() => d.engine.redo());
  expect(input).toHaveValue("20");
  fireEvent.blur(input);
  expect(d.commit).toHaveBeenCalledTimes(calls);
});

function start(kind: string) {
  const input = screen.getByRole("textbox", { name: "X" });
  const handle = screen.getByRole("button", { name: "Ajuster X" });
  if (kind === "typing") fireEvent.change(input, { target: { value: "99" } });
  else if (kind === "pointer") {
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 20, pointerId: 1 });
  } else fireEvent.keyDown(input, { key: "ArrowUp" });
  return () => {
    if (kind === "typing") fireEvent.blur(input);
    else if (kind === "pointer") {
      fireEvent.pointerMove(handle, { clientX: 50, pointerId: 1 });
      fireEvent.pointerUp(handle, { pointerId: 1 });
    } else {
      fireEvent.keyDown(input, { key: "ArrowUp", repeat: true });
      fireEvent.keyUp(input, { key: "ArrowUp" });
    }
  };
}

test.each(["typing", "pointer", "key"])(
  "an unrelated canonical commit cancels unchanged-value %s without a late release commit",
  (kind) => {
    const d = fixture();
    const finish = start(kind);
    expect(d.preview).toHaveBeenCalled();
    act(() => d.engine.execute({ type: "updateLayers", ids: [d.text.id], patch: { x: 123 } }));
    expect(screen.getByRole("textbox", { name: "X" })).toHaveValue("20");
    expect(d.cancel).toHaveBeenCalled();
    const before = d.engine.getSnapshot(),
      previews = d.preview.mock.calls.length;
    finish();
    expect(d.commit).not.toHaveBeenCalled();
    expect(d.preview).toHaveBeenCalledTimes(previews);
    expect(d.engine.getSnapshot()).toBe(before);
  },
);

test.each([
  ["typing", "selection"],
  ["pointer", "load"],
  ["key", "address"],
])("%s cannot finish after %s owner replacement", (kind, action) => {
  const d = fixture();
  const finish = start(kind);
  act(() => {
    if (action === "load") d.engine.load(d.engine.getSnapshot().project);
    else d.engine.select(action === "selection" ? [d.rectangle.id] : [d.text.id]);
  });
  const before = d.engine.getSnapshot();
  finish();
  expect(d.commit).not.toHaveBeenCalled();
  expect(d.cancel).toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(before);
  expect(screen.getByRole("textbox", { name: "X" })).toHaveValue(
    action === "address" ? "30" : "20",
  );
});

test("unresolved fallback, external identity, callbacks and UI constraints update without stale suppression", () => {
  const d = setup(),
    old = vi.fn(),
    current = vi.fn(),
    cancel = vi.fn();
  const target = { kind: "layer" as const, layerId: "missing", property: "x" as const };
  const props = {
    engine: d.engine,
    target,
    label: "Fallback",
    identity: "a",
    value: 7,
    onCommit: old,
    onCancel: cancel,
  };
  renders.number.mockClear();
  const view = d.mount(<MotionNumberInput {...props} />);
  const input = screen.getByRole("textbox", { name: "Fallback" });
  view.rerender(<MotionNumberInput {...props} value={9} onCommit={current} />);
  expect(input).toHaveValue("9");
  expect(renders.number).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "99" } });
  view.rerender(<MotionNumberInput {...props} identity="b" value={9} onCommit={current} />);
  fireEvent.blur(input);
  expect(current).not.toHaveBeenCalled();
  expect(old).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
  expect(input).toHaveValue("9");
  view.rerender(
    <MotionNumberInput
      {...props}
      identity="b"
      value={9}
      onCommit={current}
      min={0}
      max={10}
      unit="px"
    />,
  );
  fireEvent.change(input, { target: { value: "100" } });
  fireEvent.blur(input);
  expect(current).toHaveBeenLastCalledWith(10);
  expect(screen.getByText("px")).toBeVisible();
  view.rerender(
    <MotionNumberInput {...props} identity="b" value={9} onCommit={current} disabled />,
  );
  expect(input).toBeDisabled();
});

test("mixed values and display scales remain coherent, while fresh refs do not qualify as pure labels", () => {
  const d = setup(),
    refA = vi.fn(),
    refB = vi.fn();
  const target = { kind: "layer" as const, layerId: d.rectangle.id, property: "x" as const };
  const props = { engine: d.engine, target, label: "Mixed", value: 20, onCommit: vi.fn() };
  const view = d.mount(
    <MotionNumberInput {...props} targets={[target, { ...target, layerId: d.text.id }]} />,
  );
  const input = screen.getByRole("textbox", { name: "Mixed" });
  expect(input).toHaveValue("");
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.text.id], patch: { x: 20 } }));
  expect(input).toHaveValue("20");
  fireEvent.blur(input);
  expect(props.onCommit).not.toHaveBeenCalled();
  view.rerender(
    <MotionNumberInput {...props} displayScale={100} scrubLabel={<span ref={refA}>Label</span>} />,
  );
  expect(input).toHaveValue("2000");
  expect(refA).toHaveBeenCalled();
  view.rerender(
    <MotionNumberInput {...props} displayScale={100} scrubLabel={<span ref={refB}>Label</span>} />,
  );
  expect(refB).toHaveBeenCalled();
  view.unmount();
  const rendered = renders.number.mock.calls.length;
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 25 } }));
  expect(renders.number).toHaveBeenCalledTimes(rendered);
});

test("mobile dynamic slider bounds follow canonical values and exact history while retaining focus", () => {
  const d = setup();
  const target = { kind: "layer" as const, layerId: d.rectangle.id, property: "x" as const };
  d.mount(
    <MobileControlsContext value>
      <MotionNumberInput
        engine={d.engine}
        target={target}
        label="X"
        value={20}
        onCommit={vi.fn()}
      />
    </MobileControlsContext>,
  );
  const slider = screen.getByRole("slider", { name: "Régler X" });
  slider.focus();
  expect(slider).toHaveAttribute("aria-valuemax", "1020");
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 2000 } }));
  expect(slider).toHaveAttribute("aria-valuemax", "3000");
  expect(screen.getByRole("textbox", { name: "X" })).toHaveValue("2000");
  expect(screen.getByRole("slider", { name: "Régler X" })).toBe(slider);
  expect(document.activeElement).toBe(slider);
  act(() => d.engine.undo());
  expect(slider).toHaveAttribute("aria-valuemax", "1020");
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(20);
  act(() => d.engine.redo());
  expect(slider).toHaveAttribute("aria-valuemax", "3000");
  expect(document.activeElement).toBe(slider);
  const before = renders.number.mock.calls.length;
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.text.id], patch: { x: 123 } }));
  expect(renders.number).toHaveBeenCalledTimes(before);
});

test("mobile unresolved fallback updates dynamic bounds on the same canonical snapshot", () => {
  const d = setup(),
    commit = vi.fn();
  const target = { kind: "layer" as const, layerId: "missing", property: "x" as const };
  const control = (value: number) => (
    <MobileControlsContext value>
      <MotionNumberInput
        engine={d.engine}
        target={target}
        label="X"
        value={value}
        onCommit={commit}
      />
    </MobileControlsContext>
  );
  const view = d.mount(control(20));
  const slider = screen.getByRole("slider", { name: "Régler X" });
  slider.focus();
  const before = d.engine.getSnapshot();
  view.rerender(control(2000));
  expect(d.engine.getSnapshot()).toBe(before);
  expect(screen.getByRole("textbox", { name: "X" })).toHaveValue("2000");
  expect(slider).toHaveAttribute("aria-valuemax", "3000");
  expect(document.activeElement).toBe(slider);
  expect(commit).not.toHaveBeenCalled();
});

test("switching desktop controls to mobile reads the latest imperatively painted scalar", () => {
  const d = setup(),
    commit = vi.fn();
  const target = { kind: "layer" as const, layerId: d.rectangle.id, property: "x" as const };
  const control = (mobile: boolean) => (
    <MobileControlsContext value={mobile}>
      <MotionNumberInput engine={d.engine} target={target} label="X" value={20} onCommit={commit} />
    </MobileControlsContext>
  );
  const view = d.mount(control(false));
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 2000 } }));
  expect(screen.getByRole("textbox", { name: "X" })).toHaveValue("2000");
  view.rerender(control(true));
  expect(screen.getByRole("slider", { name: "Régler X" })).toHaveAttribute("aria-valuemax", "3000");
  expect(screen.getByRole("textbox", { name: "X" })).toHaveValue("2000");
  expect(commit).not.toHaveBeenCalled();
});
