import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { localeBootstrapScript } from "../../../src/state/i18n/locale-bootstrap";
import { documentLocale, localeCookie, readLocaleCookie } from "../../../src/state/i18n/preference";

test("locale cookies and document seeds accept only supported values", () => {
  expect(localeCookie("fr", true)).toContain(
    "musart.language=fr; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
  );
  expect(readLocaleCookie("other=1; musart.language=ja")).toBe("ja");
  expect(readLocaleCookie("musart.language=%")).toBeUndefined();
  expect(readLocaleCookie("musart.language=xx")).toBeUndefined();
  document.documentElement.dataset.initialLocale = "ar";
  expect(documentLocale()).toBe("ar");
  delete document.documentElement.dataset.initialLocale;
  expect(documentLocale()).toBe("en");
});
function boot(saved: string | null, initial = "en", existing = "", blocked = false) {
  let cookie = existing;
  const replace = vi.fn();
  const document = {
    documentElement: {
      dataset: { initialLocale: initial } as Record<string, string>,
      style: { visibility: "" },
    },
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      if (!blocked) cookie = value.split(";")[0]!;
    },
  };
  const context = {
    document,
    localStorage: { getItem: () => saved },
    location: { protocol: "https:", href: "https://melt.test/editor?project=saved", replace },
  };
  runInNewContext(localeBootstrapScript, context);
  return { context, replace, document };
}
test("legacy preferences migrate once before UI/engine boot, retaining the exact destination", () => {
  const state = boot("fr");
  expect(state.document.cookie).toBe("musart.language=fr");
  expect(state.document.documentElement.dataset.localeRedirect).toBe("true");
  expect(state.replace).toHaveBeenCalledExactlyOnceWith("https://melt.test/editor?project=saved");
  runInNewContext(localeBootstrapScript, state.context);
  expect(state.replace).toHaveBeenCalledOnce();
});
test("matching, absent, invalid and blocked-cookie preferences never reload or hide the page", () => {
  for (const state of [
    boot(null),
    boot("xx"),
    boot("fr", "fr", "musart.language=fr"),
    boot("fr", "en", "", true),
  ]) {
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.document.documentElement.style.visibility).toBe("");
    expect(state.document.documentElement.dataset.localeRedirect).toBeUndefined();
  }
});
