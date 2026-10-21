import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import express from "express";
import type { AuthService } from "../auth/service";
import { LeadsService } from "../leads/service";

// Meta signs the exact raw bytes; do not verify a reserialized JSON object.
export function validMetaSignature(raw:Buffer,header:string|undefined,secret:string):boolean{
 if(!/^sha256=[0-9a-f]{64}$/i.test(header??"")||secret.length<16)return false;
 const got=Buffer.from(header!.slice(7),"hex");
 const expected=createHmac("sha256",secret).update(raw).digest();
 return got.length===expected.length&&timingSafeEqual(got,expected);
}
export function inboundSenders(body:unknown,phoneNumberId:string):string[]{
 if(!body||typeof body!=="object"||Array.isArray(body))return [];
 const document=body as Record<string,unknown>;
 if(document.object!=="whatsapp_business_account"||!Array.isArray(document.entry))return [];
 const result:string[]=[];
 for(const entry of document.entry.slice(0,50)){
  if(!entry||typeof entry!=="object"||!Array.isArray(entry.changes))continue;
  for(const change of entry.changes.slice(0,50)){
   if(!change||typeof change!=="object"||change.field!=="messages")continue;
   const value=change.value;
   if(!value||typeof value!=="object"||value.metadata?.phone_number_id!==phoneNumberId||
     !Array.isArray(value.messages))continue;
   for(const msg of value.messages.slice(0,100)){
    if(msg&&typeof msg==="object"&&typeof msg.from==="string"&&
      /^[0-9]{7,15}$/.test(msg.from)&&typeof msg.id==="string"&&msg.id.length>0)result.push(msg.from);
   }
  }
 }
 return [...new Set(result)];
}
function configured(){
 const verify=process.env.WHATSAPP_VERIFY_TOKEN??"";
 const secret=process.env.WHATSAPP_APP_SECRET??"";
 const phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID??"";
 const organizationId=process.env.WHATSAPP_ORGANIZATION_ID??"";
 const createdById=process.env.WHATSAPP_CREATED_BY_USER_ID??"";
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(verify.length<16||secret.length<16||!/^[0-9]{5,30}$/.test(phoneId)||
    !uuid.test(organizationId)||!uuid.test(createdById))return null;
 return {verify,secret,phoneId,organizationId,createdById};
}
export function registerWhatsAppWebhook(app:Express,auth:AuthService){
 const path="/api/v1/integrations/whatsapp/webhook";
 const leadService=new LeadsService(auth.database);
 app.get(path,(req,res)=>{
  res.set("Cache-Control","no-store");
  const config=configured();
  const mode=req.query["hub.mode"],token=req.query["hub.verify_token"],challenge=req.query["hub.challenge"];
  const candidate=typeof token==="string"?token:"";
  if(!config||mode!=="subscribe"||typeof challenge!=="string"||challenge.length>200||
     Buffer.byteLength(candidate)!==Buffer.byteLength(config.verify)||
     !timingSafeEqual(Buffer.from(candidate),Buffer.from(config.verify))){
   return res.status(403).end();
  }
  res.type("text/plain").status(200).send(challenge);
 });
 app.post(path,express.raw({type:"application/json",limit:"128kb"}),async(req,res)=>{
  res.set("Cache-Control","no-store");
  const config=configured();
  if(!config)return res.status(503).json({error:{code:"WHATSAPP_UNCONFIGURED",message:"WhatsApp is not configured"}});
  if(!Buffer.isBuffer(req.body)||
    !validMetaSignature(req.body,req.get("x-hub-signature-256"),config.secret)){
   return res.status(401).json({error:{code:"WEBHOOK_UNAUTHORIZED",message:"Invalid webhook signature"}});
  }
  let payload:unknown;
  try{payload=JSON.parse(req.body.toString("utf8"));}
  catch{return res.status(400).json({error:{code:"INVALID_PAYLOAD",message:"Invalid JSON"}});
  }
  const senders=inboundSenders(payload,config.phoneId);
  for(const sender of senders)await leadService.ingestWhatsApp(config.organizationId,config.createdById,sender);
  res.status(200).json({data:{received:true,processed:senders.length}});
 });
}
