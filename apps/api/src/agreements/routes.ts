import type { Express, NextFunction, Request, Response } from "express";
import { Prisma } from "@digimarket/db";
import { z } from "zod";
import type { AuthService, Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";

const amount = z.string().regex(/^(0|[1-9]\d{0,8})(?:\.\d{1,2})?$/, "Enter a valid INR amount");
const text = (max: number) => z.string().trim().max(max);
const inputSchema = z.strictObject({
  mode: z.enum(["default", "custom"]),
  clientName: z.string().trim().min(2).max(160),
  clientAddress: z.string().trim().min(5).max(500),
  clientRepresentative: z.string().trim().min(2).max(120),
  clientDesignation: text(100),
  clientEmail: z.union([z.email().max(200), z.literal("")]),
  agencyRepresentative: z.string().trim().min(2).max(120),
  agencyDesignation: text(100),
  agreementDate: z.iso.date(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  serviceFee: amount,
  feePeriod: z.enum(["monthly", "one-time"]),
  servicePayment: z.enum(["full advance", "monthly advance", "instalments"]),
  advanceAmount: amount,
  paymentSchedule: text(500),
  adBudget: amount,
  adBudgetMode: z.enum(["optional", "mandatory", "not applicable"]),
  adPayment: z.enum(["at signing", "before ads run", "per schedule"]),
  taxMode: z.enum(["inclusive", "extra", "not charged"]),
  gstRate: z.number().min(0).max(28),
  reels: z.number().int().min(0).max(999),
  posts: z.number().int().min(0).max(999),
  services: z.array(z.strictObject({name: z.string().trim().min(2).max(90), description: z.string().trim().min(2).max(350)})).min(1).max(12),
  exclusions: text(1000),
  additionalTerms: text(1500),
  noticeDays: z.number().int().min(0).max(90),
});
export type AgreementInput = z.infer<typeof inputSchema>;
const standardServices: AgreementInput["services"] = [
  {name:"Website Development",description:"Website setup, core pages and agreed routine updates."},
  {name:"SEO",description:"On-page optimization and relevant search visibility work."},
  {name:"AEO",description:"Answer Engine Optimization for discoverability."},
  {name:"GEO",description:"Generative Engine Optimization for relevant online visibility."},
  {name:"Social Media Management",description:"Planning, captions, publishing and profile handling."},
  {name:"Meta Ads",description:"Facebook and Instagram campaign setup, monitoring and optimization."},
  {name:"Influencer Marketing",description:"Influencer outreach, campaign coordination and agreed collaboration fees."},
  {name:"Monthly Reels and Posts",description:"Production, editing and publishing of 8 reels and 8 branded posts each month."},
];
function paisa(value:string) {
  const [whole, decimals=""] = value.split(".");
  return Number(whole)*100 + Number(decimals.padEnd(2,"0"));
}
function validate(input: unknown): AgreementInput {
  const parsed=inputSchema.safeParse(input);
  if (!parsed.success) {
    const fields=[...new Set(parsed.error.issues.map(issue=>issue.path.join(".")||"request"))].slice(0,8);
    throw new AuthError(422,"VALIDATION_ERROR","Invalid agreement fields: "+fields.join(", "));
  }
  const raw=parsed.data;
  const value:AgreementInput=raw.mode==="default"
    ? {...raw,feePeriod:"monthly",services:standardServices.map(service=>({...service})),reels:8,posts:8}
    : raw;
  if (value.startDate>value.endDate) throw new AuthError(422,"VALIDATION_ERROR","End date must be on or after start date.");
  if (value.adBudgetMode==="not applicable" && paisa(value.adBudget)!==0) throw new AuthError(422,"VALIDATION_ERROR","Advertising budget must be zero when not applicable.");
  if (value.taxMode==="extra" && value.gstRate<=0) throw new AuthError(422,"VALIDATION_ERROR","A positive GST rate is required when tax is extra.");
  if (paisa(value.advanceAmount)>paisa(value.serviceFee)) throw new AuthError(422,"VALIDATION_ERROR","Advance cannot exceed the service fee.");
  if (value.servicePayment==="instalments"&&!value.paymentSchedule) throw new AuthError(422,"VALIDATION_ERROR","Specify the instalment payment schedule.");
  return value;
}
function requireAccess(principal:Principal) {
  if (!principal.roles.some(role=>["FOUNDER","ADMIN","SUPER_ADMIN"].includes(role)))
    throw new AuthError(403,"FORBIDDEN","Agreement access is restricted to founders and administrators.");
}

export function registerAgreementRoutes(app:Express,auth:AuthService) {
  const db=auth.database;
  const authenticate=async (req:Request,res:Response,next:NextFunction)=>{
    try {
      const bearer=req.get("authorization");
      if(!bearer?.startsWith("Bearer ")) throw unauthorized();
      const principal=await auth.authenticate(bearer.slice(7));
      requireAccess(principal);res.locals.principal=principal;next();
    } catch(error) {next(error);}
  };
  const principal=(res:Response)=>res.locals.principal as Principal;
  const base="/api/v1/agreements";
  app.get(base,authenticate,async (_req,res)=>{
    const rows=await db.agreement.findMany({
      where:{organizationId:principal(res).organizationId},
      orderBy:[{createdAt:"desc"},{id:"desc"}],take:150,
    });
    res.set("Cache-Control","no-store").json({data:{items:rows}});
  });
  app.get(base+"/:id",authenticate,async (req,res)=>{
    const id=z.uuid().safeParse(req.params.id);
    if(!id.success) throw new AuthError(422,"VALIDATION_ERROR","Invalid agreement identifier.");
    const row=await db.agreement.findFirst({where:{id:id.data,organizationId:principal(res).organizationId}});
    if(!row)throw new AuthError(404,"NOT_FOUND","Agreement not found.");
    res.set("Cache-Control","no-store").json({data:row});
  });
  app.post(base,authenticate,async (req,res)=>{
    const input=validate(req.body);
    const actor=principal(res);
    const service=paisa(input.serviceFee);
    const ads=input.adBudgetMode==="not applicable"?0:paisa(input.adBudget);
    const tax=input.taxMode==="extra"?Math.round(service*input.gstRate/100):0;
    const numberPrefix="AW-AGR-"+input.agreementDate.replaceAll("-","")+"-";
    let saved;
    for(let attempt=0;attempt<8;attempt++){
      try{
        saved=await db.$transaction(async tx=>{
          const existing=await tx.agreement.findMany({
            where:{organizationId:actor.organizationId,agreementNumber:{startsWith:numberPrefix}},
            select:{agreementNumber:true},
          });
          const highest=existing.reduce((max,row)=>Math.max(max,Number(row.agreementNumber.slice(numberPrefix.length))||0),0);
          const agreementNumber=numberPrefix+String(highest+1).padStart(2,"0");
          const item=await tx.agreement.create({data:{
            organizationId:actor.organizationId,createdById:actor.userId,agreementNumber,
            clientName:input.clientName,
            agreementDate:new Date(input.agreementDate+"T00:00:00.000Z"),
            startDate:new Date(input.startDate+"T00:00:00.000Z"),
            endDate:new Date(input.endDate+"T00:00:00.000Z"),
            serviceFee:(service/100).toFixed(2),adBudget:(ads/100).toFixed(2),total:((service+ads+tax)/100).toFixed(2),
            payload:input,
          }});
          await tx.auditLog.create({data:{
            organizationId:actor.organizationId,actorId:actor.userId,
            action:"agreements.created",entityType:"Agreement",entityId:item.id,
          }});
          return item;
        },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});
        break;
      }catch(error){
        const code=(error as {code?:string}).code;
        if(!["P2002","P2034"].includes(code??"")||attempt===7)throw error;
      }
    }
    res.status(201).set("Cache-Control","no-store").json({data:saved});
  });
}
