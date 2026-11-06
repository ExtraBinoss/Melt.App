import { BackgroundStatus } from "../../../apps/web/src/components/toolbar/segmentation/BackgroundStatus";
import { createRoot } from "react-dom/client";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
} from "../../../packages/core/src/index";
import { DepthPreparationController } from "../../../apps/web/src/services/depth/controller";
import { DepthClient } from "../../../apps/web/src/services/depth/client";
import { registerDepthPreparation } from "../../../apps/web/src/services/depth/service";
import { ToolSettings } from "../../../apps/web/src/components/toolbar/ToolSettings";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip";
import type { EditorServices } from "../../../apps/web/src/state/contracts";
import { createVideoFixture } from "./video-source-witness";
import { probeVideoOriginal } from "../../../packages/render/src/index";
import "../../../apps/web/src/components/properties/effects/library-messages";
import "../../../apps/web/src/styles/global.css";
import { i18n } from "../../../apps/web/src/state/i18n";
/** Real video poster worker + native brand engine; inference is held to inspect every UI phase. */
export async function mountDepthUI() {
  await i18n.changeLanguage("en");
  const fixture = await createVideoFixture();
  const asset = {
    ...(await probeVideoOriginal(fixture.blob)),
    id: "source",
    kind: "video" as const,
    originalId: "source-original",
    contentRevision: "one",
    byteLength: fixture.blob.size,
    mime: fixture.blob.type,
    name: "Video subject",
  };
  const engine = new EditorEngine(
    createProject({
      assets: { source: asset },
      pages: [createPage({ layers: [createLayer("video", { id: "photo", assetId: "source" })] })],
    }),
  );
  registerDepthPreparation(engine, {
    store: {
      loadMediaOriginal: async () => fixture.blob,
      prepareSaveCurrent: async () => {
        throw Error("Unused in a cancelled UI witness");
      },
      persistPrepared: async () => engine.getSnapshot().project,
    },
  });
  const client = new DepthClient();
  client.model.prepare = async () => {
    client.model.ready();
  };
  let rejectJob: ((reason: unknown) => void) | undefined;
  client.generate = async (_original, _video, progress) => {
    progress(0.25);
    return new Promise((_resolve, reject) => {
      rejectJob = reject;
    });
  };
  const cancel = client.cancel.bind(client);
  client.cancel = () => {
    cancel();
    rejectJob?.(new DOMException("Cancelled", "AbortError"));
    rejectJob = undefined;
  };
  const port = new DepthPreparationController(engine, client);
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(
    <TooltipProvider>
      <div id="background-working" style={{ marginLeft: 50, marginTop: 80, width: 260 }}>
        <BackgroundStatus
          busy
          completed={false}
          label="Background removal"
          completedLabel="Done"
          step="3/3"
        />
      </div>
      <button
        onClick={() =>
          engine.execute({
            type: "updateLayers",
            ids: ["photo"],
            patch: { effects: [createEffect("depth-anything")] },
          })
        }
      >
        Add depth effect
      </button>
      <ToolSettings
        services={{ depthPreparation: port } as EditorServices}
        onTask={async (task) => {
          await task();
          return true;
        }}
      />
    </TooltipProvider>,
  );
}
