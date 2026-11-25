import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { PrismaClient } from "@digimarket/db";
import type { AuthService, Principal } from "../auth/service";
import { createApp } from "../app";
import { ClientsService } from "./service";
import { FinanceService } from "../finance/service";

export async function verifyAgreementExpiry(db: PrismaClient) {
  const today = () => "2026-11-17",
    clients = new ClientsService(db, today),
    finance = new FinanceService(db, today);
  const org = await db.organization.create({ data: { name: "Agreement end CI " + randomUUID() } });
  const other = await db.organization.create({
    data: { name: "Other agreement CI " + randomUUID() },
  });
  const user = await db.user.create({
    data: { organizationId: org.id, loginId: "founder", displayName: "Founder", status: "ACTIVE" },
  });
  const actor: Principal = {
    organizationId: org.id,
    userId: user.id,
    sessionId: "test",
    roles: ["FOUNDER"],
    permissions: new Set([
      "clients.read",
      "clients.edit",
      "finance.read.all",
      "finance.entry.read.own",
      "finance.entry.create",
      "finance.category.manage",
    ]),
  };
  const reader = { ...actor, permissions: new Set(["clients.read"]) },
    outsider = { ...actor, organizationId: other.id };
  const make = (
    businessName: string,
    end: string | null,
    fee: string,
    status: "ACTIVE" | "PAUSED" | "ARCHIVED" = "ACTIVE",
  ) =>
    db.client.create({
      data: {
        organizationId: org.id,
        createdById: user.id,
        businessName,
        status,
        contractStartOn: new Date("2026-10-22"),
        contractEndOn: end ? new Date(end) : null,
        monthlyFee: fee,
      },
    });
  const active = await make("Agreement ended early", "2026-12-22", "15000");
  await db.client.update({ where: { id: active.id }, data: { monthlyAdBudget: "3000" } });
  const open = await make("Open-ended agreement", null, "2500");
  const endsToday = await make("Ends today", "2026-11-17", "1000");
  const expired = await make("Already expired", "2026-11-16", "9000");
  const paused = await make("Paused agreement", "2026-12-22", "8000", "PAUSED");
  const archived = await make("Archived agreement", "2026-11-01", "7000", "ARCHIVED");
  const period = { from: "2026-10-22", to: "2026-11-21" };
  const before = await finance.recurringIncome(actor, period);
  assert.equal(before.monthlyServiceTotal, "18500.0000");
  assert.equal(before.monthlyAdBudgetTotal, "3000.0000");
  assert.deepEqual(
    new Set(before.items.map((c) => c.id)),
    new Set([active.id, open.id, endsToday.id]),
  );
  const current = await clients.list(actor, { section: "current", limit: 100 });
  assert.deepEqual(
    new Set(current.items.map((c) => c.id)),
    new Set([active.id, open.id, endsToday.id, paused.id, archived.id]),
  );
  assert.deepEqual(
    (await clients.list(actor, { section: "expired", limit: 100 })).items.map((c) => c.id),
    [expired.id],
  );
  assert.deepEqual(
    (await clients.list(actor, { status: "EXPIRED", limit: 100 })).items.map((c) => c.id),
    [expired.id],
  );
  assert.equal((await clients.list(actor, { status: "ACTIVE", limit: 100 })).items.length, 3);
  assert.equal(
    (await db.client.findUniqueOrThrow({ where: { id: expired.id } })).status,
    "ACTIVE",
    "reads must not mutate natural expiry",
  );
  const category = await finance.addCategory(actor, {
    kind: "INCOME",
    name: "Received service fees",
  });
  await finance.submit(actor, {
    kind: "INCOME",
    categoryId: category.id,
    amount: "5000",
    occurredOn: "2026-11-01",
    method: "UPI",
    idempotencyKey: randomUUID(),
  });
  const input = {
    version: active.version,
    endedOn: "2026-11-16",
    reason: "Client ended the service agreement",
  };
  const fail = (status: number) => (e: unknown) => (e as { status: number }).status === status;
  await assert.rejects(() => clients.endAgreement(reader, active.id, input), fail(403));
  await assert.rejects(() => clients.endAgreement(outsider, active.id, input), fail(404));
  await assert.rejects(
    () => clients.endAgreement(actor, active.id, { ...input, endedOn: "2026-11-18" }),
    fail(422),
  );
  await assert.rejects(
    () => clients.endAgreement(actor, active.id, { ...input, endedOn: "2026-10-21" }),
    fail(422),
  );
  await assert.rejects(
    () => clients.endAgreement(actor, expired.id, { ...input, endedOn: "2026-11-17" }),
    fail(422),
  );
  await assert.rejects(() => clients.endAgreement(actor, archived.id, input), fail(422));
  await assert.rejects(
    () => clients.update(actor, active.id, { version: 1, status: "EXPIRED" }),
    fail(422),
  );
  const results = await Promise.allSettled([
    clients.endAgreement(actor, active.id, input),
    clients.endAgreement(actor, active.id, input),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected" && fail(409)(r.reason)).length, 1);
  const ended = await clients.detail(actor, active.id);
  assert.equal(ended.status, "EXPIRED");
  assert.equal(ended.agreementExpired, true);
  assert.equal(ended.version, 2);
  assert.equal(
    ended.contractEndOn?.toISOString().slice(0, 10),
    "2026-12-22",
    "keep original agreement date",
  );
  assert.equal(ended.agreementEndedOn?.toISOString().slice(0, 10), input.endedOn);
  assert.equal(ended.agreementEndReason, input.reason);
  assert.equal((await clients.detail(reader, active.id)).monthlyFee, null);
  assert.equal(
    (await clients.list(actor, { section: "current", limit: 100 })).items.some(
      (c) => c.id === active.id,
    ),
    false,
  );
  const expiredPage = await clients.list(actor, {
    section: "expired",
    limit: 1,
    sort: "businessName",
    direction: "asc",
  });
  assert.ok(expiredPage.nextCursor);
  const secondPage = await clients.list(actor, {
    section: "expired",
    limit: 1,
    sort: "businessName",
    direction: "asc",
    cursor: expiredPage.nextCursor!,
  });
  assert.notEqual(expiredPage.items[0].id, secondPage.items[0].id);
  assert.equal(secondPage.nextCursor, null);
  assert.equal((await clients.list(outsider, { section: "expired", limit: 30 })).items.length, 0);
  const after = await finance.recurringIncome(actor, period);
  assert.equal(after.monthlyServiceTotal, "3500.0000");
  assert.equal(after.monthlyAdBudgetTotal, "0.0000");
  assert.equal(
    (await finance.totals(actor, "all", period)).postedIncome,
    "5000.0000",
    "posted income is unaffected",
  );
  assert.equal(
    (await clients.list(actor, {section:"current",limit:30})).items.some((c) => c.id === active.id),
    false,
  );
  assert.equal(
    await db.auditLog.count({
      where: { organizationId: org.id, entityId: active.id, action: "clients.agreement_ended" },
    }),
    1,
  );
  await assert.rejects(
    () => clients.endAgreement(actor, active.id, { ...input, version: 2 }),
    fail(409),
  );
  await assert.rejects(
    () => clients.update(actor, active.id, { version: 2, status: "ACTIVE" }),
    fail(422),
  );
  await clients.update(actor, active.id, { version: 2, notes: "History remains accessible" });
  assert.equal((await clients.detail(actor, active.id)).status, "EXPIRED");
  const overviewBefore=await clients.overview(actor,active.id);
  assert.equal(overviewBefore.financial?.invoiceCount,0);
  assert.equal((await clients.overview(reader,active.id)).financial,null);
  await assert.rejects(()=>clients.overview(outsider,active.id),fail(404));
  const register=await clients.list(actor,{workspace:"1",limit:1});
  assert.equal(register.summary?.all,6);
  assert.equal(register.items.length,1);
  assert.equal((await clients.list(reader,{workspace:"1",limit:1})).summary?.monthlyFees,null);
  assert.equal((await clients.list(reader,{limit:100})).items.every(c=>c.monthlyFee===null),true);
  const beforeRenew=await clients.detail(actor,active.id);
  const renew={version:beforeRenew.version,startOn:"2026-11-17",endOn:"2026-12-31",monthlyFee:"17000",monthlyAdBudget:"4000",reason:"Returning client"};
  await assert.rejects(()=>clients.renew(reader,active.id,renew),fail(403));
  await assert.rejects(()=>clients.renew(outsider,active.id,renew),fail(404));
  await assert.rejects(()=>clients.renew(actor,active.id,{...renew,startOn:"2026-11-16"}),fail(422));
  await clients.renew(actor,active.id,renew);
  const renewed=await clients.detail(actor,active.id);
  assert.equal(renewed.id,active.id);
  assert.equal(renewed.contractStartOn?.toISOString().slice(0,10),"2026-10-22");
  assert.equal(renewed.currentAgreementStartOn?.toISOString().slice(0,10),"2026-11-17");
  assert.equal(renewed.agreementEndedOn,null);
  assert.equal(renewed.agreementExpired,false);
  assert.equal((await clients.overview(actor,active.id)).history.some(e=>e.action==="clients.reactivated"),true);
  await assert.rejects(()=>clients.renew(actor,active.id,renew),fail(409));
  const managed=await clients.update(actor,active.id,{version:renewed.version,health:"HEALTHY",managerId:user.id,onboarding:["AGREEMENT","BILLING"]});
  assert.equal(managed.health,"HEALTHY");
  assert.equal(managed.managerId,user.id);
  await clients.saveService(actor,active.id,{name:"Meta Ads",status:"ACTIVE"});
  await clients.saveService(actor,active.id,{name:"Meta Ads",status:"PAUSED"});
  assert.equal((await clients.overview(actor,active.id)).services.filter(s=>s.name==="Meta Ads").length,1);
  assert.equal((await clients.list(actor,{health:"HEALTHY",managerId:user.id,limit:10})).items[0]?.id,active.id);
  const nextDay = new ClientsService(db, () => "2026-11-18");
  assert.equal(
    (await nextDay.list(actor, { section: "expired", limit: 100 })).items.some(
      (c) => c.id === endsToday.id,
    ),
    true,
  );
  const auth = {
    database: db,
    config: {},
    authenticate: async () => actor,
  } as unknown as AuthService;
  const app = createApp([], auth),
    url = "/api/v1/clients/" + paused.id + "/end-agreement";
  assert.equal((await request(app).post(url).send(input)).status, 401);
  assert.equal(
    (
      await request(app)
        .post(url)
        .set("Authorization", "Bearer test")
        .send({ ...input, reason: "x" })
    ).status,
    422,
  );
  assert.equal(
    (await request(app).post(url).set("Authorization", "Bearer test").send(input)).status,
    200,
  );
  assert.equal(
    (await request(app).get("/api/v1/clients?section=expired").set("Authorization", "Bearer test"))
      .status,
    200,
  );
  console.log(
    "Client agreement expiry passed: early ending, natural expiry, projections, audit/version/tenant checks and preserved posted income",
  );
}
