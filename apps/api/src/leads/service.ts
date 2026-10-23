import { createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "@digimarket/db";
import type { LeadCreateInput, LeadUpdateInput, LeadListQuery } from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";

const deny=(actor:Principal,key:string)=>{if(!actor.permissions.has(key))throw forbidden();};
const missing=()=>new AuthError(404,"NOT_FOUND","Lead not found");
const clash=()=>new AuthError(409,"VERSION_CONFLICT","Lead changed; refresh before editing");
const clean=(s:string)=>s.trim().replace(/\s+/g," ").toLocaleLowerCase("en-US");
function phone(value?:string){
  if(!value?.trim())return null;
  const digits=value.replace(/\D/g,"");
  if(digits.length<7||digits.length>15)throw invalid("Phone number must contain 7 to 15 digits");
  return digits;
}
const safeCSV=(s:string)=>'"'+(/^[\s]*[=+@\-\t\r]/.test(s)?"'":"")+s.replaceAll('"','""')+'"';
const urlOrNull=(s?:string)=>s?.trim()||null;
const keyFor=(batch:string,i:number)=>{
  const h=createHash("sha256").update(batch+":"+i).digest("hex");
  return [h.slice(0,8),h.slice(8,12),"4"+h.slice(13,16),"8"+h.slice(17,20),h.slice(20,32)].join("-");
};
type Tx=Prisma.TransactionClient;

export class LeadsService {
 constructor(private readonly db:PrismaClient){}
 private canEdit(a:Principal,_r:{assignedToId:string|null;createdById:string}){
   void _r;
   return a.permissions.has("leads.edit") || a.permissions.has("leads.edit.own");
 }
 private async find(a:Principal,id:string){
   deny(a,"leads.read");
   const r=await this.db.lead.findFirst({where:{id,organizationId:a.organizationId,deletedAt:null}});
   if(!r)throw missing();
   return r;
 }
 private async addIn(tx:Tx,a:Principal,input:LeadCreateInput,importKey?:string){
   const normalizedPhone=phone(input.phone);
   // Both manual and webhook paths use the same transaction lock to prevent
   // duplicate leads when two messages or form submissions arrive concurrently.
   await tx.$queryRaw`SELECT 1 AS acquired FROM (SELECT pg_advisory_xact_lock(hashtextextended(${a.organizationId+":"+normalizedPhone},0))) AS lock_row`;
   if(await tx.lead.findFirst({where:{organizationId:a.organizationId,normalizedPhone}}))
     throw new AuthError(409,"LEAD_ALREADY_EXISTS","This phone number already belongs to a lead");
   const r=await tx.lead.create({data:{
     organizationId:a.organizationId,businessName:"Lead "+normalizedPhone,
     normalizedBusinessName:"lead "+normalizedPhone,contactName:null,
     phone:input.phone.trim(),normalizedPhone,
     createdById:a.userId,importKey:importKey??null,
     source:input.source??"COLD_CALL",
   }});
   await tx.leadActivity.create({data:{leadId:r.id,actorId:a.userId,kind:"CREATED"}});
   await this.flagDuplicates(tx,a.organizationId,r.id,r.normalizedPhone,r.normalizedBusinessName);
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
     action:"leads.created",entityType:"Lead",entityId:r.id,
     afterRedacted:{status:r.status}}});
   return r;
 }
 private async flagDuplicates(tx:Tx,org:string,id:string,normalizedPhone:string|null,normalizedBusinessName:string){
   const clauses:Prisma.LeadWhereInput[]=[{normalizedBusinessName}];
   if(normalizedPhone)clauses.push({normalizedPhone});
   const others=await tx.lead.findMany({where:{organizationId:org,deletedAt:null,id:{not:id},OR:clauses},
     select:{id:true,normalizedPhone:true,normalizedBusinessName:true},take:100});
   if(others.length){
     await tx.leadDuplicateCandidate.createMany({data:others.map(o=>({
       organizationId:org,leadId:id<o.id?id:o.id,candidateId:id<o.id?o.id:id,
       reason:normalizedPhone&&o.normalizedPhone===normalizedPhone?"PHONE_MATCH":"BUSINESS_MATCH",
     })),skipDuplicates:true});
   }
 }
 async metrics(a:Principal){
   deny(a,"leads.read");
   const where={organizationId:a.organizationId,deletedAt:null};
   const [total,pending,yetToCall,meetingProcess,decisionPending,followUp,approved,rejected,converted]=await Promise.all([
     this.db.lead.count({where}),
     this.db.lead.count({where:{...where,status:"PENDING"}}),
     this.db.lead.count({where:{...where,status:"YET_TO_CALL"}}),
     this.db.lead.count({where:{...where,status:"MEETING_PROCESS"}}),
     this.db.lead.count({where:{...where,status:"DECISION_PENDING"}}),
     this.db.lead.count({where:{...where,status:"FOLLOW_UP"}}),
     this.db.lead.count({where:{...where,status:"APPROVED"}}),
     this.db.lead.count({where:{...where,status:"REJECTED"}}),
     this.db.client.count({where:{organizationId:a.organizationId,
       sourceLead:{deletedAt:null,status:"APPROVED"}}}),
   ]);
   return {total,pending,yetToCall,meetingProcess,decisionPending,followUp,approved,rejected,converted,
     conversionRatePercent:total?Math.round(converted/total*10000)/100:0};
 }
 async delete(a:Principal,id:string,version:number){
   if(!a.roles.some(role=>role==="FOUNDER"||role==="ADMIN"||role==="SUPER_ADMIN"))throw forbidden();
   const existing=await this.find(a,id);
   // Match manual creation and Meta ingestion's tenant+phone advisory lock.
   // A deleted number can then be added again without a stale duplicate.
   return this.db.$transaction(async tx=>{
     if(existing.normalizedPhone)await tx.$queryRaw`SELECT 1 AS acquired FROM (SELECT pg_advisory_xact_lock(hashtextextended(${a.organizationId+":"+existing.normalizedPhone},0))) AS lock_row`;
     const rows=await tx.$queryRaw<{id:string;version:number}[]>`
       SELECT "id","version" FROM "Lead"
       WHERE "id"=${id}::uuid AND "organizationId"=${a.organizationId}::uuid
         AND "deletedAt" IS NULL FOR UPDATE
     `;
     if(!rows.length)throw missing();
     if(rows[0].version!==version)throw clash();
     // Converted clients are separate business records and must survive.
     await tx.client.updateMany({where:{organizationId:a.organizationId,sourceLeadId:id},
       data:{sourceLeadId:null}});
     await tx.leadDuplicateCandidate.deleteMany({where:{organizationId:a.organizationId,
       OR:[{leadId:id},{candidateId:id}]}});
     await tx.leadActivity.deleteMany({where:{leadId:id}});
     const deleted=await tx.lead.deleteMany({where:{id,organizationId:a.organizationId,version}});
     if(deleted.count!==1)throw clash();
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"leads.deleted",entityType:"Lead",entityId:id,
       afterRedacted:{hardDeleted:true}}});
     return {id,deleted:true};
   });
 }
 async assignees(a:Principal){
   deny(a,"leads.assign");
   return this.db.user.findMany({where:{organizationId:a.organizationId,status:"ACTIVE"},
     select:{id:true,displayName:true,loginId:true,status:true},orderBy:{displayName:"asc"},take:500});
 }
 async create(a:Principal,input:LeadCreateInput){
   deny(a,"leads.create");
   const normalized=phone(input.phone)!;
   const existing=await this.db.lead.findFirst({where:{organizationId:a.organizationId,normalizedPhone:normalized}});
   if(existing)throw new AuthError(409,"LEAD_ALREADY_EXISTS","This phone number already belongs to a lead");
   return this.db.$transaction(tx=>this.addIn(tx,a,input));
 }
 // Run only for authenticated Meta webhooks. No message contents are stored.
 async ingestWhatsApp(organizationId:string,createdById:string,rawPhone:string){
   const normalized=phone(rawPhone);
   if(!normalized)throw invalid("WhatsApp sender phone is required");
   const user=await this.db.user.findFirst({where:{id:createdById,organizationId,status:"ACTIVE"},select:{id:true}});
   if(!user)throw new AuthError(503,"WHATSAPP_CONFIG_INVALID","WhatsApp integration actor is not configured");
   const actor:Principal={userId:createdById,organizationId,sessionId:"whatsapp",
     roles:["FOUNDER"],permissions:new Set(["leads.create"])};
   return this.db.$transaction(async tx=>{
     // One sender can trigger concurrent Meta deliveries; serialize by tenant and phone.
     await tx.$queryRaw`SELECT 1 AS acquired FROM (SELECT pg_advisory_xact_lock(hashtextextended(${organizationId+":"+normalized},0))) AS lock_row`;
     const previous=await tx.lead.findFirst({where:{organizationId,normalizedPhone:normalized}});
     if(previous){
       // Preserve an existing lead and notes when its number later contacts us on WhatsApp.
       if(!previous.deletedAt&&previous.source!=="META_LEADS"){
         await tx.lead.update({where:{id:previous.id},data:{source:"META_LEADS",version:{increment:1}}});
         await tx.leadActivity.create({data:{leadId:previous.id,actorId:createdById,
           kind:"DETAILS_UPDATED",metadata:{source:"META_LEADS",reason:"whatsapp_inbound"}}});
         await tx.auditLog.create({data:{organizationId,actorId:createdById,
           action:"leads.whatsapp_source_attributed",entityType:"Lead",entityId:previous.id,
           afterRedacted:{source:"META_LEADS"}}});
       }
       return {id:previous.id,created:false};
     }
     let client=await tx.client.findFirst({where:{organizationId,OR:[
       {phone:"+"+normalized},{phone:normalized},
     ]},select:{id:true}});
     // Converted clients may retain formatted numbers such as "+91 98765 43210".
     // Deduplicate against them before creating a new lead.
     if(!client){
       const matches=await tx.$queryRaw<{id:string}[]>`
         SELECT "id" FROM "Client"
         WHERE "organizationId"=${organizationId}::uuid
           AND REGEXP_REPLACE(COALESCE("phone",''),'[^0-9]','','g')=${normalized}
         LIMIT 1
       `;
       client=matches[0]??null;
     }
     if(client)return {id:client.id,created:false};
     const lead=await this.addIn(tx,actor,{phone:"+"+normalized,source:"META_LEADS"});
     return {id:lead.id,created:true};
   });
 }

 async list(a:Principal,input:LeadListQuery){
   deny(a,"leads.read");
   const where:Prisma.LeadWhereInput={
     organizationId:a.organizationId,deletedAt:null,
     ...(input.stage?{status:input.stage}:{}),
     ...(input.source?{source:input.source}:{}),
     ...(input.assignedToId?{assignedToId:input.assignedToId}:{}),
     ...(input.q?{OR:[{businessName:{contains:input.q,mode:"insensitive"}},
       {contactName:{contains:input.q,mode:"insensitive"}},
       {location:{contains:input.q,mode:"insensitive"}},
       {phone:{contains:input.q}}]}:{}),
   };
   const rows=await this.db.lead.findMany({where,take:input.limit+1,
     ...(input.cursor?{cursor:{id:input.cursor},skip:1}:{}),
     orderBy:[{[input.sort??"createdAt"]:input.direction??"desc"} as Prisma.LeadOrderByWithRelationInput,{id:input.direction??"desc"}],
     select:{id:true,businessName:true,contactName:true,phone:true,businessType:true,location:true,
       websiteUrl:true,instagramUrl:true,googleMapsUrl:true,source:true,status:true,stageNote:true,assignedToId:true,createdById:true,
       nextFollowUpAt:true,version:true,createdAt:true,updatedAt:true,
       assignee:{select:{displayName:true}},_count:{select:{duplicateMatches:true,duplicateCandidates:true}}}});
   const hasMore=rows.length>input.limit;
   const page=rows.slice(0,input.limit);
   return {items:page,nextCursor:hasMore?page.at(-1)?.id??null:null};
 }
 async detail(a:Principal,id:string){
   const lead=await this.find(a,id);
   const editable=this.canEdit(a,lead);
   const basic={...lead,canEdit:editable};
   if(!editable)return {...basic,activities:[],duplicates:[]};
   const [activities,duplicates]=await Promise.all([
     this.db.leadActivity.findMany({where:{leadId:id},
       orderBy:{createdAt:"desc"},take:100,
       include:{actor:{select:{displayName:true}}}}),
     this.db.leadDuplicateCandidate.findMany({where:{organizationId:a.organizationId,
       OR:[{leadId:id},{candidateId:id}]},take:50,
       include:{lead:{select:{id:true,businessName:true,phone:true}},
         candidate:{select:{id:true,businessName:true,phone:true}}}}),
   ]);
   return {...basic,activities,duplicates};
 }
 async update(a:Principal,id:string,input:LeadUpdateInput){
   const current=await this.find(a,id);
   if(!this.canEdit(a,current))throw forbidden();
   const {version,stageNote,...changes}=input;
   const stageChanged=changes.status!==undefined&&changes.status!==current.status;
   if(current.status==="APPROVED"&&stageChanged)
     throw new AuthError(409,"ALREADY_APPROVED","Approved leads cannot return to the lead pipeline");
   if(changes.status==="APPROVED"&&!a.permissions.has("leads.convert"))throw forbidden();
   if(Object.keys(changes).length===0&&!stageNote?.trim())throw invalid("No changes provided");
   const data:Prisma.LeadUpdateManyMutationInput={version:{increment:1}};
   if(changes.businessName!==undefined){
     const name=changes.businessName.trim()||"Lead "+current.normalizedPhone;
     data.businessName=name;data.normalizedBusinessName=clean(name);
   }
   if(changes.contactName!==undefined)data.contactName=urlOrNull(changes.contactName);
   if(changes.businessType!==undefined)data.businessType=urlOrNull(changes.businessType);
   if(changes.googleMapsUrl!==undefined)data.googleMapsUrl=urlOrNull(changes.googleMapsUrl);
   if(changes.source!==undefined)data.source=changes.source;
   if(changes.status!==undefined)data.status=changes.status;
   if(stageNote!==undefined)data.stageNote=stageNote;
   return this.db.$transaction(async tx=>{
     const changedCount=await tx.lead.updateMany({where:{id,organizationId:a.organizationId,deletedAt:null,version},data});
     if(changedCount.count!==1)throw clash();
     const changed=await tx.lead.findUniqueOrThrow({where:{id}});
     await tx.leadActivity.create({data:{leadId:id,actorId:a.userId,
       kind:stageChanged?"STAGE_CHANGED":stageNote?.trim()?"NOTE":"DETAILS_UPDATED",
       note:stageNote?.trim()||null,
       metadata:{fromStatus:current.status,toStatus:changed.status,version:changed.version}}});
     if(changes.status==="APPROVED"){
       const existing=await tx.client.findUnique({where:{sourceLeadId:id}});
       if(!existing){
         const client=await tx.client.create({data:{
           organizationId:a.organizationId,sourceLeadId:id,createdById:a.userId,
           businessName:changed.businessName,businessType:changed.businessType,
           phone:changed.phone,
           ...(changed.contactName?{contacts:{create:{
             name:changed.contactName,phone:changed.phone,isPrimary:true,
           }}}:{}),
         }});
         await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
           action:"leads.converted_to_client",entityType:"Lead",entityId:id,
           afterRedacted:{clientId:client.id}}});
         await tx.outboxEvent.create({data:{organizationId:a.organizationId,
           eventKey:"lead-converted:"+id,kind:"lead.converted",
           aggregateType:"Client",aggregateId:client.id,payloadMinimal:{leadId:id,clientId:client.id}}});
       }
     }
     await this.flagDuplicates(tx,a.organizationId,id,changed.normalizedPhone,changed.normalizedBusinessName);
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"leads.updated",entityType:"Lead",entityId:id,
       afterRedacted:{stage:changed.status,version:changed.version}}});
     return changed;
   });
 }

 async assign(a:Principal,id:string,version:number,assignedToId:string|null){
   deny(a,"leads.assign");
   await this.find(a,id);
   if(assignedToId){
     const owner=await this.db.user.findFirst({where:{id:assignedToId,
       organizationId:a.organizationId,status:"ACTIVE"},select:{id:true}});
     if(!owner)throw invalid("Assignee must be an active staff member in this workspace");
   }
   return this.db.$transaction(async tx=>{
     const changed=await tx.lead.updateMany({where:{id,organizationId:a.organizationId,deletedAt:null,version},
       data:{assignedToId,version:{increment:1}}});
     if(changed.count!==1)throw clash();
     await tx.leadActivity.create({data:{leadId:id,actorId:a.userId,kind:"OWNER_ASSIGNED",
       metadata:{assignedToId}}});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"leads.assigned",entityType:"Lead",entityId:id,afterRedacted:{assignedToId}}});
     return tx.lead.findUniqueOrThrow({where:{id}});
   });
 }
 // Autosaved notes do not increment the lead's details form version.
 async saveStageNote(a:Principal,id:string,note:string){
   const current=await this.find(a,id);
   if(!this.canEdit(a,current))throw forbidden();
   if(current.stageNote===note)return current;
   return this.db.$transaction(async tx=>{
     const updated=await tx.lead.updateMany({where:{id,organizationId:a.organizationId,deletedAt:null},data:{stageNote:note}});
     if(updated.count!==1)throw missing();
     await tx.leadActivity.create({data:{leadId:id,actorId:a.userId,kind:"NOTE",
       note:note.trim()||null,metadata:{field:"stageNote",autoSaved:true}}});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"leads.stage_note_saved",entityType:"Lead",entityId:id}});
     return tx.lead.findUniqueOrThrow({where:{id}});
   });
 }
 async note(a:Principal,id:string,note:string){
   const r=await this.find(a,id);
   if(!this.canEdit(a,r))throw forbidden();
   return this.db.$transaction(async tx=>{
     const activity=await tx.leadActivity.create({data:{leadId:id,actorId:a.userId,kind:"NOTE",note}});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"leads.note_added",entityType:"Lead",entityId:id}});
     return activity;
   });
 }
 async duplicates(a:Principal){
   deny(a,"leads.duplicates.review");
   return this.db.leadDuplicateCandidate.findMany({where:{organizationId:a.organizationId,lead:{deletedAt:null},candidate:{deletedAt:null}},
     orderBy:{createdAt:"desc"},take:100,
     include:{lead:{select:{id:true,businessName:true,phone:true}},
       candidate:{select:{id:true,businessName:true,phone:true}}}});
 }
 async resolveDuplicate(a:Principal,id:string,resolution:"CONFIRMED"|"DISMISSED"){
   deny(a,"leads.duplicates.review");
   return this.db.$transaction(async tx=>{
     const changed=await tx.leadDuplicateCandidate.updateMany({where:{id,organizationId:a.organizationId,resolution:"OPEN"},
       data:{resolution,resolvedById:a.userId,resolvedAt:new Date()}});
     if(changed.count!==1)throw new AuthError(409,"NOT_OPEN","Duplicate signal not found or already reviewed");
     const r=await tx.leadDuplicateCandidate.findUniqueOrThrow({where:{id}});
     await tx.leadActivity.create({data:{leadId:r.leadId,actorId:a.userId,kind:"DUPLICATE_REVIEWED",
       metadata:{otherLeadId:r.candidateId,resolution}}});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"leads.duplicate_reviewed",entityType:"LeadDuplicateCandidate",entityId:id,
       afterRedacted:{resolution}}});
     return r;
   });
 }
 async import(a:Principal,batchId:string,rows:LeadCreateInput[]){
   deny(a,"leads.bulk");
   deny(a,"leads.create");
   const keys=rows.map((_,i)=>keyFor(batchId,i));
   const existing=await this.db.lead.count({where:{organizationId:a.organizationId,importKey:{in:keys}}});
   if(existing)throw new AuthError(409,"BATCH_ALREADY_USED","Import batch already exists");
   try{return await this.db.$transaction(async tx=>{
     const created=[];
     for(let i=0;i<rows.length;i++)created.push(await this.addIn(tx,a,rows[i],keys[i]));
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"leads.bulk_import",entityType:"LeadImport",entityId:batchId,
       afterRedacted:{count:created.length}}});
     return {count:created.length,ids:created.map(r=>r.id)};
   },{timeout:20000});}
   catch(e){if((e as {code?:string}).code==="P2002")throw new AuthError(409,"BATCH_ALREADY_USED","Import batch already exists");throw e;}
 }
 async export(a:Principal){
   deny(a,"leads.bulk");
   deny(a,"leads.read");
   const rows=await this.db.lead.findMany({where:{organizationId:a.organizationId,deletedAt:null},
     orderBy:{createdAt:"desc"},take:5001,
     include:{assignee:{select:{loginId:true}}}});
   if(rows.length>5000)throw invalid("Export limit is 5,000 rows");
   const head=["id","business_name","contact_name","phone","business_type","location","website_url","instagram_url",
     "source","stage","assigned_login","next_follow_up","created_at"];
   const csv=[head.join(","),...rows.map(r=>[
     r.id,r.businessName,r.contactName??"",r.phone??"",r.businessType??"",r.location??"",r.websiteUrl??"",
     r.instagramUrl??"",r.source??"",r.status,r.assignee?.loginId??"",r.nextFollowUpAt?.toISOString()??"",
     r.createdAt.toISOString(),
   ].map(safeCSV).join(","))].join("\r\n")+"\r\n";
   await this.db.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
     action:"leads.exported",entityType:"LeadExport",entityId:a.userId,
     afterRedacted:{count:rows.length}}});
   return {filename:"digimarket-leads.csv",csv};
 }
}
