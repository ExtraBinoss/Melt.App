import { useEffect } from "react";
import { changeLanguage, readLanguage } from "./index";
/** Restore after the actual route hydrates, never ahead of its streamed/lazy HTML. */
export function useRestoreLocale() {
  useEffect(() => {
    void changeLanguage(readLanguage());
  }, []);
}
