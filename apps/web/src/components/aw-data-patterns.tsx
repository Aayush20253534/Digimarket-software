"use client";

import type { ChangeEvent, ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { AWBadge, AWInput, AWSelect } from "@/components/aw-ui";

export function AWStat({ label, value, description, icon, accent = false }: {
  label: string; value: ReactNode; description: string; icon: ReactNode; accent?: boolean;
}) {
  return <article className={"aw-stat" + (accent ? " aw-stat-accent" : "")}>
    <div className="flex items-center justify-between gap-2">
      <span className="aw-stat-label">{label}</span>
      <span className="aw-stat-icon" aria-hidden="true">{icon}</span>
    </div>
    <div className="aw-stat-value">{value}</div>
    <p className="aw-stat-description">{description}</p>
  </article>;
}

export function AWPanel({ title, description, action, children, className = "" }: {
  title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={"aw-panel " + className}>
    <div className="aw-panel-head">
      <div className="min-w-0"><h2 className="aw-panel-heading">{title}</h2>
        {description && <p className="aw-panel-description">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>;
}

export function AWDataToolbar({ query, onQuery, placeholder = "Search records",
  filter, onFilter, choices, label = "Filter by type", count, action
}: {
  query: string; onQuery: (value:string)=>void; placeholder?:string;
  filter: string; onFilter: (value:string)=>void;
  choices: readonly {label:string;value:string}[];
  label?:string; count:number; action?:ReactNode;
}) {
  return <div className="aw-data-toolbar">
    <label className="aw-data-search">
      <Search size={17} aria-hidden="true" />
      <span className="sr-only">{placeholder}</span>
      <AWInput aria-label={placeholder} placeholder={placeholder} value={query}
        onChange={(e:ChangeEvent<HTMLInputElement>)=>onQuery(e.target.value)} />
    </label>
    <div className="aw-data-actions">
      <AWSelect aria-label={label} value={filter} onChange={e=>onFilter(e.target.value)}
        className="aw-data-filter">
        {choices.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
      </AWSelect>
      <AWBadge tone="neutral">{count} visible</AWBadge>
      {action}
    </div>
  </div>;
}

export function AWSortButton({ label, descending, onClick }: {
  label:string; descending:boolean; onClick:()=>void;
}) {
  return <button type="button" onClick={onClick}
    className="aw-sort-button" aria-label={"Sort "+label+" "+(descending?"ascending":"descending")}>
    {label}{descending?<ArrowDown size={13} aria-hidden="true"/>:<ArrowUp size={13} aria-hidden="true"/>}
  </button>;
}

export function AWLocalPagination({ page, pages, onPage }: {
  page:number;pages:number;onPage:(next:number)=>void;
}) {
  return <div className="aw-pagination">
    <span>Page {page} of {Math.max(pages,1)}</span>
    <div className="flex items-center gap-2">
      <button className="aw-page-button" type="button" disabled={page<=1}
        aria-label="Previous page" onClick={()=>onPage(page-1)}><ChevronLeft size={17}/></button>
      <button className="aw-page-button" type="button" disabled={page>=pages}
        aria-label="Next page" onClick={()=>onPage(page+1)}><ChevronRight size={17}/></button>
    </div>
  </div>;
}
