import type { Prisma } from "@digimarket/db";
import { agencyToday } from "@digimarket/contracts";

export function expiredAgreementWhere(today = agencyToday()): Prisma.ClientWhereInput {
  return {
    OR: [
      { status: "EXPIRED" },
      { agreementEndedOn: { not: null } },
      {
        status: { not: "ARCHIVED" },
        contractEndOn: { not: null, lt: new Date(today + "T00:00:00Z") },
      },
    ],
  };
}

export function agreementExpired(
  client: { status: string; contractEndOn: Date | null; agreementEndedOn?: Date | null },
  today = agencyToday(),
) {
  return (
    client.status === "EXPIRED" ||
    !!client.agreementEndedOn ||
    (client.status !== "ARCHIVED" &&
      !!client.contractEndOn &&
      client.contractEndOn.toISOString().slice(0, 10) < today)
  );
}
