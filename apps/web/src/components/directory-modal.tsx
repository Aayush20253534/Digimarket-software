"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Portal prevents transformed workspace panels from trapping position:fixed dialogs. */
export function DirectoryModal({title,description,onClose,children}:{
  title:string;description:string;onClose:()=>void;children:ReactNode;
}) {
  const panel=useRef<HTMLDivElement>(null);
  const close=useRef(onClose);
  close.current=onClose;
  useEffect(()=>{
    const prior=document.body.style.overflow;
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    document.body.style.overflow="hidden";
    const focusFrame=window.requestAnimationFrame(()=>{
      panel.current?.querySelector<HTMLInputElement>("input,select,textarea,button")?.focus();
    });
    function key(event:KeyboardEvent){
      if(event.key==="Escape"){event.preventDefault();close.current();return;}
      if(event.key!=="Tab"||!panel.current)return;
      const controls=Array.from(panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
      )).filter(x=>x.getClientRects().length>0);
      if(!controls.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
    document.addEventListener("keydown",key);
    return()=>{
      document.body.style.overflow=prior;
      document.removeEventListener("keydown",key);
      window.cancelAnimationFrame(focusFrame);
      previousFocus?.focus();
    };
  },[]);
  if(typeof document==="undefined")return null;
  return createPortal(
    <div className="aw-directory-modal-overlay" role="presentation" onMouseDown={e=>{
      if(e.target===e.currentTarget)onClose();
    }}>
      <div className="aw-directory-modal-panel" role="dialog" aria-modal="true"
        aria-label={title} aria-describedby="aw-directory-modal-description" ref={panel}>
        <header className="aw-directory-modal-header">
          <div><h2>{title}</h2><p id="aw-directory-modal-description">{description}</p></div>
          <button type="button" className="aw-directory-modal-dismiss"
            aria-label={"Close "+title} onClick={onClose}><X size={20}/></button>
        </header>
        <div className="aw-directory-modal-content">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/** The client details drawer is portaled to prevent the sticky top bar from
 * intercepting its close controls or blocking the workspace toolbar. */
export function DirectoryDetailsPortal({onClose,children}:{
  onClose:()=>void;children:ReactNode;
}) {
  const close=useRef(onClose);
  close.current=onClose;
  useEffect(()=>{
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();close.current();}
    };
    document.addEventListener("keydown",onKey);
    return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",onKey);};
  },[]);
  if(typeof document==="undefined")return null;
  return createPortal(
    <div className="aw-directory-details-shade aw-directory-details-portal"
      role="dialog" aria-modal="true" aria-label="Client details">
      <button type="button" className="aw-directory-details-backdrop" aria-label="Close client details"
        onClick={()=>close.current()}/>
      {children}
    </div>,document.body
  );
}
