import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DiffItem } from "../api/services";
import {
  PATH_REVIEW_COPY,
  destinationDisplayName,
  isAutoHandledCompat,
  needsManualCompatAction,
} from "../utils/pathReviewCopy";
import "./ItemHoverCard.css";

interface ItemHoverCardProps {
  item: DiffItem;
  /** Top-left of the name (or row); card is placed above this point. */
  position: { x: number; y: number };
  onClose: () => void;
  onMouseEnterCard?: () => void;
}

function formatDate(dateString?: string): string {
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
}

function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function ItemHoverCard({
  item,
  position,
  onClose,
  onMouseEnterCard,
}: ItemHoverCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState(position);
  const inSrc = !!item.src;
  const inDst = !!item.dst;
  const showSrc = inSrc || !inDst;
  const showDst = inDst || !inSrc || !!item.proposedPath;

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) {
      setCoords(position);
      return;
    }
    const pad = 12;
    const gap = 8;
    const rect = el.getBoundingClientRect();
    // Place card above the name, left-aligned with it.
    let x = position.x;
    let y = position.y - rect.height - gap;

    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (y < pad) {
      // Not enough room above. Fall back just below the name.
      y = position.y + 22;
      if (y + rect.height > window.innerHeight - pad) {
        y = Math.max(pad, window.innerHeight - rect.height - pad);
      }
    }
    if (x < pad) x = pad;
    setCoords({ x, y });
  }, [position, item.id, item.proposedPath, item.pathIssueMessages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const destName =
    item.proposedPath ||
    item.dst?.name ||
    item.name;

  return (
    <div
      ref={cardRef}
      className="item-hover-card"
      style={{ left: `${coords.x}px`, top: `${coords.y}px` }}
      onMouseEnter={() => onMouseEnterCard?.()}
      onMouseLeave={onClose}
    >
      <div className="item-hover-card__header">
        <h3 className="item-hover-card__title">{item.name}</h3>
        <div className="item-hover-card__type">
          {item.type === "folder" ? "Folder" : "File"}
        </div>
      </div>

      <div
        className={`item-hover-card__split ${
          showSrc && showDst ? "" : "item-hover-card__split--single"
        }`}
      >
        {showSrc && (
          <div className="item-hover-card__side item-hover-card__side--source">
            <div className="item-hover-card__side-header">
              <span className="item-hover-card__side-label">Source</span>
              {inSrc && (
                <span className="item-hover-card__side-status">Present</span>
              )}
            </div>
            {inSrc && item.src ? (
              <div className="item-hover-card__side-content">
                <div className="item-hover-card__detail">
                  <span className="item-hover-card__detail-label">Name</span>
                  <span className="item-hover-card__detail-value">{item.src.name}</span>
                </div>
                <div className="item-hover-card__detail">
                  <span className="item-hover-card__detail-label">Path</span>
                  <span className="item-hover-card__detail-value" title={item.src.locationPath}>
                    {item.src.locationPath}
                  </span>
                </div>
                <div className="item-hover-card__detail">
                  <span className="item-hover-card__detail-label">Type</span>
                  <span className="item-hover-card__detail-value">
                    {item.src.type === "folder" ? "Folder" : "File"}
                  </span>
                </div>
                {item.src.type === "file" && (
                  <div className="item-hover-card__detail">
                    <span className="item-hover-card__detail-label">Size</span>
                    <span className="item-hover-card__detail-value">
                      {formatSize(item.src.size)}
                    </span>
                  </div>
                )}
                <div className="item-hover-card__detail">
                  <span className="item-hover-card__detail-label">Last modified</span>
                  <span className="item-hover-card__detail-value">
                    {formatDate(item.src.lastUpdated)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="item-hover-card__side-empty">Not present</div>
            )}
          </div>
        )}

        {showDst && (
          <div className="item-hover-card__side item-hover-card__side--destination">
            <div className="item-hover-card__side-header">
              <span className="item-hover-card__side-label">Destination</span>
              {inDst && (
                <span className="item-hover-card__side-status">Present</span>
              )}
            </div>
            <div className="item-hover-card__side-content">
              {(item.pathIssueStatus || item.pathIssueMessages?.length) ? (
                <div className="item-hover-card__detail">
                  <span className="item-hover-card__detail-label">
                    {isAutoHandledCompat(item)
                      ? PATH_REVIEW_COPY.compatibilityWarningLabel
                      : PATH_REVIEW_COPY.compatibilityNeedsActionLabel}
                  </span>
                  <span className="item-hover-card__detail-value item-hover-card__compat-note">
                    {isAutoHandledCompat(item)
                      ? PATH_REVIEW_COPY.compatAutoHandledSummary(
                          Math.max(1, item.pathIssueMessages?.length || 1),
                          destinationDisplayName(item)
                        )
                      : needsManualCompatAction(item)
                        ? PATH_REVIEW_COPY.manualReviewTip
                        : "Naming needs a change on the destination."}
                  </span>
                </div>
              ) : null}
              {inDst && item.dst ? (
                <>
                  <div className="item-hover-card__detail">
                    <span className="item-hover-card__detail-label">Name</span>
                    <span className="item-hover-card__detail-value">{item.dst.name}</span>
                  </div>
                  <div className="item-hover-card__detail">
                    <span className="item-hover-card__detail-label">Path</span>
                    <span
                      className="item-hover-card__detail-value"
                      title={item.dst.locationPath}
                    >
                      {item.dst.locationPath}
                    </span>
                  </div>
                  <div className="item-hover-card__detail">
                    <span className="item-hover-card__detail-label">Type</span>
                    <span className="item-hover-card__detail-value">
                      {item.dst.type === "folder" ? "Folder" : "File"}
                    </span>
                  </div>
                  {item.dst.type === "file" && (
                    <div className="item-hover-card__detail">
                      <span className="item-hover-card__detail-label">Size</span>
                      <span className="item-hover-card__detail-value">
                        {formatSize(item.dst.size)}
                      </span>
                    </div>
                  )}
                  <div className="item-hover-card__detail">
                    <span className="item-hover-card__detail-label">Last modified</span>
                    <span className="item-hover-card__detail-value">
                      {formatDate(item.dst.lastUpdated)}
                    </span>
                  </div>
                </>
              ) : !item.proposedPath ? (
                <div className="item-hover-card__side-empty">Not present</div>
              ) : (
                <div className="item-hover-card__detail">
                  <span className="item-hover-card__detail-label">Name</span>
                  <span className="item-hover-card__detail-value">{destName}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
