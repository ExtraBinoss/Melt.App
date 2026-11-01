import { createRoot } from "react-dom/client";
import { useLayoutEffect } from "react";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  recordSession,
} from "../../../packages/core/src/index";
import { useTimelapsePreview } from "../../../apps/web/src/components/animation/timelapse/use-timelapse-preview";

export function mountTimelapseMemoryWitness() {
  const image = document.createElement("canvas");
  image.width = image.height = 1024;
  const context = image.getContext("2d")!;
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, 1024, 1024);
  const assets = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => {
      // Distinct originals prevent the renderer's correct content deduplication from
      // turning this fifty-upload workload into two shared texture variants.
      context.fillStyle = `rgb(255, ${i}, 0)`;
      context.fillRect(0, 0, 1024, 1024);
      return [
        String(i),
        {
          id: String(i),
          name: `original-${i}`,
          mime: "image/png",
          width: 1024,
          height: 1024,
          dataUrl: image.toDataURL(),
        },
      ];
    }),
  );
  image.width = image.height = 0;
  const page = createPage({
    id: "memory-page",
    width: 4096,
    height: 2048,
    layers: Object.keys(assets).map((assetId, i) =>
      createLayer("image", {
        id: `layer-${i}`,
        assetId,
        x: i ? (i % 10) * 64 : 0,
        y: i ? Math.floor(i / 10) * 64 : 0,
        width: i ? 64 : 4096,
        height: i ? 64 : 2048,
        effects: i ? [] : [createEffect("brightness")],
      }),
    ),
  });
  const engine = new EditorEngine(createProject({ assets, pages: [page] }));
  let time = 0;
  const recording = recordSession(engine, { now: () => time });
  time = 1000;
  engine.execute({ type: "updateLayers", ids: ["layer-1"], patch: { x: 128 } });
  const spec = recording.stop();
  const host = document.createElement("div");
  document.body.append(host);
  let player: ReturnType<typeof useTimelapsePreview>;
  function Witness() {
    player = useTimelapsePreview(spec, page.id, 1, true);
    useLayoutEffect(() => {
      host.dataset.status = player.status;
    });
    return <div ref={player.viewport} style={{ width: 480, height: 240 }} />;
  }
  const root = createRoot(host);
  root.render(<Witness />);
  return {
    seek: (time: number) => player.controls.current?.seek(time),
    release: async () => {
      await player.controls.current?.release();
      root.unmount();
      host.remove();
    },
    spec,
  };
}
