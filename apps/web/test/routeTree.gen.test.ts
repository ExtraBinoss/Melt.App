import { expect, test } from "vitest";
import { routeTree } from "../src/routeTree.gen";

test("the generated tree has one public landing and one shared workspace with both destinations", () => {
  const children = routeTree.children!;
  expect(
    Object.values(children)
      .map((route) => route.options.id)
      .sort((left, right) => String(left).localeCompare(String(right), "en")),
  ).toEqual(["/", "/_workspace", "/ssr", "/tools"]);
  const workspace = Object.values(children).find((route) => route.options.id === "/_workspace");
  expect(
    (Object.values(workspace!.children!) as { options: { path: string } }[]).map(
      (route) => route.options.path,
    ),
  ).toEqual(["/dashboard", "/editor"]);
});
