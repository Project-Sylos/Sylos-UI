import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Braces,
  CirclePlay,
  File,
  FileText,
  FolderOpen,
  Image,
  Music,
  NotebookText,
  Presentation,
  Table2,
} from "lucide-react";

import {
  categoryForFileName,
  type FileMimeCategory,
} from "../utils/fileCategory";
import "./FileTypeIcon.css";

/**
 * Category glyphs use distinct silhouettes (not Lucide's File* family) so they
 * stay readable at list sizes (~16–18px).
 */
const CATEGORY_ICONS: Record<FileMimeCategory, LucideIcon> = {
  document: FileText,
  spreadsheet: Table2,
  presentation: Presentation,
  image: Image,
  video: CirclePlay,
  audio: Music,
  archive: Archive,
  code: Braces,
  pdf: NotebookText,
  other: File,
};

export type FileTypeIconProps = {
  name: string;
  type: "folder" | "file";
  size?: number;
  className?: string;
  strokeWidth?: number;
};

/** Decorative folder / category file glyph from basename extension. */
export default function FileTypeIcon({
  name,
  type,
  size = 18,
  className = "",
  strokeWidth = 1.75,
}: FileTypeIconProps) {
  if (type === "folder") {
    return (
      <FolderOpen
        size={size}
        strokeWidth={strokeWidth}
        aria-hidden="true"
        className={`file-type-icon file-type-icon--folder ${className}`.trim()}
      />
    );
  }

  const category = categoryForFileName(name);
  const Icon = CATEGORY_ICONS[category];
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      className={`file-type-icon file-type-icon--file file-type-icon--${category} ${className}`.trim()}
    />
  );
}
