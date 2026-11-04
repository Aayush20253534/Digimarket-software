import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { FinanceService } from "./service";

const actor = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  roles: ["FOUNDER"],
  permissions: new Set(["finance.entry.read.own"]),
} as unknown as Principal;

function fixture() {
  const categoryId = {
    meta: "00000000-0000-4000-8000-000000000003",
    travel: "00000000-0000-4000-8000-000000000004",
    ads: "00000000-0000-4000-8000-000000000005",
  };
  const findCategories = vi.fn().mockResolvedValue([
    { id: categoryId.meta, name: "Meta Ads" },
    { id: categoryId.travel, name: "Travel" },
    { id: categoryId.ads, name: "Meta Advertising" },
  ]);
  const findTransactions = vi.fn().mockResolvedValue([]);
  const groupTransactions = vi.fn().mockResolvedValue([]);
  const db = {
    financialCategory: { findMany: findCategories },
    financialTransaction: { findMany: findTransactions, groupBy: groupTransactions },
  } as unknown as PrismaClient;
  return {
    service: new FinanceService(db),
    findCategories, findTransactions, groupTransactions, categoryId,
  };
}

describe("Meta Ads register scopes", () => {
  it("only returns Meta advertising expenses for the combined register", async () => {
    const { service, findTransactions, categoryId } = fixture();
    await service.entries(actor, "mine", "meta_ads");
    const where = findTransactions.mock.calls[0][0].where;
    expect(where).toMatchObject({
      organizationId: actor.organizationId,
      enteredById: actor.userId,
      kind: "EXPENSE",
      categoryId: { in: [categoryId.meta, categoryId.ads] },
    });
    expect(where).not.toHaveProperty("clientId");
  });

  it("does not accidentally include unrelated client-attributed expenses", async () => {
    const { service, findTransactions, categoryId } = fixture();
    await service.entries(actor, "mine", "client_ads");
    expect(findTransactions.mock.calls[0][0].where).toMatchObject({
      kind: "EXPENSE",
      clientId: { not: null },
      categoryId: { in: [categoryId.meta, categoryId.ads] },
    });
  });

  it("keeps existing agency transactions in the agency ledger", async () => {
    const { service, findTransactions, findCategories } = fixture();
    await service.entries(actor, "mine");
    expect(findTransactions.mock.calls[0][0].where).toMatchObject({
      kind: undefined,
      clientId: null,
    });
    expect(findCategories).not.toHaveBeenCalled();
  });

  it("calculates client spend using only Meta Ads categories", async () => {
    const { service, groupTransactions, categoryId } = fixture();
    const totals = await service.totals(actor, "mine");
    expect(totals.clientAdSpend.posted).toBe("0.0000");
    expect(groupTransactions).toHaveBeenCalledTimes(2);
    expect(groupTransactions.mock.calls[1][0].where).toMatchObject({
      kind: "EXPENSE",
      clientId: { not: null },
      categoryId: { in: [categoryId.meta, categoryId.ads] },
    });
  });

  it("exports only Meta Ads rows for the combined scope", async () => {
    const { service, findTransactions, categoryId } = fixture();
    const exported = await service.exportCsv(actor, "mine", "meta_ads");
    expect(exported.filename).toContain("meta_ads");
    expect(findTransactions.mock.calls[0][0].where).toMatchObject({
      kind: "EXPENSE",
      categoryId: { in: [categoryId.meta, categoryId.ads] },
    });
  });
});
