import type {Express,Request,Response,NextFunction} from "express";
import {z} from "zod";
import {searchQuerySchema,reportsPeriodSchema,notificationListSchema} from "@digimarket/contracts";
import {AuthService,type Principal} from "../auth/service";
import {AuthError,unauthorized} from "../auth/errors";
import {InsightsService} from "./insights";
import {NotificationService} from "./notifications";
function parse<T>(schema:z.ZodType<T>,value:unknown):T{
 const checked=schema.safeParse(value);
 if(!checked.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid search, report or notification fields");
 return checked.data;
}
export function registerInsightsRoutes(app:Express,auth:AuthService){
 const insights=new InsightsService(auth.database),notices=new NotificationService(auth.database);
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
