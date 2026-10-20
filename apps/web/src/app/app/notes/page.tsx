"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { BookOpen, Check, Cloud, CloudOff, Eraser, FilePlus2, NotebookPen, PenLine, RefreshCw, Maximize2, Minimize2, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { AWButton, AWNotice, AWPageHeader } from "@/components/aw-ui";

type Stroke={color:string;width:number;points:[number,number][]};
type Note={id:string;title:string;body:string;strokes:string;version:number;updatedAt:string};
type NoteSummary=Pick<Note,"id"|"title"|"version"|"updatedAt">;
type Draft={title:string;body:string;strokes:string};
const blank:Draft={title:"Untitled",body:"",strokes:"[]"};
const W=900,H=520;
const parseStrokes=(s:string):Stroke[]=>{try{const x=JSON.parse(s);return Array.isArray(x)?x:[];}catch{return[];}};
const explanation=(e:unknown)=>e instanceof ApiError?e.message:"Unable to save notes. Check the connection.";
function MarkdownPreview({value}:{value:string}){
 const lines=value.split("\n");
 return <div className="aw-notes-preview" aria-label="Text preview">
  {lines.map((line,i)=>{
   const level=line.startsWith("### ")?3:line.startsWith("## ")?2:line.startsWith("# ")?1:0;
   const raw=level?line.slice(level+1):line;
   const parts=raw.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((chunk,k)=>{
    if(chunk.startsWith("**")&&chunk.endsWith("**"))return <strong key={k}>{chunk.slice(2,-2)}</strong>;
    if(chunk.startsWith("*")&&chunk.endsWith("*"))return <em key={k}>{chunk.slice(1,-1)}</em>;
    return <span key={k}>{chunk}</span>;
   });
   if(level===1)return <h2 key={i}>{parts}</h2>;
   if(level===2||level===3)return <h3 key={i}>{parts}</h3>;
   if(line.startsWith("- "))return <p key={i} className="aw-notes-bullet">• {parts}</p>;
   return <p key={i}>{parts.length?parts:"\u00a0"}</p>;
  })}
 </div>;
}
function draw(ctx:CanvasRenderingContext2D,strokes:Stroke[]){
 ctx.clearRect(0,0,W,H);
 for(const stroke of strokes){
  if(!stroke.points.length)continue;
  ctx.beginPath();ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;
  ctx.lineWidth=stroke.width;ctx.lineJoin="round";ctx.lineCap="round";
  const first=stroke.points[0];ctx.moveTo(first[0]*W,first[1]*H);
  for(const p of stroke.points.slice(1))ctx.lineTo(p[0]*W,p[1]*H);
  if(stroke.points.length===1){ctx.arc(first[0]*W,first[1]*H,stroke.width/2,0,Math.PI*2);ctx.fill();}
  else ctx.stroke();
 }
}
export default function NotesPage(){
 const {session,request}=useAuth();
 const [list,setList]=useState<NoteSummary[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [draft,setDraft]=useState<Draft>(blank);
 const draftRef=useRef<Draft>(blank),versionRef=useRef(1);
 const [loadState,setLoadState]=useState<"loading"|"ready">("loading");
 const [saveState,setSaveState]=useState<"saved"|"unsaved"|"saving"|"conflict">("saved");
 const [error,setError]=useState("");
 const [preview,setPreview]=useState(false);
 const [pen,setPen]=useState("#D18CFF"),[width,setWidth]=useState(3);
 const [drawing,setDrawing]=useState<Stroke|null>(null);
 const [expanded,setExpanded]=useState(false),[eraser,setEraser]=useState(false);
 const redoStack=useRef<Stroke[]>([]);
 const drawingRef=useRef<Stroke|null>(null),canvasRef=useRef<HTMLCanvasElement>(null);
 const inFlight=useRef(false), dirty=useRef(false), selectedRef=useRef<string|null>(null);
 const [actionBusy,setActionBusy]=useState(false);
 const setEdited=useCallback((next:Draft)=>{
  draftRef.current=next;setDraft(next);dirty.current=true;setSaveState("unsaved");
 },[]);
 const listNotes=useCallback(async()=>{
  const result=await request<{items:NoteSummary[];limited:boolean}>("/notes");
  setList(result.items);
 },[request]);
 const flush=useCallback(async():Promise<boolean>=>{
  const id=selectedRef.current;
  if(!id||!dirty.current)return true;
  if(inFlight.current)return false;
  inFlight.current=true;setSaveState("saving");setError("");
  const snapshot=draftRef.current;
  try{
   const saved=await request<Note>("/notes/"+id,{method:"PUT",body:{...snapshot,version:versionRef.current}});
   if(selectedRef.current===id){
    versionRef.current=saved.version;
    dirty.current=snapshot!==draftRef.current;
    setSaveState(dirty.current?"unsaved":"saved");
    setList(prev=>prev.map(n=>n.id===id?{id:saved.id,title:saved.title,updatedAt:saved.updatedAt,version:saved.version}:n));
   }
   return true;
  }catch(e){
   setSaveState("conflict");setError(explanation(e));return false;
  }finally{inFlight.current=false;}
 },[request]);
 const open=useCallback(async(id:string,force=false)=>{
  if(selectedRef.current===id&&!force)return;
  if(inFlight.current)return;
  if(dirty.current&&!await flush())return;
  setActionBusy(true);setError("");
  try{
   const note=await request<Note>("/notes/"+id);
   selectedRef.current=id;setSelected(id);versionRef.current=note.version;
   redoStack.current=[];
   const next={title:note.title,body:note.body,strokes:note.strokes};
   dirty.current=false;draftRef.current=next;setDraft(next);setSaveState("saved");
   setDrawing(null);drawingRef.current=null;
  }catch(e){setError(explanation(e));}finally{setActionBusy(false);}
 },[request,flush]);
 const initialized=useRef(false);
 useEffect(()=>{
  if(!session||initialized.current)return;
  initialized.current=true;
  void request<{items:NoteSummary[];limited:boolean}>("/notes")
   .then(result=>{setList(result.items);if(result.items[0])void open(result.items[0].id);})
   .catch(e=>setError(explanation(e))).finally(()=>setLoadState("ready"));
 },[session,request,open]);
 useEffect(()=>{
  if(!dirty.current||!selected||saveState==="conflict")return;
  const timer=window.setTimeout(()=>{void flush();},900);
  return ()=>window.clearTimeout(timer);
 },[draft,selected,saveState,flush]);
 useEffect(()=>{
  const el=canvasRef.current,ctx=el?.getContext("2d");
  if(ctx)draw(ctx,[...parseStrokes(draft.strokes),...(drawing?[drawing]:[])]);
 },[draft.strokes,drawing]);
 const create=async()=>{
  if(inFlight.current)return;
  if(dirty.current&&!await flush())return;
  setActionBusy(true);setError("");
  try{
   const note=await request<Note>("/notes",{method:"POST",body:blank});
   await listNotes();
   selectedRef.current=note.id;setSelected(note.id);versionRef.current=note.version;
   draftRef.current=blank;setDraft(blank);dirty.current=false;setSaveState("saved");setPreview(false);redoStack.current=[];
  }catch(e){setError(explanation(e));}finally{setActionBusy(false);}
 };
 const saveConflictCopy=async()=>{
  if(inFlight.current||actionBusy)return;
  setActionBusy(true);setError("");
  try{
   const note=await request<Note>("/notes",{method:"POST",body:{...draftRef.current,
     title:draftRef.current.title.slice(0,167)+" (recovered)"}});
   await listNotes();selectedRef.current=note.id;setSelected(note.id);versionRef.current=note.version;
   const next={title:note.title,body:note.body,strokes:note.strokes};
   draftRef.current=next;setDraft(next);dirty.current=false;setSaveState("saved");
  }catch(e){setError(explanation(e));}finally{setActionBusy(false);}
 };
 const remove=async()=>{
  if(!selected||!window.confirm("Permanently delete this note?"))return;
  if(inFlight.current)return;
  setActionBusy(true);setError("");
  try{
   await request("/notes/"+selected+"?version="+versionRef.current,{method:"DELETE"});
   selectedRef.current=null;setSelected(null);dirty.current=false;draftRef.current=blank;setDraft(blank);
   const data=await request<{items:NoteSummary[]}>("/notes");setList(data.items);
   if(data.items.length)await open(data.items[0].id);
  }catch(e){setError(explanation(e));}finally{setActionBusy(false);}
 };
 const mark=(e:PointerEvent<HTMLCanvasElement>)=>{
  const rect=e.currentTarget.getBoundingClientRect();
  return [Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),
   Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))] as [number,number];
 };
 const eraseAt=(point:[number,number])=>{
  const strokes=parseStrokes(draftRef.current.strokes);
  const radius=Math.max(.016,width/W*3);
  for(let i=strokes.length-1;i>=0;i--){
   if(strokes[i].points.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<radius)){
    redoStack.current=[];strokes.splice(i,1);
    setEdited({...draftRef.current,strokes:JSON.stringify(strokes)});break;
   }
  }
 };
 const down=(e:PointerEvent<HTMLCanvasElement>)=>{
  if(!selected||actionBusy||e.button!==0)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  if(eraser){eraseAt(mark(e));return;}
  const s:Stroke={color:pen,width,points:[mark(e)]};
  drawingRef.current=s;setDrawing(s);
 };
 const move=(e:PointerEvent<HTMLCanvasElement>)=>{
  if(eraser){if(e.buttons||e.pressure>0)eraseAt(mark(e));return;}
  const stroke=drawingRef.current;
  if(!stroke)return;
  const next={...stroke,points:[...stroke.points,mark(e)]};
  drawingRef.current=next;setDrawing(next);
 };
 const up=()=>{
  const s=drawingRef.current;if(!s)return;
  drawingRef.current=null;setDrawing(null);
  const all=[...parseStrokes(draftRef.current.strokes),s];
  redoStack.current=[];
  setEdited({...draftRef.current,strokes:JSON.stringify(all)});
 };
 const undo=()=>{
  const all=parseStrokes(draftRef.current.strokes),last=all.pop();
  if(!last)return;redoStack.current.push(last);
  setEdited({...draftRef.current,strokes:JSON.stringify(all)});
 };
 const redo=()=>{
  const last=redoStack.current.pop();if(!last)return;
  setEdited({...draftRef.current,strokes:JSON.stringify([...parseStrokes(draftRef.current.strokes),last])});
 };
 useEffect(()=>{
  if(!expanded)return;
  const before=document.body.style.overflow;document.body.style.overflow="hidden";
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setExpanded(false);};
  window.addEventListener("keydown",onKey);
  return()=>{document.body.style.overflow=before;window.removeEventListener("keydown",onKey);};
 },[expanded]);
 const insert=(text:string)=>{
  const el=document.getElementById("aw-note-body") as HTMLTextAreaElement|null;
  if(!el)return;
  const start=el.selectionStart,end=el.selectionEnd;
  const old=draftRef.current.body;
  setEdited({...draftRef.current,body:old.slice(0,start)+text+old.slice(end)});
  window.requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+text.length,start+text.length);});
 };
 return <div className="aw-notes-root">
  <AWPageHeader eyebrow="Personal workspace" title="My notes"
   description="Private, server-saved typed and handwritten notes. Changes use revision checks to prevent silent overwrites."
   action={<AWButton onClick={()=>void create()} disabled={actionBusy}><FilePlus2 size={17}/> New note</AWButton>}/>
  {error&&<AWNotice tone="error">{error} {saveState==="conflict"&&"Your unsaved content remains on this screen."}</AWNotice>}
  <div className="aw-notes-layout">
   <aside aria-label="Your notes" className="aw-notes-list">
    <div className="aw-notes-side-heading"><BookOpen size={18}/> Saved notes <span>{list.length}</span></div>
    {loadState==="loading"&&<p role="status" className="aw-notes-muted">Loading notes…</p>}
    {!list.length&&loadState==="ready"&&<p className="aw-notes-muted">No saved notes. Create one to begin.</p>}
    {list.map(n=><button key={n.id} type="button" disabled={actionBusy||inFlight.current}
      aria-current={selected===n.id?"page":undefined}
      onClick={()=>void open(n.id)} className={"aw-notes-list-item"+(selected===n.id?" active":"")}>
      <strong>{n.title}</strong><span>{new Date(n.updatedAt).toLocaleString()}</span>
     </button>)}
   </aside>
   <div className={"aw-notes-editor"+(expanded?" aw-notes-editor-expanded":"")}>
    {!selected?<div className="aw-notes-empty"><NotebookPen size={32}/><p>Choose a saved note or create a new one.</p></div>:
    <>
     <div className="aw-notes-toolbar">
      <span className="aw-notes-save-status" role="status">
       {saveState==="saved"?<Check size={16}/>:saveState==="conflict"?<CloudOff size={16}/>:<Cloud size={16}/>}
       {saveState==="saved"?"All changes saved":saveState==="saving"?"Saving…":saveState==="conflict"?"Save conflict":"Unsaved changes"}
      </span>
      <div className="aw-notes-actions">
       <button type="button" className="aw-notes-expand" aria-label={expanded?"Exit full screen":"Expand canvas"} onClick={()=>setExpanded(v=>!v)}>
        {expanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>} {expanded?"Exit full screen":"Expand canvas"}
       </button>
       {expanded&&<button type="button" onClick={()=>{setExpanded(false);void create();}} disabled={actionBusy}><FilePlus2 size={16}/> New note</button>}
       {expanded&&<button type="button" onClick={()=>setExpanded(false)}><BookOpen size={16}/> Notes list</button>}
       {saveState==="conflict"&&<button type="button" onClick={()=>void saveConflictCopy()} disabled={actionBusy}>Save recovered copy</button>}
       <button type="button" onClick={()=>void flush()} disabled={saveState==="saved"||saveState==="saving"||saveState==="conflict"}><Save size={16}/> Save</button>
       <button type="button" onClick={()=>void open(selected,true)} disabled={saveState!=="saved"} aria-label="Reload note"><RefreshCw size={16}/></button>
       <button type="button" className="danger" onClick={()=>void remove()} disabled={actionBusy||saveState==="saving"}><Trash2 size={16}/> Delete</button>
      </div>
     </div>
     <label className="aw-notes-field-label" htmlFor="aw-note-title">Title</label>
     <input id="aw-note-title" aria-label="Note title" maxLength={180} value={draft.title}
       onChange={e=>setEdited({...draftRef.current,title:e.target.value})}
       className="aw-notes-title" placeholder="Untitled note"/>
     <div className="aw-notes-draw-head">
      <div><h2><PenLine size={18}/> Handwriting canvas</h2><p>Use a mouse, finger or stylus. The drawing is saved together with the text.</p></div>
      <div className="aw-notes-pen">
       <label htmlFor="aw-pen-color">Ink</label><input id="aw-pen-color" type="color" value={pen} onChange={e=>setPen(e.target.value)}/>
       <label htmlFor="aw-pen-width">Size</label><input id="aw-pen-width" type="range" min={1} max={14} value={width} onChange={e=>setWidth(Number(e.target.value))}/>
       <button type="button" aria-pressed={!eraser} onClick={()=>setEraser(false)}><PenLine size={16}/> Pen</button>
       <button type="button" aria-pressed={eraser} onClick={()=>setEraser(true)}><Eraser size={16}/> Eraser</button>
       <button type="button" onClick={undo} disabled={!parseStrokes(draft.strokes).length}><Undo2 size={16}/> Undo</button>
       <button type="button" onClick={redo} disabled={!redoStack.current.length}><Redo2 size={16}/> Redo</button>
       <button type="button" onClick={()=>{redoStack.current=[];setEdited({...draftRef.current,strokes:"[]"});}} disabled={!parseStrokes(draft.strokes).length}>
        <Eraser size={16}/> Clear
       </button>
      </div>
     </div>
     <canvas ref={canvasRef} className="aw-notes-canvas" width={W} height={H}
       role="img" aria-label="Handwriting canvas. Draw with mouse, touch or stylus."
       onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/>
     {!expanded&&<details className="aw-notes-typed"><summary><BookOpen size={16}/> Typed notes (optional)</summary>
     <div className="aw-notes-tabs" role="group" aria-label="Text and preview">
      <button type="button" aria-pressed={!preview} onClick={()=>setPreview(false)}>Write</button>
      <button type="button" aria-pressed={preview} onClick={()=>setPreview(true)}>Preview</button>
      <button type="button" onClick={()=>insert("**bold text**")} disabled={preview}>Bold</button>
      <button type="button" onClick={()=>insert("*italic text*")} disabled={preview}>Italic</button>
      <button type="button" onClick={()=>insert("## Heading\n")} disabled={preview}>Heading</button>
     </div>
     {preview?<MarkdownPreview value={draft.body}/>:
       <textarea id="aw-note-body" aria-label="Typed notes" className="aw-notes-textarea" rows={11}
        value={draft.body} onChange={e=>setEdited({...draftRef.current,body:e.target.value})}
        placeholder="Write notes here. **Bold**, *italic*, and # headings are supported."/>}
     </details>}
    </>}
   </div>
  </div>
 </div>;
}
