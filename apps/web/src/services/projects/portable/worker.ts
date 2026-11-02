import { encodeProject, decodeProject } from "./codec";
import type { Project } from "@musart/core";
import type { MediaOriginalInput } from "../media/model";
export type Request =
  | { kind: "encode"; project: Project; originals: MediaOriginalInput[] }
  | { kind: "decode"; blob: Blob };
export type Result = { blob: Blob } | { project: Project; originals: MediaOriginalInput[] };
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<Request>) => void;
  postMessage: (value: { result?: Result; error?: string }) => void;
};
async function run(data: Request) {
  try {
    scope.postMessage({
      result:
        data.kind === "encode"
          ? { blob: await encodeProject(data.project, data.originals) }
          : await decodeProject(data.blob),
    });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : "Project archive failed.",
    });
  }
}
scope.onmessage = ({ data }) => {
  void run(data);
};
