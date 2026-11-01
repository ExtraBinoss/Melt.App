import { useMemo } from "react";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort } from "@musart/core";
import { previewAtom, useEngineValue } from "../../../state/session/editor";
import { resolveInspectorPage } from "../inspector-scope";
import { MotionColorControl } from "../motion/MotionColorControl";
import { BackgroundGradientControl } from "./GradientControl";
import { RetainedPaint, usePaintOwner } from "./retained-paint";

/** Only paint values subscribe here; unrelated Inspector fields retain their immutable scope. */
export function BackgroundPaintControls({
  engine,
  page,
  current,
  run,
  cancel,
}: {
  engine: EnginePort;
  page: Composition;
  current: () => boolean;
  run: (action: () => void) => void;
  cancel: () => void;
}) {
  const { t } = useTranslation();
  const setPreview = useSetAtom(previewAtom);
  const owner = usePaintOwner(engine, page.id);
  const background = useEngineValue(
    engine,
    () => resolveInspectorPage(engine, page)?.background ?? page.background,
  );
  const backgroundGradient = useEngineValue(engine, () => {
    const active = resolveInspectorPage(engine, page);
    return active ? active.backgroundGradient : page.backgroundGradient;
  });
  const paint = useMemo(
    () => ({ id: page.id, background, backgroundGradient }),
    [page.id, background, backgroundGradient],
  );
  function preview(patch: Partial<Composition>) {
    if (current()) setPreview({ target: "page", patch });
    else cancel();
  }
  function patch(patch: Partial<Composition>) {
    const origin = resolveInspectorPage(engine, page);
    cancel();
    if (!origin || !current()) return;
    run(() => {
      // A queued paint action must never overwrite a more recent canonical edit.
      if (current() && resolveInspectorPage(engine, page) === origin)
        engine.execute({ type: "updatePage", patch });
    });
  }
  return (
    <>
      <BackgroundGradientControl
        key={`gradient:${owner}`}
        page={paint}
        engine={engine}
        preview={preview}
        patch={patch}
        cancel={cancel}
      />
      <RetainedPaint key={`solid:${owner}`} visible={!backgroundGradient}>
        <MotionColorControl
          engine={engine}
          label={t("fill")}
          identity={`page:${page.id}`}
          value={background}
          onPreview={(background) => preview({ background })}
          onCommit={(background) => patch({ background })}
          onCancel={cancel}
        />
      </RetainedPaint>
    </>
  );
}
