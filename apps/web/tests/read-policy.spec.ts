import {test,expect} from "@playwright/test";
import {readFreshness,affectedReadGroups,prefetchPaths} from "../src/lib/read-policy";
test("financial reads and editable details never retain data",()=>{
 for(const path of ["/finance/summary","/salary/summary","/reports/overview","/leads/id","/agreements/draft","/me"])expect(readFreshness(path)).toBe(0);
 expect(readFreshness("/leads?limit=10")).toBeGreaterThan(0);
});
test("cross-module writes invalidate related reads",()=>{
 expect(affectedReadGroups("/leads/id")).toContain("clients");
 expect(affectedReadGroups("/clients/id/video-readiness/1")).toContain("reports");
 expect(affectedReadGroups("/finance/entries")).toBeNull();
 expect(prefetchPaths("/app/finance")).toEqual([]);
});
