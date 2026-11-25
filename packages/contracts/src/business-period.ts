import { z } from "zod";

export const AGENCY_START_DATE = "2026-10-22";
export const AGENCY_TIME_ZONE = "Asia/Kolkata";
const DAY = 86_400_000;
export type ReportingPeriod = { from: string; to: string };
const iso = (value: Date) => value.toISOString().slice(0, 10);

/** A civil date in the agency timezone; do not use this for PostgreSQL DATE values. */
export function agencyToday(now = new Date()): string {
  return iso(new Date(now.getTime() + 330 * 60_000));
}

/** The closing 22nd is exclusive: it belongs only to the next work cycle. */
export function businessCycle(date = agencyToday(), offset = 0) {
  const [year, month, day] = date.split("-").map(Number);
  const index = month - 1 - (day < 22 ? 1 : 0) + offset;
  const start = new Date(Date.UTC(year, index, 22));
  const end = new Date(Date.UTC(year, index + 1, 22));
  return { key: iso(start).slice(0, 7), from: iso(start),
    to: iso(new Date(end.getTime() - DAY)), endExclusive: iso(end) };
}

export function cycleLabel(key: string): string {
  const cycle = businessCycle(key + "-22");
  const format = (date: string) => new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", {
    timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
  });
  return format(cycle.from) + " – " + format(cycle.to);
}

export function reportingPreset(kind: "current" | "previous" | "three" | "year" | "all", now = new Date()): ReportingPeriod {
  const today = agencyToday(now), cycle = businessCycle(today, kind === "previous" ? -1 : 0);
  let from = cycle.from;
  if (kind === "three") from = businessCycle(today, -2).from;
  if (kind === "all") from = AGENCY_START_DATE;
  if (kind === "year") {
    const year = Number(today.slice(0, 4)) - (today.slice(5) < "10-22" ? 1 : 0);
    from = year + "-10-22";
  }
  from = from < AGENCY_START_DATE ? AGENCY_START_DATE : from;
  return { from, to: cycle.to < from ? businessCycle(from).to : cycle.to };
}

export const reportingPeriodQuerySchema = z.object({
  from: z.iso.date().optional(), to: z.iso.date().optional(),
}).transform(value => ({ from: value.from ?? reportingPreset("current").from,
  to: value.to ?? reportingPreset("current").to }))
  .refine(value => value.from <= value.to, "End date precedes start date");

/** DATE fields are stored at UTC midnight; timestamp fields use Indian civil days. */
export function dateOnlyRange(period: ReportingPeriod) {
  return { gte: new Date(period.from + "T00:00:00.000Z"), lte: new Date(period.to + "T00:00:00.000Z") };
}
export function agencyTimestampRange(period: ReportingPeriod) {
  const start = new Date(period.from + "T00:00:00+05:30");
  const next = new Date(new Date(period.to + "T00:00:00+05:30").getTime() + DAY);
  return { gte: start, lt: next };
}

// Tasks are paused, not removed. Their schema, records and implementations remain intact.
export const TASKS_ENABLED: boolean = false;

/** Started lead acquisition cycles only, newest first; never manufacture future periods. */
export function leadCycles(now = new Date()) {
  const today=agencyToday(now);
  const cycles:ReturnType<typeof businessCycle>[]=[];
  for(let offset=0;;offset--){
    const cycle=businessCycle(today,offset);
    if(cycle.from<AGENCY_START_DATE)break;
    cycles.push(cycle);
  }
  return cycles;
}
/** Missing cycle means the complete organization history, including legacy leads. */
export const leadCycleKeySchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(key=>key>=AGENCY_START_DATE.slice(0,7)&&key<=businessCycle().key,"Choose a started business cycle");
export const leadCycleQuerySchema=z.strictObject({cycle:leadCycleKeySchema.optional()});
export function leadCycleTimestampRange(key:string){return agencyTimestampRange(businessCycle(key+"-22"));}

/** Compare full completed cycles or equal elapsed days of an open cycle. */
export function comparisonPeriod(period:ReportingPeriod,today=agencyToday()):{current:ReportingPeriod;previous:ReportingPeriod}|null{
 const cycle=businessCycle(period.from);
 if(cycle.from!==period.from||cycle.to!==period.to||period.from>today)return null;
 const previous=businessCycle(period.from,-1);
 if(previous.from<AGENCY_START_DATE)return null;
 if(period.to<=today)return {current:period,previous};
 const days=Math.round((Date.parse(today)-Date.parse(period.from))/86400000);
 const end=new Date(Date.parse(previous.from)+days*86400000).toISOString().slice(0,10);
 if(end>previous.to)return null;
 return {current:{from:period.from,to:today},previous:{from:previous.from,to:end}};
}
