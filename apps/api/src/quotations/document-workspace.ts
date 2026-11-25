import {z} from "zod";
import {agencyToday} from "@digimarket/contracts";
import type {Prisma,PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {AuthError} from "../auth/errors";
import type {Express,Request,Response,NextFunction} from "express";
export const linkSchema=z.object({clientId:z.uuid().nullable().optional(),leadId:z.uuid().nullable().optional(),revisionOfId:z.uuid().nullable().optional(),sourceQuotationId:z.uuid().nullable().optional()}).strict();
export type Links=z.infer<typeof linkSchema>;
const bad=(message:string)=>new AuthError(422,"VALIDATION_ERROR",message);
export function splitDocument(body:unknown){
 const result=z.object({links:linkSchema.optional()}).passthrough().safeParse(body);
 if(!result.success)throw bad("Invalid document references");
 const {links,...payload}=result.data;return {links:links??{},payload};
}
export async function verifyLinks(db:Prisma.TransactionClient,p:Principal,kind:"quotation"|"agreement",links:Links){
 const org={organizationId:p.organizationId};
 if(links.clientId&&!await db.client.findFirst({where:{...org,id:links.clientId},select:{id:true}}))throw bad("Client not available");
 if(links.leadId&&!await db.lead.findFirst({where:{...org,id:links.leadId,deletedAt:null},select:{id:true}}))throw bad("Lead not available");
 if(links.revisionOfId){const where={...org,id:links.revisionOfId};const exists=kind==="quotation"?await db.quotation.findFirst({where,select:{id:true}}):await db.agreement.findFirst({where,select:{id:true}});if(!exists)throw bad("Revision source not available");}
 if(links.sourceQuotationId&&(kind!=="agreement"||!await db.quotation.findFirst({where:{...org,id:links.sourceQuotationId},select:{id:true}})))throw bad("Source quotation not available");
 return {clientId:links.clientId??null,leadId:links.leadId??null,revisionOfId:links.revisionOfId??null,...(kind==="agreement"?{sourceQuotationId:links.sourceQuotationId??null}:{})};
}
export const listQuery=z.object({q:z.string().trim().max(160).default(""),page:z.coerce.number().int().min(1).max(100000).default(1),limit:z.coerce.number().int().min(1).max(150).default(150),from:z.iso.date().optional(),to:z.iso.date().optional(),status:z.enum(["all","current","ended","future","ending"]).default("all"),mode:z.enum(["all","default","custom"]).default("all"),sort:z.enum(["newest","oldest"]).default("newest")}).refine(v=>!v.from||!v.to||v.from<=v.to);
export function parseList(query:unknown){const v=listQuery.safeParse(query);if(!v.success)throw bad("Invalid document filters");return v.data;}
export function dateWhere(from?:string,to?:string){return {...(from?{gte:new Date(from+"T00:00:00Z")}:{}) ,...(to?{lte:new Date(to+"T00:00:00Z")}:{})};}
export function addDays(date:string,days:number){const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function quoteStatus(date:Date,payload:Prisma.JsonValue,today=agencyToday()){
 const p=payload&&typeof payload==="object"&&!Array.isArray(payload)?payload:{};
 const days=typeof p.validityDays==="number"?p.validityDays:7;
 const start=date.toISOString().slice(0,10),end=addDays(start,Math.max(1,Math.min(180,days))-1);
 return start>today?"future":end<today?"ended":"current";
}
export function agreementStatus(start:Date,end:Date,today=agencyToday()){
 const a=start.toISOString().slice(0,10),b=end.toISOString().slice(0,10);return b<today?"ended":a>today?"future":b<=addDays(today,7)?"ending":"current";
}
export async function listQuotes(db:PrismaClient,p:Principal,query:unknown){
 const v=parseList(query),org={organizationId:p.organizationId},today=agencyToday();
 const where:Prisma.QuotationWhereInput={...org,quoteDate:dateWhere(v.from,v.to),...(v.q?{OR:[{clientName:{contains:v.q,mode:"insensitive"}},{quoteNumber:{contains:v.q,mode:"insensitive"}}]}:{}),...(v.mode!=="all"?{payload:{path:["mode"],equals:v.mode==="custom"?"new":"default"}}:{})};
 const order=v.sort==="oldest"?"asc" as const:"desc" as const;
 const [all,total]=await Promise.all([db.quotation.findMany({where:org,select:{quoteDate:true,payload:true}}),db.quotation.count({where:org})]);
 const candidates=v.status==="all"?null:await db.quotation.findMany({where,select:{id:true,quoteDate:true,payload:true}});
 if(candidates)where.id={in:candidates.filter(x=>quoteStatus(x.quoteDate,x.payload,today)===v.status).map(x=>x.id)};
 const [items,matching]=await Promise.all([db.quotation.findMany({where,orderBy:[{createdAt:order},{id:order}],skip:(v.page-1)*v.limit,take:v.limit}),db.quotation.count({where})]);
 return {items,matching,page:v.page,totalPages:Math.max(1,Math.ceil(matching/v.limit)),summary:{total,current:all.filter(x=>quoteStatus(x.quoteDate,x.payload,today)==="current").length}};
}
export async function listAgreements(db:PrismaClient,p:Principal,query:unknown){
 const v=parseList(query),org={organizationId:p.organizationId},today=agencyToday();
 const where:Prisma.AgreementWhereInput={...org,agreementDate:dateWhere(v.from,v.to),...(v.q?{OR:[{clientName:{contains:v.q,mode:"insensitive"}},{agreementNumber:{contains:v.q,mode:"insensitive"}}]}:{}),...(v.mode!=="all"?{payload:{path:["mode"],equals:v.mode}}:{})};
 const now=new Date(today+"T00:00:00Z"),soon=new Date(addDays(today,7)+"T00:00:00Z");
 if(v.status==="ended")where.endDate={lt:now};if(v.status==="future")where.startDate={gt:now};if(v.status==="current"){where.startDate={lte:now};where.endDate={gte:now};}if(v.status==="ending"){where.startDate={lte:now};where.endDate={gte:now,lte:soon};}
 const order=v.sort==="oldest"?"asc" as const:"desc" as const;
 const [items,matching,total,ending]=await Promise.all([db.agreement.findMany({where,orderBy:[{createdAt:order},{id:order}],skip:(v.page-1)*v.limit,take:v.limit}),db.agreement.count({where}),db.agreement.count({where:org}),db.agreement.count({where:{...org,startDate:{lte:now},endDate:{gte:now,lte:soon}}})]);
 return {items,matching,page:v.page,totalPages:Math.max(1,Math.ceil(matching/v.limit)),summary:{total,ending}};
}
export function registerDraftRoutes(app:Express,db:PrismaClient,base:string,authenticate:(req:Request,res:Response,next:NextFunction)=>Promise<void>,kind:"quotation"|"agreement"){
 const identity=(res:Response)=>{const p=res.locals.principal as Principal;return {organizationId:p.organizationId,userId:p.userId,kind}};
 app.get(base+"/draft",authenticate,async(_req,res)=>{const draft=await db.documentDraft.findUnique({where:{organizationId_userId_kind:identity(res)}});res.set("Cache-Control","no-store").json({data:draft??null});});
 app.put(base+"/draft",authenticate,async(req,res)=>{const p=z.object({payload:z.record(z.string(),z.unknown()),links:linkSchema.optional()}).strict().safeParse(req.body);if(!p.success||JSON.stringify(req.body).length>50000)throw bad("Invalid or oversized draft");
 const key=identity(res),data={payload:p.data.payload as Prisma.InputJsonObject,links:(p.data.links??{}) as Prisma.InputJsonObject};
 const draft=await db.documentDraft.upsert({where:{organizationId_userId_kind:key},create:{...key,...data},update:data});res.set("Cache-Control","no-store").json({data:draft});});
 app.delete(base+"/draft",authenticate,async(_req,res)=>{await db.documentDraft.deleteMany({where:identity(res)});res.status(204).end();});
}
export function registerDocumentLookup(app:Express,db:PrismaClient,base:string,authenticate:(req:Request,res:Response,next:NextFunction)=>Promise<void>){
 app.get(base+"/contacts",authenticate,async(req,res)=>{
 const p=res.locals.principal as Principal,q=z.string().trim().max(160).safeParse(req.query.q??"");if(!q.success)throw bad("Invalid client search");
 const filter={organizationId:p.organizationId,businessName:{contains:q.data,mode:"insensitive" as const}};
 const [clients,leads]=await Promise.all([p.permissions.has("clients.read")?db.client.findMany({where:filter,orderBy:{businessName:"asc"},take:20,select:{id:true,businessName:true,location:true,email:true,contacts:{orderBy:{isPrimary:"desc"},take:1,select:{name:true,role:true,email:true}}}}):Promise.resolve([]),p.permissions.has("leads.read")?db.lead.findMany({where:{...filter,deletedAt:null},orderBy:{businessName:"asc"},take:20,select:{id:true,businessName:true,contactName:true,location:true}}):Promise.resolve([])]);
 res.set("Cache-Control","no-store").json({data:{items:[...clients.map(c=>({id:c.id,kind:"client",name:c.businessName,representative:c.contacts[0]?.name??"",designation:c.contacts[0]?.role??"",email:c.contacts[0]?.email??c.email??"",address:c.location??""})),...leads.map(l=>({id:l.id,kind:"lead",name:l.businessName,representative:l.contactName??"",designation:"",email:"",address:l.location??""}))]}});
 });
}
