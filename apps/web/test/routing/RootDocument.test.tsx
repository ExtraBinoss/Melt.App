import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type * as Router from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { i18n } from "../../src/state/i18n";
const request = vi.hoisted(() => ({ language: undefined as string | undefined, header: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: () => request.language,
  setResponseHeader: request.header,
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof Router>()),
  HeadContent: () => <title>Melt</title>,
  Scripts: () => <script src="/client.js" />,
}));
import { RootDocument } from "../../src/routing/RootDocument";
test("the server emits a complete document, theme bootstrap and visible content", () => {
  const html = renderToStaticMarkup(
    <RootDocument>
      <main>Artwork</main>
    </RootDocument>,
  );
  expect(html).toContain('<html lang="en" dir="ltr" data-initial-locale="en">');
  expect(html).toContain("<title>Melt</title>");
  expect(html).toContain("musart.theme");
  expect(html).toContain("<main>Artwork</main>");
  expect(html).toContain('src="/client.js"');
});
test("SSR renders a request's language and direction without mutating the shared registry", () => {
  function Content() {
    const { t } = useTranslation();
    return <main>{t("layers")}</main>;
  }
  const original = i18n.language;
  request.language = "fr";
  const french = renderToStaticMarkup(
    <RootDocument>
      <Content />
    </RootDocument>,
  );
  expect(french).toContain('lang="fr" dir="ltr"');
  expect(french).toContain("<main>Calques</main>");
  request.language = "ar";
  expect(
    renderToStaticMarkup(
      <RootDocument>
        <Content />
      </RootDocument>,
    ),
  ).toContain('lang="ar" dir="rtl"');
  expect(i18n.language).toBe(original);
  request.language = undefined;
});
