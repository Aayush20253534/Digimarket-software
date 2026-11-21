-- Retire only the dated Client Deliveries module, not Clients, Services,
-- Projects, Video Readiness, or Post Readiness.
-- Preserve a private, non-API copy of historic delivery records before removal.
-- Safe if already applied manually before Prisma records its migration history.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
CREATE SCHEMA IF NOT EXISTS client_delivery_archive_20261121;
REVOKE ALL ON SCHEMA client_delivery_archive_20261121 FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE n_schedules bigint; n_occurrences bigint;
BEGIN
  IF to_regclass('public."ServiceDeliverySchedule"') IS NOT NULL THEN
    IF to_regclass('public."ServiceDeliveryOccurrence"') IS NULL THEN
      RAISE EXCEPTION 'Incomplete client delivery schema; refusing migration';
    END IF;
    CREATE TABLE IF NOT EXISTS client_delivery_archive_20261121."ServiceDeliverySchedule"
      AS SELECT * FROM public."ServiceDeliverySchedule";
    CREATE TABLE IF NOT EXISTS client_delivery_archive_20261121."ServiceDeliveryOccurrence"
      AS SELECT * FROM public."ServiceDeliveryOccurrence";
    SELECT count(*) INTO n_schedules FROM public."ServiceDeliverySchedule";
    SELECT count(*) INTO n_occurrences FROM public."ServiceDeliveryOccurrence";
    IF (SELECT count(*) FROM client_delivery_archive_20261121."ServiceDeliverySchedule") <> n_schedules OR
       (SELECT count(*) FROM client_delivery_archive_20261121."ServiceDeliveryOccurrence") <> n_occurrences THEN
      RAISE EXCEPTION 'Client delivery archive mismatch; refusing destructive change';
    END IF;
    DROP TABLE public."ServiceDeliveryOccurrence";
    DROP TABLE public."ServiceDeliverySchedule";
  END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA client_delivery_archive_20261121
  FROM PUBLIC, anon, authenticated, service_role;
DROP TYPE IF EXISTS public."ServiceOccurrenceStatus";
COMMIT;
