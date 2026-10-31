import type { Express, NextFunction, Request, Response } from "express";
import { Prisma } from "@digimarket/db";
import { z } from "zod";
import type { AuthService, Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";

const money = z.string().regex(/^(0|[1-9]\d{0,8})(?:\.\d{1,2})?$/, "Enter a valid INR amount");
const text = (max: number) => z.string().trim().max(max);
const quoteInput = z.strictObject({
  clientName: z.string().trim().min(2).max(80),
  packageTitle: z.string().trim().min(2).max(60).default("CUSTOM MARKETING PACKAGE"),
  quoteDate: z.iso.date(),
  serviceFee: money,
  feePeriod: z.enum(["monthly", "one-time"]),
  servicePayment: z.enum(["at signing", "monthly", "milestone"]),
  adBudget: money,
  adBudgetMode: z.enum(["optional", "mandatory", "not applicable"]),
  adPlatform: z.enum(["Meta", "Google", "Meta and Google", "other"]),
  adPayment: z.enum(["at signing", "before ads run", "per schedule"]),
  adFlexibility: z.enum(["fixed", "client-adjustable"]),
  taxMode: z.enum(["inclusive", "extra", "not charged"]),
  gstRate: z.number().min(0).max(28),
  gstin: text(32),
  influencerFees: z.enum(["included", "extra", "not applicable"]),
  domainHosting: z.enum(["included", "extra", "client-provided", "not applicable"]),
  reels: z.number().int().min(0).max(999),
  posts: z.number().int().min(0).max(999),
  validityDays: z.number().int().min(1).max(180),
  serviceTerm: z.string().trim().min(1).max(60),
  services: z.array(z.strictObject({
    name: z.string().trim().min(2).max(52),
    description: z.string().trim().min(2).max(115),
  })).min(1).max(6),
  exclusions: text(110),
});
export type QuotationInput = z.infer<typeof quoteInput>;

function requireFounder(p: Principal) {
  if (!p.roles.some(r => ["FOUNDER", "ADMIN", "SUPER_ADMIN"].includes(r))) {
    throw new AuthError(403, "FORBIDDEN", "Quotation management is restricted to founders and administrators.");
  }
}
function paisa(value: string): number {
  const [whole, decimal = ""] = value.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
function amount(value: number): string {
  return (value / 100).toFixed(2);
}
function price(input: QuotationInput) {
  const service = paisa(input.serviceFee);
  const ads = input.adBudgetMode === "not applicable" ? 0 : paisa(input.adBudget);
  // Ad spend is treated as a separately controlled pass-through, not part of the service tax base.
  const tax = input.taxMode === "extra" ? Math.round(service * input.gstRate / 100) : 0;
  return { serviceFee: amount(service), adBudget: amount(ads),
    taxAmount: amount(tax), total: amount(service + ads + tax) };
}
function validated(input: unknown): QuotationInput {
  const parsed = quoteInput.safeParse(input);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map(i => i.path.join(".") || "request"))].slice(0, 6);
    throw new AuthError(422, "VALIDATION_ERROR", "Invalid quotation fields: " + fields.join(", "));
  }
  const value = parsed.data;
  if (value.adBudgetMode === "not applicable" && paisa(value.adBudget) !== 0) {
    throw new AuthError(422, "VALIDATION_ERROR", "Ad budget must be zero when not applicable.");
  }
  if (value.taxMode === "extra" && value.gstRate <= 0) {
    throw new AuthError(422, "VALIDATION_ERROR", "Enter a GST rate when tax is extra.");
  }
  return value;
}

export function registerQuotationRoutes(app: Express, auth: AuthService) {
  const db = auth.database;
  const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bearer = req.get("authorization");
      if (!bearer?.startsWith("Bearer ")) throw unauthorized();
      const principal = await auth.authenticate(bearer.slice(7));
      requireFounder(principal);
      res.locals.principal = principal;
      next();
    } catch (error) { next(error); }
  };
  const actor = (res: Response) => res.locals.principal as Principal;
  const base = "/api/v1/quotations";
  app.get(base, authenticate, async (_req, res) => {
    const p = actor(res);
    const items = await db.quotation.findMany({
      where: { organizationId: p.organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 150,
    });
    res.set("Cache-Control", "no-store").json({ data: { items } });
  });
  app.get(base + "/:id", authenticate, async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AuthError(422, "VALIDATION_ERROR", "Invalid quotation identifier.");
    const quote = await db.quotation.findFirst({
      where: { id: id.data, organizationId: actor(res).organizationId },
    });
    if (!quote) throw new AuthError(404, "NOT_FOUND", "Quotation not found.");
    res.set("Cache-Control", "no-store").json({ data: quote });
  });
  app.post(base, authenticate, async (req, res) => {
    const input = validated(req.body);
    const p = actor(res);
    const priced = price(input);
    const prefix = "AW-Q-" + input.quoteDate.replaceAll("-", "") + "-";
    let saved;
    // Serializable transactions + a unique org/number key prevent duplicate quote numbers.
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        saved = await db.$transaction(async tx => {
          const existing = await tx.quotation.findMany({
            where: { organizationId: p.organizationId, quoteNumber: { startsWith: prefix } },
            select: { quoteNumber: true },
          });
          const highest = existing.reduce((max, q) =>
            Math.max(max, Number(q.quoteNumber.slice(prefix.length)) || 0), 0);
          const quoteNumber = prefix + String(highest + 1).padStart(2, "0");
          const quote = await tx.quotation.create({
            data: { organizationId: p.organizationId, createdById: p.userId,
              quoteNumber, clientName: input.clientName, quoteDate: new Date(input.quoteDate + "T00:00:00.000Z"),
              ...priced, payload: input },
          });
          await tx.auditLog.create({ data: { organizationId: p.organizationId, actorId: p.userId,
            action: "quotations.created", entityType: "Quotation", entityId: quote.id } });
          return quote;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
        break;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (!["P2002", "P2034"].includes(code ?? "") || attempt === 7) throw error;
      }
    }
    res.status(201).set("Cache-Control", "no-store").json({ data: saved });
  });
}
