"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Archive, Download, FileStack, RefreshCw, Upload } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { Card, EmptyState, FormField, Notice, PageHeader, Spinner, StatusBadge } from "@/components/ui";

type Asset={id:string;filename:string;contentType:string;bytes:number;resourceType:string;
 status:"ACTIVE"|"ARCHIVED";version:number;createdAt:string;clientId:string|null;
 client?:{businessName:string}|null;uploader?:{displayName:string}};
type Listing={items:Asset[];nextCursor:string|null};
type Client={id:string;businessName:string};
type Intent={intentId:string;expiresAt:string;uploadUrl:string;
 params:Record<string,string>;resourceType:string};
const accepted=["image/jpeg","image/png","image/webp","video/mp4","video/quicktime","video/webm","application/pdf"];
const errText=(e:unknown)=>e instanceof ApiError?e.message:e instanceof Error?e.message:"Asset operation failed";
const prettyBytes=(n:number)=>n>=1_000_000?(n/1_000_000).toFixed(1)+" MB":(n/1000).toFixed(0)+" KB";

export default function AssetsPage(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("assets.read");
 const canUpload=!!session?.identity.permissions.includes("assets.upload");
 const canArchive=!!session?.identity.permissions.includes("assets.delete");
 const canClients=!!session?.identity.permissions.includes("clients.read");
 const [items,setItems]=useState<Asset[]>([]);
 const [clients,setClients]=useState<Client[]>([]);
 const [file,setFile]=useState<File|null>(null);
 const [clientId,setClientId]=useState("");
 const [linkClient,setLinkClient]=useState("");
 const [selected,setSelected]=useState<Asset|null>(null);
 const [filter,setFilter]=useState<"ACTIVE"|"ARCHIVED">("ACTIVE");
 const [search,setSearch]=useState("");
 const [filterClient,setFilterClient]=useState("");
 const [cursor,setCursor]=useState<string|null>(null);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [uploadProgress,setUploadProgress]=useState("");
 const load=useCallback(async()=>{
   if(!canRead){setLoading(false);return;}
   setLoading(true);
   try{
     const q=new URLSearchParams({limit:"30",status:filter});
     if(search.trim())q.set("q",search.trim());
     if(filterClient)q.set("clientId",filterClient);
     if(cursor)q.set("cursor",cursor);
     const result=await request<Listing>("/assets?"+q.toString());
     setItems(result.items);setNextCursor(result.nextCursor);setError("");
   }catch(e){setError(errText(e));}finally{setLoading(false);}
 },[canRead,request,filter,search,filterClient,cursor]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
   if(!canClients)return;
   void request<{items:Client[]}>("/clients?limit=100&status=ACTIVE").then(data=>setClients(data.items)).catch(()=>{});
 },[canClients,request]);
 const open=(asset:Asset)=>{setSelected(asset);setLinkClient(asset.clientId??"");};
 async function upload(e:FormEvent){
   e.preventDefault();if(!file)return;
   setError("");setMessage("");setBusy(true);
   try{
     if(!accepted.includes(file.type))throw new Error("Unsupported format. Use JPEG, PNG, WebP, MP4, MOV, WebM or PDF.");
     if(!file.size)throw new Error("Cannot upload an empty file.");
     setUploadProgress("Authorizing upload…");
     const intent=await request<Intent>("/assets/upload-intent",{method:"POST",body:{
       filename:file.name,contentType:file.type,bytes:file.size,clientId:clientId||null,
     }});
     if(new Date(intent.expiresAt).getTime()<=Date.now())throw new Error("Upload authorization expired");
     const form=new FormData();
     for(const [key,value] of Object.entries(intent.params))form.append(key,value);
     form.append("file",file,file.name);
     setUploadProgress("Uploading to protected Cloudinary storage…");
     const uploaded=await fetch(intent.uploadUrl,{method:"POST",body:form});
     if(!uploaded.ok)throw new Error("Cloudinary rejected the upload ("+uploaded.status+"). Check file format, plan limits or storage configuration.");
     const payload=await uploaded.json() as {asset_id?:string};
     if(!payload.asset_id)throw new Error("Cloudinary did not return an asset identifier");
     setUploadProgress("Verifying uploaded file against Cloudinary…");
     await request("/assets/confirm",{method:"POST",body:{intentId:intent.intentId,assetId:payload.asset_id}});
     setMessage("File securely uploaded and verified.");
     setFile(null);setCursor(null);await load();
   }catch(e){setError(errText(e));}finally{setBusy(false);setUploadProgress("");}
 }
 async function download(){
   if(!selected)return;setBusy(true);setError("");setMessage("");
   try{
     const result=await request<{url:string;expiresAt:string}>("/assets/"+selected.id+"/authorized-download",{method:"POST",body:{}});
     // The signed URL expires after two minutes. Never persist it in application state/storage.
     const anchor=document.createElement("a");anchor.href=result.url;anchor.target="_blank";anchor.rel="noopener noreferrer";
     anchor.click();
     setMessage("Protected download authorized for two minutes.");
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function link(e:FormEvent){
   e.preventDefault();if(!selected)return;
   setBusy(true);setError("");setMessage("");
   try{
     const result=await request<{version:number;clientId:string|null}>("/assets/"+selected.id+"/link",
       {method:"POST",body:{version:selected.version,clientId:linkClient||null}});
     setSelected({...selected,...result});
     setMessage("Client association updated.");await load();
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function archive(){
   if(!selected)return;setBusy(true);setError("");setMessage("");
   try{
     await request("/assets/"+selected.id+"/archive",{method:"POST",body:{version:selected.version}});
     setSelected(null);setMessage("Asset archived. New download grants are disabled.");
     await load();
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 if(!session)return <Spinner label="Checking asset permissions…"/>;
 if(!canRead)return <><PageHeader title="Assets access denied"/><Notice kind="error">Your account does not have assets.read permission.</Notice></>;
 return <div className="space-y-7">
   <PageHeader eyebrow="Protected storage" title="Files & assets"
     description="Upload marketing media and PDFs privately, assign files to clients and request short-lived downloads."
     actions={<button type="button" className="btn-secondary" onClick={()=>void load()}>
       <RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button>}/>
   {error&&<Notice kind="error">{error}</Notice>}
   {message&&<Notice kind="success">{message}</Notice>}
   <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
     <div className="space-y-5">
       <Card title="Asset browser" description="No public file URLs are stored or exposed. Downloads require permission checks.">
         <div className="flex flex-wrap gap-2">
           <input aria-label="Search assets" className="field min-w-[190px] flex-1" value={search}
             placeholder="Search filename or media type" onChange={e=>{setSearch(e.target.value);setCursor(null);}}/>
           <select className="field" aria-label="Asset status" value={filter}
             onChange={e=>{setFilter(e.target.value as "ACTIVE"|"ARCHIVED");setCursor(null);}}>
             <option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option>
           </select>
           {canClients&&<select aria-label="Filter assets by client" className="field" value={filterClient}
             onChange={e=>{setFilterClient(e.target.value);setCursor(null);}}>
             <option value="">All clients</option>{clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}
           </select>}
         </div>
         {loading?<Spinner label="Loading assets…"/>:items.length===0?
           <EmptyState icon={FileStack} title="No matching assets" description="Upload a file or adjust the filters."/>:
           <div className="mt-4 space-y-2">{items.map(asset=><button type="button" key={asset.id}
             onClick={()=>open(asset)} className={"w-full rounded-xl border p-3 text-left hover:border-indigo-400 "+(selected?.id===asset.id?"border-indigo-500 bg-indigo-50":"border-slate-200")}>
             <div className="flex justify-between gap-2"><span className="break-all text-sm font-semibold">{asset.filename}</span>
               <StatusBadge status={asset.status}/></div>
             <p className="mt-1 text-xs text-slate-500">{asset.contentType} · {prettyBytes(asset.bytes)}</p>
             <p className="mt-1 text-xs text-slate-500">{asset.client?.businessName??"General agency file"} · {new Date(asset.createdAt).toLocaleDateString("en-IN")}</p>
           </button>)}</div>}
         <div className="mt-4 flex justify-between">
           <button className="btn-secondary" disabled={!cursor||loading} onClick={()=>setCursor(null)}>First page</button>
           <button className="btn-secondary" disabled={!nextCursor||loading} onClick={()=>setCursor(nextCursor)}>Next page</button>
         </div>
       </Card>
       {canUpload&&<Card title="Secure upload" description="Images up to 20 MB, video up to 100 MB, PDFs up to 10 MB. Direct upload uses short-lived authorization.">
         <form onSubmit={upload} className="space-y-3">
           <FormField id="asset-file" label="Select image, video or PDF">
             <input id="asset-file" className="field" type="file" accept={accepted.join(",")} required
               onChange={e=>setFile(e.target.files?.[0]??null)}/>
           </FormField>
           {canClients&&<FormField id="asset-client" label="Client association (optional)">
             <select id="asset-client" className="field" value={clientId} onChange={e=>setClientId(e.target.value)}>
               <option value="">General agency asset</option>{clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}
             </select>
           </FormField>}
           {file&&<p className="text-xs text-slate-500">{file.name} · {prettyBytes(file.size)}</p>}
           {uploadProgress&&<p role="status" className="text-sm text-indigo-700">{uploadProgress}</p>}
           <button type="submit" disabled={busy||!file} className="btn-primary"><Upload className="h-4 w-4" aria-hidden="true"/>{busy?"Working…":"Upload and verify"}</button>
         </form>
       </Card>}
     </div>
     <div className="space-y-5">
       {selected?<Card title={"Asset: "+selected.filename} description={"Version "+selected.version+" · "+selected.status}>
         <dl className="mb-4 space-y-2 text-sm">
           <div><dt className="font-semibold">Type</dt><dd>{selected.contentType}</dd></div>
           <div><dt className="font-semibold">File size</dt><dd>{prettyBytes(selected.bytes)}</dd></div>
           <div><dt className="font-semibold">Client</dt><dd>{selected.client?.businessName??"Unassigned"}</dd></div>
         </dl>
         {selected.status==="ACTIVE"&&<button type="button" className="btn-primary" disabled={busy} onClick={()=>void download()}>
           <Download className="h-4 w-4" aria-hidden="true"/>Protected download</button>}
         {selected.status==="ACTIVE"&&canUpload&&canClients&&<form className="mt-5 space-y-3 border-t pt-4" onSubmit={link}>
           <FormField id="asset-link" label="Link asset to client">
             <select id="asset-link" className="field" value={linkClient} onChange={e=>setLinkClient(e.target.value)}>
               <option value="">General agency file</option>{clients.map(c=><option value={c.id} key={c.id}>{c.businessName}</option>)}
             </select>
           </FormField>
           <button type="submit" disabled={busy} className="btn-secondary">Save client link</button>
         </form>}
         {selected.status==="ACTIVE"&&canArchive&&<div className="mt-5 border-t pt-4">
           <button className="btn-secondary" disabled={busy} onClick={()=>void archive()}>
             <Archive className="h-4 w-4" aria-hidden="true"/>Archive asset</button>
         </div>}
       </Card>:<Card title="Asset details"><EmptyState icon={FileStack} title="Select a file" description="Choose a file to request a protected download or update its client association."/></Card>}
       <Card title="Privacy & retention">
         <p className="text-sm leading-6 text-slate-600">Files use authenticated Cloudinary delivery. Authorized download links expire after 2 minutes. Archiving blocks future app download grants, but already issued links remain valid until expiry. Uploads without confirmation are not displayed; orphan cleanup and long-term retention are addressed during production hardening.</p>
         <p className="mt-2 text-xs text-slate-500">Do not upload passwords or account credentials. Use platform delegation or an approved secret vault.</p>
       </Card>
     </div>
   </div>
 </div>;
}
