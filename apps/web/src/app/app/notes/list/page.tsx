"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {BookOpen,Search,FileText,PenLine,ArrowLeft,Star} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
type Note={id:string;title:string;kind:"typed"|"handwritten";strokes?:string;updatedAt:string;starred:boolean};
type Point=[number,number,number?];
type PreviewStroke={points:Point[];color:string;width:number};
function preview(strokes?:string):PreviewStroke[]{
 try{
  const parsed=JSON.parse(strokes||"[]");
  if(!Array.isArray(parsed))return[];
  return parsed.slice(0,80).filter((item):item is PreviewStroke=>Array.isArray(item.points)&&typeof item.color==="string"&&typeof item.width==="number");
 }catch{return[];}
}
export default function NotesListPage(){
 const {session,request}=useAuth();
 const [notes,setNotes]=useState<Note[]>([]);
 const [search,setSearch]=useState("");
 const [error,setError]=useState("");
 useEffect(()=>{if(!session)return;void request<{items:Note[]}>("/notes").then(x=>setNotes(x.items)).catch(e=>setError(e instanceof Error?e.message:"Unable to load notes"));},[session,request]);
 const filtered=useMemo(()=>notes.filter(n=>n.title.toLowerCase().includes(search.toLowerCase())),[notes,search]);
 return <main className="aw-notes-list-page">
  <header className="aw-notes-list-header">
   <Link href="/app/notes" className="aw-notes-list-back"><ArrowLeft size={19}/> Notes Studio</Link>
   <div><h1>My Notes List</h1><p>Private notes saved in your workspace, displayed as files.</p></div>
   <span>{filtered.length} saved notes</span>
  </header>
  <label className="aw-notes-list-search"><Search size={19}/><input aria-label="Search saved notes" placeholder="Search my notes..." value={search} onChange={e=>setSearch(e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  <section aria-label="Saved notes grid" className="aw-notes-list-grid">
   {filtered.map(n=><Link key={n.id} href={"/app/notes?note="+encodeURIComponent(n.id)} className="aw-notes-list-card">
     <span className={"aw-notes-list-thumbnail "+(n.kind==="handwritten"?"aw-notes-thumb-ink":"aw-notes-thumb-text")}>
      {n.kind==="handwritten"&&preview(n.strokes).length?<svg viewBox="0 0 900 520" role="img" aria-label="Handwritten note preview">
       {preview(n.strokes).map((stroke,i)=><polyline key={i} points={stroke.points.map(p=>p[0]*900+","+p[1]*520).join(" ")}
        fill="none" stroke={stroke.color} strokeWidth={Math.max(3,stroke.width*2)} strokeLinecap="round"/>)}
      </svg>:n.kind==="typed"?<><FileText size={30}/><span className="aw-notes-typed-lines" aria-hidden="true"><i/><i/><i/><i/></span></>:<PenLine size={37}/>}
     </span>
     <span className="aw-notes-card-meta"><span>{n.kind==="typed"?"Typed document":"Handwritten document"}</span>{n.starred&&<Star size={13} fill="currentColor"/>}</span>
     <strong>{n.title||"Untitled"}</strong>
     <time>Edited {new Date(n.updatedAt).toLocaleString()}</time>
   </Link>)}
  </section>
  {filtered.length===0&&!error&&<div className="aw-notes-list-empty"><BookOpen size={36}/><p>No matching saved notes.</p></div>}
 </main>;
}
