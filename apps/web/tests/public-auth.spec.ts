import { expect, test } from "@playwright/test";

test("public AmplifyWorld homepage and login have no viewport overflow", async ({ page }) => {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 880 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Every moving part/i })).toBeVisible();
    await expect(page.getByText("AmplifyWorld", { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId("api-health-status")).toBeVisible();
    const homeBounds = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
    expect(homeBounds.scroll, "Home document overflow at " + width).toBeLessThanOrEqual(homeBounds.view + 1);
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
    await expect(page.getByLabel("Login ID")).toBeVisible();
    const loginBounds = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
    expect(loginBounds.scroll, "Login document overflow at " + width).toBeLessThanOrEqual(loginBounds.view + 1);
    if(width>=1024){
      const dimensions=await page.evaluate(()=>({
        height:document.documentElement.scrollHeight,viewport:document.documentElement.clientHeight,
      }));
      expect(dimensions.height,"Desktop login should fit one screen at "+width).toBeLessThanOrEqual(dimensions.viewport+1);
    }
  }
});

test("authentication page keeps usable controls and accessible password reveal", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("temporary-password-only");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("homepage login CTA navigates into existing authentication route", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Enter your workspace" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
});
