import { Clock, X, Check, AlertCircle, RotateCw, Trash2, Ban } from "lucide-react";
import { DiffItem } from "../api/services";
import {
  hasTraversalFailure,
  isTraversalRetryPending,
  isTraversalSkipped,
} from "../utils/pathReviewTraversalStatus";
import { isCopyComplete } from "../utils/copyStatus";

export interface PathReviewStatusIconProps {
  item: DiffItem;
  isMarkedForRetry: boolean;
  isLocked: boolean;
  zoomLevel?: number;
  size?: number;
  className?: string;
  phase?: "traversal" | "copy" | "source-cleanup" | "delete"; // Current phase - determines which status fields to use
  onRetryClick?: (item: DiffItem) => void;
  onExcludeClick?: (item: DiffItem, currentChecked: boolean) => void;
  onSkipDeleteClick?: (item: DiffItem) => void;
}

export default function PathReviewStatusIcon({
  item,
  isMarkedForRetry,
  isLocked,
  zoomLevel = 1,
  size,
  className = "",
  phase = "traversal", // Default to traversal phase for backwards compatibility
  onRetryClick,
  onExcludeClick,
  onSkipDeleteClick,
}: PathReviewStatusIconProps) {
  const iconSize = size || 20 * zoomLevel;
  const isSourceCleanup = phase === "source-cleanup";
  const isDeleteReview = phase === "delete";
  const isCopy = phase === "copy";
  
  // Use phase-appropriate status fields
  const srcTraversalStatus = item.src?.traversalStatus;
  const dstTraversalStatus = item.dst?.traversalStatus;
  const copyStatus = item.src?.copyStatus || item.copyStatus || "";
  const existsOnlyOnDst = !item.src && !!item.dst; // dst-only node (no src node)
  
  // Use provided className or default to tree view class
  const baseClass = className || 'path-review__item-status-icon';

  if (isSourceCleanup) {
    const existsOnlyOnDst =
      !item.src ||
      item.traversalStatus === "not_on_src" ||
      item.dst?.traversalStatus === "not_on_src";
    if (existsOnlyOnDst && !item.src) {
      return (
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists-only-dst`}
          style={{ cursor: "default" }}
        />
      );
    }
    const copyStatus = item.src?.copyStatus || item.copyStatus || "";
    if (!isCopyComplete(copyStatus) || !item.src) {
      return null;
    }
    const deleteStatus = item.src?.deleteStatus || "";
    if (deleteStatus === "skipped") {
      return (
        <X
          size={iconSize}
          className={`${baseClass} ${baseClass}--excluded`}
          onClick={() => onSkipDeleteClick?.(item)}
          style={{ cursor: "pointer" }}
        />
      );
    }
    return (
      <Trash2
        size={iconSize}
        className={`${baseClass} ${baseClass}--pending`}
        onClick={() => onSkipDeleteClick?.(item)}
        style={{ cursor: "pointer" }}
      />
    );
  }

  if (isDeleteReview) {
    const existsOnlyOnDst =
      !item.src ||
      item.traversalStatus === "not_on_src" ||
      item.dst?.traversalStatus === "not_on_src";
    if (existsOnlyOnDst && !item.src) {
      return (
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists-only-dst`}
          style={{ cursor: "default" }}
        />
      );
    }
    if (!item.src) {
      return null;
    }
    const deleteStatus = item.src?.deleteStatus || "";
    if (deleteStatus === "deleted") {
      return (
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--deleted`}
          style={{ cursor: "default" }}
        />
      );
    }
    if (deleteStatus === "failed") {
      return (
        <AlertCircle
          size={iconSize}
          className={`${baseClass} ${baseClass}--failed`}
          onClick={() => onRetryClick?.(item)}
          style={{ cursor: "pointer" }}
        />
      );
    }
    if (deleteStatus === "pending") {
      return (
        <RotateCw
          size={iconSize}
          className={`${baseClass} ${baseClass}--retry`}
          onClick={() => onRetryClick?.(item)}
          style={{ cursor: "pointer" }}
        />
      );
    }
    return null;
  }
  
  if (isCopy) {
    // Copy phase: prioritize copyStatus, but still check traversalStatus for failed/pending retry
    // In copy phase, same icons but different meanings:
    // - Failed = copy failed
    // - Successful = got brought over OR dst-only
    // - Pending = didn't get brought over (treat same as failed)
    // - Excluded = read-only (visible but non-interactive)
    
    // 1. Failed copyStatus - show failed icon
    if (copyStatus === "failed") {
      return (
        <AlertCircle
          size={iconSize}
          className={`${baseClass} ${baseClass}--failed`}
          onClick={() => onRetryClick?.(item)}
          style={{ cursor: "pointer" }}
        />
      );
    }

    // 2. Pending copyStatus - show retry icon (didn't get brought over, treat same as failed/retry)
    if (copyStatus === "pending") {
      return (
        <RotateCw
          size={iconSize}
          className={`${baseClass} ${baseClass}--retry`}
          onClick={() => onRetryClick?.(item)}
          style={{ cursor: "pointer" }}
        />
      );
    }
    
    // 3. Excluded copyStatus - show excluded icon (read-only in copy phase)
    if (copyStatus === "exclusion_explicit" || copyStatus === "exclusion_inherited" || copyStatus === "excluded") {
      return (
        <X
          size={iconSize}
          className={`${baseClass} ${baseClass}--excluded`}
          style={{ cursor: "default" }}
        />
      );
    }
    
    // 4. Dst-only - show cyan exists icon (exists only on destination)
    if (existsOnlyOnDst) {
      return (
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists-only-dst`}
          style={{ cursor: "default" }}
        />
      );
    }
    
    // 5. Copy complete (successful or already_existed) - magenta exists icon (exists on both)
    if (isCopyComplete(copyStatus)) {
      return (
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists ${baseClass}--exists-on-both`}
          style={{ cursor: "default" }}
        />
      );
    }
  } else {
    // Traversal phase: retry/failed icons follow SRC queue; DST pending is not retry.
    const hasFailedStatus = hasTraversalFailure(item);
    const hasPendingRetry = isTraversalRetryPending(item);
    const skippedDiscovery = isTraversalSkipped(item);

    // 0. Root-pick / traversal-skipped (before copy-excluded X)
    if (skippedDiscovery) {
      return (
        <Ban
          size={iconSize}
          className={`${baseClass} ${baseClass}--traversal-skipped`}
          onClick={() => onRetryClick?.(item)}
          style={{ cursor: "pointer" }}
          title="Skipped at root pick. Click to mark for discovery retry."
        />
      );
    }

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

    // 2. Excluded copyStatus - show excluded icon (check before pending, since exclusion takes priority)
    if (copyStatus === "exclusion_explicit" || copyStatus === "exclusion_inherited" || copyStatus === "excluded") {
      return (
        <X
          size={iconSize}
          className={`${baseClass} ${baseClass}--excluded`}
          onClick={() => !isLocked && onExcludeClick?.(item, false)}
          style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
        />
      );
    }

    // 3. SRC marked for discovery retry
    if (hasPendingRetry) {
      return (
        <RotateCw
          size={iconSize}
          className={`${baseClass} ${baseClass}--retry`}
          onClick={() => onRetryClick?.(item)}
          style={{ cursor: "pointer" }}
        />
      );
    }

    // 4. Marked for retry - show retry icon (fallback for other cases)
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

    // 5. traversalStatus 'not_on_src' - show cyan exists icon (exists only on destination)
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

    // 6. Copy complete (successful or already_existed) - magenta exists icon (exists on both)
    if (isCopyComplete(copyStatus)) {
      return (
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists ${baseClass}--exists-on-both`}
          style={{ cursor: "default" }}
        />
      );
    }

    // 7. Pending copyStatus - show pending icon
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
  }

  // Default: no icon
  return null;
}
