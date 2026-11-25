-- Freeze the dates of previously stored intervals. Quantities, notes, versions and keys remain untouched.
ALTER TABLE "ClientVideoWeek" ADD COLUMN "periodFrom" DATE, ADD COLUMN "periodTo" DATE;
ALTER TABLE "ClientVideoWeek" DROP CONSTRAINT "ClientVideoWeek_week_valid", ADD CONSTRAINT "ClientVideoWeek_week_valid" CHECK ("week" BETWEEN 1 AND 36);
WITH starts AS (
 SELECT w.id, (w.month || '-01')::date AS first_day, c."contractStartOn" AS anchor, c."contractEndOn" AS contract_end, w.week
 FROM "ClientVideoWeek" w JOIN "Client" c ON c.id=w."clientId"
), ranges AS (
 SELECT *, CASE WHEN anchor IS NULL THEN first_day + (week-1)*7
 ELSE anchor + (GREATEST(0, CEIL((first_day-anchor)::numeric/7)::integer)+week-1)*7 END AS from_day FROM starts
)
UPDATE "ClientVideoWeek" w SET "periodFrom"=r.from_day, "periodTo"=LEAST(r.from_day+6,
 CASE WHEN r.anchor IS NULL AND r.from_day< (r.first_day+interval '1 month')::date THEN (r.first_day+interval '1 month - 1 day')::date ELSE r.from_day+6 END,
 CASE WHEN r.contract_end>=r.from_day THEN r.contract_end ELSE r.from_day+6 END)
FROM ranges r WHERE w.id=r.id;
ALTER TABLE "ClientVideoWeek" ADD CONSTRAINT "ClientVideoWeek_period_valid" CHECK (("periodFrom" IS NULL AND "periodTo" IS NULL AND "week"<=5) OR ("periodFrom" IS NOT NULL AND "periodTo" IS NOT NULL AND "periodFrom"<="periodTo" AND "periodTo"-"periodFrom"<=6 AND ("week"<=5 OR ("week"=5+EXTRACT(DAY FROM "periodFrom") AND month=to_char("periodFrom",'YYYY-MM')))));

-- Freeze the dates of previously stored intervals. Quantities, notes, versions and keys remain untouched.
ALTER TABLE "ClientPostWeek" ADD COLUMN "periodFrom" DATE, ADD COLUMN "periodTo" DATE;
ALTER TABLE "ClientPostWeek" DROP CONSTRAINT "ClientPostWeek_week_valid", ADD CONSTRAINT "ClientPostWeek_week_valid" CHECK ("week" BETWEEN 1 AND 36);
WITH starts AS (
 SELECT w.id, (w.month || '-01')::date AS first_day, c."contractStartOn" AS anchor, c."contractEndOn" AS contract_end, w.week
 FROM "ClientPostWeek" w JOIN "Client" c ON c.id=w."clientId"
), ranges AS (
 SELECT *, CASE WHEN anchor IS NULL THEN first_day + (week-1)*7
 ELSE anchor + (GREATEST(0, CEIL((first_day-anchor)::numeric/7)::integer)+week-1)*7 END AS from_day FROM starts
)
UPDATE "ClientPostWeek" w SET "periodFrom"=r.from_day, "periodTo"=LEAST(r.from_day+6,
 CASE WHEN r.anchor IS NULL AND r.from_day< (r.first_day+interval '1 month')::date THEN (r.first_day+interval '1 month - 1 day')::date ELSE r.from_day+6 END,
 CASE WHEN r.contract_end>=r.from_day THEN r.contract_end ELSE r.from_day+6 END)
FROM ranges r WHERE w.id=r.id;
ALTER TABLE "ClientPostWeek" ADD CONSTRAINT "ClientPostWeek_period_valid" CHECK (("periodFrom" IS NULL AND "periodTo" IS NULL AND "week"<=5) OR ("periodFrom" IS NOT NULL AND "periodTo" IS NOT NULL AND "periodFrom"<="periodTo" AND "periodTo"-"periodFrom"<=6 AND ("week"<=5 OR ("week"=5+EXTRACT(DAY FROM "periodFrom") AND month=to_char("periodFrom",'YYYY-MM')))));
