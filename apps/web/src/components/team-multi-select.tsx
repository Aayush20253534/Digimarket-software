"use client";
import {useId,useMemo,useState} from "react";
import {Check,ChevronDown,Search,Users} from "lucide-react";
type Person={id:string;displayName:string};
export function TeamMultiSelect({label,options,value,onChange}:{label:string;options:Person[];value:string[];onChange:(ids:string[])=>void}){
 const id=useId(),[expanded,setExpanded]=useState(false),[search,setSearch]=useState("");
 const filtered=useMemo(()=>options.filter(x=>x.displayName.toLowerCase().includes(search.trim().toLowerCase())),[options,search]);
 const chosen=options.filter(x=>value.includes(x.id));
 return <div className="aw-team-select"><span id={id} className="mb-2 block text-sm font-semibold">{label}</span>
 <button type="button" className="aw-team-trigger" aria-labelledby={id} aria-expanded={expanded}
   onClick={()=>setExpanded(x=>!x)}><Users size={17}/><span>{chosen.length?chosen.map(x=>x.displayName).join(", "):"Choose team members"}</span><ChevronDown size={18}/></button>
 {expanded&&<div className="aw-team-options">
  <div className="aw-team-filter"><Search size={16}/><input aria-label={"Search "+label.toLowerCase()} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find an employee…"/></div>
  <div className="aw-team-options-list" role="group" aria-labelledby={id}>{filtered.map(person=><label key={person.id} className="aw-team-option">
    <input type="checkbox" aria-label={person.displayName} checked={value.includes(person.id)}
     onChange={e=>onChange(e.target.checked?[...value,person.id]:value.filter(k=>k!==person.id))}/>
     <span>{person.displayName}</span>{value.includes(person.id)&&<Check size={16}/>}</label>)}
    {!filtered.length&&<p className="p-3 text-sm">No matching employees</p>}</div>
  <button type="button" className="aw-team-done" onClick={()=>setExpanded(false)}>Done · {value.length} selected</button>
 </div>}
 <p className="mt-1 text-xs opacity-70">Use checkboxes to select multiple employees.</p>
 </div>;
}