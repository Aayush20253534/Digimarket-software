-- Remove the retired Client Deliveries scheduling feature.
-- The historic 25 plans and 89 occurrences are copied into a non-API archive
-- before removal. This archive is intentionally not exposed to application users.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS client_delivery_archive_20261121;
REVOKE ALL ON SCHEMA client_delivery_archive_20261121 FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS client_delivery_archive_20261121."ServiceDeliverySchedule"
  AS SELECT * FROM public."ServiceDeliverySchedule";
CREATE TABLE IF NOT EXISTS client_delivery_archive_20261121."ServiceDeliveryOccurrence"
  AS SELECT * FROM public."ServiceDeliveryOccurrence";

REVOKE ALL ON ALL TABLES IN SCHEMA client_delivery_archive_20261121
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE source_schedules bigint; source_occurrences bigint;
BEGIN
  SELECT count(*) INTO source_schedules FROM public."ServiceDeliverySchedule";
  SELECT count(*) INTO source_occurrences FROM public."ServiceDeliveryOccurrence";
  IF (SELECT count(*) FROM client_delivery_archive_20261121."ServiceDeliverySchedule") <> source_schedules OR
     (SELECT count(*) FROM client_delivery_archive_20261121."ServiceDeliveryOccurrence") <> source_occurrences THEN
    RAISE EXCEPTION 'Client delivery archival failed; refusing destructive schema change';
  END IF;
END $$;

DROP TABLE public."ServiceDeliveryOccurrence";
DROP TABLE public."ServiceDeliverySchedule";
DROP TYPE public."ServiceOccurrenceStatus";
