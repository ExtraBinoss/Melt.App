import { isTemplateOriginalPath } from "./paths";
import {
  MOTION_TEMPLATE_ASSET_REVISIONS,
  MOTION_TEMPLATE_PREVIEW_REVISIONS,
} from "./asset-revisions";
import { motionTemplateSources } from "./source-cache";
import type { ProjectTiming } from "../../../performance/project-timing";
import { isDesignedTemplateId } from "../designed/catalog";
import { prepareDesignedTemplate } from "../designed/load";
import { isMotionTemplateId } from "./identity";
import { isOriginalMediaAsset, validateProject, type Project } from "@musart/core";
import type { EditorServices } from "../../../../state/contracts";
import { i18n } from "../../../../state/i18n";
import type { MediaOriginalInput } from "../../media/model";
import type { MotionTemplateId, MotionTemplateManifest } from "./model";

import "./messages";
import type { messages as resources } from "./messages";

export class MotionTemplateError extends Error {
  constructor(readonly code: keyof typeof resources.en) {
    super(i18n.t(`motionTemplates:${code}`));
    this.name = "MotionTemplateError";
  }
}

export interface TemplateLoadOptions {
  readonly timing?: ProjectTiming;
  readonly signal?: AbortSignal;
  readonly expectedOrigin?: {
    readonly projectId: string;
    readonly pageId: string;
    readonly revision: number;
  };
}

export type TemplateFetcher = (url: string, init?: RequestInit) => Promise<Response>;

type PreparationOptions = Pick<TemplateLoadOptions, "signal" | "timing"> & { preview?: boolean };

async function download(
  url: string,
  fetcher: TemplateFetcher,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await fetcher(url, { signal });
  } catch {
    signal?.throwIfAborted();
    throw new MotionTemplateError("download");
  }
}

async function boundedResponse(
  response: Response,
  limit: number,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  signal?.throwIfAborted();
  if (!response.ok) throw new MotionTemplateError("download");
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new MotionTemplateError("tooLarge");
  }
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    signal?.throwIfAborted();
    if (bytes.byteLength > limit) throw new MotionTemplateError("tooLarge");
    return bytes;
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new MotionTemplateError("tooLarge");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export function parseMotionTemplateManifest(
  value: unknown,
  id: MotionTemplateId,
): MotionTemplateManifest {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
    const manifest = value as MotionTemplateManifest;
    if (
      manifest.version !== 1 ||
      manifest.templateId !== id ||
      !Array.isArray(manifest.originals) ||
      manifest.originals.length > 16
    )
      throw Error();
    // The bounded response has already been parsed. Validate it directly rather
    // than serializing and parsing the complete document a second time.
    validateProject(manifest.project);
    const project = manifest.project;
    if (project.pages.length !== 1 || project.pages[0]!.motion?.mode !== "motion") throw Error();
    const media = Object.values(project.assets).filter(isOriginalMediaAsset);
    const seen = new Set<string>();
    for (const original of manifest.originals) {
      if (
        !original ||
        !isTemplateOriginalPath(id, original.file) ||
        !Number.isSafeInteger(original.byteLength) ||
        original.byteLength <= 0 ||
        original.byteLength > 8 * 1024 * 1024 ||
        !["video/mp4", "audio/wav"].includes(original.mime) ||
        seen.has(original.originalId) ||
        !/^sha256:[a-f0-9]{64}$/.test(original.contentRevision)
      )
        throw Error();
      if (
        !media.some(
          (asset) =>
            asset.originalId === original.originalId &&
            asset.contentRevision === original.contentRevision &&
            asset.byteLength === original.byteLength &&
            asset.mime === original.mime,
        )
      )
        throw Error();
      seen.add(original.originalId);
    }
    if (
      media.some(
        (asset) =>
          !manifest.originals.some(
            (original) =>
              original.originalId === asset.originalId &&
              original.contentRevision === asset.contentRevision &&
              original.byteLength === asset.byteLength &&
              original.mime === asset.mime,
          ),
      )
    )
      throw Error();
    return { version: 1, templateId: id, project, originals: manifest.originals };
  } catch {
    throw new MotionTemplateError("invalid");
  }
}

export interface PreparedMotionTemplate {
  readonly project: Project;
  readonly originals: readonly MediaOriginalInput[];
}

/** Bounded original-only preparation shared by hover previews and durable installation. */
async function prepareUncachedMotionTemplate(
  templateId: MotionTemplateId,
  options: PreparationOptions = {},
  fetcher: TemplateFetcher = fetch,
): Promise<PreparedMotionTemplate> {
  options.signal?.throwIfAborted();
  if (!isMotionTemplateId(templateId)) throw new MotionTemplateError("invalid");
  if (isDesignedTemplateId(templateId)) {
    const project = await prepareDesignedTemplate(templateId, options, (input, init) =>
      fetcher(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        init,
      ),
    );
    return { project, originals: [] };
  }
  const base = `${import.meta.env.BASE_URL}templates/motion/`;
  options.timing?.stage("Download template manifest");
  const preview = options.preview ? MOTION_TEMPLATE_PREVIEW_REVISIONS[templateId] : undefined;
  const revision = preview ?? MOTION_TEMPLATE_ASSET_REVISIONS[templateId];
  const response = await download(
    `${base}${templateId}/${templateId}${preview ? ".preview" : ""}.json${revision ? `?v=${revision}` : ""}`,
    fetcher,
    options.signal,
  );
  const bytes = await boundedResponse(response, 8 * 1024 * 1024, options.signal);
  options.timing?.stage("Parse + validate template");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new MotionTemplateError("invalid");
  }
  const manifest = parseMotionTemplateManifest(parsed, templateId);
  options.timing?.stage("Load + verify media originals");
  const originals: MediaOriginalInput[] = [];
  for (const original of manifest.originals) {
    const result = await download(`${base}${original.file}`, fetcher, options.signal);
    const data = await boundedResponse(result, original.byteLength, options.signal);
    if (data.byteLength !== original.byteLength) throw new MotionTemplateError("integrity");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    options.signal?.throwIfAborted();
    if (`sha256:${digest}` !== original.contentRevision) throw new MotionTemplateError("integrity");
    originals.push({
      originalId: original.originalId,
      contentRevision: original.contentRevision,
      blob: new Blob([data], { type: original.mime }),
    });
  }
  options.signal?.throwIfAborted();
  return { project: manifest.project, originals };
}

/** Verified build assets can be reused by a later open, without caching failures or aborts. */
export async function prepareMotionTemplate(
  templateId: MotionTemplateId,
  options: PreparationOptions = {},
  fetcher: TemplateFetcher = fetch,
): Promise<PreparedMotionTemplate> {
  options.signal?.throwIfAborted();
  if (fetcher !== fetch) return prepareUncachedMotionTemplate(templateId, options, fetcher);
  options.timing?.stage("Acquire validated template source (reuse when cached)");
  const signal = options.signal ?? new AbortController().signal;
  return motionTemplateSources.template(
    templateId,
    signal,
    () => prepareUncachedMotionTemplate(templateId, options, fetcher),
    options.preview && MOTION_TEMPLATE_PREVIEW_REVISIONS[templateId] ? "preview" : "full",
    (options.preview ? MOTION_TEMPLATE_PREVIEW_REVISIONS[templateId] : undefined) ??
      MOTION_TEMPLATE_ASSET_REVISIONS[templateId] ??
      "",
  );
}

/** Install once only after complete validation; previews never call this boundary. */
export async function openMotionTemplate(
  services: Pick<EditorServices, "openMediaProject">,
  templateId: MotionTemplateId,
  options: TemplateLoadOptions = {},
  fetcher: TemplateFetcher = fetch,
): Promise<void> {
  options.signal?.throwIfAborted();
  if (!isMotionTemplateId(templateId)) throw new MotionTemplateError("invalid");
  if (!services.openMediaProject) throw new MotionTemplateError("unsupported");
  const prepared = await prepareMotionTemplate(templateId, options, fetcher);
  options.signal?.throwIfAborted();
  const now = new Date().toISOString();
  await services.openMediaProject(
    { ...prepared.project, id: crypto.randomUUID(), createdAt: now, updatedAt: now },
    prepared.originals,
    options,
  );
}

import.meta.hot?.dispose(() => motionTemplateSources.clear());
