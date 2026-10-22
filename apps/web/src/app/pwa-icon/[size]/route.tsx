import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export const runtime = "nodejs";
export const revalidate = 86400;
// Keep installed PWA icons identical to the shared AmplifyWorld mark.
const permitted = new Set(["180","192","512"]);
const markSource = readFile(join(process.cwd(),"public","brand","amplifyworld-mark.svg"),"utf8");
export function generateStaticParams(){return [...permitted].map(size=>({size}));}
export async function GET(_request:Request,{params}:{params:Promise<{size:string}>}){
 const {size:rawSize}=await params;
 if(!permitted.has(rawSize))return new Response("Not found",{status:404});
 const size=Number(rawSize);
 const logoData="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(await markSource);
 return new ImageResponse(
   <div style={{
     width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",
     background:"linear-gradient(135deg, #201033 0%, #10091C 66%, #1A0C2A 100%)",
     borderRadius:Math.round(size*.21),
   }}>
     <img src={logoData} alt="" width={Math.round(size*.79)} height={Math.round(size*.61)}/>
   </div>,
   {width:size,height:size,headers:{"Cache-Control":"public, max-age=86400"}},
 );
}
