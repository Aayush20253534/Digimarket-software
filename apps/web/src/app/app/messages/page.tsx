"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useAuth} from "@/components/auth-provider";
import {MessageCircle,Paperclip,Send,FileText,Download} from "lucide-react";

type Person={id:string;displayName:string;loginId:string;avatarData:string|null};
type Message={id:string;senderId:string;recipientId:string;text:string;createdAt:string;noteSnapshot?:{title:string;kind:string;body:string}|null;attachment?:{name:string;mime:string;data:string}|null};
export default function MessagesPage(){
 const {session,request}=useAuth();
 const [people,setPeople]=useState<Person[]>([]),[peer,setPeer]=useState("");
 const [items,setItems]=useState<Message[]>([]),[text,setText]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [file,setFile]=useState<{name:string;mime:string;data:string}|null>(null);
 const bottom=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!session)return;void request<{items:Person[]}>("/messages/users").then(x=>setPeople(x.items)).catch(e=>setError(String(e)));},[session,request]);
 useEffect(()=>{if(!peer)return;let cancelled=false;
 const reload=()=>request<{items:Message[]}>("/messages?with="+encodeURIComponent(peer)).then(x=>{if(!cancelled)setItems(x.items);}).catch(e=>{if(!cancelled)setError(String(e));});
 void reload();const id=window.setInterval(()=>void reload(),12000);return()=>{cancelled=true;window.clearInterval(id);};
 },[peer,request]);
 useEffect(()=>{bottom.current?.scrollIntoView({behavior:"smooth"});},[items.length]);
 const send=async()=>{if(!peer||(!text.trim()&&!file)||busy)return;setBusy(true);setError("");
  try{await request("/messages",{method:"POST",body:{recipientId:peer,text, ...(file?{attachment:file}:{})}});setText("");setFile(null);
   const response=await request<{items:Message[]}>("/messages?with="+peer);setItems(response.items);
  }catch(e){setError(e instanceof Error?e.message:"Message failed");}finally{setBusy(false);}
 };
 const upload=(f:File|undefined)=>{if(!f)return;if(f.size>1024*1024){setError("Maximum attachment size is 1 MB");return;}
  const reader=new FileReader();reader.onload=()=>setFile({name:f.name,mime:f.type||"application/octet-stream",data:String(reader.result)});reader.readAsDataURL(f);
 };
 return <div style={{display:"grid",gridTemplateColumns:"minmax(180px,260px) 1fr",gap:16,minHeight:"70vh",color:"#f3e9ff"}}>
  <aside style={{background:"#170e26",borderRadius:18,padding:14}}>
   <h1 style={{fontSize:20,fontWeight:700,marginBottom:16}}>Messages</h1>
   {people.map(u=><button key={u.id} type="button" onClick={()=>setPeer(u.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",padding:10,marginBottom:6,borderRadius:12,background:peer===u.id?"#663393":"#281738",color:"white"}}>
    {u.avatarData?<img src={u.avatarData} alt="" style={{width:36,height:36,borderRadius:"50%",objectFit:"cover"}}/>:<MessageCircle size={24}/>}
    <span><strong style={{display:"block"}}>{u.displayName}</strong><small>{u.loginId}</small></span>
   </button>)}
   {!people.length&&<p>No other active members.</p>}
  </aside>
  <section style={{background:"#120c20",border:"1px solid #55316d",borderRadius:18,padding:16,display:"flex",flexDirection:"column",minWidth:0}}>
   {peer?<><h2 style={{fontSize:19,fontWeight:700,borderBottom:"1px solid #55316d",paddingBottom:12}}>{people.find(p=>p.id===peer)?.displayName}</h2>
    <div style={{flex:1,overflowY:"auto",maxHeight:"60vh",padding:"20px 0"}}>
     {items.map(m=><div key={m.id} style={{maxWidth:"85%",margin:m.senderId===session?.user.id?"10px 0 10px auto":"10px auto 10px 0",background:m.senderId===session?.user.id?"#4d236b":"#2a2037",padding:13,borderRadius:14,overflowWrap:"anywhere"}}>
      {m.text&&<p style={{whiteSpace:"pre-wrap"}}>{m.text}</p>}
      {m.noteSnapshot&&<div style={{marginTop:8,padding:12,background:"#170e26",borderRadius:10}}><FileText size={20}/><strong>{m.noteSnapshot.title}</strong><p>{m.noteSnapshot.kind} note</p>
       {m.senderId!==session?.user.id&&<Link href={"/app/notes?shared="+m.id} style={{display:"inline-block",padding:8,background:"#8742c2",borderRadius:7}}>Open in Notes</Link>}
       {m.senderId===session?.user.id&&<p>Shared note</p>}
      </div>}
      {m.attachment&&<a href={m.attachment.data} download={m.attachment.name} style={{display:"flex",gap:8,padding:8,textDecoration:"underline"}}><Download size={16}/>{m.attachment.name}</a>}
      <small style={{opacity:.65,display:"block",marginTop:6}}>{new Date(m.createdAt).toLocaleString()}</small>
     </div>)}<div ref={bottom}/>
    </div>
    {file&&<div style={{padding:10}}>Attached: {file.name} <button type="button" onClick={()=>setFile(null)}>Remove</button></div>}
    <div style={{display:"flex",gap:10}}>
     <label title="Attach a file (up to 1 MB)" style={{cursor:"pointer",padding:10}}><Paperclip size={21}/><input type="file" style={{display:"none"}} onChange={e=>upload(e.target.files?.[0])}/></label>
     <input aria-label="Message" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void send();}} placeholder="Write a message..." style={{flex:1,minWidth:0,background:"#281936",border:"1px solid #654078",padding:12,borderRadius:10,color:"#fff"}}/>
     <button type="button" disabled={busy||(!text.trim()&&!file)} onClick={()=>void send()} style={{background:"#8534c3",padding:12,borderRadius:10}}><Send size={20}/></button>
    </div>
   </>:<div style={{margin:"auto",textAlign:"center"}}><MessageCircle size={42}/><p>Select a teammate to start messaging.</p><Link href="/app/notes">My notes</Link></div>}
   {error&&<p role="alert" style={{color:"#ff9ba5",marginTop:10}}>{error}</p>}
  </section>
 </div>;
}
