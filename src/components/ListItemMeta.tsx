import { formatBytes } from "../utils/formatBytes";
import { formatItemTimestamp } from "../utils/formatItemTimestamp";

interface ListItemMetaProps {
  lastUpdated?: string;
  size?: number;
  type?: "file" | "folder";
  className?: string;
}

export default function ListItemMeta({
  lastUpdated,
  size,
  type = "folder",
  className = "",
}: ListItemMetaProps) {
  const modified = formatItemTimestamp(lastUpdated);
  const parts: string[] = [];

  if (type === "file" && size != null && size >= 0) {
    parts.push(formatBytes(size));
  }
  if (modified) {
    parts.push(modified);
  }

  if (parts.length === 0) {
    return null;
  }

  return (
    <div className={`list-item-meta${className ? ` ${className}` : ""}`}>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="list-item-meta__part">
          {index > 0 && <span className="list-item-meta__sep" aria-hidden="true">·</span>}
          {part}
        </span>
      ))}
    </div>
  );
}
