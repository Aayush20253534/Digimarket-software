"use client";
import {useEffect,useState} from "react";
import {useAuth} from "@/components/auth-provider";
type Client={id:string;businessName:string};
type Service={id:string;name:string;status:string};
type Page={items:Client[];nextCursor:string|null};
export function ServiceAllocationPicker({clientId,serviceId,onChange}:{clientId:string;serviceId:string;onChange:(clientId:string,serviceId:string)=>void}){
 const {session,request}=useAuth();
 const [clients,setClients]=useState<Client[]>([]);
 const [services,setServices]=useState<Service[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  if(!session?.identity.permissions.includes("clients.read"))return;
  let cancelled=false;
  void request<Page>("/clients?limit=100").then(r=>{if(!cancelled)setClients(r.items);}).catch(()=>{if(!cancelled)setError("Unable to load clients");});
  return()=>{cancelled=true;};
 },[request,session?.identity.userId]);
 useEffect(()=>{
  if(!clientId){setServices([]);setError("");return;}
  let cancelled=false;setLoading(true);
  void request<{services:Service[]}>("/clients/"+clientId).then(r=>{if(!cancelled){setServices(r.services.filter(x=>x.status==="ACTIVE"));setError("");}})
   .catch(()=>{if(!cancelled){setServices([]);setError("Unable to load active services");}})
   .finally(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;};
 },[clientId,request]);
 return <div className="grid gap-3 md:col-span-2 md:grid-cols-2" aria-label="Client service allocation">
  <label className="text-sm">Client
   <select className="field mt-1 w-full" aria-label="Allocation client" value={clientId} onChange={e=>onChange(e.target.value,"")}>
    <option value="">Internal task (no client)</option>
    {clientId&&!clients.some(x=>x.id===clientId)&&<option value={clientId}>Selected client</option>}
    {clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}
   </select>
  </label>
  <label className="text-sm">Agreed service
   <select className="field mt-1 w-full" aria-label="Allocation service" value={serviceId} disabled={!clientId||loading||!!error}
    onChange={e=>onChange(clientId,e.target.value)}>
    <option value="">{loading?"Loading services…":"No specific service"}</option>
    {services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
   </select>
  </label>
  {error&&<p role="alert" className="text-xs text-red-400 md:col-span-2">{error}</p>}
 </div>;
}
