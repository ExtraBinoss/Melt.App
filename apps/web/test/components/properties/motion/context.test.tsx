import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { memo, Suspense, useLayoutEffect } from "react";
import {
  MotionFieldProvider,
  useMotionFieldEditor,
  type MotionFieldEditor,
} from "../../../../src/components/properties/motion/context";
import { setup } from "../../../support/ui";

test("isolated controls are unbound and retained consumers capture the latest committed editor", () => {
  const d = setup(),
    begin = vi.fn(),
    next = vi.fn(),
    start = vi.fn(),
    renders = vi.fn();
  const Probe = memo(function Probe() {
    renders();
    const editor = useMotionFieldEditor();
    return <button onClick={() => editor?.start?.()}>{editor ? "bound" : "unbound"}</button>;
  });
  const view = d.mount(<Probe />);
  expect(screen.getByText("unbound")).toBeVisible();
  const control = (editor: MotionFieldEditor) => (
    <MotionFieldProvider editor={editor}>
      <Probe />
    </MotionFieldProvider>
  );
  view.rerender(control({ begin }));
  fireEvent.click(screen.getByText("bound"));
  expect(begin).toHaveBeenCalledOnce();
  const before = renders.mock.calls.length;
  view.rerender(control({ begin: next, start }));
  fireEvent.click(screen.getByText("bound"));
  expect(start).toHaveBeenCalledOnce();
  expect(next).not.toHaveBeenCalled();
  expect(renders).toHaveBeenCalledTimes(before);
  view.rerender(control({ begin: next }));
  fireEvent.click(screen.getByText("bound"));
  expect(next).toHaveBeenCalledOnce();
  expect(renders).toHaveBeenCalledTimes(before);
});

test("a suspended owner cannot replace the committed capture port", () => {
  const d = setup(),
    begin = vi.fn(),
    abandoned = vi.fn();
  let retained: MotionFieldEditor | null = null;
  const never = new Promise<void>(() => {});
  function Probe() {
    const editor = useMotionFieldEditor();
    useLayoutEffect(() => {
      retained = editor;
    }, [editor]);
    return null;
  }
  function Pending({ suspend }: { suspend: boolean }) {
    if (suspend) throw never;
    return null;
  }
  const control = (suspend: boolean) => (
    <Suspense fallback="pending">
      <MotionFieldProvider editor={{ begin: suspend ? abandoned : begin }}>
        <Probe />
        <Pending suspend={suspend} />
      </MotionFieldProvider>
    </Suspense>
  );
  const view = d.mount(control(false));
  view.rerender(control(true));
  expect(screen.getByText("pending")).toBeVisible();
  (retained as MotionFieldEditor | null)?.begin();
  expect(begin).toHaveBeenCalledOnce();
  expect(abandoned).not.toHaveBeenCalled();
});
