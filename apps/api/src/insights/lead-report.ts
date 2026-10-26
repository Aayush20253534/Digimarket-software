import {Prisma,type PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {forbidden,invalid} from "../auth/errors";

export type LeadAnalyticsQuery={
 from:string;to:string;source?:"META_LEADS"|"COLD_CALL"|"REFERRAL";stage?:string;
 assignedToId?:string;businessType?:string;location?:string;q?:string;
 page:number;limit:number;
};
const STAGES=["YET_TO_CALL","PENDING","CALL_NOT_PICKING","CALL_BUSY","FOLLOW_UP","MEETING_PROCESS","DECISION_PENDING","AGREEMENT_PENDING","APPROVED","REJECTED"];
const ACTIVE=new Set(["PENDING","YET_TO_CALL","CALL_NOT_PICKING","CALL_BUSY","FOLLOW_UP","MEETING_PROCESS","DECISION_PENDING","AGREEMENT_PENDING","NEW","CONTACTED","QUALIFIED","PROPOSAL"]);
const percentage=(part:number,total:number)=>total?Math.round(part/total*10000)/100:0;
const isoDay=(date:Date)=>date.toISOString().slice(0,10);
const weekStart=(date:Date)=>{
 const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
 d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
 return isoDay(d);
};
const group=<T>(rows:T[],key:(row:T)=>string)=>Array.from(rows.reduce((acc,row)=>{
 const label=key(row);acc.set(label,(acc.get(label)??0)+1);return acc;
},new Map<string,number>()),([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
const safeCsv=(value:unknown)=>{
 const string=String(value??"");
 return '"'+(/^\s*[=+@\-\t\r]/.test(string)?"'":"")+string.replaceAll('"','""')+'"';
};
const acquisition=(source:string|null)=>source==="META_LEADS"||source==="WHATSAPP"?"META_LEADS":
 source==="COLD_CALL"||!source?"COLD_CALL":source==="REFERRAL"?"REFERRAL":"OTHER";
export class LeadAnalyticsService{
 constructor(private readonly db:PrismaClient){}
 private scoped(a:Principal,q:LeadAnalyticsQuery):Prisma.LeadWhereInput{
  if(!a.permissions.has("reports.business.read")||!a.permissions.has("leads.read"))throw forbidden();
  if(q.from>q.to)throw invalid("Invalid reporting period");
  return {organizationId:a.organizationId,deletedAt:null,
   createdAt:{gte:new Date(q.from+"T00:00:00.000Z"),lte:new Date(q.to+"T23:59:59.999Z")},
   ...(q.source?{AND:[{OR:q.source==="META_LEADS"?[{source:"META_LEADS"},{source:"WHATSAPP"}]:
     q.source==="COLD_CALL"?[{source:"COLD_CALL"},{source:null}]:[{source:"REFERRAL"}]}]}:{}),
   ...(q.stage?{status:q.stage as Prisma.EnumLeadStageFilter["equals"]}:{}),
   ...(q.assignedToId?{assignedToId:q.assignedToId}:{}),
   ...(q.businessType?{businessType:q.businessType}:{}),
   ...(q.location?{location:q.location}:{}),
   ...(q.q?{OR:[
     {businessName:{contains:q.q,mode:"insensitive"}},
     {contactName:{contains:q.q,mode:"insensitive"}},
     {phone:{contains:q.q}},
     {businessType:{contains:q.q,mode:"insensitive"}},
     {location:{contains:q.q,mode:"insensitive"}},
     {assignee:{displayName:{contains:q.q,mode:"insensitive"}}},
   ]}:{})
  };
 }
 private async snapshot(a:Principal,q:LeadAnalyticsQuery){
  const where=this.scoped(a,q);
  const leads=await this.db.lead.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],
   select:{id:true,businessName:true,contactName:true,phone:true,businessType:true,location:true,
    source:true,status:true,assignedToId:true,nextFollowUpAt:true,createdAt:true,updatedAt:true,
    assignee:{select:{displayName:true}},convertedClient:{select:{id:true,createdAt:true}}},
  });
  return leads;
 }
 async report(a:Principal,q:LeadAnalyticsQuery){
  const leads=await this.snapshot(a,q);
  const now=new Date(),dayMs=86400000,total=leads.length;
  // Stage history must come from persisted transitions, never inferred from the latest status.
  const activities=leads.length?await this.db.leadActivity.findMany({
   where:{leadId:{in:leads.map(x=>x.id)},kind:"STAGE_CHANGED"},
   select:{leadId:true,createdAt:true,metadata:true},orderBy:{createdAt:"asc"},
  }):[];
  const reached=new Map<string,Set<string>>();
  const approvalAt=new Map<string,Date>();
  for(const lead of leads)reached.set(lead.id,new Set([lead.status]));
  for(const activity of activities){
   const metadata=activity.metadata;
   if(!metadata||typeof metadata!=="object"||Array.isArray(metadata))continue;
   const stage=metadata.toStatus;
   if(typeof stage!=="string")continue;
   reached.get(activity.leadId)?.add(stage);
   if(stage==="APPROVED"&&!approvalAt.has(activity.leadId))approvalAt.set(activity.leadId,activity.createdAt);
  }
  const approved=leads.filter(x=>x.status==="APPROVED");
  const converted=leads.filter(x=>x.status==="APPROVED"&&!!x.convertedClient);
  const inPipeline=leads.filter(x=>ACTIVE.has(x.status));
  const overdue=inPipeline.filter(x=>x.nextFollowUpAt&&x.nextFollowUpAt<now).length;
  const upcoming=inPipeline.filter(x=>x.nextFollowUpAt&&x.nextFollowUpAt>=now&&x.nextFollowUpAt<=new Date(now.getTime()+7*dayMs)).length;
  const later=inPipeline.filter(x=>x.nextFollowUpAt&&x.nextFollowUpAt>new Date(now.getTime()+7*dayMs)).length;
  const noFollowUp=inPipeline.filter(x=>!x.nextFollowUpAt).length;
  const ages=approved.map(x=>{
   const at=approvalAt.get(x.id)??x.convertedClient?.createdAt;
   return at?Math.max(0,(at.getTime()-x.createdAt.getTime())/dayMs):null;
  }).filter((x):x is number=>x!==null);
  const averageApprovalDays=ages.length?Math.round(ages.reduce((a,b)=>a+b,0)/ages.length*10)/10:null;
  const tally=(predicate:(id:string)=>boolean)=>leads.filter(x=>predicate(x.id)).length;
  const funnel=[
   {name:"Created",count:total},
   {name:"Meeting process",count:tally(id=>reached.get(id)?.has("MEETING_PROCESS")??false)},
   {name:"Decision pending",count:tally(id=>reached.get(id)?.has("DECISION_PENDING")??false)},
   {name:"Agreement pending",count:tally(id=>reached.get(id)?.has("AGREEMENT_PENDING")??false)},
   {name:"Approved",count:approved.length},
   {name:"Client converted",count:converted.length},
  ];
  const trend=(period:"daily"|"weekly"|"monthly")=>{
   const rows=group(leads,x=>period==="daily"?isoDay(x.createdAt):
    period==="weekly"?weekStart(x.createdAt):isoDay(x.createdAt).slice(0,7));
   return rows.sort((a,b)=>a.name.localeCompare(b.name));
  };
  const sources=["META_LEADS","COLD_CALL","REFERRAL","OTHER"].map(name=>{
   const items=leads.filter(x=>acquisition(x.source)===name);
   const aCount=items.filter(x=>x.status==="APPROVED").length;
   const cCount=items.filter(x=>x.status==="APPROVED"&&x.convertedClient).length;
   return {name,total:items.length,approved:aCount,converted:cCount,
    approvalRate:percentage(aCount,items.length),conversionRate:percentage(cCount,items.length)};
  });
  const stages=Array.from(new Set([...STAGES,...leads.map(x=>x.status)])).map(name=>({
   name,count:leads.filter(x=>x.status===name).length
  }));
  const byAssignee=new Map<string,{id:string|null;name:string;total:number;approved:number;converted:number;meetings:number}>();
  for(const lead of leads){
   const id=lead.assignedToId??"unassigned",name=lead.assignee?.displayName??"Unassigned";
   const found=byAssignee.get(id)??{id:lead.assignedToId,name,total:0,approved:0,converted:0,meetings:0};
   found.total++;if(lead.status==="APPROVED")found.approved++;
   if(lead.status==="APPROVED"&&lead.convertedClient)found.converted++;
   if(reached.get(lead.id)?.has("MEETING_PROCESS"))found.meetings++;
   byAssignee.set(id,found);
  }
  const team=Array.from(byAssignee.values()).map(x=>({...x,
   conversionRate:percentage(x.converted,x.total)})).sort((a,b)=>b.total-a.total);
  const categories=group(leads,x=>x.businessType?.trim()||"Not specified");
  const locations=group(leads,x=>x.location?.trim()||"Not specified");
  const start=(q.page-1)*q.limit;
  const items=leads.slice(start,start+q.limit).map(x=>({
   id:x.id,businessName:x.businessName,contactName:x.contactName,phone:x.phone,
   source:acquisition(x.source),status:x.status,businessType:x.businessType,location:x.location,
   assignedToId:x.assignedToId,assignee:x.assignee?.displayName??"Unassigned",
   createdAt:x.createdAt.toISOString(),updatedAt:x.updatedAt.toISOString(),
   nextFollowUpAt:x.nextFollowUpAt?.toISOString()??null,
   approved:x.status==="APPROVED",converted:x.status==="APPROVED"&&!!x.convertedClient,
   ageDays:Math.max(0,Math.floor((now.getTime()-x.createdAt.getTime())/dayMs)),
  }));
  return {from:q.from,to:q.to,asOf:now.toISOString(),
   summary:{total,approved:approved.length,converted:converted.length,
    approvalRate:percentage(approved.length,total),conversionRate:percentage(converted.length,total),
    meta:sources[0].total,cold:sources[1].total,referral:sources[2].total,meetings:funnel[1].count,
    decisionPending:stages.find(x=>x.name==="DECISION_PENDING")?.count??0,
    agreementPending:stages.find(x=>x.name==="AGREEMENT_PENDING")?.count??0,
    rejected:stages.find(x=>x.name==="REJECTED")?.count??0,
    overdue,averageApprovalDays,approvalTimingSample:ages.length},
   trends:{daily:trend("daily"),weekly:trend("weekly"),monthly:trend("monthly")},
   sources,stages,funnel,team,categories,locations,
   followUps:[{name:"Overdue",count:overdue},{name:"Next 7 days",count:upcoming},
    {name:"Later",count:later},{name:"Not scheduled",count:noFollowUp}],
   assignees:team.filter(x=>x.id!==null).map(x=>({id:x.id,name:x.name})),
   totalPages:Math.max(1,Math.ceil(total/q.limit)),page:q.page,limit:q.limit,hasMore:start+q.limit<total,items,
   definitions:{
    cohort:"Non-deleted leads created during the inclusive UTC date range. All filters apply to cards, charts and table.",
    approved:"Leads whose current status is APPROVED.",
    converted:"APPROVED leads linked to a client record, counted separately.",
    funnel:"Each stage counts leads with a recorded stage transition or matching current stage. Stages can be skipped, so counts are not necessarily decreasing.",
    timing:"Approval duration uses a recorded APPROVED transition or linked client creation date. Leads without such timestamps are excluded.",
    followups:"Follow-up buckets use the current follow-up schedule for open leads in this cohort, not a historical snapshot.",
   }};
 }
 async csv(a:Principal,q:LeadAnalyticsQuery){
  const rows=await this.snapshot(a,q);
  if(rows.length>5000)throw invalid("CSV export is limited to 5,000 matching leads. Narrow the reporting filters.");
  const head=["Business","Contact","Phone","Source","Status","Client Converted","Type","Location","Assignee","Created","Last Updated","Next Follow-up"];
  const csv=[head.map(safeCsv).join(","),...rows.map(x=>[
   x.businessName,x.contactName,x.phone,acquisition(x.source),x.status,
   x.status==="APPROVED"&&!!x.convertedClient?"Yes":"No",x.businessType,x.location,
   x.assignee?.displayName??"Unassigned",x.createdAt.toISOString(),x.updatedAt.toISOString(),
   x.nextFollowUpAt?.toISOString()??"",
  ].map(safeCsv).join(","))].join("\r\n");
  return {filename:"lead-analytics-"+q.from+"-to-"+q.to+".csv",csv,count:rows.length};
 }
}
