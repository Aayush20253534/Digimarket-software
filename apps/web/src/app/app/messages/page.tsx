"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useAuth} from "@/components/auth-provider";
import {MessageCircle,Paperclip,Send,FileText,Download,Search,Users,CheckCheck,ArrowLeft,X} from "lucide-react";

type Person={id:string;displayName:string;loginId:string;avatarData:string|null;unreadCount:number};
type Attachment={name:string;mime:string;data:string};
type Message={id:string;senderId:string;recipientId:string;text:string;createdAt:string;
 noteSnapshot?:{title:string;kind:string;body:string}|null;attachment?:Attachment|null};

function MemberAvatar({person,size=44}:{person:Pick<Person,"displayName"|"avatarData">;size?:number}){
 const initials=person.displayName.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
 return person.avatarData?
  <img alt={person.displayName+" profile"} src={person.avatarData} className="aw-chat-avatar" style={{width:size,height:size}}/>:
  <span className="aw-chat-avatar aw-chat-avatar-fallback" style={{width:size,height:size}} aria-label={person.displayName+" initials"}>{initials||"?"}</span>;
}
export default function MessagesPage(){
 const {session,request}=useAuth();
 const [people,setPeople]=useState<Person[]>([]);
 const [peer,setPeer]=useState("");
 const [memberQuery,setMemberQuery]=useState("");
 const [items,setItems]=useState<Message[]>([]);
 const [draft,setDraft]=useState("");
 const [attachment,setAttachment]=useState<Attachment|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [loadingMembers,setLoadingMembers]=useState(true);
 const [loadingChat,setLoadingChat]=useState(false);
 const selectedRef=useRef("");
 const bottom=useRef<HTMLDivElement>(null);
 const threadRef=useRef<HTMLDivElement>(null);
 const userId=session?.identity.userId;

 const reloadMembers=useCallback(async()=>{
  if(!session)return;
  try{
   const response=await request<{items:Person[]}>("/messages/users");
   setPeople(response.items);
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"Cannot load members");}
  finally{setLoadingMembers(false);}
 },[request,session]);
 useEffect(()=>{
  if(!session)return;
  void reloadMembers();
  const handle=window.setInterval(()=>{if(document.visibilityState==="visible")void reloadMembers();},12000);
  return()=>window.clearInterval(handle);
 },[session,reloadMembers]);

 const loadThread=useCallback(async(target:string)=>{
  if(!target)return;
  try{
   const data=await request<{items:Message[]}>("/messages?with="+encodeURIComponent(target));
   if(selectedRef.current!==target)return;
   setItems(data.items);
   if(document.visibilityState==="visible"){
    await request("/messages/read/"+target,{method:"POST",body:{}});
    if(selectedRef.current===target)setPeople(prev=>prev.map(p=>p.id===target?{...p,unreadCount:0}:p));
   }
   setError("");
  }catch(e){if(selectedRef.current===target)setError(e instanceof Error?e.message:"Conversation could not load");}
  finally{if(selectedRef.current===target)setLoadingChat(false);}
 },[request]);
 useEffect(()=>{
  if(!peer)return;
  let active=true;
  setLoadingChat(true);setItems([]);
  void loadThread(peer);
  const handle=window.setInterval(()=>{if(active&&document.visibilityState==="visible")void loadThread(peer);},8000);
  const onFocus=()=>{if(active)void loadThread(peer);};
  window.addEventListener("focus",onFocus);
  return()=>{active=false;window.clearInterval(handle);window.removeEventListener("focus",onFocus);};
 },[peer,loadThread]);
 useEffect(()=>{
  const node=threadRef.current;
  if(node)node.scrollTop=node.scrollHeight;
 },[items.length,peer]);

 const choose=(id:string)=>{
  if(peer===id){void loadThread(id);return;}
  selectedRef.current=id;
  setPeer(id);setDraft("");setAttachment(null);setError("");
 };
 const send=async()=>{
  if(!peer||(!draft.trim()&&!attachment)||busy)return;
  setBusy(true);setError("");
  try{
   await request("/messages",{method:"POST",body:{recipientId:peer,text:draft,...(attachment?{attachment}:{})}});
   setDraft("");setAttachment(null);
   await loadThread(peer);await reloadMembers();
  }catch(e){setError(e instanceof Error?e.message:"Message could not be sent");}
  finally{setBusy(false);}
 };
 const addFile=(file?:File)=>{
  if(!file)return;
  if(file.size>1024*1024){setError("Attachments must be 1 MB or smaller.");return;}
  const reader=new FileReader();
  reader.onload=()=>setAttachment({name:file.name,mime:file.type||"application/octet-stream",data:String(reader.result)});
  reader.onerror=()=>setError("File could not be read.");
  reader.readAsDataURL(file);
 };
 const current=people.find(p=>p.id===peer);
 const filtered=people.filter(p=>(p.displayName+" "+p.loginId).toLowerCase().includes(memberQuery.trim().toLowerCase()));
 return <div className="aw-messages-page" data-testid="workspace-messages">
  <aside className="aw-chat-directory" aria-label="Workspace conversations">
   <div className="aw-chat-directory-header">
    <div><span className="aw-chat-eyebrow">TEAM WORKSPACE</span><h1>Messages</h1></div>
    <span className="aw-chat-contact-count">{people.length}</span>
   </div>
   <label className="aw-chat-search"><Search size={17}/><input aria-label="Search available members" placeholder="Search members..." value={memberQuery} onChange={e=>setMemberQuery(e.target.value)}/></label>
   <div className="aw-chat-directory-caption">DIRECT MESSAGES</div>
   <div className="aw-chat-contacts">
    {filtered.map(person=><button type="button" className="aw-chat-contact" key={person.id}
      aria-current={peer===person.id?"true":undefined} onClick={()=>choose(person.id)}>
      <MemberAvatar person={person}/>
      <span className="aw-chat-contact-details"><strong>{person.displayName}</strong><small>@{person.loginId}</small></span>
      {person.unreadCount>0&&<span aria-label={person.unreadCount+" unread messages"} className="aw-chat-unread">+{person.unreadCount>99?"99":person.unreadCount}</span>}
    </button>)}
    {loadingMembers&&<p className="aw-chat-empty-list">Loading members…</p>}
    {!loadingMembers&&!filtered.length&&<p className="aw-chat-empty-list">{memberQuery?"No matching members.":"No other active team members."}</p>}
   </div>
  </aside>
  <section className="aw-chat-conversation" aria-label="Direct message conversation">
   {current?<><header className="aw-chat-conversation-header">
     <button type="button" className="aw-chat-back" aria-label="Back to conversations" onClick={()=>choose("")}><ArrowLeft size={19}/></button>
     <MemberAvatar person={current} size={46}/>
     <div className="aw-chat-peer-label"><h2>{current.displayName}</h2><p>@{current.loginId} · Private conversation</p></div>
     <span className="aw-chat-header-status"><CheckCheck size={16}/> Team member</span>
    </header>
    <div className="aw-chat-thread" ref={threadRef} role="log" aria-label={"Messages with "+current.displayName}>
     {loadingChat&&!items.length&&<div className="aw-chat-placeholder">Loading conversation…</div>}
     {!loadingChat&&!items.length&&<div className="aw-chat-placeholder"><MessageCircle size={39}/><strong>Start a conversation</strong><span>Messages and files shared here are only visible to participants.</span></div>}
     {items.map(m=><div key={m.id} className={"aw-chat-message "+(m.senderId===userId?"aw-chat-message-own":"aw-chat-message-other")}>
       {m.senderId!==userId&&<MemberAvatar person={current} size={30}/>}
       <div className="aw-chat-message-bubble">
        {m.text&&<p>{m.text}</p>}
        {m.noteSnapshot&&<div className="aw-chat-note-attachment"><FileText size={18}/>
         <div><strong>{m.noteSnapshot.title}</strong><small>{m.noteSnapshot.kind} note</small>
          {m.senderId!==userId&&<Link href={"/app/notes?shared="+m.id}>Open in Notes</Link>}
         </div></div>}
        {m.attachment&&<a className="aw-chat-file-link" download={m.attachment.name} href={m.attachment.data}>
         <Download size={17}/>{m.attachment.name}</a>}
        <time>{new Date(m.createdAt).toLocaleString(undefined,{hour:"numeric",minute:"2-digit",month:"short",day:"numeric"})}</time>
       </div>
      </div>)}
     <div ref={bottom}/>
    </div>
    <div className="aw-chat-composer">
     {attachment&&<div className="aw-chat-upload-preview"><Paperclip size={16}/><span>{attachment.name}</span>
       <button type="button" aria-label="Remove attachment" onClick={()=>setAttachment(null)}><X size={16}/></button></div>}
     <form onSubmit={e=>{e.preventDefault();void send();}} className="aw-chat-compose-row">
      <label className="aw-chat-attach" title="Attach a file up to 1 MB"><Paperclip size={21}/>
       <input aria-label="Attach file" type="file" onChange={e=>{addFile(e.target.files?.[0]);e.target.value="";}}/>
      </label>
      <input className="aw-chat-input" aria-label="Message" placeholder={"Message "+current.displayName+"..."} value={draft} onChange={e=>setDraft(e.target.value)}/>
      <button type="submit" className="aw-chat-send" disabled={busy||(!draft.trim()&&!attachment)} aria-label="Send message"><Send size={19}/></button>
     </form>
    </div>
   </>:<div className="aw-chat-blank"><span className="aw-chat-blank-icon"><Users size={40}/></span>
     <h2>Your team conversations</h2><p>Choose someone from the member list to send a message, a file, or a shared note.</p>
     <Link href="/app/notes">Open Notes Studio</Link></div>}
   {error&&<p role="alert" className="aw-chat-error">{error}</p>}
  </section>
 </div>;
}
