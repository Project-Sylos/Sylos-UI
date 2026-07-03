import { ReactNode } from "react";
import "./FormSection.css";

export interface FormSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export default function FormSection({
  title,
  children,
  className = "",
}: FormSectionProps) {
  return (
    <div className={`form-section ${className}`}>
      <h2 className="form-section__title">{title}</h2>
      <div className="form-section__fields">{children}</div>
    </div>
  );
}
