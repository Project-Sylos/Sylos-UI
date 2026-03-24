import type { CSSProperties, ReactNode } from "react";

import "../styles/components/glass-container.css";

type GlassSurfacePanelProps = {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/**
 * Primary frosted glass shell used by full-page layouts.
 * Visual tokens live in `.glass-surface--panel` (glass-container.css).
 */
export function GlassSurfacePanel({
  className = "",
  style,
  children,
}: GlassSurfacePanelProps) {
  const merged = ["glass-surface--panel", className].filter(Boolean).join(" ");
  return (
    <div className={merged} style={style}>
      {children}
    </div>
  );
}
