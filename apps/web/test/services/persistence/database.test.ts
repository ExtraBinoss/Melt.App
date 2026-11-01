import { expect, it } from "vitest";
import { deleteDB, type DBSchema } from "idb";
import { DatabaseConnection } from "../../../src/services/persistence/database";
interface Schema extends DBSchema {
  entries: { key: string; value: string };
}
const make = (name: string) =>
  new DatabaseConnection<Schema>(name, 1, {
    upgrade(db) {
      db.createObjectStore("entries");
    },
  });
it("shares pending opens, rolls back failed multi-request writes, and awaits the durable commit", async () => {
  const name = `database-test-${crypto.randomUUID()}`,
    connection = make(name);
  const [a, b] = await Promise.all([connection.open(), connection.open()]);
  expect(a).toBe(b);
  await expect(
    connection.write(["entries"], async (tx) => {
      await tx.objectStore("entries").put("value", "key");
      throw Error("failure");
    }),
  ).rejects.toThrow("failure");
  expect(await a.get("entries", "key")).toBeUndefined();
  await connection.write(["entries"], async (tx) => {
    await tx.objectStore("entries").put("committed", "key");
  });
  connection.dispose();
  await expect(connection.open()).rejects.toThrow("closed");
  const reopened = make(name);
  expect(await (await reopened.open()).get("entries", "key")).toBe("committed");
  reopened.dispose();
  await deleteDB(name);
});
it("closes a connection disposed while its opening is still pending", async () => {
  const name = `database-dispose-${crypto.randomUUID()}`,
    connection = make(name);
  const opening = connection.open();
  connection.dispose();
  await expect(opening).rejects.toThrow("closed");
  await deleteDB(name);
});
