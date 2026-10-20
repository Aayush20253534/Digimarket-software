// Startup fails closed for a misconfigured live API. No credentials are printed.
function required(env:NodeJS.ProcessEnv,key:string){
 const value=env[key]?.trim();
 if(!value)throw new Error("Missing production configuration: "+key);
 return value;
}
function httpsOrigin(value:string,key:string){
 let url:URL;
 try{url=new URL(value);}catch{throw new Error("Invalid production URL: "+key);}
 if(url.protocol!=="https:"||url.pathname!=="/"||url.search||url.hash||url.username||url.password)
  throw new Error("Production origin must use HTTPS without path or credentials: "+key);
 return url.origin;
}
export function validateProductionApiConfig(env:NodeJS.ProcessEnv){
 if(env.NODE_ENV!=="production")return;
 for(const key of ["DATABASE_URL","DIRECT_DATABASE_URL","JWT_ACCESS_SECRET",
  "JWT_CHALLENGE_SECRET","CORS_ALLOWED_ORIGINS",
  "CLOUDINARY_CLOUD_NAME","CLOUDINARY_API_KEY","CLOUDINARY_API_SECRET",
  "OPS_MONITOR_TOKEN"])required(env,key);
 if(required(env,"OPS_MONITOR_TOKEN").length<32)throw new Error("OPS_MONITOR_TOKEN too short");
 const allowed=required(env,"CORS_ALLOWED_ORIGINS").split(",").map(x=>httpsOrigin(x.trim(),"CORS_ALLOWED_ORIGINS"));
 if(allowed.length===0||new Set(allowed).size!==allowed.length)throw new Error("Invalid CORS origin list");
 for(const key of ["DATABASE_URL","DIRECT_DATABASE_URL"]){
  const uri=new URL(required(env,key));
  if(!["postgres:","postgresql:"].includes(uri.protocol)||!uri.hostname||!uri.pathname.slice(1)
    ||!["require","verify-full"].includes(uri.searchParams.get("sslmode")??"")
    ||(uri.searchParams.get("sslmode")==="require"&&uri.searchParams.get("uselibpqcompat")==="true"))
   throw new Error("Production PostgreSQL URL requires verified TLS (sslmode=verify-full or legacy require): "+key);
 }
}
