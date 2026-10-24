import type { LucideIcon } from "lucide-react";
import { Cloud, Database, FolderOpen, HardDrive, Server } from "lucide-react";

import "./DerivedServiceIcon.css";

/** Lucide-backed endpoint kinds (not provider logo images). */
export type DerivedServiceKind =
  | "local"
  | "spectra"
  | "sftp"
  | "cloud"
  | "default";

const KIND_ICONS: Record<DerivedServiceKind, LucideIcon> = {
  local: FolderOpen,
  spectra: Database,
  sftp: Server,
  cloud: Cloud,
  default: HardDrive,
};

export type DerivedServiceIconProps = {
  kind: DerivedServiceKind;
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Sidebar uses HardDrive for local; selection keeps FolderOpen. */
  localIcon?: "folder" | "drive";
};

/** Resolve kind from service id / type strings used on roots and selection cards. */
export function derivedServiceKind(
  serviceId?: string | null,
  serviceType?: string | null
): DerivedServiceKind {
  const id = (serviceId || "").trim().toLowerCase();
  const type = (serviceType || "").trim().toLowerCase();
  const key = id || type;
  if (type === "local" || key === "local") return "local";
  if (type === "spectra" || key === "spectra") return "spectra";
  if (type === "sftp" || key === "sftp") return "sftp";
  if (type === "cloud" || key === "cloud") return "cloud";
  return "default";
}

/**
 * Brand-cartoon Lucide glyph: neon stroke over brand-ink outline.
 * Provider logos stay as plain images elsewhere.
 */
export default function DerivedServiceIcon({
  kind,
  size = 16,
  className = "",
  strokeWidth = 2,
  localIcon = "folder",
}: DerivedServiceIconProps) {
  const Icon =
    kind === "local" && localIcon === "drive" ? HardDrive : KIND_ICONS[kind];
  const inkStroke = strokeWidth + 1.25;

  return (
    <span
      className={`derived-service-icon-stack ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon
        size={size}
        strokeWidth={inkStroke}
        className="derived-service-icon derived-service-icon--ink"
      />
      <Icon
        size={size}
        strokeWidth={strokeWidth}
        className={`derived-service-icon derived-service-icon--${kind}`}
      />
    </span>
  );
}
