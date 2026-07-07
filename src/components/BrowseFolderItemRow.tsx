import { ChevronRight, File, FolderOpen } from "lucide-react";

import ListItemMeta from "./ListItemMeta";

interface BrowseFolderItemRowProps {
  name: string;
  path: string;
  type: "folder" | "file";
  showArrow?: boolean;
  lastUpdated?: string;
  size?: number;
}

export default function BrowseFolderItemRow({
  name,
  path,
  type,
  showArrow = false,
  lastUpdated,
  size,
}: BrowseFolderItemRowProps) {
  const Icon = type === "folder" ? FolderOpen : File;

  return (
    <div
      className={`browse-folder__item-main browse-folder__item-grid${
        type === "file" ? " browse-folder__item-main--static" : ""
      }`}
    >
      <div className="browse-folder__item-icon browse-folder__item-icon--row">
        <Icon className="browse-folder__row-icon" strokeWidth={2} aria-hidden="true" />
      </div>
      <div className="browse-folder__item-name browse-folder__item-name--cell">{name}</div>
      <div className="browse-folder__item-path-col" title={path}>
        {path}
      </div>
      <ListItemMeta
        className="browse-folder__item-meta-col"
        lastUpdated={lastUpdated}
        size={size}
        type={type}
      />
      {showArrow ? (
        <ChevronRight className="browse-folder__item-arrow browse-folder__row-arrow" aria-hidden="true" />
      ) : (
        <span className="browse-folder__item-arrow-spacer" aria-hidden="true" />
      )}
    </div>
  );
}
