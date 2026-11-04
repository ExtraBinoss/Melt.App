import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { EditorEngine, parseProject, serializeProject } from "@musart/core";
import type { EditorServices } from "../../../../../src/state/contracts";
import { createStudioStarter } from "../../../../../src/services/projects/templates/designed/studio-starter/build";
import { openDesignedTemplate } from "../../../../../src/services/projects/templates/designed/load";
import { createProjectFromTemplate } from "../../../../../src/services/projects/templates/catalog";
import { isMotionTemplateId } from "../../../../../src/services/projects/templates/motion/identity";

async function manifest() {
  return readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8");
}

test("the still starter replays, round-trips and retains editable native sources and scene settings", async () => {
  const { initial, project, batches } = createStudioStarter();
  const engine = new EditorEngine(initial, { now: () => project.updatedAt });
  for (const commands of batches) engine.transaction([...commands]);
  expect(engine.getSnapshot().project).toEqual(project);
  expect(parseProject(serializeProject(project))).toEqual(project);
  expect(JSON.parse(await manifest()).project).toEqual(project);
  const page = project.pages[0]!;
  expect(page.motion).toBeUndefined();
  expect(isMotionTemplateId("studio-starter")).toBe(false);
  expect(Object.keys(project.assets)).toHaveLength(0);
  expect(page.spatial).toMatchObject({ shadows: true, environment: { preset: "softbox" } });
  expect(page.spatial!.lights).toHaveLength(3);
  expect(page.layers.find((layer) => layer.id === "studio-title")).toMatchObject({
    kind: "text",
    text: "MELT",
    spatial: { source: "extrude", enabled: true },
    fillGradient: { kind: "linear" },
  });
  expect(
    new Set(page.layers.flatMap((layer) => (layer.spatial ? [layer.spatial.source] : []))),
  ).toEqual(new Set(["box", "torus", "sphere", "extrude"]));
  expect(project).not.toHaveProperty("workspaceMode");
  expect(page).not.toHaveProperty("workspaceMode");
  const title = page.layers.find((layer) => layer.kind === "text" && layer.spatial)!;
  engine.execute({ type: "updateLayers", ids: [title.id], patch: { text: "YOURS" } });
  expect(
    engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === title.id)!.text,
  ).toBe("YOURS");
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(project);
  engine.redo();
  expect(
    engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === title.id)!.text,
  ).toBe("YOURS");
});

test("installation awaits durable Studio preferences for the new identity before publishing", async () => {
  const body = await manifest();
  const installed: string[] = [];
  const projectPreferences = {
    read: vi.fn().mockResolvedValue({}),
    update: vi.fn(async (id: string) => {
      installed.push(id);
    }),
  };
  const openMediaProject = vi.fn<NonNullable<EditorServices["openMediaProject"]>>(
    async (project) => {
      expect(installed).toContain(project.id);
      expect(projectPreferences.update).toHaveBeenLastCalledWith(project.id, {
        workspaceMode: "studio",
      });
    },
  );
  const services = { openMediaProject, projectPreferences };
  const signal = new AbortController().signal;
  const expectedOrigin = { projectId: "origin", pageId: "page", revision: 2 };
  const options = { signal, expectedOrigin };
  const fetcher = vi.fn(async () => new Response(body));
  await openDesignedTemplate(services, "studio-starter", options, fetcher);
  await openDesignedTemplate(services, "studio-starter", options, fetcher);
  expect(openMediaProject).toHaveBeenCalledTimes(2);
  expect(openMediaProject.mock.calls[0]![0].id).not.toBe(openMediaProject.mock.calls[1]![0].id);
  expect(openMediaProject.mock.calls[0]!.slice(1)).toEqual([[], options]);
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("designed/studio-starter/studio-starter.json"),
    { signal },
  );
});

test("failed preferences and cancellation never publish a project or simulate installation", async () => {
  const body = await manifest();
  const openMediaProject = vi.fn<NonNullable<EditorServices["openMediaProject"]>>(async () => {});
  const fetcher = vi.fn(async () => new Response(body));
  const failure = new Error("Storage blocked");
  const projectPreferences = { read: vi.fn(), update: vi.fn().mockRejectedValue(failure) };
  await expect(
    openDesignedTemplate({ openMediaProject, projectPreferences }, "studio-starter", {}, fetcher),
  ).rejects.toBe(failure);
  await expect(
    openDesignedTemplate({ openMediaProject }, "studio-starter", {}, fetcher),
  ).rejects.toMatchObject({ code: "unavailable" });
  const abort = new AbortController();
  projectPreferences.update.mockImplementation(async () => {
    abort.abort();
  });
  await expect(
    openDesignedTemplate(
      { openMediaProject, projectPreferences },
      "studio-starter",
      { signal: abort.signal },
      fetcher,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(openMediaProject).not.toHaveBeenCalled();
});

test("the public installation route selects the canonical designed loader", async () => {
  const body = await manifest();
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body));
  const services = {
    createProject: vi.fn(),
    openPortable: vi.fn(),
    openMediaProject: vi.fn<NonNullable<EditorServices["openMediaProject"]>>(async () => {}),
    projectPreferences: { read: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
  };
  try {
    await createProjectFromTemplate(services, "studio-starter");
    expect(services.openMediaProject).toHaveBeenCalledOnce();
    expect(services.openPortable).not.toHaveBeenCalled();
    expect(services.createProject).not.toHaveBeenCalled();
  } finally {
    fetcher.mockRestore();
  }
});
