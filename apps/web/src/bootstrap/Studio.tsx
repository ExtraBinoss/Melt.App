import { preloadEditor } from "./preload";
import { MeltMark } from "../ui/brand/MeltMark";
import { StudioPreparation } from "./StudioPreparation";
import { useTranslation } from "react-i18next";
import "./messages";
import "./loading.css";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ProjectDialog } from "../components/projects/ProjectDialog";
import { TooltipProvider } from "../components/ui/tooltip";
import { useStudioSession } from "./use-studio-session";
import { useOpeningProjectName } from "./use-opening-project-name";
import { formatUiError } from "../state/i18n/errors/format";
import type { StudioRouting } from "../state/contracts";
import { createProjectFromTemplate } from "../services/projects/templates/catalog";
const loadApp = () => import("../App");
const prepareEditor = preloadEditor;
const App = lazy(() => loadApp().then((module) => ({ default: module.App })));
export function Studio({ routing }: { routing?: StudioRouting } = {}) {
  const { t } = useTranslation("startup");
  const [error, setError] = useState("");
  const [automation] = useState(
    () =>
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).get("automation") === "1",
  );
  const { runtime, services, ensureRuntime, publishRuntime, peek } = useStudioSession(
    routing,
    (failure) => setError(formatUiError(failure)),
  );
  const openingProjectName = useOpeningProjectName(
    routing?.view === "editor" ? routing.projectId : undefined,
    runtime?.engine.getSnapshot().project,
  );
  const initialRouting = useRef(routing);
  const cancelBackgroundHold = useRef<(() => void) | null>(null);
  const [editorOpened, setEditorOpened] = useState(routing?.view !== "dashboard");
  if (routing?.view === "editor" && !editorOpened) setEditorOpened(true);
  useEffect(() => {
    let disposed = false;
    const report = (error: unknown) => {
      if (!disposed) setError(formatUiError(error));
    };
    const initial = initialRouting.current;
    if (initial?.view === "dashboard") return;
    const controller = new AbortController();
    const editorCode = initial?.view === "editor" ? prepareEditor() : undefined;
    // Keep rejection observed while local project preparation is still pending.
    void editorCode?.catch(() => {});
    void ensureRuntime()
      .then(async (result) => {
        if (disposed) {
          return;
        }
        if (initial?.templateId) {
          await Promise.all([
            editorCode,
            createProjectFromTemplate(result.services, initial.templateId, {
              signal: controller.signal,
            }),
          ]);
          if (disposed) return;
          initial.navigate("editor", result.engine.getSnapshot().project.id);
        }
        await editorCode;
        if (!disposed) publishRuntime(result);
      })
      .catch(report);
    return () => {
      disposed = true;
      controller.abort();
      cancelBackgroundHold.current?.();
    };
  }, [ensureRuntime, publishRuntime]);
  useEffect(() => {
    if (initialRouting.current?.view === "dashboard" && routing?.view === "editor" && !runtime)
      void ensureRuntime()
        .then(publishRuntime)
        .catch((failure: unknown) => setError(formatUiError(failure)));
  }, [routing?.view, runtime, ensureRuntime, publishRuntime]);
  useEffect(() => () => cancelBackgroundHold.current?.(), []);
  useEffect(() => {
    if (!runtime || !automation) return;
    let active = true,
      detach: (() => void) | undefined;
    void import("../services/automation/automation")
      .then((module) => {
        if (active) detach = module.attachAutomation(runtime.engine, runtime.services);
      })
      .catch((failure: unknown) => {
        if (active) setError(formatUiError(failure));
      });
    return () => {
      active = false;
      detach?.();
    };
  }, [runtime, automation]);
  useEffect(() => {
    if (
      !runtime ||
      !routing?.projectId ||
      runtime.engine.getSnapshot().project.id === routing.projectId
    )
      return;
    void runtime.services
      .openProject(routing.projectId)
      .catch((failure: unknown) => setError(formatUiError(failure)));
  }, [runtime, routing?.projectId]);
  return (
    <>
      {!editorOpened && routing ? (
        <TooltipProvider>
          <ProjectDialog
            services={services}
            standalone
            welcome
            showLanding={false}
            initialView="templates"
            onHome={() => routing.navigate("home")}
            onPrepareEditor={async () => {
              const code = prepareEditor();
              void code.catch(() => {});
              try {
                const current = await ensureRuntime();
                const { createRenderActivity } =
                  await import("../services/session/render-activity");
                cancelBackgroundHold.current?.();
                cancelBackgroundHold.current = createRenderActivity(
                  current.engine,
                ).holdUntilPresented();
                await code;
              } catch (error) {
                cancelBackgroundHold.current?.();
                throw error;
              }
            }}
            onClose={() => {
              const current = peek();
              if (current) routing.navigate("editor", current.engine.getSnapshot().project.id);
            }}
            onTask={async (task) => {
              try {
                await task();
                return true;
              } catch (failure) {
                cancelBackgroundHold.current?.();
                setError(formatUiError(failure));
                return false;
              }
            }}
          />
        </TooltipProvider>
      ) : runtime ? (
        <Suspense fallback={<StudioPreparation projectName={openingProjectName} />}>
          <App
            engine={runtime.engine}
            services={runtime.services}
            welcome={runtime.welcome}
            routing={routing}
          />
        </Suspense>
      ) : error ? (
        <div className="studio-loading">
          <MeltMark size={52} />
        </div>
      ) : (
        <StudioPreparation projectName={openingProjectName} />
      )}
      {error && (
        <div className="runtime-error" role="alert">
          <span>{error}</span>
          <button type="button" aria-label={t("dismiss")} onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
    </>
  );
}
