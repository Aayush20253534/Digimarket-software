-- Existing Lead.source is VARCHAR(120); no structural schema change is required.
-- Preserve attribution for all previously ingested WhatsApp contacts.
UPDATE "Lead" SET "source"='META_LEADS' WHERE "source"='WHATSAPP';
-- Legacy phone-only/manual leads did not store a source.
UPDATE "Lead" SET "source"='COLD_CALL' WHERE "source" IS NULL;
