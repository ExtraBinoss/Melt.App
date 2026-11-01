import { expect, test } from "@playwright/test";

test("studio entry has a working native destination before client hydration", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(new URL("/", baseURL).href);
    const entry = page.getByRole("button", { name: "Try Melt", exact: true });
    await expect(entry).toHaveAttribute("href", "/dashboard");
    await entry.click();
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await context.close();
  }
});
