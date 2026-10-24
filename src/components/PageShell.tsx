import type { CSSProperties, ReactNode } from "react";

import "../styles/components/surface.css";

type PageShellProps = {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/** Plain full-size page wrapper; surfaces inside a page carry their own borders. */
export function PageShell({
  className = "",
  style,
  children,
}: PageShellProps) {
  const merged = ["page-shell", className].filter(Boolean).join(" ");
  return (
    <div className={merged} style={style}>
      {children}
    </div>
  );
}
