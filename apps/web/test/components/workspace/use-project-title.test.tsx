import { expect, test } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProjectTitle } from "../../../src/components/workspace/use-project-title";
test("owns and restores the editor title through project rename, history and navigation", () => {
  document.title = "Editor · Melt";
  const view = renderHook(({ name, active }) => useProjectTitle(name, active), {
    initialProps: { name: "Angel.exe", active: true },
  });
  expect(document.title).toBe("Angel.exe - Melt");
  view.rerender({ name: "<Ma création> & été", active: true });
  expect(document.title).toBe("<Ma création> & été - Melt");
  view.rerender({ name: "Angel.exe", active: true });
  expect(document.title).toBe("Angel.exe - Melt");
  document.title = "Dashboard · Melt";
  view.rerender({ name: "Angel.exe", active: false });
  expect(document.title).toBe("Dashboard · Melt");
  view.unmount();
});
