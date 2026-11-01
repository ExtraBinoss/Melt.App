import { HeadContent, Scripts } from "@tanstack/react-router";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../state/i18n";
import { localeDirection } from "../state/i18n/locales";
import { initialDocumentLocale } from "../state/i18n/initial-locale";
import { localeBootstrapScript } from "../state/i18n/locale-bootstrap";
import "../styles/fonts.css";
import "../styles/global.css";

const themeScript = `try{const t=localStorage.getItem('musart.theme')||'system';const d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch{}`;

/** SSR and hydration share the selected locale, without an intermediate English layout. */
export function RootDocument({ children }: { children: ReactNode }) {
  const [initialLocale] = useState(initialDocumentLocale);
  const [translations] = useState(() =>
    import.meta.env.SSR ? i18n.cloneInstance({ lng: initialLocale }) : i18n,
  );
  useLayoutEffect(() => {
    const update = (language: string) => {
      if (translations !== i18n) void translations.changeLanguage(language);
      document.documentElement.lang = language;
      document.documentElement.dir = localeDirection(language);
    };
    i18n.on("languageChanged", update);
    if (i18n.language !== translations.language) update(i18n.language);
    return () => {
      i18n.off("languageChanged", update);
    };
  }, [translations]);
  return (
    <html
      lang={initialLocale}
      dir={localeDirection(initialLocale)}
      data-initial-locale={initialLocale}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: localeBootstrapScript }} />
      </head>
      <body>
        <I18nextProvider i18n={translations}>{children}</I18nextProvider>
        <Scripts />
      </body>
    </html>
  );
}
