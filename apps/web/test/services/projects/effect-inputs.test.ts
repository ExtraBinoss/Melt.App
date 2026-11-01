import { expect, it } from "vitest";
import {
  createProject,
  createLayer,
  createPage,
  createEffect,
  type ImageAsset,
} from "@musart/core";
import { deleteDB } from "idb";
import { ProjectStore } from "../../../src/services/projects/storage";
import { openStudioDatabase } from "../../../src/services/projects/database";
import { readProjectPreview } from "../../../src/services/projects/previews/read";
it("reopens displacement originals from project storage and the isolated library preview snapshot", async () => {
  const name = `effect-project-${crypto.randomUUID()}`;
  const asset: ImageAsset = {
    id: "map",
    name: "map.png",
    width: 1,
    height: 1,
    mime: "image/png",
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=",
  };
  const project = createProject({
    assets: { map: asset },
    pages: [
      createPage({
        layers: [
          createLayer("rectangle", {
            effects: [createEffect("displace", { inputs: { map: "map" } })],
          }),
        ],
      }),
    ],
  });
  const first = new ProjectStore(name);
  try {
    await first.save(project);
  } finally {
    await first.close();
  }
  const second = new ProjectStore(name);
  try {
    expect(await second.load(project.id)).toEqual(project);
  } finally {
    await second.close();
  }
  const db = await openStudioDatabase(name);
  try {
    expect(await readProjectPreview(db, project.id)).toEqual(project);
  } finally {
    db.close();
    await deleteDB(name);
  }
});
