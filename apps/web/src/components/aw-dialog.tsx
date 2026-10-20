"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AWButton } from "./aw-ui";

export function AWDialog({ open, onClose, title, description, children, actions }: {
  open: boolean; onClose: () => void; title: string; description?: string;
  children?: ReactNode; actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog
    ref={ref}
    aria-labelledby="aw-dialog-title"
    aria-describedby={description ? "aw-dialog-description" : undefined}
    className="aw-dialog"
    onClose={onClose}
  >
    <div className="aw-dialog-content">
      <div className="flex items-start justify-between gap-4">
        <div><h2 id="aw-dialog-title" className="aw-dialog-title">{title}</h2>
          {description && <p id="aw-dialog-description" className="aw-dialog-description">{description}</p>}
        </div>
        <AWButton variant="ghost" small onClick={onClose} aria-label="Close dialog">✕</AWButton>
      </div>
      {children}
      {actions && <div className="aw-dialog-actions">{actions}</div>}
    </div>
  </dialog>;
}
