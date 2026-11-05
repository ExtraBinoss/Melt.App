import { useEffect } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { StudioPropertyPopover } from "../../../src/ui/studio/controls/StudioPropertyPopover";
import {
  useAnimationDetails,
  animationPresentation,
} from "../../../src/components/motion/animations/presentation";
import { setup } from "../../support/ui";

test("property controls retain their DOM, suspend effects when closed and restore keyboard focus", async () => {
  const d = setup(),
    mounted = vi.fn(),
    stopped = vi.fn();
  function Content() {
    useEffect(() => {
      mounted();
      return stopped;
    }, []);
    return <input aria-label="retained field" defaultValue="initial" />;
  }
  const view = d.mount(
    <StudioPropertyPopover trigger={<button>Properties</button>}>
      <Content />
    </StudioPropertyPopover>,
  );
  const trigger = screen.getByRole("button", { name: "Properties" });
  fireEvent.click(trigger);
  const input = await screen.findByRole("textbox", { name: "retained field" });
  fireEvent.change(input, { target: { value: "kept" } });
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  expect(stopped).toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  expect(await screen.findByRole("textbox", { name: "retained field" })).toBe(input);
  expect(input).toHaveValue("kept");
  expect(mounted.mock.calls.length).toBeGreaterThan(1);
  view.unmount();
});

test("derived Jotai view atoms isolate animation selection and engine owners", () => {
  const a = setup(),
    b = setup(),
    renders = vi.fn();
  function Details() {
    renders();
    return <output>{String(useAnimationDetails(a.engine))}</output>;
  }
  const view = a.mount(<Details />);
  const before = renders.mock.calls.length;
  act(() => animationPresentation(a.engine).set({ selected: "temporary" }));
  act(() => animationPresentation(b.engine).set({ details: true }));
  expect(renders).toHaveBeenCalledTimes(before);
  act(() => animationPresentation(a.engine).set({ details: true }));
  expect(screen.getByText("true")).toBeInTheDocument();
  view.unmount();
});
