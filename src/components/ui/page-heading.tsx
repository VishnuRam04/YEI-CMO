import type { ReactNode } from "react";

export function PageHeading({ eyebrow, title, description, actions }: {
  eyebrow: string; title: string; description: string; actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="lede">{description}</p></div>
      {actions && <div style={{ display: "flex", gap: 9 }}>{actions}</div>}
    </div>
  );
}
