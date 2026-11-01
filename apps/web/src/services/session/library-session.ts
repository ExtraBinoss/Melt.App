import type { EditorRuntime, RuntimeOptions } from "./runtime";
import type { LibraryData } from "./library-data";

export interface LibrarySessionDependencies {
  data: (signal: AbortSignal) => Promise<LibraryData>;
  runtime: (options: RuntimeOptions) => Promise<EditorRuntime>;
}

/** A single resource owner hands library stores to the editor, including late/unmounted results. */
export class LibrarySession {
  private readonly controller = new AbortController();
  private dataTask?: Promise<LibraryData>;
  private runtimeTask?: Promise<EditorRuntime>;
  private current?: EditorRuntime;
  private closing?: Promise<void>;
  constructor(
    private readonly dependencies: LibrarySessionDependencies,
    private readonly options: Omit<
      RuntimeOptions,
      "store" | "fonts" | "thumbnails" | "thumbnailActivity" | "signal"
    >,
  ) {}
  async data() {
    this.controller.signal.throwIfAborted();
    const data = await (this.dataTask ??= this.dependencies
      .data(this.controller.signal)
      .catch((error: unknown) => {
        if (!this.controller.signal.aborted) this.dataTask = undefined;
        throw error;
      }));
    this.controller.signal.throwIfAborted();
    return data;
  }
  async runtime() {
    this.controller.signal.throwIfAborted();
    this.runtimeTask ??= (this.options.library ? this.data() : Promise.resolve(undefined))
      .then(async (data) => {
        const result = await this.dependencies.runtime({
          ...this.options,
          ...(data
            ? {
                store: data.store,
                fonts: data.fonts,
                thumbnails: data.thumbnails,
                thumbnailActivity: data.activity,
              }
            : {}),
          signal: this.controller.signal,
        });
        this.current = result;
        return result;
      })
      .catch((error: unknown) => {
        if (!this.controller.signal.aborted) this.runtimeTask = undefined;
        throw error;
      });
    const result = await this.runtimeTask;
    this.controller.signal.throwIfAborted();
    return result;
  }
  peek() {
    return this.current;
  }
  dispose() {
    if (this.closing) return this.closing;
    this.controller.abort();
    if (this.current) return (this.closing = this.current.dispose());
    return (this.closing = (async () => {
      let runtime: EditorRuntime | undefined;
      try {
        runtime = await this.runtimeTask;
      } catch {
        /* The requesting operation reports startup failures. */
      }
      if (runtime) await runtime.dispose();
      else if (this.dataTask) {
        let data: LibraryData | undefined;
        try {
          data = await this.dataTask;
        } catch {
          /* No resources were acquired. */
        }
        await data?.dispose();
      }
    })());
  }
}
