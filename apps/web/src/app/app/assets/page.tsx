"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Archive, ChevronRight, Download, File, FileStack, Folder, FolderPlus, Home, Palette, Pencil, RefreshCw, Upload } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { Card, EmptyState, FormField, Notice, PageHeader, Spinner, StatusBadge } from "@/components/ui";

type Asset={id:string;filename:string;contentType:string;bytes:number;resourceType:string;
 status:"ACTIVE"|"ARCHIVED";version:number;createdAt:string;clientId:string|null;folderId?:string|null;
 client?:{businessName:string}|null;uploader?:{displayName:string}};
type FolderItem={id:string;parentId:string|null;name:string;color:string;version:number};
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
 const [trail,setTrail]=useState<FolderItem[]>([]);
 const folderId=trail.length?trail[trail.length-1].id:null;
 const [folders,setFolders]=useState<FolderItem[]>([]);
 const [newFolderName,setNewFolderName]=useState("");
 const [newFolderColor,setNewFolderColor]=useState("#A56CE4");
 const [editedName,setEditedName]=useState("");
 const [destination,setDestination]=useState("");
 const [renaming,setRenaming]=useState<string|null>(null);
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
     q.set("folderId",folderId??"root");
     const [result,folderList]=await Promise.all([
       request<Listing>("/assets?"+q.toString()),
       request<{folders:FolderItem[]}>("/asset-folders?parentId="+(folderId??"root"))
     ]);
     setItems(result.items);setFolders(folderList.folders);setNextCursor(result.nextCursor);setError("");
   }catch(e){setError(errText(e));}finally{setLoading(false);}
 },[canRead,request,filter,search,filterClient,cursor,folderId]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
   if(!canClients)return;
   void request<{items:Client[]}>("/clients?limit=100&status=ACTIVE").then(data=>setClients(data.items)).catch(()=>{});
 },[canClients,request]);
 const open=(asset:Asset)=>{setSelected(asset);setEditedName(asset.filename);setDestination(asset.folderId??"");setLinkClient(asset.clientId??"");};
 const enter=(folder:FolderItem)=>{setTrail(v=>[...v,folder]);setCursor(null);setSelected(null);};
 const goTo=(depth:number)=>{setTrail(v=>v.slice(0,depth));setCursor(null);setSelected(null);};
 async function downloadFolder(folder:FolderItem){
  if(!session)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/v1/asset-folders/"+folder.id+"/download",{
    method:"POST",credentials:"same-origin",
    headers:{authorization:"Bearer "+session.accessToken,"content-type":"application/json"},
    body:"{}",
   });
   if(!response.ok){
    const result=await response.json().catch(()=>null) as {error?:{message?:string}}|null;
    throw new Error(result?.error?.message||"Folder download failed");
   }
   const url=URL.createObjectURL(await response.blob());
   const anchor=document.createElement("a");anchor.href=url;anchor.download=folder.name+".zip";anchor.click();
   window.setTimeout(()=>URL.revokeObjectURL(url),30000);
   setMessage("Folder ZIP downloaded.");
  }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function addFolder(e:FormEvent){
   e.preventDefault();if(!newFolderName.trim())return;
   setBusy(true);setError("");
   try{await request("/asset-folders",{method:"POST",body:{name:newFolderName.trim(),color:newFolderColor,parentId:folderId}});
    setNewFolderName("");await load();setMessage("Folder created.");}catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function renameFolder(folder:FolderItem,updates:{name?:string;color?:string}){
   setBusy(true);setError("");
   try{await request("/asset-folders/"+folder.id,{method:"PUT",body:{...updates,version:folder.version}});
    setRenaming(null);await load();setMessage("Folder updated.");}catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function organizeFile(e:FormEvent){
   e.preventDefault();if(!selected)return;
   setBusy(true);setError("");
   try{
    const saved=await request<Asset>("/assets/"+selected.id+"/organize",{method:"POST",
      body:{filename:editedName.trim(),folderId:destination||null,version:selected.version}});
    setSelected({...selected,...saved});setMessage("File renamed or moved.");await load();
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
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
     const saved=await request<Asset>("/assets/confirm",{method:"POST",body:{intentId:intent.intentId,assetId:payload.asset_id}});
     if(folderId)await request("/assets/"+saved.id+"/organize",{method:"POST",body:{filename:file.name,folderId,version:saved.version}});
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
     description="Organize agency files into color-coded folders, rename or move files, and upload media to protected Cloudinary storage."
     actions={<button type="button" className="btn-secondary" onClick={()=>void load()}>
       <RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button>}/>
   {error&&<Notice kind="error">{error}</Notice>}
   {message&&<Notice kind="success">{message}</Notice>}
   <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
     <div className="space-y-5">
       <Card title="Drive-style file explorer" description="Folders and file metadata are stored in your workspace. Downloads remain private and authenticated.">
         <nav aria-label="Folder path" className="aw-drive-breadcrumb">
          <button type="button" onClick={()=>goTo(0)}><Home size={16}/> My Drive</button>
          {trail.map((folder,i)=><span key={folder.id} className="aw-drive-crumb"><ChevronRight size={14}/>
            <button type="button" onClick={()=>goTo(i+1)}>{folder.name}</button></span>)}
         </nav>
         {canUpload&&<form className="aw-drive-create" onSubmit={addFolder}>
           <FolderPlus size={19}/><input className="field" aria-label="New folder name" maxLength={120}
             placeholder="New folder name" value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} required/>
           <label title="Folder color"><Palette size={15}/><input aria-label="New folder color" type="color" value={newFolderColor}
             onChange={e=>setNewFolderColor(e.target.value)}/></label>
           <button className="btn-primary" disabled={busy} type="submit">Create folder</button>
         </form>}
         <div className="aw-drive-folders" aria-label="Folders in current directory">
          {folders.map(folder=><div className="aw-drive-folder" key={folder.id}>
            <button type="button" className="aw-drive-folder-open" onClick={()=>enter(folder)}>
             <Folder size={28} fill={folder.color} color={folder.color} strokeWidth={1.6}/>
             <span>{folder.name}</span><ChevronRight size={16}/>
            </button>
            <div className="aw-drive-folder-tools">
             <button type="button" aria-label={"Download "+folder.name+" as ZIP"} title="Download folder ZIP"
               disabled={busy} onClick={()=>void downloadFolder(folder)}><Download size={15}/></button>
             {canUpload&&<>
             <button type="button" aria-label={"Rename "+folder.name} title="Rename folder"
               onClick={()=>setRenaming(renaming===folder.id?null:folder.id)}><Pencil size={15}/></button>
             <input type="color" aria-label={"Change "+folder.name+" color"} title="Change folder color" value={folder.color}
               onChange={e=>void renameFolder(folder,{color:e.target.value})}/>
              </>}
            </div>}
            {renaming===folder.id&&<form className="aw-drive-rename" onSubmit={e=>{e.preventDefault();
              const input=e.currentTarget.elements.namedItem("folder-name") as HTMLInputElement|null;
              if(input)void renameFolder(folder,{name:input.value});}}>
              <input name="folder-name" aria-label="Rename folder" defaultValue={folder.name} maxLength={120} required className="field"/>
              <button type="submit" className="btn-secondary">Save</button>
             </form>}
           </div>)}
         </div>
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
           <div className="aw-drive-files mt-4" aria-label="Files in current directory">{items.map(asset=><button type="button" key={asset.id}
             onClick={()=>open(asset)} className={"w-full rounded-xl border p-3 text-left hover:border-indigo-400 "+(selected?.id===asset.id?"border-indigo-500 bg-indigo-50":"border-slate-200")}>
             <div className="flex justify-between gap-2"><span className="break-all text-sm font-semibold"><File size={18} className="inline mr-2"/>{asset.filename}</span>
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
         {selected.status==="ACTIVE"&&canUpload&&<form onSubmit={organizeFile} className="mb-4 space-y-3">
          <FormField id="asset-rename" label="Rename file"><input id="asset-rename" className="field" value={editedName}
            maxLength={180} required onChange={e=>setEditedName(e.target.value)}/></FormField>
          <FormField id="asset-folder-destination" label="Move to folder"><select id="asset-folder-destination" className="field"
            value={destination} onChange={e=>setDestination(e.target.value)}>
            <option value="">My Drive / root</option>
            {trail.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
            {folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
           </select></FormField>
           <button type="submit" className="btn-secondary" disabled={busy||!editedName.trim()}>Save file changes</button>
         </form>}
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
