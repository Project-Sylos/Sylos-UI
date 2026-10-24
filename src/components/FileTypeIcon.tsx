import type { LucideIcon } from "lucide-react";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  FolderOpen,
  Presentation,
} from "lucide-react";

import {
  categoryForFileName,
  type FileMimeCategory,
} from "../utils/fileCategory";
import "./FileTypeIcon.css";

const CATEGORY_ICONS: Record<FileMimeCategory, LucideIcon> = {
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  code: FileCode,
  pdf: FileType,
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
  size = 16,
  className = "",
  strokeWidth = 1.5,
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
