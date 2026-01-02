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
  
  // Determine status based on copyStatus (for traversal review mode)
  // If dst exists but src doesn't, it's already successful
  let isExcluded = false;
  let isPending = false;
  let isSuccessful = false;
  
  if (!item.inSrc && item.inDst) {
    isSuccessful = true;
  } else if (item.inSrc) {
    const copyStatus = item.copyStatus || "pending";
    isExcluded = copyStatus === "exclusion_explicit" || copyStatus === "exclusion_inherited";
    isPending = copyStatus === "pending";
    isSuccessful = copyStatus === "successful";
  } else {
    // Default to pending if src doesn't exist
    isPending = true;
  }

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

  // Pending items - show pending icon (clickable to exclude)
  if (!isFailed && !isMarkedForRetry && isPending && !isSuccessful) {
    return (
      <Clock
        size={iconSize}
        className={`${baseClass} ${baseClass}--pending`}
        onClick={() => !isLocked && onExcludeClick?.(item, true)}
        style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
      />
    );
  }

  // Excluded items - show excluded icon (clickable to unexclude)
  if (!isFailed && !isMarkedForRetry && isExcluded) {
    return (
      <X
        size={iconSize}
        className={`${baseClass} ${baseClass}--excluded`}
        onClick={() => !isLocked && onExcludeClick?.(item, false)}
        style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
      />
    );
  }

  // Items that exist on both or are successful - show exists icon (not clickable)
  if (!isFailed && !isMarkedForRetry && (isSuccessful || existsOnBoth)) {
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

