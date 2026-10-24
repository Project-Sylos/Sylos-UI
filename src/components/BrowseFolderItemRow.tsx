import { ChevronRight } from "lucide-react";

import FileTypeIcon from "./FileTypeIcon";
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
  return (
    <div
      className={`browse-folder__item-main browse-folder__item-grid${
        type === "file" ? " browse-folder__item-main--static" : ""
      }`}
    >
      <div className="browse-folder__item-icon browse-folder__item-icon--row">
        <FileTypeIcon
          name={name}
          type={type}
          className="browse-folder__row-icon"
        />
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
