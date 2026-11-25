-- Existing leads and all new intake begin unclassified; never infer intent from historical stages.
CREATE TYPE "LeadTemperature" AS ENUM ('UNCLASSIFIED', 'HOT', 'WARM', 'COLD');
ALTER TABLE "Lead" ADD COLUMN "temperature" "LeadTemperature" NOT NULL DEFAULT 'UNCLASSIFIED';
