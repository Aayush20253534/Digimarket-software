"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {BookOpen,Search,FileText,PenLine,ArrowLeft} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
type Note={id:string;title:string;kind:"typed"|"handwritten";updatedAt:string;starred:boolean};
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
   <span>{filtered.length} notes</span>
  </header>
  <label className="aw-notes-list-search"><Search size={19}/><input aria-label="Search saved notes" placeholder="Search my notes..." value={search} onChange={e=>setSearch(e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  <section aria-label="Saved notes grid" className="aw-notes-list-grid">
   {filtered.map(n=><Link key={n.id} href={"/app/notes?note="+encodeURIComponent(n.id)} className="aw-notes-list-card">
     <span className="aw-notes-list-thumbnail">{n.kind==="typed"?<FileText size={37}/>:<PenLine size={37}/>}</span>
     <strong>{n.title}</strong><small>{n.kind==="typed"?"Typed note":"Handwritten note"}{n.starred?" · Starred":""}</small>
     <time>{new Date(n.updatedAt).toLocaleString()}</time>
   </Link>)}
  </section>
  {filtered.length===0&&!error&&<div className="aw-notes-list-empty"><BookOpen size={36}/><p>No matching saved notes.</p></div>}
 </main>;
}
