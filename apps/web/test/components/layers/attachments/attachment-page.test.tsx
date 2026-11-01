import { Suspense, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  useAttachmentPagePort,
  useAttachmentPage,
} from "../../../../src/components/layers/attachments/attachment-page";
import { setup } from "../../../support/ui";

test("an abandoned wrapper render cannot publish its page into a retained attachment port", () => {
  const d = setup();
  const initial = d.engine.getSnapshot().project.pages[0]!;
  const suspended = new Promise<never>(() => {});
  const hook = renderHook(
    ({ page, suspend }) => {
      const port = useAttachmentPagePort(d.engine, page, d.rectangle.id);
      if (suspend) throw suspended;
      return port;
    },
    {
      initialProps: { page: initial, suspend: false },
      wrapper: ({ children }: { children: ReactNode }) => (
        <Suspense fallback={null}>{children}</Suspense>
      ),
    },
  );
  const port = hook.result.current;
  expect(port.read()).toBe(initial);
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.text.id], patch: { x: 123 } }));
  const changed = d.engine.getSnapshot().project.pages[0]!;
  expect(port.read()).toBeNull();
  hook.rerender({ page: changed, suspend: true });
  expect(port.read()).toBeNull();
  hook.rerender({ page: changed, suspend: false });
  expect(hook.result.current).toBe(port);
  expect(port.read()).toBe(changed);
  hook.unmount();
  expect(port.read()).toBeNull();
});

test("project changes rebind primitive owners and same-ID replacement still requires a committed page", () => {
  const d = setup();
  const hook = renderHook(({ page }) => useAttachmentPagePort(d.engine, page, d.rectangle.id), {
    initialProps: { page: d.engine.getSnapshot().project.pages[0]! },
  });
  const original = hook.result.current;
  act(() => d.engine.load({ ...d.engine.getSnapshot().project, id: "replacement" }));
  const replacement = hook.result.current;
  expect(replacement).not.toBe(original);
  expect(replacement.projectId).toBe("replacement");
  expect(original.read()).toBeNull();
  expect(replacement.read()).toBeNull();
  hook.rerender({ page: d.engine.getSnapshot().project.pages[0]! });
  expect(replacement.read()).toBe(d.engine.getSnapshot().project.pages[0]);
  act(() => d.engine.load(d.engine.getSnapshot().project));
  expect(replacement.read()).toBeNull();
  hook.rerender({ page: d.engine.getSnapshot().project.pages[0]! });
  expect(hook.result.current).toBe(replacement);
  expect(replacement.read()).toBe(d.engine.getSnapshot().project.pages[0]);
});

test("open attachment publication stays local to its editing scope across background metadata", () => {
  const d = setup();
  const page = d.engine.getSnapshot().project.pages[0]!;
  let renders = 0;
  const hook = renderHook(() => {
    renders++;
    return useAttachmentPage(d.engine, page, undefined, true);
  });
  const before = renders;
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#123456" } }));
  act(() => d.engine.undo());
  act(() => d.engine.redo());
  expect(renders).toBe(before);
  expect(hook.result.current.current).toBe(page);
  act(() => expect(hook.result.current.capture()).toBe(d.engine.getSnapshot().project.pages[0]));
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { opacity: 0.5 } }),
  );
  expect(hook.result.current.current).toBeNull();
  expect(renders).toBeGreaterThan(before);
  hook.unmount();
});

test("a parent passing a fresh metadata page still retains the attachment presentation source", () => {
  const d = setup();
  const page = d.engine.getSnapshot().project.pages[0]!;
  const hook = renderHook(
    ({ incoming }) => useAttachmentPage(d.engine, incoming, undefined, true),
    {
      initialProps: { incoming: page },
    },
  );
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#123456" } }));
  const current = d.engine.getSnapshot().project.pages[0]!;
  hook.rerender({ incoming: current });
  expect(hook.result.current.source).toBe(page);
  expect(hook.result.current.current).toBe(page);
  act(() => expect(hook.result.current.capture()).toBe(current));
  act(() => d.engine.load(d.engine.getSnapshot().project));
  hook.rerender({ incoming: d.engine.getSnapshot().project.pages[0]! });
  expect(hook.result.current.source).not.toBe(page);
});
