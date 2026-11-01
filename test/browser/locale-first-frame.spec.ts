import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 412, height: 823 }, hasTouch: true, isMobile: true });

test("a saved locale is already present in SSR and keeps the desktop navigation stable through hydration", async ({
  page,
  context,
  baseURL,
  browser,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await context.addCookies([{ name: "musart.language", value: "fr", url: baseURL! }]);
  const other = await browser.newContext();
  try {
    await other.addCookies([{ name: "musart.language", value: "de", url: baseURL! }]);
    const [fr, de] = await Promise.all([page.request.get(baseURL!), other.request.get(baseURL!)]);
    expect(await fr.text()).toContain('<html lang="fr"');
    expect(await de.text()).toContain('<html lang="de"');
    expect(await de.text()).not.toContain("Fonctionnalités");
    expect(fr.headers()["vary"]).toContain("Cookie");
  } finally {
    await other.close();
  }
  const painted: string[] = [];
  await page.exposeFunction("recordLocalePaint", (language: string) => painted.push(language));
  await page.addInitScript(() => {
    new PerformanceObserver((list) => {
      if (list.getEntries().some((entry) => entry.name === "first-contentful-paint")) {
        void (
          window as unknown as { recordLocalePaint(language: string): Promise<void> }
        ).recordLocalePaint(document.documentElement.lang);
        const nav = document.querySelector(".site-header > nav");
        if (nav)
          Object.defineProperty(window, "__initialNav", {
            value: { x: nav.getBoundingClientRect().x, width: nav.getBoundingClientRect().width },
          });
      }
    }).observe({ type: "paint", buffered: true });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Créez simplement. Animez comme un pro.", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => painted).toEqual(["fr"]);
  const bounds = await page.evaluate(() => {
    const first = (window as unknown as { __initialNav: { x: number; width: number } })
      .__initialNav;
    const now = document.querySelector(".site-header > nav")!.getBoundingClientRect();
    return { first, now: { x: now.x, width: now.width } };
  });
  expect(bounds.first.width).toBeGreaterThan(100);
  expect(Math.abs(bounds.now.x - bounds.first.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.now.width - bounds.first.width)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Try Melt", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Tableau de bord Melt", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  expect(errors).toEqual([]);
});

test("legacy local-storage language migrates once before visible content, without a repeated reload", async ({
  page,
  context,
}) => {
  const painted: string[] = [];
  let navigations = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
  });
  await page.exposeFunction("recordLocalePaint", (language: string) => painted.push(language));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    new PerformanceObserver((list) => {
      if (list.getEntries().some((entry) => entry.name === "first-contentful-paint"))
        void (
          window as unknown as { recordLocalePaint(language: string): Promise<void> }
        ).recordLocalePaint(document.documentElement.lang);
    }).observe({ type: "paint", buffered: true });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Créez simplement. Animez comme un pro.", exact: true }),
  ).toBeVisible();
  expect(navigations).toBe(2);
  await expect.poll(() => painted).toEqual(["fr"]);
  expect((await context.cookies()).find((cookie) => cookie.name === "musart.language")?.value).toBe(
    "fr",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Créez simplement. Animez comme un pro.", exact: true }),
  ).toBeVisible();
  expect(navigations).toBe(3);
});
