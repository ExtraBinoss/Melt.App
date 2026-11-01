import type { EditorRuntime } from "../services/session/runtime";
import type { StudioRouting } from "../state/contracts";
import { LibrarySession } from "../services/session/library-session";
import { createLibraryServices } from "../services/session/library-services";

/** Reconnect StrictMode without reviving a closed resource lease. */
export class StudioSessionOwner {
  private active = true;
  private session?: LibrarySession;
  private report?: (error: unknown) => void;
  private fail = (error: unknown) => {
    if (this.active) this.report?.(error);
  };
  readonly services = createLibraryServices(
    () => this.acquire().data(),
    () => this.runtime(),
    this.fail,
  );
  constructor(private readonly initial?: StudioRouting) {}
  connect() {
    this.active = true;
  }
  reporter(report: (error: unknown) => void) {
    this.report = report;
  }
  private acquire() {
    if (!this.active) throw new DOMException("Studio is closed.", "AbortError");
    return (this.session ??= new LibrarySession(
      {
        data: async (signal) =>
          (await import("../services/session/library-data")).createLibraryData((error) => {
            if (!signal.aborted) this.fail(error);
          }),
        runtime: async (options) =>
          (await import("../services/session/runtime")).createRuntime((error) => {
            if (!options.signal?.aborted) this.fail(error);
          }, options),
      },
      {
        projectId: this.initial?.projectId,
        editor: this.initial?.view === "editor",
        library: this.initial?.view === "dashboard",
      },
    ));
  }
  runtime() {
    return this.acquire().runtime();
  }
  accepts(runtime: EditorRuntime) {
    return this.active && this.session?.peek() === runtime;
  }
  peek = () => this.session?.peek();
  close() {
    this.active = false;
    const current = this.session;
    this.session = undefined;
    void current?.dispose().catch(this.fail);
  }
}
