import { DiffItem } from "../api/services";
import "./ItemHoverCard.css";

interface ItemHoverCardProps {
  item: DiffItem;
  position: { x: number; y: number };
  onClose: () => void;
}

export default function ItemHoverCard({
  item,
  position,
  onClose,
}: ItemHoverCardProps) {
  const formatDate = (dateString?: string): string => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const formatSize = (bytes?: number): string => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  return (
    <div
      className="item-hover-card"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseEnter={onClose}
      onMouseLeave={onClose}
    >
      <div className="item-hover-card__header">
        <h3 className="item-hover-card__title">{item.name}</h3>
        <div className="item-hover-card__type">
          {item.type === "folder" ? "Folder" : "File"}
        </div>
      </div>

      <div className="item-hover-card__split">
        {/* Source Side */}
        <div className="item-hover-card__side item-hover-card__side--source">
          <div className="item-hover-card__side-header">
            <span className="item-hover-card__side-label">Source</span>
            {item.inSrc && (
              <span className="item-hover-card__side-status">Present</span>
            )}
          </div>
          {item.inSrc && item.src ? (
            <div className="item-hover-card__side-content">
              <div className="item-hover-card__detail">
                <span className="item-hover-card__detail-label">Last Modified:</span>
                <span className="item-hover-card__detail-value">
                  {formatDate(item.src.lastUpdated)}
                </span>
              </div>
              {item.src.type === "file" && item.src.size !== undefined && (
                <div className="item-hover-card__detail">
                  <span className="item-hover-card__detail-label">Size:</span>
                  <span className="item-hover-card__detail-value">
                    {formatSize(item.src.size)}
                  </span>
                </div>
              )}
              <div className="item-hover-card__detail">
                <span className="item-hover-card__detail-label">Path:</span>
                <span className="item-hover-card__detail-value" title={item.src.locationPath}>
                  {item.src.locationPath}
                </span>
              </div>
            </div>
          ) : (
            <div className="item-hover-card__side-empty">Not present</div>
          )}
        </div>

        {/* Destination Side */}
        <div className="item-hover-card__side item-hover-card__side--destination">
          <div className="item-hover-card__side-header">
            <span className="item-hover-card__side-label">Destination</span>
            {item.inDst && (
              <span className="item-hover-card__side-status">Present</span>
            )}
          </div>
          {item.inDst && item.dst ? (
            <div className="item-hover-card__side-content">
              <div className="item-hover-card__detail">
                <span className="item-hover-card__detail-label">Last Modified:</span>
                <span className="item-hover-card__detail-value">
                  {formatDate(item.dst.lastUpdated)}
                </span>
              </div>
              {item.dst.type === "file" && item.dst.size !== undefined && (
                <div className="item-hover-card__detail">
                  <span className="item-hover-card__detail-label">Size:</span>
                  <span className="item-hover-card__detail-value">
                    {formatSize(item.dst.size)}
                  </span>
                </div>
              )}
              <div className="item-hover-card__detail">
                <span className="item-hover-card__detail-label">Path:</span>
                <span className="item-hover-card__detail-value" title={item.dst.locationPath}>
                  {item.dst.locationPath}
                </span>
              </div>
            </div>
          ) : (
            <div className="item-hover-card__side-empty">Not present</div>
          )}
        </div>
      </div>
    </div>
  );
}

