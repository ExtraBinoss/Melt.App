import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SPATIAL_MATERIALS, createSpatialLayer } from "@musart/core";
import { CatalogGroups, catalogOpenGroups } from "../../../src/ui/studio/catalog/CatalogGroups";
import { materialParameters } from "../../../src/ui/studio/catalog/material-parameters";
import { ProjectPreferencesProvider } from "../../../src/components/workspace/preferences/context";
import { StudioMaterial } from "../../../src/ui/studio/panels/StudioMaterial";
import type { ProjectLayoutPreferences } from "../../../src/services/projects/preferences/model";
import { setup } from "../../support/ui";

const groups = [
  { id: "plastic", label: "Plastics", count: 10 },
  { id: "metal", label: "Metals", count: 15 },
];

test("new categories start open while saved choices are scoped to each catalog", () => {
  expect(catalogOpenGroups("material", groups, undefined)).toEqual(["plastic", "metal"]);
  expect(
    catalogOpenGroups("material", groups, {
      "material:metal": false,
      "environment:plastic": false,
    }),
  ).toEqual(["plastic"]);
});

test("closing a category survives remount and late hydration, preserving other catalog choices", async () => {
  let resolve!: (value: ProjectLayoutPreferences) => void;
  const delayed = new Promise<ProjectLayoutPreferences>((done) => {
    resolve = done;
  });
  let persisted: ProjectLayoutPreferences = {};
  const port = {
    read: vi.fn(() => delayed),
    update: vi.fn(async (_id: string, patch: ProjectLayoutPreferences) => {
      persisted = patch;
    }),
  };
  const onError = vi.fn();
  const content = (
    <CatalogGroups kind="material" groups={groups}>
      {(id) => <span>{id}</span>}
    </CatalogGroups>
  );
  const view = render(
    <ProjectPreferencesProvider projectId="one" port={port} onError={onError}>
      {content}
    </ProjectPreferencesProvider>,
  );
  expect(screen.getByRole("button", { name: "Plastics" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "Metals" }));
  await act(async () => {
    resolve({ studioCatalogOpen: { "material:metal": true } });
    await delayed;
  });
  expect(screen.getByRole("button", { name: "Metals" })).toHaveAttribute("aria-expanded", "false");
  expect(persisted.studioCatalogOpen).toEqual({
    "material:plastic": true,
    "material:metal": false,
  });
  view.unmount();
  render(
    <ProjectPreferencesProvider
      projectId="one"
      port={{ ...port, read: async () => persisted }}
      onError={onError}
    >
      {content}
    </ProjectPreferencesProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByRole("button", { name: "Metals" })).toHaveAttribute("aria-expanded", "false");
  expect(onError).not.toHaveBeenCalled();
});

test("material families expose two familiar parameters and one meaningful finish at most", () => {
  expect(materialParameters("glass")).toEqual(["roughness", "metalness", "transmission"]);
  expect(materialParameters("fabric")).toEqual(["roughness", "metalness", "sheen"]);
  expect(materialParameters("emissive")).toEqual(["roughness", "metalness", "emissiveIntensity"]);
  expect(materialParameters("metal")).toEqual(["roughness", "metalness"]);
  for (const preset of SPATIAL_MATERIALS)
    expect(materialParameters(preset.category).length).toBeLessThanOrEqual(3);
});

test("choosing a catalog sphere commits the physical material once, exposes transmission and undoes atomically", () => {
  const d = setup();
  d.engine.execute({
    type: "updateLayers",
    ids: [d.rectangle.id],
    patch: { spatial: createSpatialLayer("box") },
  });
  d.engine.load(d.engine.getSnapshot().project);
  d.engine.select([d.rectangle.id]);
  const original = d.engine.getSnapshot().project;
  d.mount(<StudioMaterial engine={d.engine} run={d.run} />);
  fireEvent.click(screen.getByRole("button", { name: "Matière" }));
  expect(screen.getByText("Couleur", { selector: "summary" }).parentElement).not.toHaveAttribute(
    "open",
  );
  fireEvent.click(screen.getByRole("button", { name: "Verre · Corail" }));
  expect(d.run).toHaveBeenCalledOnce();
  const preset = SPATIAL_MATERIALS.find((item) => item.id === "glassCoral")!;
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]).toMatchObject({
    fill: preset.color,
    spatial: { useModelMaterials: false, material: preset.settings },
  });
  expect(screen.getByRole("slider", { name: "Transmission" })).toBeDefined();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
