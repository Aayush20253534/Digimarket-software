import {agencyToday,followUpListQuerySchema,type LeadTemperature} from "@digimarket/contracts";
type Row={id:string;businessName:string;contactName:string|null;phone:string|null;status:string;nextFollowUpAt:string|null;stageNote?:string|null;temperature?:LeadTemperature;version:number};
type LegacyPage={items:Row[];nextCursor:string|null;total?:number};
const priority:LeadTemperature[]=["HOT","WARM","COLD","UNCLASSIFIED"];
const dateOf=(r:Row)=>r.nextFollowUpAt?.slice(0,10)??"";
const tempOf=(r:Row)=>r.temperature??"UNCLASSIFIED";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const unavailable=()=>json({error:{code:"FOLLOW_UP_API_NOT_DEPLOYED",message:"The older API cannot return the complete follow-up register. Deploy the latest main branch on Render, then refresh."}},503);
// Deployment-skew adapter: read the existing tenant-scoped Leads API with the
// caller's own credentials. Never return partial pages as global counts.
export async function compatibleFollowUps(url:URL,response:Response,fetchPage:(url:URL)=>Promise<Response>,now=new Date()):Promise<Response>{
 if(response.status!==200&&response.status!==422)return response;
 const payload=await response.clone().json().catch(()=>null);
 const oldShape=response.ok&&Array.isArray(payload?.data?.items)&&payload.data.summary===undefined;
 const oldValidation=response.status===422&&payload?.error?.code==="VALIDATION_ERROR"&&
   /Unrecognized key[s]?:/i.test(payload.error.message??"")&&
   /\b(view|q|temperature|from|to|month)\b/.test(payload.error.message??"");
 if(!oldShape&&!oldValidation)return response;
 const parsed=followUpListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
 if(!parsed.success)return json({error:{code:"VALIDATION_ERROR",message:"Invalid follow-up filters"}},422);
 const input=parsed.data,rows:Row[]=[],seen=new Set<string>(),cursors=new Set<string>();
 let cursor:string|null=null;
 for(let i=0;i<50;i++){
   const target=new URL("/api/v1/leads",url.origin);
   target.searchParams.set("stage","FOLLOW_UP");target.searchParams.set("limit","100");
   if(cursor)target.searchParams.set("cursor",cursor);
   const result=await fetchPage(target);
   if(!result.ok)return result;
   const value=await result.json().catch(()=>null) as {data?:LegacyPage}|null;
   const data=value?.data;
   if(!data||!Array.isArray(data.items))return unavailable();
   for(const r of data.items){
     if(!r.id||seen.has(r.id))return unavailable();
     seen.add(r.id);
     if(r.status==="FOLLOW_UP"&&r.nextFollowUpAt)rows.push(r);
   }
   cursor=data.nextCursor;
   if(!cursor){if(typeof data.total==="number"&&seen.size!==data.total)return unavailable();break;}
   if(cursors.has(cursor)||i===49)return unavailable();
   cursors.add(cursor);
 }
 const today=agencyToday(now),bucket=(r:Row):"overdue"|"today"|"upcoming"=>dateOf(r)<today?"overdue":dateOf(r)===today?"today":"upcoming";
 const search=input.q?.toLowerCase();
 const matches=rows.filter(r=>(!input.temperature||tempOf(r)===input.temperature)&&(!search||[r.businessName,r.contactName??"",r.phone??""].some(v=>v.toLowerCase().includes(search))));
 const scoped=matches.filter(r=>(!input.from||dateOf(r)>=input.from)&&(!input.to||dateOf(r)<=input.to));
 const summary={all:scoped.length,overdue:0,today:0,upcoming:0};
 for(const r of scoped)summary[bucket(r)]++;
 const calendar:Record<string,number>={};
 if(input.month)for(const r of matches){const day=dateOf(r);if(day.startsWith(input.month+"-"))calendar[day]=(calendar[day]??0)+1;}
 const filtered=scoped.filter(r=>!input.view||input.view==="all"||bucket(r)===input.view)
 .sort((a,b)=>dateOf(a).localeCompare(dateOf(b))||priority.indexOf(tempOf(a))-priority.indexOf(tempOf(b))||(a.id<b.id?-1:a.id>b.id?1:0));
 const start=input.cursor?filtered.findIndex(r=>r.id===input.cursor)+1:0;
 const items=filtered.slice(start,start+input.limit).map(r=>({id:r.id,businessName:r.businessName,contactName:r.contactName,phone:r.phone,nextFollowUpAt:r.nextFollowUpAt,stageNote:r.stageNote??"",temperature:tempOf(r),version:r.version}));
 return json({data:{items,total:filtered.length,today,summary,calendar,compatibilityMode:true,nextCursor:start+input.limit<filtered.length?items.at(-1)?.id??null:null}});
}
