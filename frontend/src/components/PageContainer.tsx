import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { GlassSurfacePanel } from "./GlassSurfacePanel";
import "./PageContainer.css";

export type PageContainerProps = {
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string | ReactNode;
  className?: string;
  contentClassName?: string;
  maxWidth?: string;
};

export default function PageContainer({
  children,
  onBack,
  backLabel = "← Back",
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
          <button
            type="button"
            className="page-container__back"
            onClick={onBack}
          >
            {typeof backLabel === "string" && backLabel.includes("←") ? (
              backLabel
            ) : (
              <>
                <ArrowLeft size={16} style={{ marginRight: "0.5rem" }} />
                {backLabel}
              </>
            )}
          </button>
        )}
        {children}
      </GlassSurfacePanel>
    </section>
  );
}
