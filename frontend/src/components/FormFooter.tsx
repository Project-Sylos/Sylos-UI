import { ReactNode } from "react";
import "./FormFooter.css";

export interface FormFooterProps {
  children: ReactNode;
  className?: string;
}

export default function FormFooter({
  children,
  className = "",
}: FormFooterProps) {
  return (
    <div className={`form-footer ${className}`}>
      {children}
    </div>
  );
}
