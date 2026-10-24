import type {Express,Request,Response,NextFunction} from "express";
import {z} from "zod";
import {webPushPublicKey,subscriptionHash,validPushEndpoint} from "./push";
import {searchQuerySchema,reportsPeriodSchema,notificationListSchema} from "@digimarket/contracts";
import {AuthService,type Principal} from "../auth/service";
import {AuthError,unauthorized} from "../auth/errors";
import {InsightsService} from "./insights";
import {LeadAnalyticsService} from "./lead-report";
import {NotificationService} from "./notifications";
function parse<T>(schema:z.ZodType<T>,value:unknown):T{
 const checked=schema.safeParse(value);
 if(!checked.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid search, report or notification fields");
 return checked.data;
}
export function registerInsightsRoutes(app:Express,auth:AuthService){
 const insights=new InsightsService(auth.database),leadAnalytics=new LeadAnalyticsService(auth.database),notices=new NotificationService(auth.database);
 const authenticate=async(req:Request,res:Response,next:NextFunction)=>{
  try{
   const token=req.get("authorization");
   if(!token?.startsWith("Bearer "))throw unauthorized();
   res.locals.principal=await auth.authenticate(token.slice(7));next();
  }catch(e){next(e);}
 };
 const actor=(r:Response)=>r.locals.principal as Principal,base="/api/v1";
 app.get(base+"/search",authenticate,async(req,res)=>{
  res.set("Cache-Control","no-store");
  const q=parse(searchQuerySchema,req.query);res.json({data:await insights.search(actor(res),q.q)});
 });
 app.get(base+"/reports/overview",authenticate,async(req,res)=>{
  res.set("Cache-Control","no-store");
  const p=parse(reportsPeriodSchema,req.query);
  res.json({data:await insights.report(actor(res),p.from,p.to)});
 });
 const leadReportQuery=z.strictObject({
  from:z.iso.date(),to:z.iso.date(),
  source:z.enum(["META_LEADS","COLD_CALL"]).optional(),
  stage:z.enum(["PENDING","YET_TO_CALL","CALL_NOT_PICKING","CALL_BUSY","FOLLOW_UP",
    "MEETING_PROCESS","DECISION_PENDING","AGREEMENT_PENDING","APPROVED","REJECTED",
    "NEW","CONTACTED","QUALIFIED","PROPOSAL","WON","LOST"]).optional(),
  assignedToId:z.uuid().optional(),businessType:z.string().trim().max(120).optional(),
  location:z.string().trim().max(240).optional(),q:z.string().trim().max(100).optional(),
  page:z.coerce.number().int().min(1).max(100000).default(1),
  limit:z.coerce.number().int().min(1).max(100).default(20),
 }).refine(value=>value.from<=value.to,{message:"Invalid report period"});
 app.get(base+"/reports/leads",authenticate,async(req,res)=>{
  res.set("Cache-Control","no-store");
  res.json({data:await leadAnalytics.report(actor(res),parse(leadReportQuery,req.query))});
 });
 app.get(base+"/reports/leads/export",authenticate,async(req,res)=>{
  res.set("Cache-Control","no-store");
  res.json({data:await leadAnalytics.csv(actor(res),parse(leadReportQuery,req.query))});
 });
 const pushSubscription=z.strictObject({endpoint:z.string().url().max(2048)});
 app.get(base+"/notifications/push-key",authenticate,(req,res)=>{
  void req;
  const principal=actor(res);
  if(!principal.permissions.has("notifications.read"))throw new AuthError(403,"FORBIDDEN","No notification access");
  res.set("Cache-Control","no-store").json({data:{publicKey:webPushPublicKey()}});
 });
 app.post(base+"/notifications/push-subscription",authenticate,async(req,res)=>{
  const principal=actor(res);
  if(!principal.permissions.has("notifications.read"))throw new AuthError(403,"FORBIDDEN","No notification access");
  if(!webPushPublicKey())throw new AuthError(503,"PUSH_UNCONFIGURED","Phone alerts are not configured");
  const input=parse(pushSubscription,req.body);
  if(!validPushEndpoint(input.endpoint))throw new AuthError(422,"VALIDATION_ERROR","Unsupported push provider");
  const hash=subscriptionHash(input.endpoint);
  await auth.database.webPushSubscription.upsert({where:{endpointHash:hash},
   create:{organizationId:principal.organizationId,userId:principal.userId,endpoint:input.endpoint,endpointHash:hash},
   update:{organizationId:principal.organizationId,userId:principal.userId,endpoint:input.endpoint},
  });
  res.status(201).set("Cache-Control","no-store").json({data:{enabled:true}});
 });
 app.delete(base+"/notifications/push-subscription",authenticate,async(req,res)=>{
  const principal=actor(res);
  if(!principal.permissions.has("notifications.read"))throw new AuthError(403,"FORBIDDEN","No notification access");
  const input=parse(pushSubscription,req.body);
  await auth.database.webPushSubscription.deleteMany({where:{
   organizationId:principal.organizationId,userId:principal.userId,endpointHash:subscriptionHash(input.endpoint),
  }});
  res.status(204).end();
 });
 app.get(base+"/notifications",authenticate,async(req,res)=>{
  res.set("Cache-Control","no-store");
  const p=parse(notificationListSchema,req.query);
  res.json({data:await notices.list(actor(res),p.limit,p.unread==="true")});
 });
 app.post(base+"/notifications/read-all",authenticate,async(_req,res)=>{
  res.json({data:await notices.readAll(actor(res))});
 });
 app.post(base+"/notifications/:id/read",authenticate,async(req,res)=>{
  res.json({data:await notices.markRead(actor(res),parse(z.uuid(),req.params.id))});
 });
 app.get(base+"/notifications/stream",authenticate,async(req,res)=>{
  const me=actor(res);
  // EventSource cannot send Authorization. Our Next.js streaming gateway forwards
  // the existing in-memory bearer token as a header; nothing is written to URLs/cookies.
  await notices.cursor(me);
  res.status(200);res.set({
   "Content-Type":"text/event-stream; charset=utf-8",
   "Cache-Control":"no-store, no-transform",
   "Connection":"keep-alive",
   "X-Accel-Buffering":"no",
  });res.flushHeaders();
  let closed=false,last="";
  const token=req.get("authorization")!.slice(7);
  const tick=async()=>{
   if(closed||res.destroyed)return;
   try{
    // Revalidate on each tick, so logout/disabled accounts cannot keep a stream alive.
    const now=await auth.authenticate(token);
    if(now.organizationId!==me.organizationId||now.userId!==me.userId)throw unauthorized();
    const data=await notices.cursor(now);
    const signature=data.id+":"+data.unreadCount;
    if(signature!==last){
     last=signature;
     res.write("event: change\ndata: "+JSON.stringify(data)+"\n\n");
    }else res.write(": keepalive\n\n");
   }catch{
    res.end();
    closed=true;clearInterval(timer);
   }
  };
  const timer=setInterval(()=>{void tick();},12000);
  res.on("close",()=>{closed=true;clearInterval(timer);});
  await tick();
 });
}
