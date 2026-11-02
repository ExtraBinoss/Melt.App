import { confirmExportLeave, ExportLeaveCancelled } from "../export/leave";
import { remapPortableProject } from "../projects/portable/identity";
import { portableAssets } from "../projects/portable/assets";
import { projectArchive } from "../projects/portable/client";
import { readPortable } from "../projects/portable/read";
import { beginProjectTiming } from "../performance/project-timing";
import {
  createId,
  isOriginalMediaAsset,
  PRESETS,
  createLayer,
  createPage,
  createProject,
  serializeProject,
  selectionComposition,
  type EnginePort,
  type Project,
  type MotionInitializationPlan,
} from "@musart/core";
import type {
  EditorServices,
  ExportOptions,
  ExportScope,
  NewProjectOptions,
} from "../../state/contracts";
import { getMotionConfirmation } from "../../state/session/motion-confirmation";
import { createMotionTransport } from "../motion/transport";
import { getAnimationSession } from "../animation/session";
import type { ThumbnailPipeline } from "../projects/thumbnails";
import { ProjectStore } from "../projects/storage";
import { DeletedProjectError } from "../projects/lifecycle";
import { StaleProjectWriteError } from "../projects/writes/revision";
import { createMediaProjectOpener } from "./media-project";
import { assertExportScope } from "./export-scope";
import { createCompositionExporter } from "../export/composition";
import { createPreviewExport } from "./previews";
import { importMediaFiles } from "../assets/media-import";
import { importBatch, readDataUrl } from "../assets/imports";
import { downloadBlob, safeName } from "../files/download";
import { ObjectSelectionController } from "../selection/object/controller";
import { SelectionClient } from "../selection/selection";
import { PixelSelectionController } from "../selection/wand/controller";
import { i18n } from "../../state/i18n";
import "../selection/wand/messages";
import type { FontLibraryPort } from "../fonts/model";
import { isEditingShortcutTarget } from "../../state/keybindings/matching";
import { isMusArtClipboardText } from "../clipboard/controller";
import { freezeEffectPreviews } from "../../state/session/effect-preview";
import { loadRestoredProject, readRestoredHistory } from "./restored-history";
export interface ServiceDependencies {
  fonts?: FontLibraryPort;
  confirmMotion?: (plan: MotionInitializationPlan) => Promise<boolean>;
  store: ProjectStore;
  thumbnails?: ThumbnailPipeline;
  selection: SelectionClient;
  flush?: () => Promise<void>;
  saveCurrent?: (project: Project) => Promise<void>;
  download?: typeof downloadBlob;
  render?: () => Promise<typeof import("@musart/render")>;
}
export function createEditorServices(
  engine: EnginePort,
  dependencies: ServiceDependencies,
): EditorServices {
  const { store, selection, thumbnails } = dependencies;
  const saveCurrent =
    dependencies.saveCurrent ?? ((project: Project) => store.saveCurrent(project));
  const download = dependencies.download ?? downloadBlob;
  const renderer = dependencies.render ?? (() => import("@musart/render"));
  const pixelSelection = new PixelSelectionController(engine, {
    pixels: async (asset) => (await renderer()).sourcePixels(asset),
    maskName: () => i18n.t("pixelSelection:maskName"),
  });
  const objectSelection = new ObjectSelectionController(engine, selection, pixelSelection);
  const mediaResolvers = new Map<string, import("@musart/render").MediaSourceResolver>();
  const mediaResolverFor = (projectId: string) => {
    let resolver = mediaResolvers.get(projectId);
    if (!resolver) {
      resolver = {
        resolveOriginal: (asset, options) => store.loadMediaOriginal(projectId, asset, options),
      };
      mediaResolvers.set(projectId, resolver);
      if (mediaResolvers.size > 64) mediaResolvers.delete(mediaResolvers.keys().next().value!);
    }
    return resolver;
  };
  const exportComposition = createCompositionExporter(engine, {
    render: renderer,
    download,
    mediaResolverFor,
    fontResolver: dependencies.fonts?.resolve,
  });
  const activePage = () => {
    const snapshot = engine.getSnapshot();
    return snapshot.project.pages.find((p) => p.id === snapshot.pageId)!;
  };
  const switchReady = async () => {
    if (!(await confirmExportLeave())) throw new ExportLeaveCancelled();
    await dependencies.flush?.();
  };
  const create = async (options: NewProjectOptions) => {
    const timing = beginProjectTiming("Create project", { name: options.name });
    try {
      timing?.stage("Wait for previous project saves");
      await switchReady();
      const now = new Date().toISOString();
      const preset = PRESETS.find((item) => item.id === options.presetId);
      const safe = preset?.safeArea;
      let project = createProject({
        id: crypto.randomUUID(),
        name: options.name,
        createdAt: now,
        updatedAt: now,
        pages: [
          createPage({
            name: "Composition 1",
            width: options.width,
            height: options.height,
            background: options.background,
            ...(options.colorSpace ? { colorSpace: options.colorSpace } : {}),
            ...(safe
              ? {
                  margins: safe,
                  rulers: true,
                  guides: [
                    { id: createId(), axis: "x" as const, position: safe.left },
                    { id: createId(), axis: "x" as const, position: options.width - safe.right },
                    { id: createId(), axis: "y" as const, position: safe.top },
                    { id: createId(), axis: "y" as const, position: options.height - safe.bottom },
                  ],
                }
              : {}),
          }),
        ],
      });
      timing?.stage("Persist new project");
      project = await store.create(project);
      thumbnails?.schedule(project);
      timing?.stage("Publish document");
      engine.load(project);
      timing?.waitForFrame(engine.getSnapshot());
    } catch (error) {
      timing?.finish("failed", error);
      throw error;
    }
  };
  const openMediaProject = createMediaProjectOpener(engine, {
    store,
    flush: switchReady,
    schedule: (project) => thumbnails?.schedule(project),
  });
  return {
    exportComposition,
    projectPreferences: store.preferences,
    pixelSelection,
    objectSelection,
    mediaResolverFor,
    openMediaProject,
    ...(thumbnails
      ? {
          previewExport: createPreviewExport(engine, thumbnails, mediaResolverFor),
        }
      : {}),
    ...(dependencies.fonts ? { fonts: dependencies.fonts } : {}),
    loadProjectPreview: (id, options) => store.loadPreview(id, options),
    listProjects: () => store.list(),
    listProjectPage: (options) => store.listPage(options),
    loadProjectThumbnails: async (id, pageIds, options) =>
      thumbnails ? thumbnails.acquire(id, pageIds, options) : { items: [], release: () => {} },
    subscribeProjectThumbnails: (listener) => thumbnails?.subscribe(listener) ?? (() => {}),
    flushThumbnails: async () => {
      await switchReady();
      await thumbnails?.flush();
    },
    async projectInsights(id) {
      const usage = await store.usage(id),
        origin = await store.estimateOriginStorage();
      return { ...usage, ...(origin ? { origin } : {}) };
    },
    async renameProject(id, name) {
      await switchReady();
      if (engine.getSnapshot().project.id === id) {
        engine.execute({ type: "renameProject", name });
        await saveCurrent(engine.getSnapshot().project);
        await dependencies.flush?.();
      } else await store.rename(id, name);
    },
    async clearHistory(id) {
      await switchReady();
      if (engine.getSnapshot().project.id === id) await getAnimationSession(engine).clear();
      else {
        const project = await store.load(id, { observe: false });
        await store.history.clear(project, project.pages[0]!.id);
      }
    },
    async openProject(id) {
      const timing = beginProjectTiming("Open saved project", { projectId: id });
      try {
        timing?.stage("Wait for previous project saves");
        await switchReady();
        timing?.stage("Read + validate saved project");
        const origin = engine.getSnapshot();
        const project = await store.load(id, { remember: true });
        const history = await readRestoredHistory(store.history, project);
        if (await store.isDeleted(id)) throw new DeletedProjectError(id);
        const current = engine.getSnapshot();
        if (current.project !== origin.project || current.revision !== origin.revision)
          throw new StaleProjectWriteError(origin.project.id);
        timing?.identify(project.name);
        timing?.stage("Publish document");
        loadRestoredProject(engine, project, history);
        timing?.waitForFrame(engine.getSnapshot());
      } catch (error) {
        timing?.finish("failed", error);
        throw error;
      }
    },
    createProject: create,
    async saveProject() {
      const origin = engine.getSnapshot().project.id;
      // The shared writer already orders this write, including retries after a failed save.
      if (!dependencies.saveCurrent) await switchReady();
      const project = engine.getSnapshot().project;
      if (project.id !== origin) throw new StaleProjectWriteError(origin);
      await saveCurrent(project);
      thumbnails?.schedule(project);
    },
    async deleteProject(id) {
      await switchReady();
      thumbnails?.remove(id);
      await store.remove(id);
      if (engine.getSnapshot().project.id === id) {
        const projects = await store.list();
        if (projects[0]) {
          const replacement = await store.load(projects[0].id);
          const history = await readRestoredHistory(store.history, replacement);
          if (engine.getSnapshot().project.id !== id) return;
          await saveCurrent(replacement);
          if (engine.getSnapshot().project.id !== id) return;
          loadRestoredProject(engine, replacement, history);
        } else
          await create({ name: "Sans titre", width: 1080, height: 1080, background: "#ffffff" });
      }
    },
    async duplicateProject(id) {
      await switchReady();
      const source = await store.load(id, { observe: false });
      const now = new Date().toISOString();
      let duplicate: Project = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} — copie`,
        createdAt: now,
        updatedAt: now,
      };
      const originals = await Promise.all(
        [
          ...new Map(
            Object.values(source.assets)
              .filter(isOriginalMediaAsset)
              .map((asset) => [asset.originalId, asset]),
          ).values(),
        ].map(async (asset) => ({
          originalId: asset.originalId,
          contentRevision: asset.contentRevision,
          blob: await store.loadMediaOriginal(id, asset),
        })),
      );
      duplicate = await store.create(duplicate, { remember: false, mediaOriginals: originals });
      for (const thumbnail of await store.thumbnails(id))
        await store.saveThumbnail({ ...thumbnail, projectId: duplicate.id, updatedAt: now });
      thumbnails?.schedule(duplicate);
    },
    async importFiles(files) {
      if (files.some((file) => /^(?:video|audio)\//.test(file.type))) {
        await importMediaFiles(
          engine,
          files,
          {
            store,
            flush: switchReady,
            confirm: dependencies.confirmMotion ?? getMotionConfirmation(engine).request,
            probe: async (file, options) => (await renderer()).probeVideoOriginal(file, options),
            probeAudio: async (file, options) =>
              (await renderer()).probeAudioOriginal(file, options),
          },
          { at: createMotionTransport(engine).read().time },
        );
        return;
      }
      const snapshot = engine.getSnapshot();
      const command = await importBatch(files, activePage());
      const current = engine.getSnapshot();
      if (current.project.id !== snapshot.project.id || current.pageId !== snapshot.pageId)
        throw new Error("La composition a changé pendant l’import. Réessayez.");
      engine.execute(command);
      if (command.type === "addLayers") engine.select(command.layers.map((layer) => layer.id));
    },
    async openPortable(file) {
      const timing = beginProjectTiming("Import project", { file: file.name });
      try {
        timing?.stage("Read portable file");
        const origin = engine.getSnapshot();
        const assertOrigin = () => {
          if (engine.getSnapshot() !== origin)
            throw new DOMException("The project changed during import.", "AbortError");
        };
        const decoded = await readPortable(file);
        let parsed = decoded.project;
        const originals = decoded.originals;
        const exists = (await store.list()).some((item) => item.id === parsed.id);
        const deleted = await store.isDeleted(parsed.id);
        if (exists || deleted) parsed = remapPortableProject(parsed, crypto.randomUUID());
        assertOrigin();
        if (originals.length) {
          await openMediaProject(parsed, originals, {
            timing,
            expectedOrigin: {
              projectId: origin.project.id,
              pageId: origin.pageId,
              revision: origin.revision,
            },
          });
          return;
        }
        timing?.identify(parsed.name);
        let project = parsed;
        timing?.stage("Wait for previous project saves");
        await switchReady();
        timing?.stage("Persist imported project");
        assertOrigin();
        try {
          project = await store.create(project);
        } catch (error) {
          // Another session can retire the identity after the import's initial read.
          if (!(error instanceof DeletedProjectError)) throw error;
          project = remapPortableProject(project, crypto.randomUUID());
          project = await store.create(project);
        }
        thumbnails?.schedule(project);
        timing?.stage("Publish document");
        assertOrigin();
        engine.load(project);
        timing?.waitForFrame(engine.getSnapshot());
      } catch (error) {
        timing?.finish("failed", error);
        throw error;
      }
    },
    async exportProject(format = "musart") {
      freezeEffectPreviews(engine);
      const project = engine.getSnapshot().project;
      if (format === "zip" || Object.keys(project.assets).length || project.replay) {
        const originals = [];
        const seen = new Set<string>();
        for (const asset of portableAssets(project).flatMap((assets) => Object.values(assets))) {
          if (!isOriginalMediaAsset(asset)) continue;
          const key = JSON.stringify([asset.originalId, asset.contentRevision]);
          if (seen.has(key)) continue;
          seen.add(key);
          originals.push({
            originalId: asset.originalId,
            contentRevision: asset.contentRevision,
            blob: await store.loadMediaOriginal(project.id, asset),
          });
        }
        const result = await projectArchive({ kind: "encode", project, originals });
        if (!("blob" in result)) throw Error("Invalid archive response.");
        download(result.blob, `${safeName(project.name)}.${format}`);
        return;
      }
      download(
        new Blob([serializeProject(project)], { type: "application/json" }),
        `${safeName(project.name)}.musart`,
      );
    },
    async exportImage(options: ExportOptions, scope?: ExportScope) {
      options.signal?.throwIfAborted();
      freezeEffectPreviews(engine);
      const snapshot = engine.getSnapshot(),
        { project } = snapshot;
      assertExportScope(snapshot, scope);
      const transport = createMotionTransport(engine);
      transport.pause();
      const active = transport.readFrame() ?? activePage(),
        motionFrame = transport.readFramePlan();
      const pages = options.allPages
        ? project.pages
        : [
            options.selectionOnly
              ? selectionComposition(
                  active,
                  snapshot.selection,
                  [
                    project.id,
                    ...project.pages.map((item) => item.id),
                    ...Object.keys(project.assets),
                  ],
                  { centerInArtboard: options.centerSelection },
                )
              : active,
          ];
      const { exportComposition } = await renderer();
      const output: Record<string, Uint8Array> = {};
      for (const [index, page] of pages.entries()) {
        options.signal?.throwIfAborted();
        const blob = await exportComposition(page, project.assets, {
          ...options,
          mediaResolver: mediaResolverFor(project.id),
          ...(motionFrame && page.id === motionFrame.compositionId ? { motionFrame } : {}),
          ...(dependencies.fonts ? { fontResolver: dependencies.fonts.resolve } : {}),
        });
        const filename = `${safeName(page.name)}.${options.format === "jpeg" ? "jpg" : options.format}`;
        if (!options.allPages) {
          options.signal?.throwIfAborted();
          download(blob, filename);
          return;
        }
        output[`${String(index + 1).padStart(2, "0")}-${filename}`] = new Uint8Array(
          await blob.arrayBuffer(),
        );
      }
      const { zipSync } = await import("fflate");
      options.signal?.throwIfAborted();
      download(
        new Blob([zipSync(output, { level: 0 })], { type: "application/zip" }),
        `${safeName(project.name)}.zip`,
      );
    },
    async selectImagePoint(layerId, x, y, mode, tolerance) {
      if (mode === "wand") {
        engine.select([layerId]);
        await pixelSelection.begin(layerId, x, y, tolerance);
        await pixelSelection.accept();
        return;
      }
      await objectSelection.point(layerId, x, y, true);
    },
    segmentationModel: selection.model,
    prepareSegmentation: () => (selection.model ? selection.model.prepare() : selection.prepare()),
  };
}
// Clipboard text and files deliberately share the same command/import paths as the UI.
export function installClipboard(
  engine: EnginePort,
  services: Pick<EditorServices, "importFiles">,
  onError: (error: unknown) => void,
) {
  const paste = (event: ClipboardEvent) => {
    if (event.defaultPrevented || isEditingShortcutTarget(event.target)) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const files = Array.from(clipboard.files);
    if (files.length) {
      event.preventDefault();
      void services.importFiles(files).catch(onError);
      return;
    }
    const text = clipboard.getData("text/plain");
    // A disabled structured-paste binding must never turn a portable graph into
    // a literal JSON text layer. Its capture listener owns this format.
    if (!text.trim() || isMusArtClipboardText(text)) return;
    event.preventDefault();
    try {
      const layer = createLayer("text", {
        name: text.slice(0, 32),
        text,
        width: 480,
        height: Math.max(70, text.split("\n").length * 50),
        x: 100,
        y: 100,
        fontSize: 40,
      });
      engine.execute({ type: "addLayers", layers: [layer] });
      engine.select([layer.id]);
    } catch (error) {
      onError(error);
    }
  };
  document.addEventListener("paste", paste);
  return () => document.removeEventListener("paste", paste);
}
// Kept as a public low-level adapter for drag/drop and external automation.
export { readDataUrl };
