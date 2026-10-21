UPDATE "Lead" SET "status"=CASE
 WHEN "status"::text='WON' THEN 'APPROVED'::"LeadStage"
 WHEN "status"::text IN ('CONTACTED','QUALIFIED','PROPOSAL') THEN 'MEETING_PROCESS'::"LeadStage"
 ELSE 'PENDING'::"LeadStage" END
WHERE "status"::text IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','WON','LOST');
ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"LeadStage";
