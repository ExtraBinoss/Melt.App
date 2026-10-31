import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FONT_CATALOG } from "@musart/assets";
import type { FontLibraryPort } from "../../../services/fonts/model";
import { getUiPresentation } from "../../../state/session/ui-presentation";
import { waitForPresentation } from "../../../state/session/wait-for-presentation";
import {
  mergeFontOptions as mergeFonts,
  readRecentFonts,
  findFont,
  type FontOption,
} from "./catalog";
import { invalidateFontMetadata, loadFontMetadata, peekFontMetadata } from "./metadata";

/** Bounded metadata refreshes wait out overlay presentation and reject stale results. */
export function usePickerMetadata(library: FontLibraryPort, open: boolean, family: string) {
  const { t } = useTranslation("fonts");
  const [recent, setRecent] = useState<string[]>([]);
  const [fonts, setFonts] = useState<readonly FontOption[]>(() =>
    mergeFonts(FONT_CATALOG, peekFontMetadata(library) ?? []),
  );
  const [installedIds, setInstalledIds] = useState<ReadonlySet<string>>(
    () => new Set(FONT_CATALOG.map((font) => font.id)),
  );
  const [metadataReady, setMetadataReady] = useState(false);
  const [error, setError] = useState("");
  const needsMetadata = open || /^(custom|local):/.test(family);
  useEffect(() => {
    if (!needsMetadata) return;
    let mounted = true,
      revision = 0;
    const controller = new AbortController();
    function refresh(changed = false) {
      if (changed) invalidateFontMetadata(library);
      const version = ++revision;
      async function read() {
        if (open) await waitForPresentation(getUiPresentation(), controller.signal);
        if (!mounted || version !== revision) return;
        return Promise.all([
          open ? library.catalog() : Promise.resolve(FONT_CATALOG),
          loadFontMetadata(library),
        ]);
      }
      void read().then(
        (result) => {
          if (!result) return;
          const [catalog, installed] = result;
          if (!mounted || version !== revision) return;
          const merged = mergeFonts(FONT_CATALOG, catalog, installed);
          setFonts((previous) => mergeFonts(previous, merged));
          setInstalledIds(
            (previous) =>
              new Set([
                ...previous,
                ...FONT_CATALOG.map((font) => font.id),
                ...installed.map((font) => font.id),
              ]),
          );
          setMetadataReady(true);
          const saved = readRecentFonts(merged);
          if (saved.length) setRecent(saved);
        },
        () => {
          if (mounted && version === revision && !controller.signal.aborted) {
            setMetadataReady(true);
            setError(t("loadFailed"));
          }
        },
      );
    }
    // Opening always refreshes browser-wide metadata, including changes from
    // another tab. Closed pickers only need a lookup for a persisted custom ID.
    if (open || (peekFontMetadata(library) && !findFont(family, peekFontMetadata(library))))
      invalidateFontMetadata(library);
    refresh();
    const unsubscribe = library.subscribe(() => refresh(true));
    return () => {
      mounted = false;
      controller.abort();
      unsubscribe();
    };
  }, [library, open, t, needsMetadata, family]);

  return {
    fonts,
    setFonts,
    installedIds,
    setInstalledIds,
    recent,
    setRecent,
    metadataReady,
    setMetadataReady,
    error,
    setError,
  };
}
