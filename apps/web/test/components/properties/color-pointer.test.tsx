import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Profiler } from "react";
import { ColorControl } from "../../../src/components/properties/ColorControl";
import { setup } from "../../support/ui";

test("native pointer color sampling does not start a second compatibility mouse drag", () => {
  const preview = vi.fn(),
    commit = vi.fn();
  const renders = vi.fn();
  setup().mount(
    <Profiler id="color" onRender={renders}>
      <ColorControl value="#ff0000" onPreview={preview} onCommit={commit} onCancel={vi.fn()} />
    </Profiler>,
  );
  const slider = screen.getByRole("slider", {
    name: "Saturation et luminosité",
  });
  const saturation = slider.parentElement!;
  const geometry = vi.spyOn(saturation, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 200,
    height: 100,
    right: 200,
    bottom: 100,
    toJSON: () => ({}),
  });
  const widgetGeometry = vi
    .spyOn(slider, "getBoundingClientRect")
    .mockReturnValue(saturation.getBoundingClientRect());
  geometry.mockClear();
  renders.mockClear();
  fireEvent.pointerDown(slider, {
    button: 0,
    buttons: 1,
    clientX: 50,
    clientY: 25,
  });
  fireEvent.mouseDown(slider, {
    button: 0,
    buttons: 1,
    clientX: 50,
    clientY: 25,
  });
  fireEvent.pointerMove(window, { buttons: 1, clientX: 150, clientY: 50 });
  fireEvent.mouseMove(window, { buttons: 1, clientX: 150, clientY: 50 });
  expect(slider).toHaveFocus();
  expect(geometry).toHaveBeenCalledOnce();
  expect(widgetGeometry).not.toHaveBeenCalled();
  expect(renders).not.toHaveBeenCalled();
  expect(slider).toHaveAttribute("aria-valuetext", "Saturation et luminosité: 75% / 50%");
  expect(
    saturation.querySelector<HTMLElement>(".react-colorful__saturation-pointer")?.style.left,
  ).toBe("75%");
  expect(preview).toHaveBeenLastCalledWith("#802020");
  expect(commit).not.toHaveBeenCalled();
  fireEvent.pointerUp(window, { button: 0, clientX: 150, clientY: 50 });
  fireEvent.mouseUp(window, { button: 0, clientX: 150, clientY: 50 });
  expect(commit).toHaveBeenCalledExactlyOnceWith("#802020");
});

test("touch compatibility events leave pointer preview and cancellation under one owner", () => {
  const preview = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn();
  setup().mount(
    <ColorControl value="#ff0000" onPreview={preview} onCommit={commit} onCancel={cancel} />,
  );
  const slider = screen.getByRole("slider", {
    name: "Saturation et luminosité",
  });
  vi.spyOn(slider.parentElement!, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 200,
    height: 100,
    right: 200,
    bottom: 100,
    toJSON: () => ({}),
  });
  const geometry = vi.spyOn(slider, "getBoundingClientRect");
  fireEvent.pointerDown(slider, {
    button: 0,
    buttons: 1,
    clientX: 50,
    clientY: 25,
  });
  fireEvent.touchStart(slider, {
    touches: [{ identifier: 1, pageX: 50, pageY: 25 }],
  });
  fireEvent.pointerMove(window, { buttons: 1, clientX: 150, clientY: 50 });
  fireEvent.touchMove(window, {
    touches: [{ identifier: 1, pageX: 150, pageY: 50 }],
  });
  expect(geometry).not.toHaveBeenCalled();
  expect(preview).toHaveBeenLastCalledWith("#802020");
  fireEvent.pointerCancel(window);
  fireEvent.touchEnd(window);
  expect(cancel).toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Couleur hexadécimale")).toHaveValue("#FF0000");
});

test("secondary mouse buttons cannot begin a saturation edit", () => {
  const preview = vi.fn(),
    commit = vi.fn();
  setup().mount(
    <ColorControl value="#ff0000" onPreview={preview} onCommit={commit} onCancel={vi.fn()} />,
  );
  const slider = screen.getByRole("slider", {
    name: "Saturation et luminosité",
  });
  fireEvent.pointerDown(slider, {
    button: 2,
    buttons: 2,
    clientX: 50,
    clientY: 25,
  });
  fireEvent.mouseDown(slider, {
    button: 2,
    buttons: 2,
    clientX: 50,
    clientY: 25,
  });
  fireEvent.pointerMove(window, { buttons: 2, clientX: 150, clientY: 50 });
  fireEvent.mouseMove(window, { buttons: 2, clientX: 150, clientY: 50 });
  fireEvent.pointerUp(window, { button: 2, clientX: 150, clientY: 50 });
  fireEvent.mouseUp(window, { button: 2, clientX: 150, clientY: 50 });
  expect(preview).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});
