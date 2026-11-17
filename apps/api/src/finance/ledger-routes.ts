import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { reportingPeriodQuerySchema } from "@digimarket/contracts";
import type { AuthService, Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";
import { FinanceLedgerService } from "./ledger-service";
import { FinanceService } from "./service";
const amount = z.string().regex(/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,4})?$/);
const signedAmount = z.string().regex(/^-?(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,4})?$/);
const note = z.string().trim().min(4).max(500);
const pagination = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).default(""),
});
const registerQuery = pagination.extend({
  view: z.enum(["mine", "all"]).default("mine"),
  scope: z.enum(["agency", "client_ads", "meta_ads"]).default("agency"),
  funding: z.enum(["ALL", "SELF", "CLIENT"]).optional(),
  kind: z.enum(["INCOME", "EXPENSE"]).optional(),
  status: z.enum(["POSTED", "PENDING", "REJECTED", "CANCELLED"]).optional(),
  categoryId: z.uuid().optional(),
});
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new AuthError(422, "VALIDATION_ERROR", "Invalid finance fields");
  return r.data;
}
export function registerFinanceLedgerRoutes(app: Express, auth: AuthService) {
  const ledger = new FinanceLedgerService(auth.database),
    finance = new FinanceService(auth.database),
    root = "/api/v1/finance";
  const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const h = req.get("authorization");
      if (!h?.startsWith("Bearer ")) throw unauthorized();
      res.locals.principal = await auth.authenticate(h.slice(7));
      res.set("Cache-Control", "no-store");
      next();
    } catch (e) {
      next(e);
    }
  };
  const actor = (res: Response) => res.locals.principal as Principal;
  const period = (req: Request) => parse(reportingPeriodQuerySchema, req.query);
  const page = (req: Request) => parse(pagination, req.query);
  // Keep a structured error when a concurrent idempotency/reversal insert wins.
  const run =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await fn(req, res);
      } catch (e) {
        if ((e as { code?: string }).code === "P2002")
          next(
            new AuthError(
              409,
              "DUPLICATE_RECORD",
              "This entry, account or reversal already exists",
            ),
          );
        else next(e);
      }
    };
  app.get(
    root + "/account-owners",
    authenticate,
    run(async (req, res) => {
      res.json({ data: await ledger.owners(actor(res)) });
    }),
  );
  app.get(
    root + "/account-options",
    authenticate,
    run(async (req, res) => {
      res.json({ data: await ledger.options(actor(res)) });
    }),
  );
  app.get(
    root + "/accounts",
    authenticate,
    run(async (req, res) => {
      res.json({ data: await ledger.balances(actor(res), period(req)) });
    }),
  );
  app.post(
    root + "/accounts",
    authenticate,
    run(async (req, res) => {
      res.status(201).json({
        data: await ledger.createAccount(
          actor(res),
          parse(
            z.strictObject({
              name: z.string().trim().min(2).max(120),
              kind: z.enum(["BANK", "CASH", "UPI", "FOUNDER"]),
              ownerUserId: z.uuid().optional(),
              openingOn: z.iso.date(),
              openingBalance: signedAmount,
            }),
            req.body,
          ),
        ),
      });
    }),
  );
  app.post(
    root + "/account-corrections",
    authenticate,
    run(async (req, res) => {
      res.json({
        data: await ledger.correctAccount(
          actor(res),
          parse(
            z.strictObject({
              id: z.uuid(),
              name: z.string().trim().min(2).max(120),
              openingOn: z.iso.date(),
              openingBalance: signedAmount,
              note,
            }),
            req.body,
          ),
        ),
      });
    }),
  );
  app.get(
    root + "/account-history",
    authenticate,
    run(async (req, res) => {
      res.json({
        data: await ledger.accountHistory(
          actor(res),
          period(req),
          parse(z.uuid(), req.query.accountId),
          page(req),
        ),
      });
    }),
  );
  app.get(
    root + "/unassigned",
    authenticate,
    run(async (req, res) => {
      res.json({ data: await ledger.unassigned(actor(res), period(req), page(req)) });
    }),
  );
  app.post(
    root + "/account-links",
    authenticate,
    run(async (req, res) => {
      res.json({
        data: await ledger.link(
          actor(res),
          parse(
            z.strictObject({
              source: z.enum(["finance", "salary"]),
              id: z.uuid(),
              accountId: z.uuid(),
            }),
            req.body,
          ),
        ),
      });
    }),
  );
  app.get(
    root + "/client-funds",
    authenticate,
    run(async (req, res) => {
      res.json({ data: await ledger.clientBalances(actor(res), period(req)) });
    }),
  );
  app.get(
    root + "/client-funds/history",
    authenticate,
    run(async (req, res) => {
      res.json({
        data: await ledger.clientHistory(
          actor(res),
          period(req),
          parse(z.uuid(), req.query.clientId),
          page(req),
        ),
      });
    }),
  );
  app.post(
    root + "/client-funds",
    authenticate,
    run(async (req, res) => {
      res.status(201).json({
        data: await ledger.recordFunds(
          actor(res),
          parse(
            z.strictObject({
              clientId: z.uuid(),
              accountId: z.uuid(),
              kind: z.enum(["TOPUP", "REFUND"]),
              amount,
              occurredOn: z.iso.date(),
              note,
              reference: z.string().trim().max(160).optional(),
              idempotencyKey: z.uuid(),
            }),
            req.body,
          ),
        ),
      });
    }),
  );
  app.get(
    root + "/transfers",
    authenticate,
    run(async (req, res) => {
      res.json({ data: await ledger.transfers(actor(res), period(req), page(req)) });
    }),
  );
  app.post(
    root + "/transfers",
    authenticate,
    run(async (req, res) => {
      res.status(201).json({
        data: await ledger.transfer(
          actor(res),
          parse(
            z.strictObject({
              fromAccountId: z.uuid(),
              toAccountId: z.uuid(),
              amount,
              occurredOn: z.iso.date(),
              note,
              idempotencyKey: z.uuid(),
            }),
            req.body,
          ),
        ),
      });
    }),
  );
  app.post(
    root + "/reconciliations",
    authenticate,
    run(async (req, res) => {
      res.json({
        data: await ledger.reconcile(
          actor(res),
          parse(
            z.strictObject({
              accountId: z.uuid(),
              asOf: z.iso.date(),
              statementBalance: signedAmount,
              note,
            }),
            req.body,
          ),
        ),
      });
    }),
  );
  app.get(
    root + "/cycle-review",
    authenticate,
    run(async (req, res) => {
      res.json({ data: await ledger.review(actor(res), period(req)) });
    }),
  );
  app.post(
    root + "/cycle-close",
    authenticate,
    run(async (req, res) => {
      const input = parse(
        z.strictObject({
          from: z.iso.date(),
          to: z.iso.date(),
          note,
          confirmed: z.literal(true),
          confirmClientDeficits: z.boolean().optional(),
        }),
        req.body,
      );
      res.json({
        data: await ledger.close(actor(res), input, input.note, input.confirmClientDeficits),
      });
    }),
  );
  app.post(
    root + "/reversals",
    authenticate,
    run(async (req, res) => {
      res.status(201).json({
        data: await ledger.reverse(
          actor(res),
          parse(
            z.strictObject({
              source: z.enum(["FINANCE", "SALARY", "FUNDS", "TRANSFER"]),
              id: z.uuid(),
              occurredOn: z.iso.date(),
              reason: note,
              idempotencyKey: z.uuid(),
            }),
            req.body,
          ),
        ),
      });
    }),
  );
  app.get(
    root + "/category-summary",
    authenticate,
    run(async (req, res) => {
      res.json({
        data: await finance.categorySummary(
          actor(res),
          parse(z.enum(["mine", "all"]).default("mine"), req.query.view),
          period(req),
          parse(z.enum(["INCOME", "EXPENSE"]), req.query.kind),
        ),
      });
    }),
  );
  app.get(
    root + "/register",
    authenticate,
    run(async (req, res) => {
      res.json({
        data: await finance.register(actor(res), {
          ...period(req),
          ...parse(registerQuery, req.query),
        }),
      });
    }),
  );
  app.get(
    root + "/register/export",
    authenticate,
    run(async (req, res) => {
      res.json({
        data: await finance.exportRegister(actor(res), {
          ...period(req),
          ...parse(registerQuery, req.query),
        }),
      });
    }),
  );
}
