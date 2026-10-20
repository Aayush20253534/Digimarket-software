// Safe, unauthenticated post-deploy checks. No user credentials, tokens, or test writes.
const required=name=>{const value=process.env[name];if(!value)throw Error("Missing "+name);return value;};
function origin(envName){
 const uri=new URL(required(envName));
 if(uri.protocol!=="https:"||uri.pathname!=="/"||uri.search||uri.hash)
  throw Error(envName+" must be a plain HTTPS origin");
 return uri.origin;
}
async function check(url,condition,name){
 const res=await fetch(url,{signal:AbortSignal.timeout(12000),cache:"no-store",
  headers:{accept:"application/json"}});
 const contentType=res.headers.get("content-type")??"";
 const body=contentType.includes("json")?await res.json():await res.text();
 if(!condition(res,body))throw Error("FAILED "+name+" status="+res.status);
 console.info("PASS "+name+" status="+res.status);
}
const api=origin("PROD_API_ORIGIN"),web=origin("PROD_WEB_ORIGIN");
await check(api+"/api/v1/health",(r,b)=>r.ok&&b?.data?.status==="ok","API process health");
await check(api+"/api/v1/ready",(r,b)=>r.ok&&b?.data?.database==="ok","Live database readiness");
await check(api+"/api/v1/me",r=>r.status===401,"Auth gate rejects anonymous access");
await check(api+"/api/v1/ops/health",r=>r.status===404,"Operational stats are private");
await check(web+"/",(r,b)=>r.ok&&typeof b==="string"&&b.includes("DigiMarket"),
 "Website responds");
await check(web+"/api/v1/me",r=>r.status===401,"Frontend BFF rejects anonymous requests");
console.info("Production anonymous smoke passed. Authenticated journeys and worker state require protected operational checks.");
