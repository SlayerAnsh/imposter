import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
}

export function Card({ title, children, className = "", ...rest }: CardProps) {
  return (
    <div {...rest} className={`imp-card ${className}`.trim()}>
      {title ? <div className="imp-card-title">{title}</div> : null}
      <div className="imp-card-body">{children}</div>
    </div>
  );
}
