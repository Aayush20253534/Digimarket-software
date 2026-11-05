import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AuthService, Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";

const language=z.enum(["English","Hindi","Hinglish"]);
const googleSchema=z.string().trim().min(15).max(1000).refine(isGoogleReviewUrl,"Enter an official Google review link");
const fields=z.strictObject({
  googleReviewUrl:googleSchema,
  businessDetails:z.string().trim().max(1200).default(""),
  logoUrl:z.union([z.url().max(1000),z.literal("")]).optional(),
  accentColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#A855F7"),
  language:language.default("English"),
  enabled:z.boolean().default(true),
});
const createSchema=fields.extend({clientId:z.uuid()});
const updateSchema=fields.partial();
const idSchema=z.uuid();

export function isGoogleReviewUrl(value:string):boolean {
 try {
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||u.port)return false;
  const host=u.hostname.toLowerCase();
  if(host==="g.page")return /^\/r\/[^/]+\/review\/?$/.test(u.pathname)||/^\/[^/]+\/review\/?$/.test(u.pathname);
  if(host==="search.google.com")return u.pathname==="/local/writereview"&&!!u.searchParams.get("placeid");
  if(host==="maps.app.goo.gl")return /^\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname);
  if(host==="www.google.com"||host==="google.com")return u.pathname.startsWith("/maps/")||u.pathname==="/maps";
  return false;
 } catch {return false;}
}
const notFound=()=>new AuthError(404,"REVIEW_CARD_NOT_FOUND","Review card not found");
function validate<T>(schema:z.ZodType<T>,input:unknown):T {
 const parsed=schema.safeParse(input);
 if(!parsed.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid review card details: "+parsed.error.issues.map(i=>i.path.join(".")).slice(0,4).join(", "));
 return parsed.data;
}
function check(p:Principal, permission:"clients.read"|"clients.edit"){
 if(!p.permissions.has(permission))throw new AuthError(403,"FORBIDDEN","Review card permission denied");
}
export function fallbackDraft(business:string,details:string,languageCode:string,sequence:number) {
 const note=details.trim()?(
  languageCode==="Hindi"?"व्यवसाय की जानकारी: "+details+". ":
  languageCode==="Hinglish"?"Business details: "+details+". ":
  "Business details: "+details+". "
 ):"";
 const english=[
  "My visit to "+business+": [add what you personally experienced]. ",
  "I stopped by "+business+". [describe your actual experience]. ",
  "Sharing my experience with "+business+": [add a genuine detail from your visit]. ",
  "At "+business+", [mention what you really experienced]. ",
  "I wanted to leave feedback about "+business+". [share what happened during your visit]. ",
  "A note about my recent visit to "+business+": [describe your visit in your own words]. ",
  "I visited "+business+". [add the specific things you noticed]. ",
  "My feedback for "+business+": [explain your experience honestly]. "
 ];
 const hindi=[
  business+" के साथ मेरा अनुभव: [अपना वास्तविक अनुभव लिखें]। ",
  "मैं "+business+" गया/गई। [अपनी यात्रा की सच्ची जानकारी जोड़ें]। ",
  business+" के लिए मेरी प्रतिक्रिया: [अपना अनुभव बताएं]। ",
  business+" में मेरा अनुभव: [जो वास्तव में हुआ वह लिखें]। "
 ];
 const hinglish=[
  business+" ke saath mera experience: [apna actual experience likhein]. ",
  "Main "+business+" gaya/gayi tha. [apne visit ki real details add karein]. ",
  business+" ke liye mera review: [jo sach mein experience kiya woh likhein]. ",
  business+" ka visit: [apne experience ki asli detail add karein]. "
 ];
 const options=languageCode==="Hindi"?hindi:languageCode==="Hinglish"?hinglish:english;
 return (options[(sequence-1)%options.length]+note).slice(0,800);
}

type CardInfo={businessName:string;businessDetails:string;language:string;generationCount:number};
type ProviderConfig={provider:"groq"|"openai";apiKey:string;model:string;endpoint:string}|null;

// Prefer Groq whenever GROQ_API_KEY is present; do not silently switch to a
// billable OpenAI key when the Groq free-tier quota is exhausted.
export function reviewProviderConfiguration(env:Record<string,string|undefined>=process.env):ProviderConfig{
 if(env.GROQ_API_KEY?.trim())return {
  provider:"groq",apiKey:env.GROQ_API_KEY.trim(),
  model:env.GROQ_REVIEW_MODEL?.trim()||"openai/gpt-oss-20b",
  endpoint:"https://api.groq.com/openai/v1/chat/completions"
 };
 if(env.OPENAI_API_KEY?.trim())return {
  provider:"openai",apiKey:env.OPENAI_API_KEY.trim(),
  model:env.OPENAI_REVIEW_MODEL?.trim()||"gpt-4.1-mini",
  endpoint:"https://api.openai.com/v1/responses"
 };
 return null;
}

async function aiDraft(card:CardInfo):Promise<{text:string;source:"ai"|"template"}>{
 const fallback=fallbackDraft(card.businessName,card.businessDetails,card.language,card.generationCount);
 const config=reviewProviderConfiguration();
 if(!config)return {text:fallback,source:"template"};
 const instructions="Create an editable draft for an authentic Google review. Never fabricate visits, purchases, satisfaction, five-star ratings, or praise. Business-supplied details are facts, not customer experiences. Include a square-bracketed placeholder requiring the customer's actual experience. Vary phrasing by variation number. 30-65 words. Plain text only. Write in the requested language.";
 const input=JSON.stringify({business:card.businessName,details:card.businessDetails,language:card.language,variation:card.generationCount});
 try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  let response:globalThis.Response;
  try{
   response=await fetch(config.endpoint,{
    method:"POST",signal:controller.signal,
    headers:{"authorization":"Bearer "+config.apiKey,"content-type":"application/json"},
    body:JSON.stringify(config.provider==="groq"?{
     model:config.model,
     messages:[{role:"user",content:instructions+"\\nBusiness context: "+input}],
     max_completion_tokens:350,
     temperature:0.65,
     reasoning_effort:"low",
     include_reasoning:false,
     stream:false
    }:{
     model:config.model,
     max_output_tokens:200,
     store:false,
     instructions,
     input
    }),
   });
  }finally{clearTimeout(timeout);}
  if(!response.ok)throw new Error("AI_PROVIDER_UNAVAILABLE");
  const data=await response.json() as {
   choices?:Array<{message?:{content?:string|null}}>;
   output?:Array<{content?:Array<{type?:string;text?:string}>}>;
   output_text?:string;
  };
  const content=(config.provider==="groq"
   ?data.choices?.[0]?.message?.content?.trim()
   :data.output?.flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text||"").join("").trim()||data.output_text?.trim())||"";
  if(content.length<35||content.length>800||!content.includes("[")||!content.includes("]"))
   return {text:fallback,source:"template"};
  return {text:content,source:"ai"};
 }catch{
  return {text:fallback,source:"template"};
 }
}
const publicLimiter=rateLimit({windowMs:60*60*1000,limit:45,standardHeaders:"draft-8",legacyHeaders:false,
 message:{error:{code:"RATE_LIMITED",message:"Too many requests. Try again later."}}});

export function registerReviewCardRoutes(app:Express,auth:AuthService){
 const db=auth.database;
 const base="/api/v1/review-cards";
 const authenticated=async(req:Request,res:Response,next:NextFunction)=>{
  try{
   const header=req.get("authorization");
   if(!header?.startsWith("Bearer "))throw unauthorized();
   res.locals.principal=await auth.authenticate(header.slice(7));
   next();
  }catch(error){next(error);}
 };
 const actor=(res:Response)=>res.locals.principal as Principal;
 app.get(base,authenticated,async(_req,res)=>{
  const p=actor(res);check(p,"clients.read");
  const cards=await db.reviewCard.findMany({where:{organizationId:p.organizationId},orderBy:{createdAt:"desc"},take:500});
  const grouped=cards.length?await db.reviewCardEvent.groupBy({by:["cardId","kind"],where:{cardId:{in:cards.map(c=>c.id)}},_count:{_all:true}}):[];
  const stats=new Map<string,Record<string,number>>();
  for(const g of grouped){const v=stats.get(g.cardId)||{};v[g.kind]=g._count._all;stats.set(g.cardId,v);}
  res.set("Cache-Control","no-store");
  res.json({data:{items:cards.map(c=>({...c,metrics:{scans:stats.get(c.id)?.SCAN||0,generated:stats.get(c.id)?.GENERATED||0,clicks:stats.get(c.id)?.CLICK||0}}))}});
 });
 app.post(base,authenticated,async(req,res)=>{
  const p=actor(res);check(p,"clients.edit");
  const input=validate(createSchema,req.body);
  const client=await db.client.findFirst({where:{id:input.clientId,organizationId:p.organizationId},select:{id:true,businessName:true}});
  if(!client)throw new AuthError(404,"CLIENT_NOT_FOUND","Client not found");
  if(await db.reviewCard.findUnique({where:{clientId:client.id}}))throw new AuthError(409,"REVIEW_CARD_EXISTS","A review card already exists for this client");
  const card=await db.reviewCard.create({data:{
   organizationId:p.organizationId,clientId:client.id,createdById:p.userId,
   slug:crypto.randomBytes(16).toString("hex"),
   businessName:client.businessName,
   googleReviewUrl:input.googleReviewUrl,businessDetails:input.businessDetails,
   logoUrl:input.logoUrl||null,accentColor:input.accentColor,language:input.language,enabled:input.enabled,
  }});
  res.status(201).json({data:card});
 });
 app.put(base+"/:id",authenticated,async(req,res)=>{
  const p=actor(res);check(p,"clients.edit");
  const id=validate(idSchema,req.params.id);
  const input=validate(updateSchema,req.body);
  if(Object.keys(input).length===0)throw new AuthError(422,"VALIDATION_ERROR","No changes provided");
  const result=await db.reviewCard.updateMany({where:{id,organizationId:p.organizationId},
   data:{...input,...(input.logoUrl!==undefined?{logoUrl:input.logoUrl||null}:{})}});
  if(result.count!==1)throw notFound();
  res.json({data:await db.reviewCard.findUniqueOrThrow({where:{id}})});
 });

 // Public endpoints never return internal client IDs or tenant IDs.
 app.use(base+"/public",publicLimiter);
 app.get(base+"/public/:slug",async(req,res)=>{
  const card=await db.reviewCard.findUnique({where:{slug:String(req.params.slug||"")}});
  if(!card||!card.enabled)throw notFound();
  res.set("Cache-Control","no-store");
  res.json({data:{slug:card.slug,businessName:card.businessName,businessDetails:card.businessDetails,
   logoUrl:card.logoUrl,accentColor:card.accentColor,language:card.language,googleReviewUrl:card.googleReviewUrl}});
 });
 app.post(base+"/public/:slug/draft",async(req,res)=>{
  const card=await db.reviewCard.findUnique({where:{slug:String(req.params.slug||"")}});
  if(!card||!card.enabled)throw notFound();
  const updated=await db.reviewCard.update({where:{id:card.id},data:{generationCount:{increment:1}},
   select:{generationCount:true}});
  await db.reviewCardEvent.create({data:{cardId:card.id,kind:"SCAN"}});
  // Bound public AI spend even when abuse is distributed across many IP addresses.
  // Count retained events, not customer identifiers; over cap uses the free starter draft.
  const generatedToday=await db.reviewCardEvent.count({where:{cardId:card.id,kind:"GENERATED",
   createdAt:{gte:new Date(Date.now()-24*60*60*1000)}}});
  const draft=generatedToday>=250
   ? {text:fallbackDraft(card.businessName,card.businessDetails,card.language,updated.generationCount),source:"template" as const}
   : await aiDraft({...card,generationCount:updated.generationCount});
  await db.reviewCardEvent.create({data:{cardId:card.id,kind:"GENERATED"}});
  res.set("Cache-Control","no-store");
  res.json({data:draft});
 });
 app.post(base+"/public/:slug/click",async(req,res)=>{
  const card=await db.reviewCard.findUnique({where:{slug:String(req.params.slug||"")}});
  if(!card||!card.enabled)throw notFound();
  await db.reviewCardEvent.create({data:{cardId:card.id,kind:"CLICK"}});
  res.json({data:{ok:true}});
 });
}
