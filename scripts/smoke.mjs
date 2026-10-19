// Smoke test for a concurrently running API (4000) and Next.js web (3000).
// Starts no services itself. Exit nonzero on timeout or invalid response.
const apiUrl = process.env.SMOKE_API_URL ?? "http://127.0.0.1:4000/api/v1/health";
const webUrl = process.env.SMOKE_WEB_URL ?? "http://127.0.0.1:3000/";

async function poll(url, validator, description) {
  const deadline = Date.now() + 90_000;
  let lastReason = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const content = await response.text();
      if (!validator(content)) throw new Error("Unexpected response body");
      console.info(`PASS ${description} (${url})`);
      return;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw new Error(`FAIL ${description} (${url}): ${lastReason}`);
}

try {
  await poll(apiUrl, (text) => {
    const body = JSON.parse(text);
    return body?.data?.service === "api" && body?.data?.status === "ok" &&
      body?.meta?.version === "v1";
  }, "API health contract");

  await poll(webUrl, (text) => text.includes("DigiMarket") &&
    text.includes("Connected") &&
    text.includes("api-health-status"), "Next.js render and server-to-API fetch");

  console.info("Module 1 smoke checks passed.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
