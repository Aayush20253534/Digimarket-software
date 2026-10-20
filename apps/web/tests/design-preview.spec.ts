import { expect, test } from "@playwright/test";

test("AmplifyWorld design preview is static, accessible and responsive", async ({ page }) => {
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/design-preview");
    await expect(page.getByRole("heading", { name: /Work smarter/ })).toBeVisible();
    await expect(page.getByText("Phase 1 · Design preview")).toBeVisible();
    const viewport = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(viewport.scrollWidth, "No horizontal page overflow at "+width+"px").toBeLessThanOrEqual(viewport.clientWidth + 1);
  }
  await page.getByRole("button", { name: "Preview dialog" }).click();
  await expect(page.getByRole("dialog", { name: "AmplifyWorld design system" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "AmplifyWorld design system" })).not.toBeVisible();
  await page.getByRole("button", { name: "CRM", exact: true }).click();
  await expect(page.getByRole("button", { name: "CRM", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "Filter example rows" }).fill("nowhere");
  await expect(page.getByText("No sample rows")).toBeVisible();
  await page.getByRole("textbox", { name: "Filter example rows" }).fill("");
  await expect(page.getByRole("table", { name: "Illustrative project table" })).toBeVisible();
});
