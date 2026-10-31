import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { useTranslation } from "react-i18next";
import { useHydrated } from "@tanstack/react-router";
import { formatUiError } from "../../state/i18n/errors/format";
import { ImagePlus, Upload, RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { DropdownChevron } from "../../components/shared/DropdownChevron";
import { Throbber } from "../../components/ui/throbber/Throbber";
import { createBrandActivity } from "../../ui/brand/activity";
import type { BrandActivity } from "../../ui/brand/playback";
import { publicHref, sourceTool, type ToolDefinition } from "../catalog";
import { acceptToolFile } from "./input";
import type { WorkspaceProps } from "./types";
function Loading({ activity, label }: { activity: BrandActivity; label: string }) {
  const active = useSyncExternalStore(activity.subscribe, activity.read, activity.read);
  return (
    <div className="tool-loading" data-active={active}>
      <Throbber activity={activity} variant="shimmer" size={52} label={label} />
    </div>
  );
}
export function Converter({ tool }: { tool: ToolDefinition }) {
  const { t } = useTranslation("tools");
  const [Workspace, setWorkspace] = useState<ComponentType<WorkspaceProps> | null>(null);
  const ready = useHydrated();
  const [file, setFile] = useState<File | null>(null),
    [error, setError] = useState<unknown>(null),
    [label, setLabel] = useState("preparing");
  const [host, setHost] = useState<HTMLDivElement | null>(null),
    [dragging, setDragging] = useState(false);
  const activity = useMemo(() => createBrandActivity(), []);
  const input = useRef<HTMLInputElement>(null),
    wanted = useRef<File | null>(null),
    life = useRef({ alive: true, request: 0 });
  const sampleRequest = useRef<AbortController | null>(null),
    dragDepth = useRef(0);
  useEffect(() => {
    life.current.alive = true;
    const current = life.current;
    return () => {
      current.alive = false;
      current.request++;
      sampleRequest.current?.abort();
      activity.set(false);
    };
  }, [activity]);
  const busy = useCallback(
    (source: File, active: boolean, phase?: "prepare" | "export") => {
      if (!life.current.alive || wanted.current !== source) return;
      if (active) setLabel(phase === "export" ? "exporting" : "preparing");
      activity.set(active);
    },
    [activity],
  );
  const choose = useCallback(
    (next: File) => {
      try {
        acceptToolFile(next, sourceTool(tool, next));
      } catch (failure) {
        setError(failure);
        return;
      }
      sampleRequest.current?.abort();
      const request = ++life.current.request;
      wanted.current = next;
      setFile(next);
      setError(null);
      setLabel("preparing");
      activity.set(true);
      if (Workspace) return;
      void import("./ToolWorkspace").then(
        (module) => {
          if (life.current.alive && request === life.current.request)
            setWorkspace(() => module.ToolWorkspace);
        },
        (failure: unknown) => {
          if (life.current.alive && request === life.current.request) {
            setError(failure);
            activity.set(false);
          }
        },
      );
    },
    [Workspace, activity, tool],
  );
  async function sample(media: "image" | "video") {
    sampleRequest.current?.abort();
    const abort = new AbortController();
    sampleRequest.current = abort;
    const request = ++life.current.request;
    setError(null);
    setLabel("loadingEngine");
    activity.set(true);
    try {
      // Flower is the existing locally hosted MDN CC0 clip used by the motion templates.
      const example =
        media === "image"
          ? {
              path: "/benchmark/06-boathouse-1.jpg",
              name: "melt-example.jpg",
              type: "image/jpeg",
              budget: 1024 * 1024,
            }
          : {
              path: "/templates/motion/media/flower.mp4",
              name: "melt-example.mp4",
              type: "video/mp4",
              budget: 2 * 1024 * 1024,
            };
      const response = await fetch(publicHref(example.path), {
        signal: abort.signal,
      });
      if (!response.ok) throw new Error(`The example could not be loaded (${response.status}).`);
      const blob = await response.blob();
      if (blob.size > example.budget) throw new Error("The example exceeds its size budget.");
      if (life.current.alive && request === life.current.request)
        choose(new File([blob], example.name, { type: example.type }));
    } catch (failure) {
      if (!abort.signal.aborted && life.current.alive && request === life.current.request) {
        setError(failure);
        activity.set(false);
      }
    }
  }
  const Icon = ImagePlus;
  const activeTool = file ? sourceTool(tool, file) : tool;
  return (
    <section className="tool-converter" data-ready={ready} aria-label={t("parameters")}>
      <div className="tool-preview-column">
        <div
          className="tool-preview"
          data-dragging={dragging}
          onDragEnter={(event) => {
            event.preventDefault();
            dragDepth.current++;
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (--dragDepth.current <= 0) {
              dragDepth.current = 0;
              setDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            const next = event.dataTransfer.files[0];
            if (next && ready) choose(next);
          }}
        >
          <div className="tool-canvas-host" ref={setHost} />
          {!file && (
            <div className="tool-drop-copy">
              <Icon size={36} strokeWidth={1} />
              <h2>{t("dropFile")}</h2>
              <p>{t("dropHintFile")}</p>
              <Button disabled={!ready} onClick={() => input.current?.click()}>
                <Upload size={14} />
                {t("chooseFile")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button disabled={!ready} variant="ghost" size="sm">
                    {t("sample")}
                    <DropdownChevron />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="center"
                  style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
                >
                  <DropdownMenuItem onSelect={() => void sample("image")}>
                    {t("image")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void sample("video")}>
                    {t("video")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <Loading activity={activity} label={t(label)} />
        </div>
        <div className="tool-file-actions">
          <p>{t("local")}</p>
          {file && (
            <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
              <RotateCcw size={13} />
              {t("replace")}
            </Button>
          )}
        </div>
        <input
          ref={input}
          data-tool-file
          disabled={!ready}
          type="file"
          className="sr-only"
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml,video/*"
          aria-label={t("chooseFile")}
          onChange={(event) => {
            const next = event.target.files?.[0];
            if (next && ready) choose(next);
            event.target.value = "";
          }}
        />
        {error != null && (
          <div className="tool-error" role="alert">
            <strong>{t("error")}</strong>
            <p>
              {error instanceof Error && ["fileTooLarge", "invalidFile"].includes(error.message)
                ? t(error.message)
                : formatUiError(error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => location.reload()}>
              {t("reload")}
            </Button>
          </div>
        )}
      </div>
      <aside className="tool-controls">
        {file && host && Workspace ? (
          <Workspace file={file} tool={activeTool} host={host} onActivity={busy} />
        ) : (
          <div className="tool-start-copy">
            <h2>{t("parameters")}</h2>
            <p>{t(`styles.${tool.style}.summary`)}</p>
            <ol>
              {(t("steps", { returnObjects: true }) as string[]).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        )}
      </aside>
    </section>
  );
}
