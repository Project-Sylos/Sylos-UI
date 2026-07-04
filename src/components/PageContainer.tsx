import { ReactNode } from "react";

import PageBackButton from "./PageBackButton";
import { GlassSurfacePanel } from "./GlassSurfacePanel";
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
  maxWidth = "min(960px, 100%)",
}: PageContainerProps) {
  return (
    <section className={`page-container ${className}`}>
      <GlassSurfacePanel
        className={`page-container__content ${contentClassName}`.trim()}
        style={{ maxWidth }}
      >
        {onBack && (
          <PageBackButton
            onClick={onBack}
            title={backTitle}
            className="page-container__back"
          />
        )}
        {children}
      </GlassSurfacePanel>
    </section>
  );
}
