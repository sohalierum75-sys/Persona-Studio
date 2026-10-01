import type { ReactNode } from "react";

export function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`surface ${className}`}>{children}</section>;
}

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="section-header"><div><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</div>;
}
