-- Store a validated Google Maps share URL with each lead.
ALTER TABLE "Lead" ADD COLUMN "googleMapsUrl" VARCHAR(1000);
