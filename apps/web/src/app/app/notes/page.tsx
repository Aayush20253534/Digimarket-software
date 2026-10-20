"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { BookOpen, Check, Cloud, CloudOff, Eraser, FilePlus2, NotebookPen, PenLine, RefreshCw, Maximize2, Minimize2, Redo2, Save, Trash2, Undo2, Brush, Highlighter, Pencil, MousePointer2, Shapes, Type, StickyNote, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Settings2, Download, Search, FolderPlus, Star, Clock3 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { AWNotice } from "@/components/aw-ui";

type Tool="pen"|"pencil"|"highlighter"|"marker"|"eraser"|"brush"|"fountain"|"select"|"shape"|"text"|"sticky";
type Point=[number,number,number?];
type Stroke={color:string;width:number;points:Point[];tool?:Exclude<Tool,"eraser"|"select">;opacity?:number;style?:"solid"|"dashed"|"dotted";shape?:"line"|"rectangle"|"roundedRectangle"|"ellipse"|"circle"|"triangle"|"diamond"|"pentagon"|"hexagon"|"star"|"arrow";text?:string};
function partialErase(stroke:Stroke,point:Point,radius:number):Stroke[]{
 const old=stroke.points;if(!old.length)return[];if(stroke.tool==="sticky"||stroke.tool==="text")return[stroke];
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
  const a=old[i-1],b=old[i],n=Math.max(1,Math.ceil(Math.hypot((b[0]-a[0])*W,(b[1]-a[1])*H)/5));
  for(let j=i===1?0:1;j<=n;j++){
   const t=j/n,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;
   const p:Point=a[2]===undefined&&b[2]===undefined?[x,y]:[x,y,(a[2]??.5)+((b[2]??.5)-(a[2]??.5))*t];
   if(Math.hypot(p[0]*W-cx,p[1]*H-cy)<=radius+stroke.width/2)push();else current.push(p);
  }
 }
 push();return parts.map(points=>({...stroke,points}));
}
type Note={id:string;title:string;body:string;strokes:string;pages:string;starred:boolean;notebookId:string|null;deletedAt:string|null;version:number;updatedAt:string};
type NoteSummary=Pick<Note,"id"|"title"|"strokes"|"starred"|"notebookId"|"deletedAt"|"version"|"updatedAt">;
type Notebook={id:string;name:string;color:string};
type NotePage={id:string;strokes:string;paper:"blank"|"ruled"|"grid"|"dotted"};
type Draft={title:string;body:string;strokes:string;pages:string};
const blank:Draft={title:"Untitled",body:"",strokes:"[]",pages:"[]"};
const parsePages=(value:string):NotePage[]=>{try{const result=JSON.parse(value);return Array.isArray(result)?result:[];}catch{return[];}};
const W=900,H=520;
const parseStrokes=(s:string):Stroke[]=>{try{const x=JSON.parse(s);return Array.isArray(x)?x:[];}catch{return[];}};
const explanation=(e:unknown)=>e instanceof Error?e.message:"Unable to save notes. Check the connection.";
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
  ctx.globalAlpha=(stroke.tool==="highlighter"?.28:stroke.tool==="pencil"?.66:stroke.tool==="marker"?.88:1)*(stroke.opacity??1);
  ctx.lineJoin="round";ctx.lineCap="round";
  if(stroke.style==="dashed")ctx.setLineDash([9,5]);else if(stroke.style==="dotted"||stroke.tool==="pencil")ctx.setLineDash([1,2.8]);
  const pts=stroke.points;
  if(stroke.tool==="text"||stroke.tool==="sticky"){
    const x=pts[0][0]*W,y=pts[0][1]*H;
    if(stroke.tool==="sticky"){ctx.fillStyle="#fff0ad";ctx.globalAlpha=1;ctx.fillRect(x,y,170,105);ctx.fillStyle="#292136";}
    ctx.font="18px sans-serif";(stroke.text??"").split("\n").slice(0,5).forEach((line,i)=>ctx.fillText(line,x+8,y+28+i*21,150));ctx.restore();continue;
  }
  if(stroke.tool==="shape"&&pts.length>=2){
    const x=pts[0][0]*W,y=pts[0][1]*H,dx=pts[1][0]*W-x,dy=pts[1][1]*H-y;
    ctx.lineWidth=stroke.width;ctx.beginPath();
    if(stroke.shape==="rectangle")ctx.rect(x,y,dx,dy);
    else if(stroke.shape==="roundedRectangle")ctx.roundRect(x,y,dx,dy,Math.min(18,Math.abs(dx)/5,Math.abs(dy)/5));
    else if(stroke.shape==="ellipse"||stroke.shape==="circle"){
      const radiusX=Math.max(1,Math.abs(dx)/2),radiusY=stroke.shape==="circle"?radiusX:Math.max(1,Math.abs(dy)/2);
      ctx.ellipse(x+dx/2,y+dy/2,radiusX,radiusY,0,0,Math.PI*2);
    }else if(["triangle","diamond","pentagon","hexagon","star"].includes(stroke.shape??"")){
      const count=stroke.shape==="triangle"?3:stroke.shape==="diamond"?4:stroke.shape==="pentagon"?5:stroke.shape==="hexagon"?6:10;
      const cx=x+dx/2,cy=y+dy/2,rx=Math.abs(dx)/2,ry=Math.abs(dy)/2;
      for(let i=0;i<count;i++){
        const angle=-Math.PI/2+i*2*Math.PI/count;
        const factor=stroke.shape==="star"&&i%2===1?.42:1;
        const px=cx+Math.cos(angle)*rx*factor,py=cy+Math.sin(angle)*ry*factor;
        if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
      ctx.closePath();
    }else{ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);}
    ctx.stroke();
    if(stroke.shape==="arrow"){const theta=Math.atan2(dy,dx);ctx.beginPath();ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-15*Math.cos(theta-.5),y+dy-15*Math.sin(theta-.5));ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-15*Math.cos(theta+.5),y+dy-15*Math.sin(theta+.5));ctx.stroke();}
    ctx.restore();continue;
  }
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
 const [notebooks,setNotebooks]=useState<Notebook[]>([]);
 const [collection,setCollection]=useState<"all"|"recent"|"starred"|"trash">("all");
 const [notebookFilter,setNotebookFilter]=useState<string|null>(null);
 const [activePage,setActivePage]=useState(0);
 const [selected,setSelected]=useState<string|null>(null);
 const [draft,setDraft]=useState<Draft>(blank);
 const draftRef=useRef<Draft>(blank),versionRef=useRef(1);
 // An older deployed API understands strokes but not persisted pages. Do not send
 // fields that its strict validator rejects, or silently drop a multi-page note.
 const pagesSupported=useRef(false);
 const [modernNotesApi,setModernNotesApi]=useState(true);
 const [loadState,setLoadState]=useState<"loading"|"ready">("loading");
 const [saveState,setSaveState]=useState<"saved"|"unsaved"|"saving"|"conflict">("saved");
 const [error,setError]=useState("");
 const [preview,setPreview]=useState(false);
 const [pen,setPen]=useState("#D18CFF"),[width,setWidth]=useState(3),[eraserSize,setEraserSize]=useState(16);
 const [tool,setTool]=useState<Tool>("pen");
 const [mode,setMode]=useState<"handwritten"|"typed">("handwritten");
 const [paper,setPaper]=useState<"dotted"|"blank"|"ruled"|"grid">("dotted");
 const [zoom,setZoom]=useState(100);
 const [panel,setPanel]=useState<"tools"|"page"|"layers">("tools");
 const [noteQuery,setNoteQuery]=useState("");
 const [libraryOpen,setLibraryOpen]=useState(false),[inspectorOpen,setInspectorOpen]=useState(false);
 const [opacity,setOpacity]=useState(100);
 const [strokeStyle,setStrokeStyle]=useState<"solid"|"dashed"|"dotted">("solid");
 const [shape,setShape]=useState<NonNullable<Stroke["shape"]>>("rectangle");
 const selection=useRef<{index:number;start:Point;before:Stroke[]}|null>(null);
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
  const result=await request<{items:NoteSummary[];limited:boolean}>("/notes"+(collection==="trash"?"?trash=true":""));
  setList(result.items);
 },[request,collection]);
 const flush=useCallback(async():Promise<boolean>=>{
  const id=selectedRef.current;
  if(!id||!dirty.current)return true;
  if(inFlight.current)return false;
  inFlight.current=true;setSaveState("saving");setError("");
  const snapshot=draftRef.current;
  try{
   const pages=parsePages(snapshot.pages);
   if(!pagesSupported.current&&pages.length>1)throw new Error(
     "This backend does not support multi-page notes yet. Deploy the latest GitHub main branch to Render before saving more than one page. Your work is still in this tab."
   );
   const {title,body,strokes}=snapshot;
   const saved=await request<Note>("/notes/"+id,{method:"PUT",body:{
     title,body,strokes,...(pagesSupported.current?{pages:snapshot.pages}:{}),
     version:versionRef.current,
   }});
   if(selectedRef.current===id){
    versionRef.current=saved.version;
    dirty.current=snapshot!==draftRef.current;
    setSaveState(dirty.current?"unsaved":"saved");
    setList(prev=>prev.map(n=>n.id===id?{...n,title:saved.title,strokes:saved.strokes,updatedAt:saved.updatedAt,version:saved.version}:n));
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
   pagesSupported.current=typeof note.pages==="string";
   setModernNotesApi(pagesSupported.current);
   selectedRef.current=id;setSelected(id);versionRef.current=note.version;
   redoStack.current=[];history.current=[];setErasing(null);
   const pages=parsePages(note.pages??"[]");
   setActivePage(0);setPaper(pages[0]?.paper??"dotted");
   const next={title:note.title,body:note.body,strokes:pages[0]?.strokes??note.strokes,pages:note.pages??"[]"};
   dirty.current=false;draftRef.current=next;setDraft(next);setSaveState("saved");
   setDrawing(null);drawingRef.current=null;
  }catch(e){setError(explanation(e));}finally{setActionBusy(false);}
 },[request,flush]);
 const initialized=useRef(false);
 useEffect(()=>{
  if(!session||initialized.current)return;
  initialized.current=true;
  void request<{items:NoteSummary[];limited:boolean}>("/notes")
   .then(result=>{setList(result.items);if(result.items[0]){
     const focus=new URLSearchParams(window.location.search).get("note");
     void open(focus&&result.items.some(n=>n.id===focus)?focus:result.items[0].id);
    }})
   .catch(e=>setError(explanation(e))).finally(()=>setLoadState("ready"));
 },[session,request,open]);
 useEffect(()=>{
  if(!session)return;
  void request<{items:Notebook[]}>("/notes/notebooks").then(data=>setNotebooks(data.items))
   .catch(e=>{if(e instanceof ApiError&&e.status===404){setModernNotesApi(false);return;}setError(explanation(e));});
 },[session,request]);
 useEffect(()=>{
  if(!initialized.current)return;
  void listNotes().catch(e=>setError(explanation(e)));
 },[collection,listNotes]);
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
   // Old Notes APIs validate fields strictly and reject the modern 'pages' key.
   const note=await request<Note>("/notes",{method:"POST",body:{
     title:blank.title,body:blank.body,strokes:blank.strokes,
   }});
   pagesSupported.current=typeof note.pages==="string";
   setModernNotesApi(pagesSupported.current);
   await listNotes();
   selectedRef.current=note.id;setSelected(note.id);versionRef.current=note.version;
   draftRef.current=blank;setDraft(blank);setActivePage(0);setPaper("dotted");dirty.current=false;setSaveState("saved");setPreview(false);redoStack.current=[];history.current=[];
  }catch(e){setError(explanation(e));}finally{setActionBusy(false);}
 };
 const saveConflictCopy=async()=>{
  if(inFlight.current||actionBusy)return;
  setActionBusy(true);setError("");
  try{
   if(!pagesSupported.current&&parsePages(draftRef.current.pages).length>1)
     throw new Error("The deployed Notes API cannot save multiple pages. Keep this tab open until the Render backend is updated.");
   const snapshot=draftRef.current;
   const note=await request<Note>("/notes",{method:"POST",body:{
     title:snapshot.title.slice(0,167)+" (recovered)",body:snapshot.body,strokes:snapshot.strokes,
     ...(pagesSupported.current?{pages:snapshot.pages}:{}),
   }});
   await listNotes();selectedRef.current=note.id;setSelected(note.id);versionRef.current=note.version;
   const pages=parsePages(note.pages??"[]");
   setActivePage(0);setPaper(pages[0]?.paper??"dotted");
   const next={title:note.title,body:note.body,strokes:pages[0]?.strokes??note.strokes,pages:note.pages??"[]"};
   draftRef.current=next;setDraft(next);dirty.current=false;setSaveState("saved");
  }catch(e){setError(explanation(e));}finally{setActionBusy(false);}
 };
 const remove=async()=>{
  if(!selected||!window.confirm("Move this note to Trash? You can restore it until you permanently delete it from Trash."))return;
  if(inFlight.current)return;
  setActionBusy(true);setError("");
  try{
   await request("/notes/"+selected+"?version="+versionRef.current,{method:"DELETE"});
   selectedRef.current=null;setSelected(null);dirty.current=false;draftRef.current=blank;setDraft(blank);
   const data=await request<{items:NoteSummary[]}>("/notes");setList(data.items);
   if(data.items.length)await open(data.items[0].id);
  }catch(e){setError(explanation(e));}finally{setActionBusy(false);}
 };
 const moveListedNote=async(note:NoteSummary)=>{
  if(!window.confirm("Move "+note.title+" to Trash?"))return;
  if(inFlight.current)return;
  setActionBusy(true);setError("");
  try{
   if(dirty.current&&!await flush())return;
   const version=selectedRef.current===note.id?versionRef.current:note.version;
   await request("/notes/"+note.id+"?version="+version,{method:"DELETE"});
   if(selectedRef.current===note.id){selectedRef.current=null;setSelected(null);dirty.current=false;draftRef.current=blank;setDraft(blank);}
   await listNotes();
  }catch(e){setError(explanation(e));}finally{setActionBusy(false);}
 };
 const mark=(e:PointerEvent<HTMLCanvasElement>)=>{
  const rect=e.currentTarget.getBoundingClientRect();
  return [Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),
   Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))] as [number,number];
 };
 const setStrokes=(next:Stroke[],addUndo=true)=>{
  if(addUndo){history.current.push(draftRef.current.strokes);if(history.current.length>80)history.current.shift();redoStack.current=[];}
  const current=JSON.stringify(next),pages=parsePages(draftRef.current.pages);
  const records=pages.length?pages:[{id:"page-1",strokes:draftRef.current.strokes,paper}];
  records[activePage]={...(records[activePage]??{id:"page-"+(activePage+1),paper}),strokes:current};
  setEdited({...draftRef.current,strokes:current,pages:JSON.stringify(records)});
 };
 const markPressure=(e:PointerEvent<HTMLCanvasElement>):Point=>{
  const [x,y]=mark(e);return e.pointerType==="pen"?[x,y,Math.max(.1,e.pressure)]:[x,y];
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
  if(tool==="text"||tool==="sticky"){
    const value=window.prompt(tool==="text"?"Insert text":"Sticky note text");
    if(value?.trim()){setStrokes([...parseStrokes(draftRef.current.strokes),{color:pen,width,tool,points:[markPressure(e)],text:value.slice(0,200)}]);}
    return;
  }
  if(tool==="select"){
    const p=markPressure(e),all=parseStrokes(draftRef.current.strokes);
    let index=-1;for(let i=all.length-1;i>=0;i--)if(all[i].points.some(q=>Math.hypot((q[0]-p[0])*W,(q[1]-p[1])*H)<26)){index=i;break;}
    if(index>=0)selection.current={index,start:p,before:all};
    return;
  }
  const stroke:Stroke={color:pen,width:tool==="highlighter"?Math.min(30,Math.max(12,width*3)):tool==="marker"?Math.min(30,Math.max(7,width*2)):width,tool,points:[markPressure(e)],opacity:opacity/100,style:strokeStyle,...(tool==="shape"?{shape}:{})};
  drawingRef.current=stroke;setDrawing(stroke);
 };
 const move=(e:PointerEvent<HTMLCanvasElement>)=>{
  if(tool==="eraser"){if(eraserWork.current)eraseAt(markPressure(e));return;}
  if(selection.current){
    const sel=selection.current,p=markPressure(e),dx=p[0]-sel.start[0],dy=p[1]-sel.start[1];
    const changed=sel.before.map((st,i)=>i===sel.index?{...st,points:st.points.map(pt=>[Math.max(0,Math.min(1,pt[0]+dx)),Math.max(0,Math.min(1,pt[1]+dy)),...(pt[2]!==undefined?[pt[2]]:[])] as Point)}:st);
    setErasing(changed);return;
  }
  const stroke=drawingRef.current;if(!stroke)return;
  const next={...stroke,points:stroke.tool==="shape"?[stroke.points[0],markPressure(e)]:[...stroke.points,markPressure(e)]};
  drawingRef.current=next;setDrawing(next);
 };
 const up=()=>{
  if(selection.current){
    selection.current=null;if(erasing){const current=erasing;setErasing(null);setStrokes(current);}return;
  }
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
  if(previous!==undefined){redoStack.current.push(current);setStrokes(parseStrokes(previous),false);return;}
  const all=parseStrokes(current),last=all.pop();if(!last)return;
  redoStack.current.push(current);setStrokes(all,false);
 };
 const redo=()=>{
  const next=redoStack.current.pop();if(next===undefined)return;
  history.current.push(draftRef.current.strokes);setStrokes(parseStrokes(next),false);
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
 const pages=parsePages(draft.pages);
 const pageCount=Math.max(1,pages.length);
 const changePage=(target:number)=>{
  if(target<0||target>=pageCount||target===activePage)return;
  const targetPage=pages[target];if(!targetPage)return;
  history.current=[];redoStack.current=[];setActivePage(target);setPaper(targetPage.paper);
  setEdited({...draftRef.current,strokes:targetPage.strokes});
 };
 const addPage=()=>{
  const records=pages.length?pages:[{id:"page-1",strokes:draft.strokes,paper}];
  const next={id:"page-"+Date.now(),strokes:"[]",paper};
  setActivePage(records.length);history.current=[];redoStack.current=[];
  setEdited({...draftRef.current,strokes:"[]",pages:JSON.stringify([...records,next])});
 };
 const duplicatePage=()=>{
  const records=pages.length?pages:[{id:"page-1",strokes:draft.strokes,paper}];
  const next={...records[activePage],id:"page-"+Date.now()};
  records.splice(activePage+1,0,next);
  setActivePage(activePage+1);history.current=[];redoStack.current=[];
  setEdited({...draftRef.current,strokes:next.strokes,pages:JSON.stringify(records)});
 };
 const deletePage=()=>{
  if(pageCount===1||!window.confirm("Delete the current page?"))return;
  const records=pages.filter((_,i)=>i!==activePage);
  const target=Math.min(activePage,records.length-1);setActivePage(target);setPaper(records[target].paper);
  history.current=[];redoStack.current=[];
  setEdited({...draftRef.current,strokes:records[target].strokes,pages:JSON.stringify(records)});
 };
 const choosePaper=(next:NotePage["paper"])=>{
  setPaper(next);
  const records=pages.length?pages:[{id:"page-1",strokes:draftRef.current.strokes,paper:next}];
  records[activePage]={...records[activePage],paper:next};
  setEdited({...draftRef.current,pages:JSON.stringify(records)});
 };
 const createNotebook=async()=>{
  const name=window.prompt("Notebook name")?.trim();if(!name)return;
  try{const book=await request<Notebook>("/notes/notebooks",{method:"POST",body:{name,color:"#8C45DB"}});
    setNotebooks(v=>[...v,book].sort((a,b)=>a.name.localeCompare(b.name)));
    setCollection("all");setNotebookFilter(book.id);
  }catch(e){setError(explanation(e));}
 };
 const renameNotebook=async(book:Notebook)=>{
  const name=window.prompt("Rename notebook",book.name)?.trim();if(!name||name===book.name)return;
  try{await request("/notes/notebooks/"+book.id,{method:"PUT",body:{name,color:book.color}});
    setNotebooks(v=>v.map(b=>b.id===book.id?{...b,name}:b));
  }catch(e){setError(explanation(e));}
 };
 const toggleStar=async(n:NoteSummary)=>{
  try{const saved=await request<Note>("/notes/"+n.id+"/metadata",{method:"PUT",body:{starred:!n.starred}});
    setList(v=>v.map(x=>x.id===n.id?{...x,starred:saved.starred}:x));
  }catch(e){setError(explanation(e));}
 };
 const placeInNotebook=async(id:string|null)=>{
  if(!selected)return;
  try{const saved=await request<Note>("/notes/"+selected+"/metadata",{method:"PUT",body:{notebookId:id}});
    setList(v=>v.map(n=>n.id===selected?{...n,notebookId:saved.notebookId}:n));
  }catch(e){setError(explanation(e));}
 };
 const permanentlyDeleteNote=async(id:string)=>{
  if(!window.confirm("Permanently delete this note from Trash? This cannot be undone."))return;
  setActionBusy(true);setError("");
  try{
   await request("/notes/"+id+"/permanent",{method:"DELETE"});
   if(selectedRef.current===id){selectedRef.current=null;setSelected(null);dirty.current=false;draftRef.current=blank;setDraft(blank);}
   await listNotes();
  }catch(e){setError(explanation(e));}finally{setActionBusy(false);}
 };
 const restoreNote=async(id:string)=>{
  try{await request("/notes/"+id+"/restore",{method:"POST"});await listNotes();setSelected(null);selectedRef.current=null;}
  catch(e){setError(explanation(e));}
 };
 const selectedSummary=list.find(n=>n.id===selected);
 const visibleNotes=list.filter(n=>(collection!=="starred"||n.starred)&&
   (!notebookFilter||n.notebookId===notebookFilter)&&
   n.title.toLowerCase().includes(noteQuery.trim().toLowerCase())&&
   (collection!=="recent"||Date.now()-new Date(n.updatedAt).getTime()<30*86400000));
 const tools: {id:Tool;label:string;icon:typeof PenLine}[]=[
  {id:"pen",label:"Pen",icon:PenLine},{id:"pencil",label:"Pencil",icon:Pencil},
  {id:"marker",label:"Marker",icon:PenLine},{id:"brush",label:"Brush",icon:Brush},
  {id:"highlighter",label:"Highlighter",icon:Highlighter},{id:"fountain",label:"Fountain Pen",icon:PenLine},
  {id:"eraser",label:"Eraser",icon:Eraser},{id:"select",label:"Select",icon:MousePointer2},
  {id:"shape",label:"Shapes",icon:Shapes},{id:"text",label:"Text",icon:Type},{id:"sticky",label:"Sticky Note",icon:StickyNote}
 ];
 useEffect(()=>{
  if(!expanded)return;
  const esc=(event:KeyboardEvent)=>{if(event.key==="Escape")setExpanded(false);};
  document.addEventListener("keydown",esc);
  return()=>document.removeEventListener("keydown",esc);
 },[expanded]);
 const downloadNote=(format:"png"|"md")=>{
  const a=document.createElement("a");
  const filename=(draft.title||"Untitled").replace(/[^a-z0-9 _-]/gi,"").slice(0,64)||"note";
  if(format==="png"){
   if(!canvasRef.current)return;
   const exportCanvas=document.createElement("canvas");exportCanvas.width=W;exportCanvas.height=H;
   const ctx=exportCanvas.getContext("2d");if(!ctx)return;
   ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);ctx.drawImage(canvasRef.current,0,0);
   a.href=exportCanvas.toDataURL("image/png");
  }else a.href=URL.createObjectURL(new Blob([draft.body],{type:"text/markdown"}));
  a.download=filename+"."+format;a.click();
  if(format==="md")window.setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 };
 return <div className={"aw-notes-root aw-studio"+(expanded?" aw-studio-fullscreen":"")}>
  <aside aria-label="Your notes" className={"aw-studio-library"+(libraryOpen?" aw-studio-library-open":"")}>
   <div className="aw-studio-brand"><div className="aw-studio-logo"><NotebookPen size={27}/></div>
     <div><strong>AmplifyWorld</strong><span>Notes Studio</span></div></div>
   <div className="aw-studio-library-body">
    <label className="aw-studio-search"><Search size={17}/><input aria-label="Search notes" value={noteQuery}
       onChange={event=>setNoteQuery(event.target.value)} placeholder="Search notes…"/></label>
    <button className="aw-studio-new" type="button" onClick={()=>void create()} disabled={actionBusy}><FilePlus2 size={18}/> New note</button>
    <div className="aw-studio-collections">
     {(["all","recent","starred","trash"] as const).map(c=><button key={c} type="button" className={collection===c&&!notebookFilter?"selected":""}
      onClick={()=>{setCollection(c);setNotebookFilter(null);}}>
      {c==="all"?<BookOpen size={18}/>:c==="recent"?<Clock3 size={18}/>:c==="starred"?<Star size={18}/>:<Trash2 size={18}/>}
      {c==="all"?"All Notes":c==="recent"?"Recent":c==="starred"?"Starred":"Trash"}
      {c==="all"&&<span>{list.length}</span>}
     </button>)}
    </div>
    <div className="aw-studio-section-title aw-studio-section-row">NOTEBOOKS
      <button type="button" aria-label="Create notebook" onClick={()=>void createNotebook()}><FolderPlus size={16}/></button>
    </div>
    <div className="aw-studio-collections">{notebooks.map(book=><div key={book.id} className="aw-studio-notebook-row">
     <button type="button" className={notebookFilter===book.id?"selected":""} onClick={()=>{setNotebookFilter(book.id);setCollection("all");}}>
      <BookOpen size={17} color={book.color}/>{book.name}
     </button><button type="button" aria-label={"Rename notebook "+book.name} title="Rename notebook" onClick={()=>void renameNotebook(book)}><PenLine size={13}/></button>
    </div>)}</div>
    <div className="aw-studio-section-title">RECENT NOTES</div>
    {loadState==="loading"&&<p role="status" className="aw-notes-muted">Loading notes…</p>}
    {!list.length&&loadState==="ready"&&<p className="aw-notes-muted">No saved notes. Create one to begin.</p>}
    {visibleNotes.map(n=><div key={n.id} className={"aw-studio-note-item"+(selected===n.id?" active":"")}>
      <button type="button" className="aw-studio-note-open" disabled={actionBusy||inFlight.current}
       aria-current={selected===n.id?"page":undefined} onClick={()=>{void open(n.id);setLibraryOpen(false);}}>
       <div className="aw-studio-note-preview"><svg viewBox="0 0 900 520" aria-hidden="true">{parseStrokes(n.strokes).slice(0,80).map((stroke,i)=>
        <polyline key={i} fill="none" stroke={stroke.color} strokeWidth={Math.max(2,stroke.width*4)}
         points={stroke.points.map(pt=>(pt[0]*900)+","+(pt[1]*520)).join(" ")}/>)}</svg></div>
       <span><strong>{n.title}</strong><small>{new Date(n.updatedAt).toLocaleString()}</small></span>
      </button>
      {collection==="trash"?<div className="aw-notes-trash-actions">
        <button type="button" disabled={actionBusy} onClick={()=>void restoreNote(n.id)} aria-label={"Restore "+n.title}>Restore</button>
        <button type="button" disabled={actionBusy} className="danger" onClick={()=>void permanentlyDeleteNote(n.id)} aria-label={"Permanently delete "+n.title}><Trash2 size={15}/></button>
       </div>:
       <div className="aw-notes-trash-actions">
        <button type="button" disabled={actionBusy} aria-label={(n.starred?"Unstar ":"Star ")+n.title} onClick={()=>void toggleStar(n)}><Star size={15} fill={n.starred?"#b26cfa":"none"}/></button>
        <button type="button" disabled={actionBusy} className="danger" aria-label={"Move "+n.title+" to Trash"} onClick={()=>void moveListedNote(n)}><Trash2 size={15}/></button>
       </div>}
     </div>)}
   </div>
  </aside>
  <main className="aw-studio-main">
   <header className="aw-studio-header">
    <div className="aw-studio-header-name">
     <button type="button" className="aw-studio-mobile-menu" aria-label="Open notes library" onClick={()=>setLibraryOpen(x=>!x)}><BookOpen size={20}/></button>
     {selected?<input id="aw-note-title" aria-label="Note title" maxLength={180} value={draft.title}
       onChange={e=>setEdited({...draftRef.current,title:e.target.value})} placeholder="Untitled note"/>:
       <h1>My notes</h1>}
     {selected&&<PenLine size={16} aria-hidden="true"/>}
    </div>
    {selected&&<div className="aw-notes-save-status" role="status">
      {saveState==="saved"?<Check size={16}/>:saveState==="conflict"?<CloudOff size={16}/>:<Cloud size={16}/>}
      <span>{saveState==="saved"?"Saved":saveState==="saving"?"Saving…":saveState==="conflict"?"Save conflict":"Unsaved changes"}</span>
     </div>}
    <div className="aw-studio-head-actions">
     {selected&&<button type="button" onClick={()=>void flush()} disabled={saveState==="saved"||saveState==="saving"||saveState==="conflict"} aria-label="Save note"><Save size={18}/><span>Save</span></button>}
     {selected&&<div className="aw-studio-export">
      <button type="button" aria-label="Export drawing as PNG" onClick={()=>downloadNote("png")}><Download size={17}/> Export PNG</button>
      <button type="button" aria-label="Export typed notes as Markdown" onClick={()=>downloadNote("md")}>MD</button>
     </div>}
     <button type="button" aria-label={expanded?"Exit full screen":"Expand canvas"} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize2 size={19}/>:<Maximize2 size={19}/>}</button>
     <button type="button" aria-label="Toggle tool settings" onClick={()=>setInspectorOpen(x=>!x)}><Settings2 size={19}/></button>
    </div>
   </header>
   {!modernNotesApi&&<AWNotice tone="error">The Notes API on Render is outdated. Single-page notes can still be saved, but notebooks and multi-page persistence require deploying the latest backend.</AWNotice>}
   {error&&<AWNotice tone="error">{error} {saveState==="conflict"&&"Unsaved work remains here."}</AWNotice>}
   {!selected?<div className="aw-notes-empty"><NotebookPen size={36}/><p>Choose a saved note or create a new one.</p></div>:<>
    <div className="aw-studio-modebar">
     <div className="aw-studio-mode-switch" role="group" aria-label="Note mode">
      <button type="button" aria-pressed={mode==="handwritten"} onClick={()=>setMode("handwritten")}><PenLine size={18}/> Handwritten Note</button>
      <button type="button" aria-pressed={mode==="typed"} onClick={()=>setMode("typed")}><Type size={18}/> Typed Note</button>
     </div>
     <div className="aw-studio-utility">
      {mode==="handwritten"&&<><button type="button" aria-label="Previous page" onClick={()=>changePage(activePage-1)} disabled={activePage===0}><ChevronLeft size={17}/></button>
      <span aria-label="Page number">{activePage+1} / {pageCount}</span>
      <button type="button" aria-label="Next page" onClick={()=>changePage(activePage+1)} disabled={activePage===pageCount-1}><ChevronRight size={17}/></button>
      <button type="button" aria-label="Add page" onClick={addPage}>+ Page</button>
      <button type="button" title="Zoom out" aria-label="Zoom out" onClick={()=>setZoom(x=>Math.max(50,x-25))}><ZoomOut size={17}/></button>
      <span aria-label="Zoom percentage">{zoom}%</span><button type="button" title="Zoom in" aria-label="Zoom in" onClick={()=>setZoom(x=>Math.min(200,x+25))}><ZoomIn size={17}/></button>
      <button type="button" onClick={()=>setZoom(100)}>Fit</button>
      <button type="button" onClick={undo} disabled={!parseStrokes(draft.strokes).length} aria-label="Undo"><Undo2 size={17}/></button>
      <button type="button" onClick={redo} disabled={!redoStack.current.length} aria-label="Redo"><Redo2 size={17}/></button></>}
     </div>
    </div>
    {mode==="handwritten"?<>
     <div className="aw-studio-tools" role="group" aria-label="Drawing tools">
      {tools.map(({id,label,icon:Icon})=><button key={id} type="button" aria-pressed={tool===id} onClick={()=>setTool(id)}>
       <Icon size={22} strokeWidth={1.8}/><span>{label}</span></button>)}
     </div>
     <div className="aw-studio-sheet-scroll"><div className={"aw-studio-sheet paper-"+paper} style={{width:zoom+"%"}}>
       <canvas ref={canvasRef} className="aw-notes-canvas" width={W} height={H} role="img"
        aria-label="Handwriting canvas. Draw with mouse, touch or stylus."
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/>
      </div></div>
    </>:<section className="aw-studio-typed">
     <div className="aw-notes-tabs" role="group" aria-label="Text and preview">
      <button type="button" aria-pressed={!preview} onClick={()=>setPreview(false)}>Write</button>
      <button type="button" aria-pressed={preview} onClick={()=>setPreview(true)}>Preview</button>
      <button type="button" onClick={()=>insert("**bold text**")} disabled={preview}>Bold</button>
      <button type="button" onClick={()=>insert("*italic text*")} disabled={preview}>Italic</button>
      <button type="button" onClick={()=>insert("## Heading\n")} disabled={preview}>Heading</button>
     </div>
     {preview?<MarkdownPreview value={draft.body}/>:<textarea id="aw-note-body" aria-label="Typed notes"
      className="aw-notes-textarea" value={draft.body} onChange={e=>setEdited({...draftRef.current,body:e.target.value})}
      placeholder="Write your ideas, tasks, and meeting notes…"/>}
    </section>}
    <div className="aw-studio-foot">
     {saveState==="conflict"&&<button type="button" onClick={()=>void saveConflictCopy()} disabled={actionBusy}>Save recovered copy</button>}
     <label className="aw-studio-note-book-select">Notebook
       <select value={selectedSummary?.notebookId??""} onChange={e=>void placeInNotebook(e.target.value||null)} aria-label="Choose notebook">
        <option value="">Unfiled</option>{notebooks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
       </select>
     </label>
     <button type="button" aria-label="Reload note" onClick={()=>void open(selected,true)} disabled={saveState!=="saved"}><RefreshCw size={16}/> Reload</button>
     <button type="button" className="danger" onClick={()=>void remove()} disabled={actionBusy||saveState==="saving"}><Trash2 size={16}/> Move to Trash</button>
    </div>
   </>}
  </main>
  <aside className={"aw-studio-inspector"+(inspectorOpen?" aw-studio-inspector-open":"")} aria-label="Tool inspector">
   {selected&&<section className="aw-studio-page-switcher" aria-label="Note pages">
    <div className="aw-studio-page-switcher-head"><strong>All pages ({pageCount})</strong><button type="button" onClick={addPage} aria-label="Add note page">+ Add</button></div>
    <div className="aw-studio-page-grid">
     {Array.from({length:pageCount},(_,index)=>{
       const notePage=pages[index];
       const strokes=parseStrokes(index===activePage?draft.strokes:(notePage?.strokes??"[]"));
       return <button key={notePage?.id??index} className="aw-studio-page-tile" aria-label={"Open note page "+(index+1)}
        aria-current={index===activePage?"page":undefined}
        type="button" onClick={()=>changePage(index)}>
        <span className="aw-studio-page-thumbnail" aria-hidden="true">
          <svg viewBox="0 0 900 520">{strokes.slice(0,55).map((stroke,i)=><polyline key={i} points={stroke.points.map(pt=>pt[0]*900+","+pt[1]*520).join(" ")}
            fill="none" stroke={stroke.color} strokeWidth={Math.max(2,stroke.width*3)}/>)}</svg>
        </span><span>Page {index+1}</span>
       </button>;
     })}
    </div>
   </section>}
   <div className="aw-studio-inspector-tabs" role="tablist" aria-label="Inspector tabs">
    <button type="button" role="tab" aria-selected={panel==="tools"} onClick={()=>setPanel("tools")}>Tool Settings</button>
    <button type="button" role="tab" aria-selected={panel==="page"} onClick={()=>setPanel("page")}>Page</button>
    <button type="button" role="tab" aria-selected={panel==="layers"} onClick={()=>setPanel("layers")}>Layers</button>
   </div>
   {panel==="tools"?<div className="aw-studio-settings">
    <label htmlFor="aw-pen-color">Color</label><div className="aw-studio-picker"><input id="aw-pen-color" aria-label="Ink color" type="color" value={pen} onChange={e=>setPen(e.target.value)}/><span>{pen.toUpperCase()}</span></div>
    <div className="aw-studio-swatches">{["#181321","#FFFFFF","#F9A37E","#FF8E36","#F9DC4D","#54DF92","#3064F5","#9D43EA","#FF54B7"].map(c=>
     <button key={c} type="button" style={{background:c}} aria-label={"Select color "+c} aria-pressed={pen.toLowerCase()===c.toLowerCase()} onClick={()=>setPen(c)}/>)}</div>
    <label htmlFor="aw-pen-width">Brush Size</label><div className="aw-studio-range"><input id="aw-pen-width" aria-label="Brush size" type="range" min={1} max={18} value={width} onChange={e=>setWidth(Number(e.target.value))}/><span>{width} mm</span></div>
    <label htmlFor="aw-opacity">Opacity</label><div className="aw-studio-range"><input id="aw-opacity" type="range" min={10} max={100} value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/><span>{opacity}%</span></div>
    <label htmlFor="aw-eraser-width">Eraser Size</label><div className="aw-studio-range"><input id="aw-eraser-width" aria-label="Eraser size" type="range" min={4} max={80} step={2} value={eraserSize} onChange={e=>setEraserSize(Number(e.target.value))}/><span>{eraserSize} mm</span></div>
    <p className="aw-studio-label">Stroke Style</p><div className="aw-studio-options">{(["solid","dashed","dotted"] as const).map(s=><button key={s} type="button" aria-pressed={strokeStyle===s} onClick={()=>setStrokeStyle(s)}>{s}</button>)}</div>
    {tool==="shape"&&<><p className="aw-studio-label">Shape</p><div className="aw-studio-options">{(["line","rectangle","roundedRectangle","ellipse","circle","triangle","diamond","pentagon","hexagon","star","arrow"] as const).map(s=><button key={s} type="button" aria-pressed={shape===s} onClick={()=>setShape(s)}>{s}</button>)}</div></>}
    <p className="aw-studio-label">Paper Style</p><div className="aw-studio-paper-options">{(["blank","ruled","grid","dotted"] as const).map(s=><button key={s} type="button" aria-pressed={paper===s} onClick={()=>choosePaper(s)}><span className={"paper-"+s}/>{s}</button>)}</div>
    <button type="button" className="aw-studio-clear" onClick={()=>{if(window.confirm("Clear the entire drawing?"))setStrokes([]);}} disabled={!parseStrokes(draft.strokes).length}><Eraser size={16}/> Clear drawing</button>
   </div>:panel==="page"?<div className="aw-studio-settings"><p className="aw-studio-label">Pages: {pageCount}</p>
    <div className="aw-studio-options"><button type="button" onClick={addPage}>Add page</button>
    <button type="button" onClick={duplicatePage}>Duplicate</button>
    <button type="button" onClick={deletePage} disabled={pageCount===1}>Delete</button></div>
    <p className="aw-studio-label">Page appearance</p><div className="aw-studio-paper-options">{(["blank","ruled","grid","dotted"] as const).map(s=><button key={s} type="button" aria-pressed={paper===s} onClick={()=>choosePaper(s)}>{s}</button>)}</div></div>:
   <div className="aw-studio-settings"><p className="aw-notes-muted">The current page contains {parseStrokes(draft.strokes).length} saved drawing objects. Layer reordering is not yet available.</p></div>}
  </aside>
 </div>;
}
