import {describe,expect,it} from "vitest";
import {agreementStatus,parseList,quoteStatus,revisionFamily,splitDocument,validityEnd} from "./document-workspace";
describe("document workspace",()=>{
 it("counts quotation validity from the document date inclusively",()=>{expect(validityEnd("2026-11-25",7)).toBe("2026-12-01");expect(quoteStatus(new Date("2026-11-25"),{validityDays:7},"2026-12-01")).toBe("current");expect(quoteStatus(new Date("2026-11-25"),{validityDays:7},"2026-12-02")).toBe("ended");});
 it("keeps future and ended agreement terms separate from signatures",()=>{expect(agreementStatus(new Date("2026-11-25"),new Date("2026-12-24"),"2026-11-24")).toBe("future");expect(agreementStatus(new Date("2026-11-25"),new Date("2026-12-24"),"2026-12-18")).toBe("ending");expect(agreementStatus(new Date("2026-11-25"),new Date("2026-12-24"),"2026-12-25")).toBe("ended");});
 it("limits pagination and rejects malformed links",()=>{expect(parseList({page:"2",limit:"20",q:" Café "}).q).toBe("Café");expect(()=>parseList({limit:"200"})).toThrow();expect(()=>splitDocument({clientName:"Test",links:{clientId:"not-a-uuid"}})).toThrow();expect(splitDocument({clientName:"Test"})).toEqual({payload:{clientName:"Test"},links:{}});});
 it("returns the whole revision family without unrelated records",()=>{const rows=[{id:"a",revisionOfId:null},{id:"b",revisionOfId:"a"},{id:"c",revisionOfId:"b"},{id:"d",revisionOfId:"a"},{id:"x",revisionOfId:null}];expect(revisionFamily(rows,"c").sort()).toEqual(["a","b","c","d"]);expect(revisionFamily(rows,"unknown")).toEqual([]);});
});
