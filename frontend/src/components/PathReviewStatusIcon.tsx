import React from "react";
import { Clock, X, Check, AlertCircle, RotateCw } from "lucide-react";
import { DiffItem } from "../api/services";

export interface PathReviewStatusIconProps {
  item: DiffItem;
  isMarkedForRetry: boolean;
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
  isLocked,
  zoomLevel = 1,
  size,
  className = "",
  onRetryClick,
  onExcludeClick,
}: PathReviewStatusIconProps) {
  const iconSize = size || 20 * zoomLevel;
  // Check both src and dst traversalStatus - failed overrides pending
  const srcTraversalStatus = item.src?.traversalStatus;
  const dstTraversalStatus = item.dst?.traversalStatus;
  // Failed status from either node overrides pending - show failed icon
  const hasFailedStatus = srcTraversalStatus === "failed" || dstTraversalStatus === "failed";
  // Pending status if either node is pending (and neither is failed)
  const hasPendingStatus = (srcTraversalStatus === "pending" || dstTraversalStatus === "pending") && !hasFailedStatus;
  
  // copyStatus may not exist for dst-only items - default to empty string to avoid masking real status
  // Empty string ensures string comparisons work but won't match any status checks
  const copyStatus = item.copyStatus ?? "";

  // Use provided className or default to tree view class
  const baseClass = className || 'path-review__item-status-icon';
  
  // 1. Failed traversalStatus (from either src or dst) - show failed icon (prioritize failed over pending)
  if (hasFailedStatus) {
    return (
      <AlertCircle
        size={iconSize}
        className={`${baseClass} ${baseClass}--failed`}
        onClick={() => onRetryClick?.(item)}
        style={{ cursor: "pointer" }}
      />
    );
  }

  // 2. Pending traversalStatus (from either src or dst) - show retry icon
  if (hasPendingStatus) {
    return (
      <RotateCw
        size={iconSize}
        className={`${baseClass} ${baseClass}--retry`}
        onClick={() => onRetryClick?.(item)}
        style={{ cursor: "pointer" }}
      />
    );
  }

  // 3. Marked for retry - show retry icon (fallback for other cases)
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

  // 3. Excluded copyStatus - show excluded icon
  if (copyStatus === "exclusion_explicit" || copyStatus === "exclusion_inherited") {
    return (
      <X
        size={iconSize}
        className={`${baseClass} ${baseClass}--excluded`}
        onClick={() => !isLocked && onExcludeClick?.(item, false)}
        style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
      />
    );
  }

  // 4. traversalStatus 'not_on_src' - show cyan exists icon (exists only on destination)
  // Check primary traversalStatus or either node
  const primaryTraversalStatus = item.traversalStatus;
  if (primaryTraversalStatus === "not_on_src" || srcTraversalStatus === "not_on_src" || dstTraversalStatus === "not_on_src") {
    return (
      <Check
        size={iconSize}
        className={`${baseClass} ${baseClass}--exists-only-dst`}
        style={{ cursor: "default" }}
      />
    );
  }

  // 5. Successful copyStatus - show magenta exists icon (exists on both)
  if (copyStatus === "successful") {
    return (
      <Check
        size={iconSize}
        className={`${baseClass} ${baseClass}--exists ${baseClass}--exists-on-both`}
        style={{ cursor: "default" }}
      />
    );
  }

  // 6. Pending copyStatus - show pending icon
  if (copyStatus === "pending") {
    return (
      <Clock
        size={iconSize}
        className={`${baseClass} ${baseClass}--pending`}
        onClick={() => !isLocked && onExcludeClick?.(item, true)}
        style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
      />
    );
  }

  // Default: no icon
  return null;
}
