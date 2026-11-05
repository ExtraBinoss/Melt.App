import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ANIMATION_CATEGORIES,
  SCENE_MOTION_ANIMATION_PRESETS,
  canApplySceneMotionAnimationPreset,
  type Composition,
  type SceneAnimationOwner,
  type SceneMotionAnimationPreset,
  MOTION_ANIMATION_PRESETS,
  type Layer,
  type EnginePort,
  type MotionAnimationPreset,
} from "@musart/core";
import {
  MotionPresetStore,
  isSceneMotionPreset,
  type SavedMotionPreset,
} from "../../../services/motion/animations/presets";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import { SearchInput } from "../../assets/SearchInput";
import { Button } from "../../ui/button";
import { PresetGrid } from "./PresetGrid";
import { HorizontalScroll } from "../../shared/scroll/HorizontalScroll";
import "./messages";
import "./animations.css";

function compatible(preset: MotionAnimationPreset, kind: string, subject?: Layer) {
  const spatial = preset.channels.filter(
    (channel) => channel.target.kind === "layer" && channel.target.property.startsWith("spatial."),
  );
  if (spatial.length && !subject?.spatial?.enabled) return false;
  if (
    spatial.some((channel) => channel.target.property === "spatial.depth") &&
    subject?.spatial?.source !== "extrude"
  )
    return false;
  return (
    !preset.effects.some((effect) => effect.type === "morph") ||
    kind === "text" ||
    (kind === "vector" && preset.effects.some((effect) => effect.shapeMorph))
  );
}

export function PresetPicker({
  engine,
  apply,
  subjectKind = "image",
  subject,
  scene,
}: {
  engine: EnginePort;
  subjectKind?: string;
  subject?: Layer;
} & (
  | { scene?: undefined; apply: (preset: MotionAnimationPreset) => void }
  | {
      scene: { page: Composition; owner: SceneAnimationOwner };
      apply: (preset: SceneMotionAnimationPreset) => void;
    }
)) {
  const { t } = useTranslation("animations");
  const loadMore = useRef<HTMLButtonElement>(null);
  const [source, setSource] = useState("library");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<SavedMotionPreset[]>([]);
  const [before, setBefore] = useState<[number, string] | null>(null);
  const [store, setStore] = useState<MotionPresetStore | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewError = useCallback(() => setPreviewFailed(true), []);
  const previewReady = useCallback(() => setPreviewFailed(false), []);
  useEffect(() => {
    if (source !== "mine") return;
    const owner = new MotionPresetStore();
    let alive = true;
    void owner.list().then(
      (page) => {
        if (alive) {
          setStore(owner);
          setSaved(page.items);
          setBefore(page.before);
        }
      },
      () => {
        if (alive) setError(true);
      },
    );
    return () => {
      alive = false;
      owner.dispose();
    };
  }, [source]);
  const library = scene ? SCENE_MOTION_ANIMATION_PRESETS : MOTION_ANIMATION_PRESETS;
  const supports = useCallback(
    (preset: MotionAnimationPreset | SceneMotionAnimationPreset) =>
      scene
        ? isSceneMotionPreset(preset) &&
          canApplySceneMotionAnimationPreset(scene.page, scene.owner, preset)
        : !isSceneMotionPreset(preset) && compatible(preset, subjectKind, subject),
    [scene, subjectKind, subject],
  );
  const available = useMemo(
    () => (source === "library" ? library : saved.map((record) => record.preset)).filter(supports),
    [source, library, saved, supports],
  );
  const entries = useMemo(
    () =>
      available.filter(
        (preset) =>
          (category === "all" || preset.category === category) &&
          `${preset.name} ${t(`category.${preset.category}`)}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
      ),
    [available, category, query, t],
  );
  async function more() {
    if (!before || !store || busy) return;
    setBusy(true);
    try {
      const page = await store.list(before);
      setSaved((current) => [...current, ...page.items]);
      setBefore(page.before);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  async function remove(record: SavedMotionPreset) {
    if (!store || busy) return;
    setBusy(true);
    try {
      await store.delete(record);
      setSaved((current) => current.filter((item) => item.id !== record.id));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const button = loadMore.current;
    if (!button || busy || source !== "mine" || !before) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) button.click();
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, [before, busy, source]);
  return (
    <div className="animation-picker">
      <header>
        <strong>
          <Sparkles size={14} />
          {t("add")}
        </strong>
        <span>
          {t("count", {
            count: source === "library" ? library.filter(supports).length : saved.length,
          })}
        </span>
      </header>
      <SegmentedTabs
        mode="choice"
        size="compact"
        label={t("title")}
        value={source}
        items={[
          { value: "library", label: t("library") },
          { value: "mine", label: t("mine") },
        ]}
        onValueChange={(value) => {
          setSource(value);
          setCategory("all");
        }}
      />
      <div className="animation-search">
        <SearchInput
          aria-label={t("search")}
          hints={library
            .filter(supports)
            .slice(0, 6)
            .map((preset) => ({ label: preset.name }))}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <HorizontalScroll
        label={t("categories")}
        className="animation-category-strip"
        edgeControls="shadows"
      >
        <div className="animation-categories">
          {["all", ...ANIMATION_CATEGORIES]
            .filter((value) =>
              scene
                ? value === "all" || available.some((preset) => preset.category === value)
                : value !== "typography" || subjectKind === "text" || source === "mine",
            )
            .map((value) => (
              <Button
                key={value}
                size="xs"
                variant={category === value ? "secondary" : "ghost"}
                aria-pressed={category === value}
                data-animation-category={value}
                onClick={() => {
                  setCategory(value);
                }}
              >
                {t(value === "all" ? "all" : `category.${value}`)}
              </Button>
            ))}
        </div>
      </HorizontalScroll>
      <PresetGrid
        key={`${source}:${category}:${query}`}
        engine={engine}
        entries={entries}
        apply={(preset) => {
          if (scene && isSceneMotionPreset(preset)) apply(preset);
          else if (!scene && !isSceneMotionPreset(preset)) apply(preset);
        }}
        busy={busy}
        onError={previewError}
        onReady={previewReady}
        empty={t(source === "mine" && !saved.length ? "emptyLibrary" : "noResults")}
        remove={
          source === "mine"
            ? (id) => {
                const record = saved.find((record) => record.id === id);
                if (record) void remove(record);
              }
            : undefined
        }
      >
        {source === "mine" && before && (
          <Button
            ref={loadMore}
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void more()}
          >
            {t("more")}
          </Button>
        )}
      </PresetGrid>
      {error && <p role="alert">{t("failed")}</p>}
      {previewFailed && <p role="alert">{t("previewFailed")}</p>}
    </div>
  );
}
