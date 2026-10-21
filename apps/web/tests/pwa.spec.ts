import { expect, test } from "@playwright/test";

test("PWA manifest, icons, service worker and safe offline shell are served", async ({ request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("AmplifyWorld Workspace");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/app/dashboard");
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192", type: "image/png" }),
    expect.objectContaining({ sizes: "512x512", type: "image/png" }),
  ]));
  for (const dimension of [180, 192, 512]) {
    const response = await request.get("/pwa-icon/" + dimension);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const data = await response.body();
    expect([...data.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  }
  const worker = await request.get("/sw.js");
  expect(worker.status()).toBe(200);
  const source = await worker.text();
  expect(source).toContain("request.mode !== \"navigate\"");
  expect(source).not.toContain("caches.put");
  expect(source).not.toContain("cache.put");
  const offline = await request.get("/offline.html");
  expect(offline.ok()).toBeTruthy();
  expect(await offline.text()).toContain("private records and credentials are not saved");
});

test("PWA is linked on the public login page without bypassing authentication", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
});
