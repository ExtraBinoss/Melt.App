import { afterEach, expect, it } from "vitest";
import { createProject, validateProject } from "@musart/core";
import { ProjectStore } from "../../../src/services/projects/storage";
const stores: ProjectStore[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
});
function store(name = crypto.randomUUID()) {
  const result = new ProjectStore(name);
  stores.push(result);
  return result;
}
it("allocates the first free name atomically, preserves inputs and persists the allocated document", async () => {
  const db = store(),
    input = createProject({ name: "Bloom" });
  const first = await db.create(input);
  const third = await db.create(createProject({ name: "Bloom 2" }));
  const second = await db.create(createProject({ name: "Bloom" }));
  const fourth = await db.create(createProject({ name: "Bloom" }));
  expect([first.name, second.name, third.name, fourth.name]).toEqual([
    "Bloom",
    "Bloom 1",
    "Bloom 2",
    "Bloom 3",
  ]);
  expect(input.name).toBe("Bloom");
  expect(await db.load(fourth.id)).toEqual(fourth);
  validateProject(fourth);
  await db.saveCurrent(fourth);
  expect((await db.load(fourth.id)).name).toBe("Bloom 3");
  await expect(db.create(input)).rejects.toThrow();
  expect(await db.list()).toHaveLength(4);
});
it("serializes two independent creators through the IndexedDB transaction", async () => {
  const name = crypto.randomUUID(),
    a = store(name),
    b = store(name);
  const projects = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      (index % 2 ? a : b).create(createProject({ name: "Untitled" })),
    ),
  );
  expect(new Set(projects.map((project) => project.name))).toEqual(
    new Set(["Untitled", ...Array.from({ length: 5 }, (_, i) => `Untitled ${i + 1}`)]),
  );
  expect(await a.list()).toHaveLength(6);
});
it("observes existing saves and later renames/deletions without renaming ordinary saves", async () => {
  const db = store(),
    old = createProject({ name: "Poster" });
  await db.save(old);
  let created = await db.create(createProject({ name: "Poster" }));
  expect(created.name).toBe("Poster 1");
  await db.rename(old.id, "Moved");
  created = await db.create(createProject({ name: "Poster" }));
  expect(created.name).toBe("Poster");
  await db.remove(created.id);
  expect((await db.create(createProject({ name: "Poster" }))).name).toBe("Poster");
  await db.save({ ...old, name: "Poster" });
  expect((await db.load(old.id)).name).toBe("Poster");
});
