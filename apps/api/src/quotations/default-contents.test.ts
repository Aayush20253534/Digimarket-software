import { describe, expect, it } from "vitest";
import { validated } from "./routes";

const base = {
  mode: "default" as const,
  clientName: "Sample Café",
  packageTitle: "CUSTOM MARKETING PACKAGE",
  quoteDate: "2026-11-05",
  serviceFee: "15000",
  feePeriod: "monthly" as const,
  servicePayment: "monthly" as const,
  adBudget: "3000",
  adBudgetMode: "mandatory" as const,
  adPlatform: "Meta" as const,
  adPayment: "before ads run" as const,
  adFlexibility: "client-adjustable" as const,
  taxMode: "not charged" as const,
  gstRate: 18,
  gstin: "",
  influencerFees: "not applicable" as const,
  domainHosting: "extra" as const,
  reels: 8,
  posts: 8,
  validityDays: 7,
  serviceTerm: "1 month",
  services: [{name:"Placeholder",description:"Scope will be normalized"}],
  exclusions: "",
};

describe("default quotation content quantities", () => {
  it("keeps eight reels and posts by default", () => {
    const quote = validated(base);
    expect(quote.reels).toBe(8);
    expect(quote.posts).toBe(8);
    expect(quote.services[4]?.description).toContain("8 reels per month");
    expect(quote.services[5]?.description).toContain("8 posts per month");
  });

  it("preserves custom quantities and synchronizes the standard scope", () => {
    const quote = validated({...base, reels: 20, posts: 4});
    expect(quote.reels).toBe(20);
    expect(quote.posts).toBe(4);
    expect(quote.services).toHaveLength(6);
    expect(quote.services[4]?.description).toContain("20 reels per month");
    expect(quote.services[5]?.description).toContain("4 posts per month");
    expect(quote.services[0]?.name).toBe("WEBSITE");
  });

  it("accepts zero content quantities without reverting them to eight", () => {
    const quote = validated({...base, reels: 0, posts: 0});
    expect(quote.reels).toBe(0);
    expect(quote.posts).toBe(0);
    expect(quote.services[4]?.description).toContain("0 reels per month");
  });

  it("rejects negative and out of range quantities", () => {
    expect(() => validated({...base, reels:-1})).toThrow();
    expect(() => validated({...base, posts:1000})).toThrow();
  });

  it("leaves custom quotation service scopes unchanged", () => {
    const quote = validated({...base, mode:"new" as const,
      services:[{name:"Social media",description:"4 reels, 4 posts"}],reels:4,posts:4});
    expect(quote.services).toEqual([{name:"Social media",description:"4 reels, 4 posts"}]);
  });
});
