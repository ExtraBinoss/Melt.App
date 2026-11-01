import { useEffect } from "react";
import { changeLanguage, readLanguage, i18n } from "./index";
/** Restore after the actual route hydrates, never ahead of its streamed/lazy HTML. */
export function useRestoreLocale() {
  useEffect(() => {
    const language = readLanguage();
    if (i18n.language !== language) void changeLanguage(language);
  }, []);
}
