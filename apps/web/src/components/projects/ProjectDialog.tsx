import { readLibraryPreview } from "./items/links";
import type { LibraryPreviewRequest } from "./items/links";
import { useHydrated } from "@tanstack/react-router";
import { DashboardSurface } from "./dashboard/DashboardSurface";
import {
  dashboardHref,
  isPlainPrimaryClick,
  dialogLinkKeyDown,
} from "../../ui/navigation/activation";
import { atom, useStore } from "jotai";
import { LazyPreferencesDialog, PreferencesHost } from "./preferences/PreferencesHost";
import { LibraryBrowser } from "./items/LibraryBrowser";
import { brand } from "../../ui/brand/config";
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { Throbber } from "../ui/throbber/Throbber";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useMobileLayout } from "../workspace/mobile/use-mobile";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { useLibraryMode } from "./dashboard/library-mode";
import { LibraryToolbar } from "./dashboard/LibraryToolbar";
import { LibraryTransition } from "./dashboard/LibraryTransition";
import { ProjectCreateActions } from "./dashboard/ProjectCreateActions";
import { useTranslation } from "react-i18next";
import type { EditorServices, ProjectSummary } from "../../state/contracts";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { LibrarySidebar } from "./dashboard/LibrarySidebar";
import { MobileLibraryNavigation } from "./dashboard/MobileLibraryNavigation";
import { MeltMark } from "../../ui/brand/MeltMark";
import { CreationDialogHost, StandaloneProjectCreation } from "./creation/ProjectCreationDialog";
const ProjectGallery = lazy(() =>
  import("./gallery/ProjectGallery").then((module) => ({ default: module.ProjectGallery })),
);
import { TemplateGallery } from "./templates/TemplateGallery";
import { createProjectFromTemplate } from "../../services/projects/templates/catalog";
import { beginProjectOpening, currentProjectOpening } from "./opening/controller";
import type { TemplateLoadOptions } from "../../services/projects/templates/motion/loader";
import { isMotionTemplateId } from "../../services/projects/templates/motion/identity";
const LandingPage = lazy(() =>
  import("./landing/LandingPage").then((module) => ({ default: module.LandingPage })),
);
import "./creation/messages";
import "./dashboard/messages";
import "./dashboard/dashboard.css";

export type TaskRunner = (task: () => void | Promise<void>, success?: string) => Promise<boolean>;
export interface ProjectDialogProps {
  onReplayTutorial?: () => void;
  services: EditorServices;
  projectName?: string;
  welcome?: boolean;
  projectId?: string;
  origin?: TemplateLoadOptions["expectedOrigin"];
  onClose: () => void;
  onTask: TaskRunner;
  initialView?: "projects" | "templates" | "newProject" | "settings" | "settingsEditor";
  showLanding?: boolean;
  onHome?: () => void;
  onPrepareEditor?: () => Promise<void>;
  standalone?: boolean;
}
/** The same dashboard works before the first document and above an open project. */
export function ProjectDialog(props: ProjectDialogProps) {
  return props.initialView === "settings" || props.initialView === "settingsEditor" ? (
    <LazyPreferencesDialog
      onClose={props.onClose}
      onReplayTutorial={props.onReplayTutorial}
      initialSection={props.initialView === "settingsEditor" ? "editor" : "general"}
    />
  ) : props.initialView === "newProject" && !props.welcome ? (
    <StandaloneProjectCreation {...props} />
  ) : (
    <ProjectDashboard {...props} />
  );
}
function ProjectDashboard({
  services,
  projectName,
  projectId,
  origin,
  onClose,
  onTask,
  initialView = "projects",
  welcome = false,
  showLanding = true,
  onHome,
  onPrepareEditor,
  standalone = false,
}: ProjectDialogProps) {
  const { t } = useTranslation();
  const mobile = useMobileLayout();
  const headingId = useId();
  const [requestedPreview] = useState<LibraryPreviewRequest | null>(() =>
    typeof location === "undefined" ? null : readLibraryPreview(),
  );
  const hydrated = useHydrated();
  const linkedPreview = hydrated ? requestedPreview : null;
  const [landing, setLanding] = useState(
    Boolean(showLanding && welcome && initialView !== "newProject"),
  );
  const [selectedView, setView] = useState<"projects" | "templates" | null>(null);
  const view =
    selectedView ??
    (linkedPreview
      ? linkedPreview.kind === "template"
        ? "templates"
        : "projects"
      : initialView === "templates"
        ? "templates"
        : "projects");
  const [queries, setQueries] = useState({ projects: "", templates: "" });
  const [libraryMode, setLibraryMode] = useLibraryMode();
  const [projectHints, setProjectHints] = useState<ProjectSummary[]>([]);
  const [creation] = useState(() => atom(initialView === "newProject"));
  const creationTrigger = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const BrandTrigger = busy ? "button" : "a";
  const [preferences] = useState(() => atom(false));
  const preferenceStore = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const librarySurface = useRef<HTMLDivElement>(null);
  const libraryContent = useRef<HTMLDivElement>(null);
  const scope = useRef({ alive: true, pending: false });
  const templateRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const current = scope.current;
    current.alive = true;
    return () => {
      current.alive = false;
      templateRequest.current?.abort();
    };
  }, []);
  useEffect(
    () => () => templateRequest.current?.abort(),
    [origin?.projectId, origin?.pageId, origin?.revision, projectId, welcome],
  );
  const perform = useCallback(
    async (task: () => void | Promise<void>, success?: string) => {
      const current = scope.current;
      if (current.pending || !current.alive) return false;
      current.pending = true;
      setBusy(true);
      const opening = currentProjectOpening();
      if (opening) await opening.painted();
      if (!current.alive) {
        opening?.close();
        current.pending = false;
        return false;
      }
      const ok = await onTask(task, success);
      if (ok) opening?.installed();
      else opening?.close();
      current.pending = false;
      if (!current.alive) return false;
      setBusy(false);
      return ok;
    },
    [onTask],
  );
  function complete(task: () => void | Promise<void>) {
    if (scope.current.pending || !scope.current.alive) return;
    const request = templateRequest.current;
    beginProjectOpening(request ? () => request.abort() : undefined);
    void perform(task).then((ok) => {
      if (ok && scope.current.alive) onClose();
    });
  }
  function custom() {
    if (!scope.current.pending && scope.current.alive) {
      creationTrigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      preferenceStore.set(creation, true);
    }
  }
  function home() {
    if (!scope.current.pending && scope.current.alive) {
      if (onHome) onHome();
      else setLanding(true);
    }
  }
  function changeView(value: string) {
    if (
      scope.current.pending ||
      !scope.current.alive ||
      (value !== "projects" && value !== "templates")
    )
      return;
    setView(value);
    preferenceStore.set(creation, false);
  }
  function chooseTemplate(id: string) {
    if (scope.current.pending || !scope.current.alive) return;
    const request = new AbortController();
    templateRequest.current?.abort();
    templateRequest.current = request;
    setTemplateLoading(isMotionTemplateId(id));
    complete(async () => {
      try {
        // Begin editor code only after an explicit open, alongside validated installation.
        await Promise.all([
          onPrepareEditor?.(),
          createProjectFromTemplate(services, id, {
            signal: request.signal,
            expectedOrigin: origin,
          }),
        ]);
      } catch (error) {
        request.abort();
        throw error;
      } finally {
        if (templateRequest.current === request) {
          templateRequest.current = null;
          if (scope.current.alive) setTemplateLoading(false);
        }
      }
    });
  }
  if (landing)
    return (
      <Suspense fallback={<Throbber size={28} label={t("brand:loading")} />}>
        <LandingPage
          onCreate={() => setLanding(false)}
          onTemplate={chooseTemplate}
          busy={busy}
          onCancel={templateLoading ? () => templateRequest.current?.abort() : undefined}
        />
      </Suspense>
    );
  return (
    <LibraryBrowser
      services={services}
      busy={busy}
      linkedPreview={linkedPreview}
      onOpenLinked={(item) => {
        if (item.kind === "template") chooseTemplate(item.id);
        else
          complete(async () => {
            await Promise.all([onPrepareEditor?.(), services.openProject(item.id)]);
          });
      }}
      onLinkedError={(error) => {
        void onTask(() => {
          throw error;
        });
      }}
    >
      <Dialog
        open
        modal={!standalone}
        onOpenChange={(open) => {
          if (
            !open &&
            !welcome &&
            !busy &&
            !preferenceStore.get(preferences) &&
            !preferenceStore.get(creation)
          )
            onClose();
        }}
      >
        <DashboardSurface
          standalone={standalone}
          titleId={`${headingId}-title`}
          descriptionId={`${headingId}-description`}
          closeLabel={t("close")}
          showCloseButton={!welcome && !busy}
          onEscapeKeyDown={(event) => {
            if (
              welcome ||
              busy ||
              preferenceStore.get(preferences) ||
              preferenceStore.get(creation)
            )
              event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (
              welcome ||
              busy ||
              preferenceStore.get(preferences) ||
              preferenceStore.get(creation)
            )
              event.preventDefault();
          }}
          data-welcome={welcome || undefined}
          className="floating-panel project-dashboard translate-x-0 translate-y-0"
        >
          <div className="dashboard-sidebar">
            <Button
              variant="ghost"
              className="dashboard-brand"
              aria-label={t("dashboard:home")}
              disabled={busy}
              asChild
            >
              <BrandTrigger
                type={busy ? "button" : undefined}
                href={busy ? undefined : dashboardHref}
                role="button"
                onKeyDown={dialogLinkKeyDown}
                aria-disabled={busy || undefined}
                onClick={(event) => {
                  if (busy) {
                    event.preventDefault();
                    return;
                  }
                  if (!isPlainPrimaryClick(event)) return;
                  event.preventDefault();
                  home();
                }}
              >
                <MeltMark size={32} interactive />
                <span>{brand.name}</span>
              </BrandTrigger>
            </Button>
            <LibrarySidebar
              services={services}
              onTask={onTask}
              view={view}
              busy={busy}
              onViewChange={changeView}
              onChooseRecent={(id) =>
                complete(async () => {
                  await Promise.all([onPrepareEditor?.(), services.openProject(id)]);
                })
              }
              onPreferences={() => preferenceStore.set(preferences, true)}
            />
          </div>
          <div ref={librarySurface} className="dashboard-main">
            <DialogHeader className="dashboard-header">
              <div className="dashboard-header-line">
                <Button
                  variant="ghost"
                  className="dashboard-home"
                  aria-label={t("dashboard:backHomeLabel")}
                  disabled={busy}
                  onClick={home}
                >
                  <ArrowLeft size={15} />
                  {t("dashboard:backHome")}
                </Button>
              </div>
              <DialogTitle
                {...(standalone ? { id: `${headingId}-title` } : {})}
                className="sr-only"
              >
                {t("dashboard:title")}
              </DialogTitle>
              <DialogDescription
                {...(standalone ? { id: `${headingId}-description` } : {})}
                className="sr-only"
              >
                {t("dashboard:description")}
              </DialogDescription>
            </DialogHeader>
            <div className="dashboard-body">
              <ScrollShadow className="dashboard-list-scroll" surface="var(--background)">
                <section aria-labelledby={headingId} className="dashboard-pane scrollable-panel">
                  <div className="dashboard-pane-content">
                    <div className="dashboard-intro">
                      <div>
                        <h2 id={headingId}>
                          {t(
                            view === "projects" && projectName && !welcome
                              ? "dashboard:projectHeading"
                              : "dashboard:question",
                          )}
                        </h2>
                        <p>
                          {t(
                            view === "projects"
                              ? "dashboard:projectsHint"
                              : "dashboard:description",
                          )}
                        </p>
                      </div>
                      <ProjectCreateActions
                        label={t(view === "projects" ? "dashboard:new" : "dashboard:custom")}
                        disabled={busy}
                        onCreate={custom}
                        onImport={() => fileRef.current?.click()}
                      />
                    </div>
                    <LibraryToolbar
                      services={services}
                      view={view}
                      query={queries[view]}
                      onQueryChange={(query) =>
                        setQueries((current) => ({ ...current, [view]: query }))
                      }
                      mode={libraryMode}
                      onModeChange={setLibraryMode}
                      projects={projectHints}
                      disabled={busy}
                    />
                    <div ref={libraryContent} className="dashboard-grid-stage">
                      <AnimatePresence initial={false}>
                        <LibraryTransition key={view}>
                          {view === "projects" ? (
                            <Suspense fallback={<Throbber size={28} label={t("brand:loading")} />}>
                              <ProjectGallery
                                services={services}
                                activeProjectId={projectId}
                                onTask={perform}
                                busy={busy}
                                onOpen={() => {
                                  if (scope.current.alive) onClose();
                                }}
                                onCreate={custom}
                                onPrepareEditor={onPrepareEditor}
                                query={queries.projects}
                                hideSearch
                                mode={libraryMode}
                                onProjectsLoaded={setProjectHints}
                              />
                            </Suspense>
                          ) : (
                            <TemplateGallery
                              busy={busy}
                              onChoose={chooseTemplate}
                              onCancel={
                                templateLoading ? () => templateRequest.current?.abort() : undefined
                              }
                              query={queries.templates}
                              mode={libraryMode}
                              hideToolbar
                            />
                          )}
                        </LibraryTransition>
                      </AnimatePresence>
                    </div>
                  </div>
                </section>
              </ScrollShadow>
            </div>
            {mobile && (
              <MobileLibraryNavigation
                view={view}
                busy={busy}
                preferences={preferences}
                surface={librarySurface}
                content={libraryContent}
                onViewChange={changeView}
                onPreferences={() => preferenceStore.set(preferences, true)}
              />
            )}
          </div>
          <CreationDialogHost
            state={creation}
            trigger={creationTrigger}
            busy={busy}
            onCreate={(options) => complete(() => services.createProject(options))}
          />
          <PreferencesHost state={preferences} />
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept=".musart,.json,application/json"
            aria-label={t("dashboard:import")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) complete(() => services.openPortable(file));
              event.target.value = "";
            }}
          />
        </DashboardSurface>
      </Dialog>
    </LibraryBrowser>
  );
}
