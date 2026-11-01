import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type OpenDBCallbacks,
  type StoreNames,
} from "idb";
/** Shared connection boundary; schema migrations remain with their domain owner. */
export function openDatabase<S extends DBSchema>(
  name: string,
  version: number,
  callbacks: OpenDBCallbacks<S> = {},
) {
  const opening = openDB<S>(name, version, {
    ...callbacks,
    blocking(...args) {
      void opening.then(
        (db) => db.close(),
        () => {},
      );
      callbacks.blocking?.(...args);
    },
  });
  return opening;
}
type Transaction = { readonly done: Promise<unknown>; abort(): void };
export function abortTransaction(transaction: Transaction): void {
  try {
    transaction.abort();
  } catch {
    /* A settled native transaction cannot be aborted. */
  }
}
/** Await the native commit, not only its last request. Never retry an uncertain write. */
export async function commitTransaction<T>(
  transaction: Transaction,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    const value = await operation();
    await transaction.done;
    return value;
  } catch (error) {
    abortTransaction(transaction);
    await transaction.done.catch(() => undefined);
    throw error;
  }
}
/** Lazy, retryable opening with a permanent disposal barrier and owned pending transactions. */
export class DatabaseConnection<S extends DBSchema> {
  private opening: Promise<IDBPDatabase<S>> | undefined;
  private closed = false;
  private writes = new Set<Transaction>();
  constructor(
    private readonly name: string,
    private readonly version: number,
    private readonly callbacks: OpenDBCallbacks<S>,
  ) {}
  async open(): Promise<IDBPDatabase<S>> {
    if (this.closed) throw Error("Database connection is closed");
    if (!this.opening) {
      const opening = openDatabase<S>(this.name, this.version, {
        ...this.callbacks,
        blocking: (...args) => {
          this.dispose();
          this.callbacks.blocking?.(...args);
        },
        terminated: () => {
          this.dispose();
          this.callbacks.terminated?.();
        },
      });
      this.opening = opening;
      void opening.catch(() => {
        if (this.opening === opening) this.opening = undefined;
      });
    }
    const db = await this.opening;
    if (this.closed) {
      db.close();
      throw Error("Database connection is closed");
    }
    return db;
  }
  async write<N extends StoreNames<S>[], T>(
    stores: N,
    operation: (tx: IDBPTransaction<S, N, "readwrite">) => Promise<T>,
  ): Promise<T> {
    const db = await this.open();
    const tx = db.transaction(stores, "readwrite");
    this.writes.add(tx);
    try {
      return await commitTransaction(tx, async () => {
        const result = await operation(tx);
        if (this.closed) throw Error("Database connection is closed");
        return result;
      });
    } finally {
      this.writes.delete(tx);
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const tx of this.writes) abortTransaction(tx);
    this.writes.clear();
    void this.opening?.then(
      (db) => db.close(),
      () => {},
    );
  }
}
