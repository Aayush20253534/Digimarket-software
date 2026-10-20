import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@digimarket/db";
import { bootstrapIfConfigured } from "./bootstrap";

function database(organizations: number) {
  const count = vi.fn().mockResolvedValue(organizations);
  return { client: { organization: { count } } as unknown as PrismaClient, count };
}

const validSecrets = {
  BOOTSTRAP_ORG_NAME: "DigiMarket",
  BOOTSTRAP_ADMIN_LOGIN: "admin",
  BOOTSTRAP_ADMIN_PASSWORD: "unique-long-temporary-passphrase",
};

describe("Render Free first-account bootstrap guard", () => {
  it("does not access the database if no temporary setup variables are configured", async () => {
    const { client, count } = database(0);
    expect(await bootstrapIfConfigured(client, {})).toBe("not_configured");
    expect(count).not.toHaveBeenCalled();
  });

  it("rejects a partial set of first-account credentials before accessing the database", async () => {
    const { client, count } = database(0);
    await expect(bootstrapIfConfigured(client, { BOOTSTRAP_ADMIN_LOGIN: "admin" }))
      .rejects.toThrow("all three temporary");
    expect(count).not.toHaveBeenCalled();
  });

  it("refuses to overwrite, reset or re-provision an existing organization", async () => {
    const { client, count } = database(1);
    expect(await bootstrapIfConfigured(client, validSecrets)).toBe("already_initialized");
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("does not treat whitespace-only credentials as configured", async () => {
    const { client } = database(0);
    await expect(bootstrapIfConfigured(client, { BOOTSTRAP_ORG_NAME: "  ",
      BOOTSTRAP_ADMIN_LOGIN: "admin" })).rejects.toThrow("all three temporary");
  });
});
