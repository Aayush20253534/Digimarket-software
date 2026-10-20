import {NextRequest} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const token=request.headers.get("authorization");
 if(!token?.startsWith("Bearer "))return Response.json({error:{code:"UNAUTHORIZED",message:"Sign in required"}},{status:401});
 const base=process.env.API_INTERNAL_URL??"http://127.0.0.1:4000";
 const upstream=await fetch(new URL("/api/v1/notifications/stream",base),{
  method:"GET",headers:{authorization:token,accept:"text/event-stream"},
  cache:"no-store",signal:request.signal,
 });
 if(!upstream.ok||!upstream.body)return Response.json({error:{code:"STREAM_UNAVAILABLE",message:"Live updates unavailable"}},{status:upstream.status});
 return new Response(upstream.body,{status:200,headers:{
  "Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-store, no-transform",
  "X-Accel-Buffering":"no",
 }});
}
