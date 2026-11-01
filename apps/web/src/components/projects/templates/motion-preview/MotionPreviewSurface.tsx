import { PreviewPlayer, PreviewProgress } from "./PreviewPlayer";
import { bindVisiblePreview } from "../../../shared/preview/visible-preview";
import { bindHoverPreview } from "../../../shared/preview/hover-preview";
import { createBrandActivity } from "../../../../ui/brand/activity";
import { BrandStatus } from "../../../../ui/brand/BrandStatus";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, Pause } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PreviewOwner, PreviewStatus } from "./runtime";
import type { ReactNode } from "react";
import "./messages";
import "./motion-preview.css";

/** Native intent listeners keep the gallery and landing page out of the frame clock. */
export function MotionPreviewSurface({
  startPreview,
  poster,
  nativeVideo = false,
  disabled = false,
  autoplay = false,
  className = "",
  children,
}: {
  startPreview: (
    host: HTMLElement,
    onStatus: (status: PreviewStatus, error?: unknown) => void,
  ) => PreviewOwner;
  poster?: string;
  nativeVideo?: boolean;
  children?: ReactNode;
  disabled?: boolean;
  autoplay?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("motionPreview");
  const root = useRef<HTMLSpanElement>(null);
  const viewport = useRef<HTMLSpanElement>(null);
  const feedback = useRef<HTMLSpanElement>(null);
  const controls = useRef<HTMLButtonElement>(null);
  const toggle = useRef<() => void>(() => {});
  const [previewOwner, setPreviewOwner] = useState<PreviewOwner | null>(null);
  const [controlHost, setControlHost] = useState<HTMLElement | null>(null);
  const mount = useCallback((node: HTMLSpanElement | null) => {
    root.current = node;
    setControlHost(
      node?.closest<HTMLElement>(
        ".project-preview, .library-card-artwork, .template-card-entry, .library-item-preview",
      ) ?? null,
    );
  }, []);
  const loading = useMemo(() => createBrandActivity(), []);
  useEffect(() => {
    const element = root.current;
    const host = viewport.current;
    const owner =
      element?.closest<HTMLElement>("[data-preview-owner]") ??
      element?.closest<HTMLElement>("button");
    if (!element || !host || !owner) return;
    const carousel = owner.closest("[data-carousel]");
    const hover = matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let alive = true;
    let generation = 0;
    let preview: PreviewOwner | null = null;
    let currentStatus: PreviewStatus = "idle";
    function status(value: PreviewStatus, error?: unknown) {
      if (!alive || !element) return;
      currentStatus = value;
      loading.set(value === "loading");
      if (controls.current) {
        controls.current.dataset.status = value;
        controls.current.disabled = disabled || value === "loading";
        const label = t(value === "playing" ? "pause" : "play");
        controls.current.setAttribute("aria-label", label);
        controls.current.title = label;
      }
      element.dataset.previewStatus = value;
      element.setAttribute("aria-busy", String(value === "loading"));
      if (feedback.current) {
        feedback.current.textContent =
          value === "failed" ? t("failed") : value === "loading" ? t("loading") : "";
        feedback.current.title = value === "failed" && error instanceof Error ? error.message : "";
      }
    }
    function stop() {
      const current = preview;
      preview = null;
      setPreviewOwner(null);
      const token = ++generation;
      if (current) {
        status("idle");
        void current.release().catch((error) => {
          if (generation === token) status("failed", error);
        });
      }
    }
    function start(event: Event, manual = false) {
      if (
        disabled ||
        (!manual && ((!autoplay && !hover.matches) || reduced.matches)) ||
        document.hidden ||
        carousel?.hasAttribute("data-carousel-moving") ||
        (owner instanceof HTMLButtonElement && owner.disabled) ||
        owner!.matches(":active") ||
        preview ||
        (event instanceof PointerEvent && event.pointerType === "touch")
      )
        return;
      const token = ++generation;
      preview = startPreview(host!, (value, error) => {
        if (generation === token) status(value, error);
      });
      setPreviewOwner(preview);
    }
    toggle.current = () => {
      if (disabled) return;
      if (!preview || currentStatus === "failed") {
        if (preview) stop();
        start(new Event("click"), true);
      } else if (currentStatus === "playing" || currentStatus === "paused")
        preview.setPaused?.(currentStatus === "playing");
    };
    const intent = bindHoverPreview(owner, {
      enabled: () =>
        !autoplay &&
        hover.matches &&
        !disabled &&
        !(owner instanceof HTMLButtonElement && owner.disabled) &&
        !carousel?.hasAttribute("data-carousel-moving"),
      onChange: (target) => {
        if (target) start(new Event("pointerenter"));
        else stop();
      },
    });
    const visible =
      typeof IntersectionObserver === "undefined"
        ? null
        : bindVisiblePreview(owner, {
            enabled: () =>
              !disabled &&
              !reduced.matches &&
              (autoplay || !hover.matches) &&
              !carousel?.hasAttribute("data-carousel-moving"),
            priority: autoplay ? 1 : 0,
            onChange: (active) => {
              if (active) start(new Event("visible"), true);
              else stop();
            },
          });
    const environment = () => visible?.refresh();
    hover.addEventListener("change", environment);
    reduced.addEventListener("change", environment);
    // Explicit play also works without hover (touch / reduced motion); it needs the
    // same release boundaries even when the hover helper has no active target.
    const leave = () => {
      if (!autoplay && hover.matches && preview) stop();
    };
    const blur = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !owner.contains(event.relatedTarget)) leave();
    };
    const hidden = () => {
      if (document.hidden) stop();
    };
    owner.addEventListener("pointerleave", leave);
    owner.addEventListener("focusout", blur);
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", hidden);
    const carouselMotion = () => intent.refresh();
    carousel?.addEventListener("musart:carousel-motion", carouselMotion);
    return () => {
      stop();
      alive = false;
      toggle.current = () => {};
      loading.set(false);
      intent.dispose();
      visible?.dispose();
      hover.removeEventListener("change", environment);
      reduced.removeEventListener("change", environment);
      owner.removeEventListener("pointerleave", leave);
      owner.removeEventListener("focusout", blur);
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", hidden);
      carousel?.removeEventListener("musart:carousel-motion", carouselMotion);
    };
  }, [startPreview, disabled, t, loading, controlHost, autoplay]);
  return (
    <span ref={mount} className={`motion-template-preview ${className}`} data-preview-status="idle">
      {!nativeVideo &&
        (poster ? <img src={poster} alt="" loading="lazy" draggable={false} /> : children)}
      <span
        ref={viewport}
        className="motion-template-preview-canvas"
        data-native-video={nativeVideo || undefined}
        aria-hidden
      >
        {nativeVideo && (
          <video data-preview-video poster={poster} preload="none" muted playsInline loop />
        )}
      </span>
      <span className="motion-template-preview-loading-mark">
        <BrandStatus size={24} state="preparing" activity={loading} />
      </span>
      {controlHost &&
        !controlHost.classList.contains("library-item-preview") &&
        createPortal(
          <button
            ref={controls}
            type="button"
            className="motion-preview-control"
            data-preview-control
            data-status="idle"
            aria-label={t("play")}
            title={t("play")}
            disabled={disabled}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggle.current();
            }}
          >
            <Play className="motion-preview-play" size={12} fill="currentColor" />
            <Pause className="motion-preview-pause" size={12} fill="currentColor" />
          </button>,
          controlHost,
        )}
      {controlHost &&
        previewOwner?.playback &&
        createPortal(
          controlHost.classList.contains("library-item-preview") ? (
            <div
              className="motion-preview-player"
              data-preview-control
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <PreviewPlayer owner={{ ...previewOwner, playback: previewOwner.playback }} />
            </div>
          ) : (
            <PreviewProgress playback={previewOwner.playback} />
          ),
          controlHost,
        )}
      <span ref={feedback} className="motion-template-preview-status" role="status" />
    </span>
  );
}
