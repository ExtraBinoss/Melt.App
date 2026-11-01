import { Suspense, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useAttachmentPagePort } from "../../../../src/components/layers/attachments/attachment-page";
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
