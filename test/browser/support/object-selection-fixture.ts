import type { Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import type {
  SelectionRequest,
  SelectionResponse,
} from "../../../apps/web/src/services/selection/selection";
/** Native UI transactions with bounded deterministic ML outputs; never loads model weights. */
export async function objectSelectionFixture(page: Page, delay = 40) {
  await page.addInitScript(
    ({ delay }) => {
      localStorage.setItem("musart.editor-tutorial.v1", "done");
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
      const NativeWorker = window.Worker;
      class ModelWorker {
        onmessage: ((event: MessageEvent<SelectionResponse>) => void) | null = null;
        onerror = null;
        onmessageerror = null;
        private timers = new Set<ReturnType<typeof setTimeout>>();
        private alive = true;
        postMessage(request: SelectionRequest) {
          const types = JSON.parse(
            document.documentElement.dataset.modelRequests ?? "[]",
          ) as string[];
          types.push(request.type);
          document.documentElement.dataset.modelRequests = JSON.stringify(types);
          if (request.type === "prompt")
            document.documentElement.dataset.objectPrompt = JSON.stringify(request.prompt);
          if (request.type === "background") {
            this.onmessage?.({
              data: {
                id: request.id,
                progress: {
                  file: "onnx/model_fp16.onnx",
                  status: "progress",
                  loaded: 49242266,
                  total: 98484532,
                },
              },
            } as MessageEvent<SelectionResponse>);
            const prepared = setTimeout(() => {
              this.timers.delete(prepared);
              if (this.alive)
                this.onmessage?.({
                  data: {
                    id: request.id,
                    progress: { file: "onnx/model_fp16.onnx", status: "done" },
                  },
                } as MessageEvent<SelectionResponse>);
            }, delay / 2);
            this.timers.add(prepared);
          }
          const timer = setTimeout(() => {
            void this.reply(request);
            this.timers.delete(timer);
          }, delay);
          this.timers.add(timer);
        }
        private async reply(request: SelectionRequest) {
          if (!this.alive) return;
          if (request.type === "prepare") {
            this.onmessage?.({
              data: { id: request.id, result: null },
            } as MessageEvent<SelectionResponse>);
            return;
          }
          if (request.type !== "background" && request.type !== "prompt")
            throw Error("Unexpected selection request");
          const prompt = request.type === "prompt" ? request.prompt : { points: [] };
          if (prompt.points.some((point) => point.x > 80)) {
            this.onmessage?.({
              data: { id: request.id, error: "Native decoder failure" },
            } as MessageEvent<SelectionResponse>);
            return;
          }
          const data = new Uint8ClampedArray(96 * 64 * 4),
            exclude = prompt.points.some((point) => point.label === 0);
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 96; x++) {
              const selected =
                request.type === "background"
                  ? x < 64
                  : prompt.box
                    ? x >= prompt.box.x &&
                      x <= prompt.box.right &&
                      y >= prompt.box.y &&
                      y <= prompt.box.bottom
                    : x >= 32 && (!exclude || x < 64);
              const i = (y * 96 + x) * 4;
              data[i] =
                data[i + 1] =
                data[i + 2] =
                  request.type === "background" ? (selected ? 255 : 0) : 255;
              data[i + 3] = request.type === "background" || selected ? 255 : 0;
            }
          let result: SelectionResponse;
          if (request.type === "background") {
            const canvas = new OffscreenCanvas(96, 64);
            canvas.getContext("2d")!.putImageData(new ImageData(data, 96, 64), 0, 0);
            const blob = await canvas.convertToBlob({ type: "image/png" });
            canvas.width = canvas.height = 1;
            result = { id: request.id, result: { blob, width: 96, height: 64 } };
          } else result = { id: request.id, result: { data, width: 96, height: 64 } };
          if (this.alive) this.onmessage?.({ data: result } as MessageEvent<SelectionResponse>);
        }
        terminate() {
          this.alive = false;
          for (const timer of this.timers) clearTimeout(timer);
          this.timers.clear();
        }
      }
      window.Worker = new Proxy(NativeWorker, {
        construct(Target, args: ConstructorParameters<typeof Worker>) {
          return String(args[0]).includes("selection.worker")
            ? new ModelWorker()
            : new Target(...args);
        },
      });
    },
    { delay },
  );
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><path fill="#e03040" d="M0 0h32v64H0z"/><path fill="#30c080" d="M32 0h32v64H32z"/><path fill="#3050e0" d="M64 0h32v64H64z"/></svg>';
  const project = createProject({
    pages: [
      createPage({
        width: 256,
        height: 192,
        background: "#00000000",
        layers: [
          createLayer("image", {
            id: "other-image",
            assetId: "source",
            x: 228,
            y: 0,
            width: 24,
            height: 24,
          }),
          createLayer("image", {
            id: "object-image",
            name: "Chosen layer",
            assetId: "source",
            x: 32,
            y: 32,
            width: 192,
            height: 128,
          }),
        ],
      }),
    ],
    assets: {
      source: {
        id: "source",
        name: "Regions",
        mime: "image/svg+xml",
        width: 96,
        height: 64,
        dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      },
    },
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["object-image"]);
  }, project);
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      data?.rendererReady === "true" &&
      data.projectId === window.musart!.session().projectId &&
      Number(data.canonicalRevision) === window.musart!.session().revision
    );
  });
}
