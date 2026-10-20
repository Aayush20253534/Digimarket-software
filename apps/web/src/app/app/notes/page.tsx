"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { BookOpen, Check, Cloud, CloudOff, Eraser, FilePlus2, NotebookPen, PenLine, RefreshCw, Maximize2, Minimize2, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { AWButton, AWNotice, AWPageHeader } from "@/components/aw-ui";

type Tool="pen"|"pencil"|"highlighter"|"marker"|"eraser";
type Point=[number,number,number?];
type Stroke={color:string;width:number;points:Point[];tool?:Exclude<Tool,"eraser">};
function partialErase(stroke:Stroke,point:Point,radius:number):Stroke[]{
 const old=stroke.points;if(!old.length)return[];
 const cx=point[0]*W,cy=point[1]*H;
 const touches=(a:Point,b:Point)=>{
  const ax=a[0]*W,ay=a[1]*H,bx=b[0]*W,by=b[1]*H,dx=bx-ax,dy=by-ay;
  const scale=dx*dx+dy*dy,t=scale?Math.max(0,Math.min(1,((cx-ax)*dx+(cy-ay)*dy)/scale)):0;
  return Math.hypot(ax+t*dx-cx,ay+t*dy-cy)<=radius+stroke.width/2;
 };
 if(!old.some((p,i)=>touches(p,old[Math.max(0,i-1)])))return[stroke];
 const parts:Point[][]=[];let current:Point[]=[];
 const push=()=>{if(current.length)parts.push(current);current=[];};
 if(old.length===1)return touches(old[0],old[0])?[]:[stroke];
 for(let i=1;i<old.length;i++){
  const a=old[i-1],b=old[i],n=Math.max(1,Math.ceil(Math.hypot((b[0]-a[0])*W,(b[1]-a[1])*H)/2));
  for(let j=i===1?0:1;j<=n;j++){
   const t=j/n,p:Point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]===undefined?undefined:(a[2]??.5)+((b[2]??.5)-(a[2]??.5))*t];
   if(Math.hypot(p[0]*W-cx,p[1]*H-cy)<=radius+stroke.width/2)push();else current.push(p);
  }
 }
 push();return parts.map(points=>({...stroke,points}));
}
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
  ctx.save();ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;
  ctx.globalAlpha=stroke.tool==="highlighter"?.28:stroke.tool==="pencil"?.66:stroke.tool==="marker"?.88:1;
  ctx.lineJoin="round";ctx.lineCap="round";
  if(stroke.tool==="pencil")ctx.setLineDash([1,1.8]);
  const pts=stroke.points;
  if(pts.length===1){ctx.beginPath();ctx.arc(pts[0][0]*W,pts[0][1]*H,stroke.width/2,0,Math.PI*2);ctx.fill();}
  else for(let i=1;i<pts.length;i++){
   ctx.beginPath();ctx.moveTo(pts[i-1][0]*W,pts[i-1][1]*H);ctx.lineTo(pts[i][0]*W,pts[i][1]*H);
   ctx.lineWidth=stroke.width*(stroke.tool==="highlighter"||stroke.tool==="marker"?1:(.7+Math.max(.1,pts[i][2]??.5)*.6));
   ctx.stroke();
  }
  ctx.restore();
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
 const [pen,setPen]=useState("#D18CFF"),[width,setWidth]=useState(3),[eraserSize,setEraserSize]=useState(16);
 const [tool,setTool]=useState<Tool>("pen");
 const [drawing,setDrawing]=useState<Stroke|null>(null);
 const [expanded,setExpanded]=useState(false);
 const redoStack=useRef<string[]>([]),history=useRef<string[]>([]);
 const eraserWork=useRef<Stroke[]|null>(null);
 const [erasing,setErasing]=useState<Stroke[]|null>(null);
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
   redoStack.current=[];history.current=[];setErasing(null);
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
  if(ctx)draw(ctx,[...(erasing??parseStrokes(draft.strokes)),...(drawing?[drawing]:[])]);
 },[draft.strokes,drawing,erasing]);
 const create=async()=>{
  if(inFlight.current)return;
  if(dirty.current&&!await flush())return;
  setActionBusy(true);setError("");
  try{
   const note=await request<Note>("/notes",{method:"POST",body:blank});
   await listNotes();
   selectedRef.current=note.id;setSelected(note.id);versionRef.current=note.version;
   draftRef.current=blank;setDraft(blank);dirty.current=false;setSaveState("saved");setPreview(false);redoStack.current=[];history.current=[];
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
 const setStrokes=(next:Stroke[],addUndo=true)=>{
  if(addUndo){history.current.push(draftRef.current.strokes);if(history.current.length>80)history.current.shift();redoStack.current=[];}
  setEdited({...draftRef.current,strokes:JSON.stringify(next)});
 };
 const markPressure=(e:PointerEvent<HTMLCanvasElement>):Point=>{
  const [x,y]=mark(e);return[x,y,e.pointerType==="pen"?Math.max(.1,e.pressure):.5];
 };
 const eraseAt=(point:Point)=>{
  if(!eraserWork.current)return;
  const before=eraserWork.current;
  const result=before.flatMap(stroke=>partialErase(stroke,point,eraserSize));
  eraserWork.current=result;setErasing(result);
 };
 const down=(e:PointerEvent<HTMLCanvasElement>)=>{
  if(!selected||actionBusy||e.button!==0)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  if(tool==="eraser"){eraserWork.current=parseStrokes(draftRef.current.strokes);eraseAt(markPressure(e));return;}
  const stroke:Stroke={color:pen,width:tool==="highlighter"?Math.max(12,width*5):tool==="marker"?Math.max(7,width*2):width,tool,points:[markPressure(e)]};
  drawingRef.current=stroke;setDrawing(stroke);
 };
 const move=(e:PointerEvent<HTMLCanvasElement>)=>{
  if(tool==="eraser"){if(eraserWork.current)eraseAt(markPressure(e));return;}
  const stroke=drawingRef.current;if(!stroke)return;
  const next={...stroke,points:[...stroke.points,markPressure(e)]};
  drawingRef.current=next;setDrawing(next);
 };
 const up=()=>{
  if(eraserWork.current){
   const next=eraserWork.current;eraserWork.current=null;setErasing(null);
   if(JSON.stringify(next)!==draftRef.current.strokes)setStrokes(next);
   return;
  }
  const stroke=drawingRef.current;if(!stroke)return;
  drawingRef.current=null;setDrawing(null);
  setStrokes([...parseStrokes(draftRef.current.strokes),stroke]);
 };
 const undo=()=>{
  const current=draftRef.current.strokes;
  const previous=history.current.pop();
  if(previous!==undefined){redoStack.current.push(current);setEdited({...draftRef.current,strokes:previous});return;}
  const all=parseStrokes(current),last=all.pop();if(!last)return;
  redoStack.current.push(current);setEdited({...draftRef.current,strokes:JSON.stringify(all)});
 };
 const redo=()=>{
  const next=redoStack.current.pop();if(next===undefined)return;
  history.current.push(draftRef.current.strokes);setEdited({...draftRef.current,strokes:next});
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
      <div><h2><PenLine size={18}/> Handwriting canvas</h2><p>Sketch, highlight and take notes using a mouse, finger or stylus.</p></div>
      <div className="aw-notes-pen">
       <div className="aw-notes-tool-choices" role="group" aria-label="Drawing tools">
        {(["pen","pencil","highlighter","marker","eraser"] as Tool[]).map(t=><button type="button" key={t} aria-pressed={tool===t} onClick={()=>setTool(t)}>
          {t==="eraser"?<Eraser size={15}/>:<PenLine size={15}/>} {t[0].toUpperCase()+t.slice(1)}</button>)}
       </div>
       <label htmlFor="aw-pen-color">Color</label><input id="aw-pen-color" aria-label="Ink color" type="color" value={pen} onChange={e=>setPen(e.target.value)}/>
       {["#29202e","#D18CFF","#FF6099","#F2C94C","#54C7D5","#78D4A1"].map(c=>
        <button key={c} type="button" className="aw-notes-swatch" aria-label={"Select color "+c} aria-pressed={pen.toLowerCase()===c.toLowerCase()} onClick={()=>setPen(c)}><span style={{background:c}}/></button>)}
       <label htmlFor="aw-pen-width">{tool==="eraser"?"Eraser size":"Brush size"}</label>
       {tool==="eraser"?<input id="aw-pen-width" aria-label="Eraser size" type="range" min={4} max={80} step={2} value={eraserSize} onChange={e=>setEraserSize(Number(e.target.value))}/>:
        <input id="aw-pen-width" aria-label="Brush size" type="range" min={1} max={18} value={width} onChange={e=>setWidth(Number(e.target.value))}/>}
       <span className="aw-notes-tool-size">{tool==="eraser"?eraserSize:width}px</span>
       <button type="button" onClick={undo} disabled={!parseStrokes(draft.strokes).length}><Undo2 size={16}/> Undo</button>
       <button type="button" onClick={redo} disabled={!redoStack.current.length}><Redo2 size={16}/> Redo</button>
       <button type="button" onClick={()=>{if(window.confirm("Clear the entire drawing?"))setStrokes([]);}} disabled={!parseStrokes(draft.strokes).length}>
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
