"use client";
import type { ButtonHTMLAttributes } from "react";
export function BigButton({
  icon,
  title,
  description,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <button {...props} className={`entry-button ${props.className ?? ""}`}>
      <span className="entry-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span aria-hidden="true">↗</span>
    </button>
  );
}
