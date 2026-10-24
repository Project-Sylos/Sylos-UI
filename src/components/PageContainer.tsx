import { ReactNode } from "react";

import PageBackButton from "./PageBackButton";
import { PageShell } from "./PageShell";
import "./PageContainer.css";

export type PageContainerProps = {
  children: ReactNode;
  onBack?: () => void;
  backTitle?: string;
  className?: string;
  contentClassName?: string;
  maxWidth?: string;
};

export default function PageContainer({
  children,
  onBack,
  backTitle = "Go back",
  className = "",
  contentClassName = "",
}: PageContainerProps) {
  return (
    <section className={`page-container ${className}`}>
      {onBack && (
        <PageBackButton
          onClick={onBack}
          title={backTitle}
          className="page-container__back"
        />
      )}
      <PageShell className={`page-container__content ${contentClassName}`.trim()}>
        {children}
      </PageShell>
    </section>
  );
}
