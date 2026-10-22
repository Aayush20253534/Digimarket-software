import {createHash,createPrivateKey,sign} from "node:crypto";
import type {PrismaClient} from "@digimarket/db";

// Empty-payload Web Push uses VAPID authentication without storing or sending private task text.
// The service worker shows a generic task alert; details require signing in.
function credentials(){
 const publicKey=process.env.WEB_PUSH_VAPID_PUBLIC_KEY??"";
 const privateKey=process.env.WEB_PUSH_VAPID_PRIVATE_KEY??"";
 const subject=process.env.WEB_PUSH_VAPID_SUBJECT??"";
 if(!/^B[A-Za-z0-9_-]{86}$/.test(publicKey)||!/^[A-Za-z0-9_-]{43}$/.test(privateKey)||
   !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject))return null;
 return {publicKey,privateKey,subject};
}
const b64=(v:string)=>Buffer.from(v,"base64url");
export function webPushPublicKey(){return credentials()?.publicKey??null;}
export function validPushEndpoint(raw:string):boolean{
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.port||u.username||u.password||u.hash||raw.length>2048)return false;
  // Prevent backend SSRF. All accepted endpoints are public push provider HTTPS services.
  return ["fcm.googleapis.com","fcmregistrations.googleapis.com","updates.push.services.mozilla.com",
   "push.services.mozilla.com","web.push.apple.com","push.apple.com","notify.windows.com"]
   .includes(u.hostname)||u.hostname.endsWith(".notify.windows.com");
 }catch{return false;}
}
export function subscriptionHash(endpoint:string){return createHash("sha256").update(endpoint).digest("hex");}
function vapidToken(endpoint:string){
 const env=credentials();if(!env)return null;
 const publicBytes=b64(env.publicKey),privateBytes=b64(env.privateKey);
 if(publicBytes.length!==65||publicBytes[0]!==4||privateBytes.length!==32)return null;
 const key=createPrivateKey({key:{
  kty:"EC",crv:"P-256",x:publicBytes.subarray(1,33).toString("base64url"),
  y:publicBytes.subarray(33,65).toString("base64url"),d:privateBytes.toString("base64url"),
 },format:"jwk"});
 const head=Buffer.from(JSON.stringify({typ:"JWT",alg:"ES256"})).toString("base64url");
 const body=Buffer.from(JSON.stringify({
  aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+60*60,sub:env.subject,
 })).toString("base64url");
 const value=head+"."+body;
 const signature=sign("sha256",Buffer.from(value),{key,dsaEncoding:"ieee-p1363"}).toString("base64url");
 return {token:value+"."+signature,publicKey:env.publicKey};
}
// Never fail an assignment if a device is offline, unsubscribed or a push provider is unavailable.
export async function sendTaskPush(db:PrismaClient,organizationId:string,recipientIds:string[]){
 if(!credentials()||!recipientIds.length)return;
 const subscriptions=await db.webPushSubscription.findMany({where:{
  organizationId,userId:{in:[...new Set(recipientIds)]}},select:{id:true,endpoint:true}
 }).catch(()=>[]);
 await Promise.all(subscriptions.map(async sub=>{
  if(!validPushEndpoint(sub.endpoint))return;
  try{
   const token=vapidToken(sub.endpoint);if(!token)return;
   const response=await fetch(sub.endpoint,{method:"POST",redirect:"error",headers:{
    Authorization:"vapid t="+token.token+", k="+token.publicKey,TTL:"3600",
    "Content-Length":"0"
   },signal:AbortSignal.timeout(5000)});
   if(response.status===404||response.status===410)
    await db.webPushSubscription.deleteMany({where:{id:sub.id}});
  }catch{
   // The in-app notification is durable and remains readable regardless of push delivery.
  }
 }));
}
