import type {
  ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode,
  SelectHTMLAttributes, TextareaHTMLAttributes
} from "react";

function join(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export type AWButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  small?: boolean;
};

export function AWButton({ variant = "primary", small = false, className, type = "button", ...props }: AWButtonProps) {
  return <button type={type} className={join("aw-button", "aw-button-" + variant, small && "aw-button-sm", className)} {...props} />;
}

export function AWCard({ title, description, action, children, className, ...props }: HTMLAttributes<HTMLElement> & {
  title?: string; description?: string; action?: ReactNode;
}) {
  return <section className={join("aw-card", className)} {...props}>
    {(title || description || action) && <div className="aw-card-header">
      <div>{title && <h2 className="aw-card-title">{title}</h2>}{description && <p className="aw-card-description">{description}</p>}</div>
      {action}
    </div>}
    {children}
  </section>;
}

export function AWPageHeader({ eyebrow, title, description, action, className }: {
  eyebrow?: string; title: string; description?: string; action?: ReactNode; className?: string;
}) {
  return <header className={join("flex min-w-0 flex-wrap items-end justify-between gap-4", className)}>
    <div className="min-w-0">{eyebrow && <p className="aw-eyebrow">{eyebrow}</p>}
      <h1 className="aw-heading">{title}</h1>
      {description && <p className="aw-description">{description}</p>}
    </div>
    {action}
  </header>;
}

export function AWFormField({ label, id, help, children, className }: {
  label: string; id: string; help?: string; children: ReactNode; className?: string;
}) {
  return <div className={className}>
    <label htmlFor={id} className="aw-label">{label}</label>
    {children}
    {help && <p className="aw-help">{help}</p>}
  </div>;
}

export function AWInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={join("aw-field", className)} {...props} />;
}
export function AWSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={join("aw-field", className)} {...props}>{children}</select>;
}
export function AWTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={join("aw-field", className)} {...props} />;
}

export type AWTone = "neutral" | "accent" | "success" | "warning" | "danger";
export function AWBadge({ children, tone = "neutral", className }: {
  children: ReactNode; tone?: AWTone; className?: string;
}) {
  return <span className={join("aw-badge", "aw-badge-" + tone, className)}>{children}</span>;
}

export function AWStatusBadge({ status, className }: { status: string; className?: string }) {
  const upper = status.toUpperCase();
  const tone: AWTone = ["ACTIVE","APPROVED","PAID","DONE","SUCCESS","PUBLISHED"].includes(upper) ? "success"
    : ["PENDING","INVITED","DRAFT","IN_REVIEW","SUBMITTED"].includes(upper) ? "warning"
    : ["DISABLED","REJECTED","FAILED","OVERDUE","VOID"].includes(upper) ? "danger" : "neutral";
  return <AWBadge className={className} tone={tone}>{status.replaceAll("_", " ")}</AWBadge>;
}

export function AWTable({ children, label, className, tableClassName, ...props }:
  HTMLAttributes<HTMLDivElement> & { label: string; tableClassName?: string; children: ReactNode }) {
  return <div className={join("aw-table-scroll", className)} {...props}>
    <table className={join("aw-table", tableClassName)} aria-label={label}>{children}</table>
  </div>;
}

export function AWNotice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "error" }) {
  return <div role={tone === "error" ? "alert" : "status"} className={join("aw-notice", "aw-notice-" + tone)}>{children}</div>;
}

export function AWEmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="aw-empty">
    <p className="aw-empty-title">{title}</p>
    <p className="mt-2 text-sm leading-6">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>;
}

export function AWSkeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="presentation" aria-hidden="true" className={join("aw-skeleton", className)} {...props} />;
}
