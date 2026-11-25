import {expect,test} from "@playwright/test";
import {compatibleFollowUps} from "../src/lib/followup-compatibility";
const now=new Date("2026-11-25T12:00:00Z");
const endpoint=(query:string)=>new URL("https://backend.example/api/v1/leads/follow-ups?"+query);
const oldResponse=()=>Response.json({data:{items:[],nextCursor:null}});
const invalidView=()=>Response.json({error:{code:"VALIDATION_ERROR",message:'Invalid lead fields: request: Unrecognized key: "view"'}},{status:422});
const fixtures=[
 {id:"00000000-0000-4000-8000-000000000001",businessName:"Old cycle cafe",contactName:"Owner",phone:"9990000000",status:"FOLLOW_UP",nextFollowUpAt:"2026-11-23T12:00:00Z",stageNote:"Call back",temperature:"UNCLASSIFIED",version:1},
 {id:"00000000-0000-4000-8000-000000000002",businessName:"New cycle cafe",contactName:null,phone:null,status:"FOLLOW_UP",nextFollowUpAt:"2026-11-25T12:00:00Z",stageNote:"Send pricing",temperature:"WARM",version:2},
 {id:"00000000-0000-4000-8000-000000000003",businessName:"Hot cafe",contactName:null,phone:null,status:"FOLLOW_UP",nextFollowUpAt:"2026-11-25T12:00:00Z",temperature:"HOT",version:1},
 {id:"00000000-0000-4000-8000-000000000004",businessName:"Later cafe",contactName:null,phone:null,status:"FOLLOW_UP",nextFollowUpAt:"2026-11-27T12:00:00Z",temperature:"COLD",version:1},
];
function legacyReader(){
 let calls=0;
 return {get calls(){return calls;},fetch:async(url:URL)=>{
   calls++;expect(url.pathname).toBe("/api/v1/leads");
   expect(url.searchParams.get("stage")).toBe("FOLLOW_UP");
   expect(url.searchParams.has("cycle")).toBe(false);
   const next=url.searchParams.has("cursor");
   return Response.json({data:{items:next?fixtures.slice(2):fixtures.slice(0,2),nextCursor:next?null:fixtures[1].id,total:4}});
 }};
}
test("deployment skew: old endpoint shape yields complete all-cycle totals and ordered pages",async()=>{
 const reader=legacyReader();
 const response=await compatibleFollowUps(endpoint("limit=2&month=2026-11"),oldResponse(),reader.fetch,now);
 expect(response.status).toBe(200);
 const {data}=await response.json();
 expect(reader.calls).toBe(2);
 expect(data.summary).toEqual({all:4,overdue:1,today:2,upcoming:1});
 expect(data.items.map((r:{id:string})=>r.id)).toEqual([fixtures[0].id,fixtures[2].id]);
 expect(data.items[0].stageNote).toBe("Call back");
 expect(data.calendar["2026-11-25"]).toBe(2);
 expect(data.compatibilityMode).toBe(true);
 const second=await compatibleFollowUps(endpoint("limit=2&cursor="+data.nextCursor),oldResponse(),legacyReader().fetch,now);
 expect((await second.json()).data.items.map((r:{id:string})=>r.id)).toEqual([fixtures[1].id,fixtures[3].id]);
});
test("screenshot 422: old strict API still supports global search, date and temperature filtering",async()=>{
 const response=await compatibleFollowUps(endpoint("limit=20&view=today&q=cafe&temperature=HOT&from=2026-11-25&to=2026-11-25"),invalidView(),legacyReader().fetch,now);
 expect(response.status).toBe(200);
 const {data}=await response.json();
 expect(data.total).toBe(1);expect(data.items[0].id).toBe(fixtures[2].id);
});
test("current API and genuine auth or validation failures pass through",async()=>{
 const current=Response.json({data:{items:[],summary:{all:0},today:"2026-11-25"}});
 const unauthorized=Response.json({error:{code:"UNAUTHORIZED"}},{status:401});
 const invalid=Response.json({error:{code:"VALIDATION_ERROR",message:"Invalid date"}},{status:422});
 const noFetch=async()=>{throw Error("Unexpected fallback");};
 for(const res of [current,unauthorized,invalid])expect(await compatibleFollowUps(endpoint("limit=20"),res,noFetch,now)).toBe(res);
 const denied=await compatibleFollowUps(endpoint("limit=20"),oldResponse(),async()=>unauthorized,now);
 expect(denied.status).toBe(401);
});
test("incomplete fallback pagination does not produce false totals",async()=>{
 const res=await compatibleFollowUps(endpoint("limit=20"),oldResponse(),async()=>Response.json({data:{items:[fixtures[0]],nextCursor:fixtures[0].id}}),now);
 expect(res.status).toBe(503);
});
