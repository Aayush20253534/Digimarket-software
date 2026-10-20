import type { Express,Request,Response,NextFunction } from "express";
import { z } from "zod";
import {invoiceDraftSchema,invoiceEditSchema,invoiceListSchema,invoiceVersionSchema,
 paymentRecordSchema,billingScheduleSchema,billingToggleSchema} from "@digimarket/contracts";
import { AuthService,type Principal } from "../auth/service";
import { AuthError,unauthorized } from "../auth/errors";
import { BillingService } from "./service";

function parse<T>(schema:z.ZodType<T>,input:unknown):T{
 const data=schema.safeParse(input);
 if(!data.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid billing fields");
 return data.data;
}
export function registerBillingRoutes(app:Express,auth:AuthService){
 const svc=new BillingService(auth.database);
 const authenticate=async(req:Request,res:Response,next:NextFunction)=>{
  try{
   const header=req.get("authorization");
   if(!header?.startsWith("Bearer "))throw unauthorized();
   res.locals.principal=await auth.authenticate(header.slice(7));next();
  }catch(e){next(e);}
 };
 const actor=(res:Response)=>res.locals.principal as Principal,id=z.uuid();
 const v=(req:Request)=>parse(invoiceVersionSchema,req.body).version;
 app.get("/api/v1/invoices",authenticate,async(req,res)=>{
  res.set("Cache-Control","no-store");res.json({data:await svc.list(actor(res),parse(invoiceListSchema,req.query))});
 });
 app.post("/api/v1/invoices",authenticate,async(req,res)=>{
  res.status(201).json({data:await svc.create(actor(res),parse(invoiceDraftSchema,req.body))});
 });
 app.get("/api/v1/invoices/receivables",authenticate,async(_req,res)=>{
  res.set("Cache-Control","no-store");res.json({data:await svc.receivables(actor(res))});
 });
 app.get("/api/v1/invoices/:id",authenticate,async(req,res)=>{
  res.set("Cache-Control","no-store");res.json({data:await svc.detail(actor(res),parse(id,req.params.id))});
 });
 app.put("/api/v1/invoices/:id",authenticate,async(req,res)=>{
  res.json({data:await svc.edit(actor(res),parse(id,req.params.id),parse(invoiceEditSchema,req.body))});
 });
 app.post("/api/v1/invoices/:id/issue",authenticate,async(req,res)=>{
  res.json({data:await svc.issue(actor(res),parse(id,req.params.id),v(req))});
 });
 app.post("/api/v1/invoices/:id/void",authenticate,async(req,res)=>{
  res.json({data:await svc.void(actor(res),parse(id,req.params.id),v(req))});
 });
 app.get("/api/v1/invoices/:id/pdf",authenticate,async(req,res)=>{
  res.set("Cache-Control","no-store");
  res.json({data:await svc.pdf(actor(res),parse(id,req.params.id))});
 });
 app.get("/api/v1/payments",authenticate,async(req,res)=>{
  res.set("Cache-Control","no-store");
  res.json({data:await svc.payments(actor(res),req.query.clientId?parse(id,req.query.clientId):undefined)});
 });
 app.post("/api/v1/payments",authenticate,async(req,res)=>{
  res.status(201).json({data:await svc.record(actor(res),parse(paymentRecordSchema,req.body))});
 });
 app.post("/api/v1/payments/:id/verify",authenticate,async(req,res)=>{
  res.json({data:await svc.verify(actor(res),parse(id,req.params.id),v(req))});
 });
 app.post("/api/v1/payments/:id/reject",authenticate,async(req,res)=>{
  res.json({data:await svc.reject(actor(res),parse(id,req.params.id),v(req))});
 });
 app.get("/api/v1/billing-schedules",authenticate,async(_req,res)=>{
  res.set("Cache-Control","no-store");res.json({data:await svc.schedules(actor(res))});
 });
 app.post("/api/v1/billing-schedules",authenticate,async(req,res)=>{
  res.status(201).json({data:await svc.createSchedule(actor(res),parse(billingScheduleSchema,req.body))});
 });
 app.put("/api/v1/billing-schedules/:id",authenticate,async(req,res)=>{
  const body=parse(billingToggleSchema,req.body);
  res.json({data:await svc.toggleSchedule(actor(res),parse(id,req.params.id),body.version,body.enabled)});
 });
}
