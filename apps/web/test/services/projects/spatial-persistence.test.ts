import { expect, test, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  type SceneAsset,
} from "@musart/core";
import { openStudioDatabase } from "../../../src/services/projects/database";
import { prepareProjectWrite } from "../../../src/services/projects/persistence/prepare";
import { persistProjectWrite } from "../../../src/services/projects/persistence/transaction";
import { readProjectPreview } from "../../../src/services/projects/previews/read";
import { SelectionPreviewIdentity } from "../../../src/services/projects/thumbnails/selection-identity";
import { spatialGlb, spatialHdr } from "../../../../../test/browser/support/spatial-glb";
function fixture() {
  const model = spatialGlb(),
    hdr = spatialHdr(64, 32);
  const asset: SceneAsset = {
    id: "model",
    kind: "model3d",
    name: "tetra.glb",
    mime: "model/gltf-binary",
    width: 1,
    height: 1,
    byteLength: model.byteLength,
    dataUrl: "data:model/gltf-binary;base64," + Buffer.from(model).toString("base64"),
    clips: [{ name: "Quarter turn", duration: 1 }],
  };
  const env: SceneAsset = {
    id: "environment",
    kind: "environment",
    name: "studio.hdr",
    mime: "image/vnd.radiance",
    width: 64,
    height: 32,
    byteLength: hdr.byteLength,
    dataUrl: "data:image/vnd.radiance;base64," + Buffer.from(hdr).toString("base64"),
  };
  const scene = createSpatialScene();
  scene.environment.assetId = env.id;
  return createProject({
    id: "spatial-project",
    assets: { [asset.id]: asset, [env.id]: env },
    pages: [
      createPage({
        id: "scene",
        spatial: scene,
        layers: [
          createLayer("rectangle", {
            id: "object",
            assetId: asset.id,
            spatial: createSpatialLayer("glb"),
          }),
          createLayer("rectangle", { id: "flat" }),
        ],
      }),
    ],
  });
}
test("3D original records persist atomically outside metadata, hydrate exact clips, and warm writes never rewrite originals", async () => {
  const project = fixture(),
    db = await openStudioDatabase(crypto.randomUUID());
  try {
    const prepared = prepareProjectWrite(project, { scene: "first-pixels" }, [], {
      expectedRevision: "",
    });
    const first = await persistProjectWrite(db, prepared.frame);
    const manifest = await db.get("projects", project.id);
    expect(JSON.stringify(manifest)).not.toContain("base64,");
    expect((await db.get("assets", [project.id, "model"]))!.dataUrl).toBe(
      project.assets.model!.dataUrl,
    );
    expect(await readProjectPreview(db, project.id)).toEqual(project);
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    try {
      const next = prepareProjectWrite(
        { ...project, name: "Renamed" },
        { scene: "first-pixels" },
        [],
        { expectedRevision: first.writeRevision },
        undefined,
        { projectId: project.id, revision: first.assetsRevision, urls: prepared.urls },
      );
      expect(next.frame.originals).toHaveLength(0);
      await persistProjectWrite(db, next.frame);
      expect(
        put.mock.contexts.filter((store) => (store as IDBObjectStore).name === "assets"),
      ).toHaveLength(0);
      await expect(persistProjectWrite(db, prepared.frame)).rejects.toMatchObject({
        code: "STALE_PROJECT_WRITE",
      });
      expect((await readProjectPreview(db, project.id)).name).toBe("Renamed");
    } finally {
      put.mockRestore();
    }
  } finally {
    db.close();
  }
});
test("only previews containing 3D depend on composition lighting and environment originals", () => {
  const project = fixture(),
    page = project.pages[0]!,
    cache = new SelectionPreviewIdentity();
  const base = cache.read(page, project.assets, ["object"]),
    flat = cache.read(page, project.assets, ["flat"]);
  const changed = {
    ...page,
    spatial: { ...page.spatial!, environment: { ...page.spatial!.environment, rotation: 90 } },
  };
  expect(cache.read(changed, project.assets, ["object"])).not.toBe(base);
  expect(cache.read(changed, project.assets, ["flat"])).toBe(flat);
  const environment = project.assets.environment as SceneAsset;
  expect(
    cache.read(
      page,
      { ...project.assets, environment: { ...environment, dataUrl: environment.dataUrl + "AAAA" } },
      ["object"],
    ),
  ).not.toBe(base);
});
