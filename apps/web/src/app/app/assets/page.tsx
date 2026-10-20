"use client";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, ArrowUpDown, ChevronRight, Download, Eye, File, FileImage, FileText, FileVideo, Folder, FolderPlus, Grid2X2, Home, List, MoreVertical, Pencil, Plus, RefreshCw, Search, Upload, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { FormField, Notice, Spinner } from "@/components/ui";

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
 const [clients,setClients]=useState<Client[]>([]);
 const [files,setFiles]=useState<File[]>([]);
 const fileInput=useRef<HTMLInputElement>(null);
 const [clientId,setClientId]=useState("");
 const [linkClient,setLinkClient]=useState("");
 const [selected,setSelected]=useState<Asset|null>(null);
 const [filter,setFilter]=useState<"ACTIVE"|"ARCHIVED">("ACTIVE");
 const [search,setSearch]=useState("");
 const [filterClient,setFilterClient]=useState("");
 const [cursor,setCursor]=useState<string|null>(null);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [legacySort,setLegacySort]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [uploadProgress,setUploadProgress]=useState("");
 const [newMenu,setNewMenu]=useState(false),[folderDialog,setFolderDialog]=useState(false);
 const [uploadDialog,setUploadDialog]=useState(false),[detailsOpen,setDetailsOpen]=useState(false);
 const [preview,setPreview]=useState<{url:string;type:string;filename:string}|null>(null);
 const [context,setContext]=useState<string|null>(null);
 const [view,setView]=useState<"grid"|"list">("grid"),[sort,setSort]=useState<"name"|"date"|"size"|"type">("name"),[reverse,setReverse]=useState(false);
 const [selectedIds,setSelectedIds]=useState<string[]>([]);
 const [folderEdit,setFolderEdit]=useState<FolderItem|null>(null);
 const [folderCatalog,setFolderCatalog]=useState<FolderItem[]>([]),[folderCatalogLimited,setFolderCatalogLimited]=useState(false);
 const [folderEditName,setFolderEditName]=useState(""),[folderEditColor,setFolderEditColor]=useState("#A56CE4"),[folderMove,setFolderMove]=useState("");
 const [dropActive,setDropActive]=useState(false);
 useEffect(()=>{
  const handler=(event:PointerEvent)=>{
   const target=event.target as HTMLElement;
   if(!target.closest(".aw-drive-item-menu,.aw-drive-menu-trigger"))setContext(null);
   if(!target.closest(".aw-drive-new-wrap"))setNewMenu(false);
  };
  document.addEventListener("pointerdown",handler);
  return()=>document.removeEventListener("pointerdown",handler);
 },[]);
 useEffect(()=>{
  if(!(folderDialog||folderEdit||uploadDialog||detailsOpen||preview))return;
  const before=document.body.style.overflow;
  document.body.style.overflow="hidden";
  return()=>{document.body.style.overflow=before;};
 },[folderDialog,folderEdit,uploadDialog,detailsOpen,preview]);
 useEffect(()=>{
  const esc=(event:KeyboardEvent)=>{
   if(event.key!=="Escape")return;
   setContext(null);setNewMenu(false);
   if(!busy){setPreview(null);setFolderDialog(false);setFolderEdit(null);setUploadDialog(false);setDetailsOpen(false);}
  };
  document.addEventListener("keydown",esc);
  return()=>document.removeEventListener("keydown",esc);
 },[busy]);
 const displayed=useMemo(()=>[...items].sort((a,b)=>{
   const x=sort==="name"?a.filename:sort==="type"?a.contentType:sort==="size"?a.bytes:a.createdAt;
   const y=sort==="name"?b.filename:sort==="type"?b.contentType:sort==="size"?b.bytes:b.createdAt;
   const delta=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),undefined,{numeric:true,sensitivity:"base"});
   return reverse?-delta:delta;
 }),[items,sort,reverse]);
 const visibleFolders=useMemo(()=>folders.filter(x=>x.name.toLowerCase().includes(search.trim().toLowerCase())),[folders,search]);
 const load=useCallback(async()=>{
   if(!canRead){setLoading(false);return;}
   setLoading(true);
   try{
     const q=new URLSearchParams({limit:"30",status:filter,sort,direction:reverse?"desc":"asc"});
     if(search.trim())q.set("q",search.trim());
     if(filterClient)q.set("clientId",filterClient);
     if(cursor)q.set("cursor",cursor);
     q.set("folderId",folderId??"root");
     const folderRequest=request<{folders:FolderItem[]}>("/asset-folders?parentId="+(folderId??"root"));
     let result:Listing;
     try{result=await request<Listing>("/assets?"+q.toString());setLegacySort(false);}
     catch(e){
      if(!(e instanceof ApiError)||e.status!==422)throw e;
      q.delete("sort");q.delete("direction");
      result=await request<Listing>("/assets?"+q.toString());setLegacySort(true);
     }
     const folderList=await folderRequest;
     setItems(result.items);setFolders(folderList.folders);setNextCursor(result.nextCursor);setError("");
   }catch(e){setError(errText(e));}finally{setLoading(false);}
 },[canRead,request,filter,search,filterClient,cursor,folderId,sort,reverse]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
   if(!canClients)return;
   void request<{items:Client[]}>("/clients?limit=100&status=ACTIVE").then(data=>setClients(data.items)).catch(()=>{});
 },[canClients,request]);
 const open=(asset:Asset)=>{setSelected(asset);setEditedName(asset.filename);setDestination(asset.folderId??"");setLinkClient(asset.clientId??"");};
 const enter=(folder:FolderItem)=>{setTrail(v=>[...v,folder]);setCursor(null);setSelected(null);setSelectedIds([]);setContext(null);};
 const goTo=(depth:number)=>{setTrail(v=>v.slice(0,depth));setCursor(null);setSelected(null);setSelectedIds([]);setContext(null);};
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
 async function addFolder(e:FormEvent):Promise<void>{
   e.preventDefault();if(!newFolderName.trim())return;
   setBusy(true);setError("");
   try{await request("/asset-folders",{method:"POST",body:{name:newFolderName.trim(),color:newFolderColor,parentId:folderId}});
    setNewFolderName("");await load();setMessage("Folder created.");setFolderDialog(false);}catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function deleteFolder(folder:FolderItem){
   if(!window.confirm("Delete empty folder '"+folder.name+"'? Files are never deleted by this action."))return;
   setBusy(true);setError("");
   try{
    await request("/asset-folders/"+folder.id,{method:"DELETE"});
    setMessage("Empty folder deleted.");await load();
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function renameFolder(folder:FolderItem,updates:{name?:string;color?:string;parentId?:string|null}):Promise<boolean>{
   setBusy(true);setError("");
   try{await request("/asset-folders/"+folder.id,{method:"PUT",body:{...updates,version:folder.version}});
    await load();setMessage("Folder updated.");return true;}catch(e){setError(errText(e));return false;}finally{setBusy(false);}
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
 async function uploadOne(file:File,index:number,total:number){
   if(!accepted.includes(file.type))throw new Error("Unsupported file format: "+file.name);
   if(!file.size)throw new Error("Empty file: "+file.name);
   setUploadProgress("Authorizing "+index+" of "+total+": "+file.name);
   const intent=await request<Intent>("/assets/upload-intent",{method:"POST",body:{
    filename:file.name,contentType:file.type,bytes:file.size,clientId:clientId||null}});
   if(new Date(intent.expiresAt).getTime()<=Date.now())throw new Error("Upload authorization expired");
   const form=new FormData();
   for(const [key,value] of Object.entries(intent.params))form.append(key,value);
   form.append("file",file,file.name);
   setUploadProgress("Uploading "+index+" of "+total+": "+file.name+" (0%)");
   const payload=await new Promise<{asset_id?:string}>((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open("POST",intent.uploadUrl);
    xhr.upload.onprogress=event=>{
     if(event.lengthComputable)setUploadProgress("Uploading "+index+" of "+total+": "+file.name+" ("+Math.round(event.loaded/event.total*100)+"%)");
    };
    xhr.onerror=()=>reject(new Error("Network error while uploading "+file.name));
    xhr.onabort=()=>reject(new Error("Upload cancelled for "+file.name));
    xhr.onload=()=>{
     if(xhr.status<200||xhr.status>=300){reject(new Error("Cloudinary rejected "+file.name+" ("+xhr.status+")"));return;}
     try{resolve(JSON.parse(xhr.responseText) as {asset_id?:string});}
     catch{reject(new Error("Invalid Cloudinary response for "+file.name));}
    };
    xhr.send(form);
   });
   if(!payload.asset_id)throw new Error("Cloudinary did not confirm "+file.name);
   setUploadProgress("Verifying "+index+" of "+total+": "+file.name);
   const saved=await request<Asset>("/assets/confirm",{method:"POST",body:{intentId:intent.intentId,assetId:payload.asset_id}});
   if(folderId)await request("/assets/"+saved.id+"/organize",{method:"POST",body:{filename:file.name,folderId,version:saved.version}});
 }
 async function upload(e:FormEvent){
   e.preventDefault();if(!files.length)return;
   setBusy(true);setError("");setMessage("");
   let uploaded=0;
   try{
    for(const file of files){await uploadOne(file,uploaded+1,files.length);uploaded++;}
    setMessage(uploaded+" file(s) uploaded and verified.");setFiles([]);setUploadDialog(false);setCursor(null);
   }catch(e){setError((uploaded?uploaded+" file(s) uploaded before failure. ":"")+errText(e));setFiles(files.slice(uploaded));}
   finally{setBusy(false);setUploadProgress("");await load();}
 }
 function queueFiles(chosen:FileList|File[]){
  const raw=Array.from(chosen),next=raw.filter(f=>accepted.includes(f.type)).slice(0,10);
  if(raw.length!==next.length)setError("Only the first 10 supported image, video or PDF files can be uploaded per batch.");
  if(!next.length){setError("Choose JPEG, PNG, WebP, MP4, MOV, WebM or PDF files.");return;}
  setFiles(next);setUploadDialog(true);setNewMenu(false);
 }
 async function moveAssets(ids:string[],destinationId:string|null){
  if(!canUpload||!ids.length)return;
  let moved=0;setError("");setBusy(true);setContext(null);
  try{
   for(const id of [...new Set(ids)]){
    const asset=items.find(a=>a.id===id);
    if(!asset||asset.status!=="ACTIVE")continue;
    await request("/assets/"+asset.id+"/organize",{method:"POST",
     body:{filename:asset.filename,folderId:destinationId,version:asset.version}});
    moved++;
   }
   setSelected(null);setSelectedIds([]);
   setMessage("Moved "+moved+" file(s) to the selected folder.");
  }catch(e){setError("Moved "+moved+" file(s) before an error: "+errText(e));}
  finally{setBusy(false);await load();}
 }
 async function moveFolderTo(folder:FolderItem,destinationId:string|null){
  if(!canUpload||folder.id===destinationId)return;
  setBusy(true);setContext(null);setError("");
  try{
   await request("/asset-folders/"+folder.id,{method:"PUT",
    body:{name:folder.name,color:folder.color,parentId:destinationId,version:folder.version}});
   setMessage("Moved folder "+folder.name+".");
  }catch(e){setError(errText(e));}
  finally{setBusy(false);await load();}
 }
 async function previewAsset(asset:Asset){
  setBusy(true);setError("");
  try{
   const response=await request<{url:string}>("/assets/"+asset.id+"/authorized-download",{method:"POST",body:{}});
   setPreview({url:response.url,type:asset.contentType,filename:asset.filename});setContext(null);
  }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function bulkArchive(){
  if(!selectedIds.length||!window.confirm("Archive "+selectedIds.length+" selected file(s)?"))return;
  setBusy(true);setError("");let done=0;
  try{for(const id of selectedIds){const asset=items.find(x=>x.id===id);if(!asset)continue;
    await request("/assets/"+id+"/archive",{method:"POST",body:{version:asset.version}});done++;}}
  catch(e){setError(errText(e));}
  finally{setBusy(false);setSelectedIds([]);if(done===selectedIds.length)setMessage(done+" file(s) archived.");await load();}
 }
 async function loadFolderCatalog(){
  try{
   const all:FolderItem[]=[],visited=new Set<string>(),queue:(string|null)[]=[null];
   let limited=false;
   while(queue.length&&visited.size<80&&all.length<1200){
    const id=queue.shift()??null,key=id??"root";
    if(visited.has(key))continue;visited.add(key);
    const response=await request<{folders:FolderItem[];limited:boolean}>("/asset-folders?parentId="+key);
    if(response.limited)limited=true;
    for(const f of response.folders){all.push(f);queue.push(f.id);}
   }
   setFolderCatalog(all);setFolderCatalogLimited(limited||queue.length>0);
  }catch(e){setError(errText(e));}
 }
 function editFolder(folder:FolderItem){
  void loadFolderCatalog();
  setFolderEdit(folder);setFolderEditName(folder.name);setFolderEditColor(folder.color);
  setFolderMove(folder.parentId??"");setContext(null);
 }
 async function saveFolderEdit(e:FormEvent){
  e.preventDefault();if(!folderEdit)return;
  const ok=await renameFolder(folderEdit,{name:folderEditName,color:folderEditColor,parentId:folderMove||null});
  if(ok)setFolderEdit(null);
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
 if(!canRead)return <div className="aw-drive-shell"><Notice kind="error">Asset access denied.</Notice></div>;
 return <div className="aw-drive-shell" data-testid="drive-explorer"
   onDragOver={e=>{if(canUpload&&e.dataTransfer.types.includes("Files")){e.preventDefault();setDropActive(true);}}}
   onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDropActive(false);}}
   onDrop={e=>{e.preventDefault();setDropActive(false);if(canUpload)queueFiles(e.dataTransfer.files);}}>
  <div className="aw-drive-heading"><div><p className="aw-eyebrow">PROTECTED STORAGE</p><h1>My Drive</h1>
   <p>Organize, find and securely share your permitted agency assets.</p></div>
   <div className="aw-drive-heading-actions">
    {canUpload&&<div className="aw-drive-new-wrap">
     <button className="aw-drive-new-button" type="button" aria-expanded={newMenu} aria-label="New" onClick={()=>setNewMenu(v=>!v)}><Plus size={19}/> New</button>
     {newMenu&&<div className="aw-drive-new-menu" role="menu">
      <button role="menuitem" type="button" onClick={()=>{setFolderDialog(true);setNewMenu(false);}}><FolderPlus size={16}/> New folder</button>
      <button role="menuitem" type="button" onClick={()=>{setUploadDialog(true);setNewMenu(false);}}><Upload size={16}/> Upload files</button>
     </div>}</div>}
    <button type="button" className="aw-drive-icon-button" aria-label="Refresh Drive" onClick={()=>void load()} disabled={loading}><RefreshCw size={18} className={loading?"animate-spin":""}/></button>
   </div></div>
  {error&&<Notice kind="error">{error}</Notice>}
  {message&&<Notice kind="success">{message}</Notice>}
  <div className="aw-drive-toolbar">
   <div className="aw-drive-search"><Search size={17}/><input aria-label="Search assets" value={search} placeholder="Search this folder…" onChange={e=>{setSearch(e.target.value);setCursor(null);setSelectedIds([]);}}/></div>
   <select aria-label="Asset status" className="aw-drive-select" value={filter} onChange={e=>{setFilter(e.target.value as "ACTIVE"|"ARCHIVED");setCursor(null);setSelectedIds([]);}}><option value="ACTIVE">Active files</option><option value="ARCHIVED">Archived files</option></select>
   {canClients&&<select aria-label="Filter assets by client" className="aw-drive-select" value={filterClient} onChange={e=>{setFilterClient(e.target.value);setCursor(null);setSelectedIds([]);}}><option value="">All clients</option>{clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}</select>}
   <select className="aw-drive-select" aria-label="Sort assets" value={sort} onChange={e=>{setSort(e.target.value as typeof sort);setCursor(null);setSelectedIds([]);}}><option value="name">Name</option><option value="date">Date</option><option value="type">Type</option><option value="size">Size</option></select>
   <button type="button" className="aw-drive-icon-button" aria-label="Reverse sort" title="Reverse sort" onClick={()=>{setReverse(x=>!x);setCursor(null);setSelectedIds([]);}}><ArrowUpDown size={17}/></button>
   <div className="aw-drive-view-switch"><button type="button" aria-label="Grid view" aria-pressed={view==="grid"} onClick={()=>setView("grid")}><Grid2X2 size={18}/></button><button type="button" aria-label="List view" aria-pressed={view==="list"} onClick={()=>setView("list")}><List size={18}/></button></div>
  </div>
  <p className="aw-drive-storage-label">{items.length} files loaded · {prettyBytes(items.reduce((total,f)=>total+f.bytes,0))} on this page. Protected, permission-scoped files. {legacySort?"Sorting is limited to this page until the API updates.":""}</p>
  <nav className="aw-drive-path" aria-label="Folder path">
   {trail.length>0&&<button type="button" aria-label="Go back" onClick={()=>goTo(trail.length-1)}><ArrowLeft size={17}/></button>}
   <button type="button" onClick={()=>goTo(0)}><Home size={17}/> My Drive</button>
   {trail.map((f,i)=><span key={f.id} className="aw-drive-crumb"><ChevronRight size={14}/><button type="button" onClick={()=>goTo(i+1)}>{f.name}</button></span>)}
  </nav>
  {selected&&!detailsOpen&&<div className="aw-drive-selection"><span>Selected: <strong>{selected.filename}</strong></span><button type="button" onClick={()=>{setDetailsOpen(true);void loadFolderCatalog();}}><Eye size={15}/> View details</button><button type="button" onClick={()=>void previewAsset(selected)}><FileImage size={15}/> Preview</button></div>}
  {selectedIds.length>0&&<div className="aw-drive-selection"><strong>{selectedIds.length} selected</strong><button type="button" onClick={()=>setSelectedIds([])}>Clear selection</button>{canArchive&&<button type="button" disabled={busy} onClick={()=>void bulkArchive()}><Archive size={15}/> Archive selected</button>}</div>}
  {loading?<div className="aw-drive-loading"><Spinner label="Loading Drive…"/></div>:<>
   {visibleFolders.length>0&&<section aria-label="Folders" className="aw-drive-section"><h2>Folders <span>{visibleFolders.length}</span></h2>
     <div className="aw-drive-tile-grid">{visibleFolders.map(folder=><div key={folder.id} className="aw-drive-folder-tile" draggable={canUpload}
       onDragStart={e=>{if(!canUpload)return;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("application/x-aw-folder",folder.id);}}
       onDragOver={e=>{if(e.dataTransfer.types.includes("application/x-aw-asset")||e.dataTransfer.types.includes("application/x-aw-folder")){e.preventDefault();e.dataTransfer.dropEffect="move";}}}
       onDrop={e=>{
        const ids=e.dataTransfer.getData("application/x-aw-asset");
        const source=e.dataTransfer.getData("application/x-aw-folder");
        if(!ids&&!source)return;
        e.preventDefault();e.stopPropagation();
        if(ids){try{void moveAssets(JSON.parse(ids) as string[],folder.id);}catch{setError("Invalid file selection");}}
        else if(source){const target=folders.find(f=>f.id===source);if(target)void moveFolderTo(target,folder.id);}
       }}
       onContextMenu={e=>{e.preventDefault();setContext("folder:"+folder.id);}}>
       <button type="button" className="aw-drive-folder-primary" onClick={()=>enter(folder)} aria-label={"Open folder "+folder.name}>
        <Folder size={23} fill={folder.color} color={folder.color} strokeWidth={1.6}/><strong>{folder.name}</strong>
       </button>
       <button type="button" className="aw-drive-menu-trigger" aria-label={"More actions for folder "+folder.name} onClick={()=>setContext(v=>v==="folder:"+folder.id?null:"folder:"+folder.id)}><MoreVertical size={17}/></button>
       {context==="folder:"+folder.id&&<div className="aw-drive-item-menu">
        <button type="button" onClick={()=>{enter(folder);setContext(null);}}>Open</button>
        <button type="button" aria-label={"Download "+folder.name+" as ZIP"} onClick={()=>{void downloadFolder(folder);setContext(null);}}>Download ZIP</button>
        {canUpload&&<button type="button" aria-label={"Rename "+folder.name} onClick={()=>editFolder(folder)}>Rename, color or move</button>}
        {canArchive&&<button type="button" aria-label={"Delete empty folder "+folder.name} onClick={()=>{void deleteFolder(folder);setContext(null);}}>Delete empty folder</button>}
       </div>}
      </div>)}</div>
   </section>}
   <section className="aw-drive-section" aria-label="Files in current directory"><h2>Files <span>{items.length}{nextCursor?"+":""}</span></h2>
    {!items.length?<div className="aw-drive-empty"><File size={28}/><strong>{folders.length||search?"No matching files":"This folder is empty"}</strong><p>Files uploaded here will appear in this list.</p></div>:
    <div className={"aw-drive-items aw-drive-"+view} role="list">{displayed.map(asset=><div key={asset.id} className={"aw-drive-file"+(selected?.id===asset.id?" is-selected":"")} role="listitem"
       draggable={canUpload&&asset.status==="ACTIVE"}
       onDragStart={e=>{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("application/x-aw-asset",JSON.stringify(selectedIds.includes(asset.id)?selectedIds:[asset.id]));}}
       onContextMenu={e=>{e.preventDefault();open(asset);setContext("file:"+asset.id);}}>
      <label className="aw-drive-check"><input type="checkbox" aria-label={"Select "+asset.filename} checked={selectedIds.includes(asset.id)}
       onChange={e=>setSelectedIds(v=>e.target.checked?[...v,asset.id]:v.filter(id=>id!==asset.id))}/></label>
      <button type="button" className="aw-drive-file-primary" onClick={()=>open(asset)} onDoubleClick={()=>void previewAsset(asset)}>
       <span className="aw-drive-file-icon">{asset.contentType.startsWith("image/")?<FileImage size={24}/>:asset.contentType.startsWith("video/")?<FileVideo size={24}/>:asset.contentType==="application/pdf"?<FileText size={24}/>:<File size={24}/>}</span>
       <span className="aw-drive-file-name"><strong>{asset.filename}</strong><small>{prettyBytes(asset.bytes)} · {new Date(asset.createdAt).toLocaleDateString()}</small></span>
      </button>
      <span className="aw-drive-file-type">{asset.contentType}</span>
      <button type="button" className="aw-drive-menu-trigger" aria-label={"More actions for "+asset.filename} onClick={()=>{open(asset);setContext(v=>v==="file:"+asset.id?null:"file:"+asset.id);}}><MoreVertical size={17}/></button>
      {context==="file:"+asset.id&&<div className="aw-drive-item-menu">
       <button type="button" onClick={()=>void previewAsset(asset)}>Preview</button>
       <button type="button" onClick={()=>{open(asset);setDetailsOpen(true);setContext(null);void loadFolderCatalog();}}>Details, rename or move</button>
       <button type="button" onClick={()=>{open(asset);setContext(null);void request<{url:string}>("/assets/"+asset.id+"/authorized-download",{method:"POST",body:{}}).then(d=>{const a=document.createElement("a");a.href=d.url;a.target="_blank";a.rel="noopener noreferrer";a.click();}).catch(e=>setError(errText(e)));}}>Download</button>
       {canArchive&&asset.status==="ACTIVE"&&<button type="button" onClick={()=>{open(asset);setDetailsOpen(true);setContext(null);}}>Archive…</button>}
      </div>}
     </div>)}</div>}
    <div className="aw-drive-pager"><button type="button" disabled={!cursor||loading} onClick={()=>{setCursor(null);setSelectedIds([]);setSelected(null);}}>First page</button><span>{items.length} loaded</span><button type="button" disabled={!nextCursor||loading} onClick={()=>{setCursor(nextCursor);setSelectedIds([]);setSelected(null);}}>Next page</button></div>
   </section>
  </>}
  {dropActive&&<div className="aw-drive-drop-mask"><Upload size={38}/><strong>Drop files to upload</strong></div>}
  {folderDialog&&<div className="aw-drive-modal-shade" role="dialog" aria-modal="true" aria-label="Create folder"><div className="aw-drive-modal">
   <div className="aw-drive-modal-head"><h2>New folder</h2><button type="button" aria-label="Close folder dialog" onClick={()=>setFolderDialog(false)}><X size={18}/></button></div>
   <form className="aw-drive-modal-form" onSubmit={e=>void addFolder(e)}>
    <FormField id="new-drive-folder-name" label="Folder name"><input id="new-drive-folder-name" className="field" aria-label="New folder name" value={newFolderName} maxLength={120} required onChange={e=>setNewFolderName(e.target.value)}/></FormField>
    <FormField id="new-drive-folder-color" label="Folder color"><input id="new-drive-folder-color" type="color" aria-label="New folder color" value={newFolderColor} onChange={e=>setNewFolderColor(e.target.value)}/></FormField>
    <div className="aw-drive-modal-actions"><button type="button" onClick={()=>setFolderDialog(false)}>Cancel</button><button className="btn-primary" type="submit" disabled={busy}>Create folder</button></div>
   </form></div></div>}
  {folderEdit&&<div className="aw-drive-modal-shade" role="dialog" aria-modal="true" aria-label="Edit folder"><div className="aw-drive-modal">
   <div className="aw-drive-modal-head"><h2>Edit folder</h2><button type="button" aria-label="Close folder editor" onClick={()=>setFolderEdit(null)}><X size={18}/></button></div>
   <form className="aw-drive-modal-form" onSubmit={e=>void saveFolderEdit(e)}>
    <FormField id="edit-folder-name" label="Folder name"><input id="edit-folder-name" className="field" aria-label="Rename folder" value={folderEditName} maxLength={120} required onChange={e=>setFolderEditName(e.target.value)}/></FormField>
    <FormField id="edit-folder-color" label="Color"><input id="edit-folder-color" type="color" aria-label="Change folder color" value={folderEditColor} onChange={e=>setFolderEditColor(e.target.value)}/></FormField>
    <FormField id="move-folder-to" label="Move folder"><select id="move-folder-to" className="field" value={folderMove} onChange={e=>setFolderMove(e.target.value)}>
     <option value="">My Drive (root)</option>{folderCatalog.filter(f=>f.id!==folderEdit.id).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
    </select></FormField>
    {folderCatalogLimited&&<p className="aw-drive-muted">Some deeply nested folders are not in this list.</p>}
    <div className="aw-drive-modal-actions"><button type="button" onClick={()=>setFolderEdit(null)}>Cancel</button><button type="submit" className="btn-primary" disabled={busy}>Save folder</button></div>
   </form></div></div>}
  {uploadDialog&&<div className="aw-drive-modal-shade" role="dialog" aria-modal="true" aria-label="Upload files"><div className="aw-drive-modal">
   <div className="aw-drive-modal-head"><h2>Upload files</h2><button type="button" aria-label="Close upload" disabled={busy} onClick={()=>setUploadDialog(false)}><X size={18}/></button></div>
   <form className="aw-drive-modal-form" onSubmit={e=>void upload(e)}>
    <FormField id="asset-file" label="Choose image, video or PDF files"><input ref={fileInput} id="asset-file" className="field" type="file" accept={accepted.join(",")} multiple
      onChange={e=>setFiles(Array.from(e.target.files??[]).slice(0,10))}/></FormField>
    {canClients&&<FormField id="asset-client" label="Associate with client (optional)"><select className="field" id="asset-client" value={clientId} onChange={e=>setClientId(e.target.value)}><option value="">General agency asset</option>{clients.map(c=><option value={c.id} key={c.id}>{c.businessName}</option>)}</select></FormField>}
    <p>{files.length} file(s) queued. Maximum 10 per batch.</p>
    {uploadProgress&&<p role="status">{uploadProgress}</p>}
    <div className="aw-drive-modal-actions"><button type="button" disabled={busy} onClick={()=>setUploadDialog(false)}>Cancel</button><button className="btn-primary" type="submit" disabled={busy||!files.length}><Upload size={16}/> Upload and verify</button></div>
   </form></div></div>}
  {selected&&detailsOpen&&<div className="aw-drive-drawer-mask" role="dialog" aria-modal="true" aria-label="Asset details">
   <div className="aw-drive-drawer">
    <div className="aw-drive-modal-head"><h2>Asset details</h2><button type="button" aria-label="Close asset details" onClick={()=>setDetailsOpen(false)}><X size={19}/></button></div>
    <h3>{selected.filename}</h3><p className="aw-drive-muted">{selected.contentType} · {prettyBytes(selected.bytes)} · {selected.uploader?.displayName||"Agency file"}</p>
    <p className="aw-drive-muted">Uploaded {new Date(selected.createdAt).toLocaleString()} · {selected.status}</p>
    {selected.status==="ACTIVE"&&canUpload&&<form className="aw-drive-modal-form" onSubmit={async e=>{await organizeFile(e);}}>
     <FormField id="asset-rename" label="Filename"><input className="field" id="asset-rename" value={editedName} onChange={e=>setEditedName(e.target.value)} required maxLength={180}/></FormField>
     <FormField id="asset-folder-destination" label="Move to folder"><select className="field" id="asset-folder-destination" value={destination} onChange={e=>setDestination(e.target.value)}>
      <option value="">My Drive / root</option>{folderCatalog.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
     </select></FormField>
     {folderCatalogLimited&&<p className="aw-drive-muted">Additional destinations exist; open their parent folder to move files there.</p>}
     <button type="submit" disabled={busy} className="btn-primary"><Pencil size={15}/> Save file changes</button>
    </form>}
    {selected.status==="ACTIVE"&&<div className="aw-drive-detail-actions"><button type="button" className="btn-secondary" onClick={()=>void previewAsset(selected)}><Eye size={15}/> Preview</button><button type="button" className="btn-secondary" disabled={busy} onClick={()=>void download()}><Download size={15}/> Protected download</button></div>}
    {selected.status==="ACTIVE"&&canUpload&&canClients&&<form onSubmit={link} className="aw-drive-modal-form">
      <FormField id="asset-link" label="Link to client"><select id="asset-link" className="field" value={linkClient} onChange={e=>setLinkClient(e.target.value)}><option value="">General agency file</option>{clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}</select></FormField>
      <button type="submit" className="btn-secondary" disabled={busy}>Save client link</button></form>}
    {selected.status==="ACTIVE"&&canArchive&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>{if(window.confirm("Archive "+selected.filename+"?")){void archive();setDetailsOpen(false);}}}><Archive size={16}/> Archive asset</button>}
   </div></div>}
  {preview&&<div className="aw-drive-preview-shade" role="dialog" aria-modal="true" aria-label="File preview">
    <div className="aw-drive-preview-head"><strong>{preview.filename}</strong><button type="button" aria-label="Close preview" onClick={()=>setPreview(null)}><X size={20}/></button></div>
    {preview.type.startsWith("image/")?<img src={preview.url} alt={preview.filename} className="aw-drive-preview-media"/>:
     preview.type.startsWith("video/")?<video className="aw-drive-preview-media" controls src={preview.url}/>:
     preview.type==="application/pdf"?<iframe title={preview.filename} src={preview.url} className="aw-drive-preview-pdf"/>:<p>Preview unavailable for this type.</p>}
    <a href={preview.url} target="_blank" rel="noopener noreferrer">Open authorized file</a>
   </div>}
 </div>;
}
