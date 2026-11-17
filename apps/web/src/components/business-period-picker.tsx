"use client";
import {AGENCY_START_DATE,businessCycle,cycleLabel,reportingPreset,type ReportingPeriod} from "@digimarket/contracts";

export function BusinessPeriodPicker({value,onChange,disabled=false}:{
  value:ReportingPeriod;onChange:(period:ReportingPeriod)=>void;disabled?:boolean
}) {
  const cycle=businessCycle(value.from);
  const exact=cycle.from===value.from&&cycle.to===value.to;
  return <section className="rounded-xl border border-white/10 p-4 space-y-3" aria-label="Work cycle">
    <div className="flex flex-wrap gap-2 items-center">
      <strong>{exact?cycleLabel(cycle.key):"Custom reporting period"}</strong>
      <button type="button" className="btn-secondary" disabled={disabled||value.from<=AGENCY_START_DATE}
        onClick={()=>{const previous=businessCycle(value.from,-1);onChange({from:previous.from<AGENCY_START_DATE?AGENCY_START_DATE:previous.from,to:previous.to});}}>Previous cycle</button>
      <button type="button" className="btn-secondary" disabled={disabled} onClick={()=>onChange(reportingPreset("current"))}>Current cycle</button>
      <button type="button" className="btn-secondary" disabled={disabled} onClick={()=>onChange(businessCycle(value.from,1))}>Next cycle</button>
      <button type="button" className="btn-secondary" disabled={disabled} onClick={()=>onChange(reportingPreset("all"))}>Since 22 Oct 2026</button>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">From<input className="field block" type="date" aria-label="Work cycle from" required disabled={disabled}
        value={value.from} max={value.to} onChange={event=>{if(event.target.value)onChange({...value,from:event.target.value});}}/></label>
      <label className="text-sm">Through (inclusive)<input className="field block" type="date" aria-label="Work cycle through" required disabled={disabled}
        value={value.to} min={value.from} onChange={event=>{if(event.target.value)onChange({...value,to:event.target.value});}}/></label>
      <p className="text-sm opacity-70">The 22nd starts each cycle in India. The closing 22nd belongs to the next cycle.</p>
    </div>
  </section>;
}
