import { getStudioViewport } from "../../ui/studio/framing/viewport";
import { installExactCanvasTarget } from "./exact-canvas-target";
import { videoNeedsWebGL } from "@musart/render/renderer-policy";
import { SpatialControlsSlot } from "../spatial/SpatialControlsSlot";
import type { EnginePort } from "@musart/core";
import { CanvasPreparation } from "./CanvasPreparation";
import { Component, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  LinearSRGBColorSpace,
  NoToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  WebGPURenderer,
} from "three/webgpu";
import { useTranslation } from "react-i18next";
import type { SceneController } from "../session/scene-controller";
import type { FontResolver, MediaSourceResolver } from "@musart/render";
import { useRenderMetrics } from "../../state/session/render-metrics";
import { PlaneResources } from "./plane-resources";
import { useVideoBackend } from "./use-video-backend";
import { FiberTimerClock } from "./fiber-timer";
import { DrawingDensity } from "./drawing-density";
import { watchDisplayDensity } from "./display-density";
import { createRendererErrorReporter } from "./error-reporting";
import { errorDiagnostics } from "../../components/notifications/diagnostics";
import { formatUiError } from "../../state/i18n/errors/format";
import "../../state/i18n/errors/messages";
import "./loading.css";

export interface SceneProps {
  engine?: EnginePort;
  controller: SceneController;
  onError?: (message: string, details?: string) => void;
  zoom?: number;
  fontResolver?: FontResolver;
  mediaResolverFor?: (projectId: string) => MediaSourceResolver;
}
export async function makeRenderer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  videoSources = false,
): Promise<WebGPURenderer> {
  const forceWebGL = videoSources && (await videoNeedsWebGL());
  function create(forceWebGL = false) {
    if (canvas instanceof HTMLCanvasElement)
      canvas.dataset.rendererInstances = String(Number(canvas.dataset.rendererInstances ?? 0) + 1);
    const renderer = new WebGPURenderer({
      canvas,
      alpha: true,
      antialias: false,
      ...(forceWebGL ? { forceWebGL: true } : {}),
    });
    installExactCanvasTarget(renderer, canvas);
    return renderer;
  }
  let renderer = create(forceWebGL);
  try {
    await renderer.init();
  } catch (error) {
    await renderer.dispose();
    if (forceWebGL) throw error;
    renderer = create(true);
    try {
      await renderer.init();
    } catch (error) {
      await renderer.dispose();
      throw error;
    }
  }
  if (import.meta.env.DEV)
    console.info("[Melt renderer]", {
      surface: "canvas",
      videoSources,
      backend:
        renderer.backend && "isWebGLBackend" in renderer.backend && renderer.backend.isWebGLBackend
          ? "webgl"
          : "webgpu",
    });
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setClearColor(0, 0);
  return renderer;
}
export function CompositionPlane({
  engine,
  controller,
  onError,
  zoom = 1,
  fontResolver,
  mediaResolverFor,
  density: suppliedDensity,
}: SceneProps & { density?: DrawingDensity }) {
  const density = useMemo(() => suppliedDensity ?? new DrawingDensity(), [suppliedDensity]);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  const reportError = useMemo(
    () => createRendererErrorReporter(engine, () => onErrorRef.current),
    [engine],
  );
  const invalidate = useThree((state) => state.invalidate);
  const setDpr = useThree((state) => state.setDpr);
  const clock = useThree((state) => state.clock);
  useEffect(() => (clock instanceof FiberTimerClock ? clock.retain(document) : undefined), [clock]);
  const renderer = useThree((state) => state.gl) as unknown as WebGPURenderer;
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera) as OrthographicCamera;
  const resources = useMemo(
    () =>
      new PlaneResources(
        renderer,
        fontResolver,
        undefined,
        mediaResolverFor,
        controller.holdPlayback,
      ),
    [renderer, fontResolver, mediaResolverFor, controller],
  );
  useFrame(() => {
    try {
      density.prepare(renderer);
      // Own Fiber's final display draw so RAF errors reach the same copyable notice
      // as asynchronous composition failures, without aborting the shared frame loop.
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    } catch (error) {
      resources.report(error, true);
    }
  }, 1);
  useEffect(() => {
    if (!engine) return;
    const viewport = getStudioViewport(engine);
    const update = () => {
      const value = viewport.read(),
        page = controller.read().page;
      try {
        resources.setViewport(value?.pageId === page.id ? value.displayRegion : undefined);
      } catch (error) {
        resources.report(error);
      }
    };
    const stop = viewport.subscribe(update);
    update();
    return stop;
  }, [engine, controller, resources]);
  useEffect(() => {
    const presenter = controller.presentation.acquire();
    const fontPresenter = controller.fontPresentation.acquire();
    let release: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let stopFonts: (() => void) | undefined;
    const cleanup = () => {
      try {
        unsubscribe?.();
        stopFonts?.();
      } finally {
        try {
          release?.();
        } finally {
          presenter.release();
          fontPresenter.release();
        }
      }
    };
    const update = () => {
      const frame = controller.read();
      const { page, assets, presentation, motionFrame, playback } = frame;
      try {
        resources.submit(page, assets, presentation, motionFrame, playback, frame);
      } catch (error) {
        resources.report(error);
      }
    };
    try {
      release = resources.activate(
        scene,
        camera,
        invalidate,
        reportError,
        (scale, width, height) => density.apply(scale, setDpr, width, height),
        presenter,
        fontPresenter,
      );
      unsubscribe = controller.subscribe(update);
      let fontTicket = controller.fontPresentation.read().ticket;
      stopFonts = controller.fontPresentation.subscribe(() => {
        const state = controller.fontPresentation.read();
        if (state.status !== "pending" || !state.ticket || state.ticket === fontTicket) return;
        fontTicket = state.ticket;
        update();
      });
      update();
      return cleanup;
    } catch (error) {
      cleanup();
      void resources
        .dispose()
        .catch((failure: unknown) =>
          reportError(formatUiError(failure), errorDiagnostics(failure)),
        );
      throw error;
    }
  }, [resources, scene, camera, invalidate, controller, setDpr, density, reportError]);
  useEffect(
    () =>
      watchDisplayDensity(zoom, (density) => {
        try {
          resources.setDensity(density);
        } catch (error) {
          resources.report(error);
        }
      }),
    [zoom, resources],
  );
  return <primitive object={resources.mesh} dispose={null} />;
}
class GpuBoundary extends Component<
  {
    children: ReactNode;
    onError?: (message: string, details?: string) => void;
    fallback: string;
    describeError: (message: string) => string;
  },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError?.(this.props.describeError(error.message), errorDiagnostics(error));
  }
  render() {
    if (this.state.error)
      return (
        <div className="gpu-error" role="alert">
          {this.props.fallback}
        </div>
      );
    return this.props.children;
  }
}
export const EditorScene = memo(function EditorScene({
  engine,
  controller,
  onError,
  zoom = 1,
  fontResolver,
  mediaResolverFor,
}: SceneProps) {
  const [{ page }] = useState(() => controller.read());
  const videoBackend = useVideoBackend(controller, engine);
  const density = useMemo(() => new DrawingDensity(), []);
  const reportError = useMemo(
    () => createRendererErrorReporter(engine, () => onError),
    [engine, onError],
  );
  const { t } = useTranslation();
  const element = useRef<HTMLDivElement>(null);
  const preparing = useMemo(
    () => ({
      read: () => {
        const canvas = element.current?.querySelector("canvas");
        const { page, presentation } = controller.read();
        return (
          !canvas ||
          canvas.dataset.presentationReady !== "true" ||
          canvas.dataset.pageId !== page.id ||
          Boolean(presentation && canvas.dataset.projectId !== presentation.origin.projectId)
        );
      },
      subscribe: (listener: () => void) => {
        const presentation = controller.presentation.subscribe(listener);
        const scene = controller.subscribe(listener);
        return () => {
          presentation();
          scene();
        };
      },
    }),
    [controller],
  );
  useEffect(() => {
    if (!engine) return;
    const viewport = getStudioViewport(engine);
    const update = () => {
      const root = element.current,
        value = viewport.read(),
        page = controller.read().page;
      if (!root) return;
      const region = value?.pageId === page.id ? value.displayRegion : null;
      root.style.left = region ? `${region.x}px` : "";
      root.style.top = region ? `${region.y}px` : "";
      root.style.width = region ? `${region.width}px` : "";
      root.style.height = region ? `${region.height}px` : "";
    };
    const stop = viewport.subscribe(update);
    update();
    return stop;
  }, [engine, controller]);
  useRenderMetrics(element);
  return (
    <GpuBoundary
      onError={reportError}
      fallback={t("errors:gpuUnavailable")}
      describeError={(message) => t("errors:gpuError", { message })}
    >
      <div className="editor-gpu-scene" ref={element}>
        <Canvas
          key={videoBackend ? "video-exact" : "graphics-exact"}
          orthographic
          frameloop="demand"
          shadows={{ enabled: false, type: PCFShadowMap }}
          resize={{ offsetSize: true }}
          dpr={density.bounds}
          flat
          linear
          camera={{
            position: [0, 0, 10],
            zoom: 1,
            near: 0.1,
            far: 100,
            left: -page.width / 2,
            right: page.width / 2,
            top: page.height / 2,
            bottom: -page.height / 2,
            manual: true,
          }}
          gl={async (props) => makeRenderer(props.canvas as HTMLCanvasElement, videoBackend)}
          style={{ width: "100%", height: "100%" }}
        >
          {engine && <SpatialControlsSlot engine={engine} controller={controller} />}
          <CompositionPlane
            engine={engine}
            controller={controller}
            onError={reportError}
            zoom={zoom}
            fontResolver={fontResolver}
            mediaResolverFor={mediaResolverFor}
            density={density}
          />
        </Canvas>
        <CanvasPreparation activity={preparing} />
      </div>
    </GpuBoundary>
  );
});
