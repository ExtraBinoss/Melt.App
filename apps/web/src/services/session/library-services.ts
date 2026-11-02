import type { EditorServices } from "../../state/contracts";
import type { LibraryData } from "./library-data";
import type { EditorRuntime } from "./runtime";

/** Cached-library reads are independent; every edit/open still uses the genuine engine services. */
export function createLibraryServices(
  acquireData: () => Promise<LibraryData>,
  runtime: () => Promise<EditorRuntime>,
  onError: (error: unknown) => void,
): EditorServices {
  let acquired: Promise<LibraryData> | undefined;
  const data = () => (acquired = acquireData());
  const subscribe = (attach: (value: LibraryData) => () => void) => {
    let active = true,
      stop: (() => void) | undefined;
    void data().then(
      (value) => {
        if (active) stop = attach(value);
      },
      (error) => {
        if (active) onError(error);
      },
    );
    return () => {
      active = false;
      stop?.();
    };
  };
  return {
    listProjects: async () => (await data()).store.list(),
    listProjectPage: async (options) => (await data()).store.listPage(options),
    loadProjectPreview: async (id, options) => (await data()).store.loadPreview(id, options),
    loadProjectThumbnails: async (...args) => (await data()).thumbnails.acquire(...args),
    subscribeProjectThumbnails: (listener) =>
      subscribe((value) => value.thumbnails.subscribe(listener)),
    mediaResolverFor: (id) => ({
      resolveOriginal: async (asset, options) =>
        (await data()).store.loadMediaOriginal(id, asset, options),
    }),
    fonts: {
      supportsLocalFonts: typeof window !== "undefined" && "queryLocalFonts" in window,
      catalog: async () => (await data()).fonts.catalog(),
      installed: async () => (await data()).fonts.installed(),
      install: async (...args) => (await data()).fonts.install(...args),
      importFile: async (...args) => (await data()).fonts.importFile(...args),
      resolve: async (...args) => (await data()).fonts.resolve(...args),
      discoverLocal: async () => (await data()).fonts.discoverLocal(),
      subscribe: (listener) => subscribe((value) => value.fonts.subscribe(listener)),
      dispose: () => {
        void acquired?.then((value) => value.fonts.dispose(), onError);
      },
    },
    openProject: async (...args) => (await runtime()).services.openProject(...args),
    createProject: async (...args) => (await runtime()).services.createProject(...args),
    openPortable: async (...args) => (await runtime()).services.openPortable(...args),
    openMediaProject: async (...args) => {
      const open = (await runtime()).services.openMediaProject;
      if (!open) throw Error("Media project installation is unavailable.");
      return open(...args);
    },
    saveProject: async () => (await runtime()).services.saveProject(),
    deleteProject: async (...args) => (await runtime()).services.deleteProject(...args),
    duplicateProject: async (...args) => (await runtime()).services.duplicateProject(...args),
    renameProject: async (...args) => (await runtime()).services.renameProject(...args),
    projectInsights: async (id) => {
      const store = (await data()).store;
      const usage = await store.usage(id),
        origin = await store.estimateOriginStorage();
      return { ...usage, ...(origin ? { origin } : {}) };
    },
    clearHistory: async (...args) => (await runtime()).services.clearHistory(...args),
    flushThumbnails: async () => (await runtime()).services.flushThumbnails(),
    importFiles: async (...args) => (await runtime()).services.importFiles(...args),
    exportProject: async (format) => (await runtime()).services.exportProject(format),
    exportImage: async (...args) => (await runtime()).services.exportImage(...args),
    selectImagePoint: async (...args) => (await runtime()).services.selectImagePoint(...args),
    prepareSegmentation: async () => (await runtime()).services.prepareSegmentation(),
  };
}
