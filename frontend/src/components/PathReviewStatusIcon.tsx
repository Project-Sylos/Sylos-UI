import React from "react";
import { Clock, X, Check, AlertCircle, RotateCw } from "lucide-react";
import { DiffItem } from "../api/services";

export interface PathReviewStatusIconProps {
  item: DiffItem;
  isMarkedForRetry: boolean;
  isChecked: boolean;
  existsOnBoth: boolean;
  isLocked: boolean;
  zoomLevel?: number;
  size?: number;
  className?: string;
  onRetryClick?: (item: DiffItem) => void;
  onExcludeClick?: (item: DiffItem, currentChecked: boolean) => void;
}

export default function PathReviewStatusIcon({
  item,
  isMarkedForRetry,
  isChecked,
  existsOnBoth,
  isLocked,
  zoomLevel = 1,
  size,
  className = "",
  onRetryClick,
  onExcludeClick,
}: PathReviewStatusIconProps) {
  const iconSize = size || 20 * zoomLevel;
  const isFailed = item.traversalStatus === "failed";
  const isExcluded = !isChecked && !existsOnBoth;

  // Use provided className or default to tree view class
  const baseClass = className || 'path-review__item-status-icon';
  
  // Failed items - show retry icon
  if (isFailed && !isMarkedForRetry) {
    return (
      <AlertCircle
        size={iconSize}
        className={`${baseClass} ${baseClass}--failed`}
        onClick={() => onRetryClick?.(item)}
        style={{ cursor: "pointer" }}
      />
    );
  }

  // Marked for retry - show retry icon (clickable to unmark)
  if (isMarkedForRetry) {
    return (
      <RotateCw
        size={iconSize}
        className={`${baseClass} ${baseClass}--retry`}
        onClick={() => onRetryClick?.(item)}
        style={{ cursor: "pointer" }}
      />
    );
  }

  // Pending items (checked) - show pending icon (clickable to exclude)
  if (!isFailed && !isMarkedForRetry && isChecked && !existsOnBoth) {
    return (
      <Clock
        size={iconSize}
        className={`${baseClass} ${baseClass}--pending`}
        onClick={() => !isLocked && onExcludeClick?.(item, isChecked)}
        style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
      />
    );
  }

  // Excluded items - show excluded icon (clickable to unexclude)
  if (!isFailed && !isMarkedForRetry && !isChecked && !existsOnBoth) {
    return (
      <X
        size={iconSize}
        className={`${baseClass} ${baseClass}--excluded`}
        onClick={() => !isLocked && onExcludeClick?.(item, isChecked)}
        style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
      />
    );
  }

  // Items that exist on both - show exists icon (not clickable)
  if (!isFailed && !isMarkedForRetry && existsOnBoth) {
    return (
      <Check
        size={iconSize}
        className={`${baseClass} ${baseClass}--exists`}
        style={{ cursor: "default" }}
      />
    );
  }

  // Default: no icon
  return null;
}

