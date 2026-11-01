import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { defaultLocale, isSupportedLocale } from "./locales";
import { documentLocale, LANGUAGE_KEY } from "./preference";

/** Request-local locale; the singleton translation registry is never mutated by SSR requests. */
export const initialDocumentLocale = createIsomorphicFn()
  .server(() => {
    const language = getCookie(LANGUAGE_KEY);
    setResponseHeader("Vary", "Origin, Cookie");
    if (isSupportedLocale(language)) {
      setResponseHeader("Cache-Control", "private, no-cache");
      return language;
    }
    return defaultLocale;
  })
  .client(documentLocale);
