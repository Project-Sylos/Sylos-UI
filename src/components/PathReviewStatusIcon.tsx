import { Clock, X, Check, AlertCircle, RotateCw, Trash2, Ban } from "lucide-react";
import { DiffItem } from "../api/services";
import {
  excludedByRuleText,
  isRuleExcluded,
} from "../utils/pathReviewRuleExclusion";
import {
  hasTraversalFailure,
  isTraversalRetryPending,
  isTraversalSkipped,
} from "../utils/pathReviewTraversalStatus";
import { isCopyComplete } from "../utils/copyStatus";
import { PATH_REVIEW_COPY } from "../utils/pathReviewCopy";

export interface PathReviewStatusIconProps {
  item: DiffItem;
  isMarkedForRetry: boolean;
  isLocked: boolean;
  zoomLevel?: number;
  size?: number;
  className?: string;
  phase?: "traversal" | "copy" | "copy-plan" | "source-cleanup" | "delete";
  onRetryClick?: (item: DiffItem) => void;
  onExcludeClick?: (item: DiffItem, currentChecked: boolean) => void;
  onSkipDeleteClick?: (item: DiffItem) => void;
  /** When set, replace the status glyph with a spinner until the backend op finishes. */
  opInProgressTitle?: string;
}

export default function PathReviewStatusIcon({
  item,
  isMarkedForRetry,
  isLocked,
  zoomLevel = 1,
  size,
  className = "",
  phase = "traversal",
  onRetryClick,
  onExcludeClick,
  onSkipDeleteClick,
  opInProgressTitle,
}: PathReviewStatusIconProps) {
  const iconSize = size || 20 * zoomLevel;
  if (opInProgressTitle) {
    const spinner = Math.max(10, Math.round(iconSize * 0.72));
    return (
      <span
        className={`path-review-op-spinner ${className}`.trim()}
        style={{ width: spinner, height: spinner }}
        title={opInProgressTitle}
        aria-label={opInProgressTitle}
        role="status"
      />
    );
  }
  const isSourceCleanup = phase === "source-cleanup";
  const isDeleteReview = phase === "delete";
  const isCopyPlan = phase === "copy-plan";
  const isCopy = phase === "copy";

  const srcTraversalStatus = item.src?.traversalStatus;
  const dstTraversalStatus = item.dst?.traversalStatus;
  const copyStatus = item.src?.copyStatus || item.copyStatus || "";
  const existsOnlyOnDst = !item.src && !!item.dst;

  const baseClass = className || "path-review__item-status-icon";

  if (isSourceCleanup) {
    if (existsOnlyOnDst && !item.src) {
      return (
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists-only-dst`}
          style={{ cursor: "default" }}
        />
      );
    }
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
    if (deleteStatus === "pending_inherited") {
      return (
        <Trash2
          size={iconSize}
          className={`${baseClass} ${baseClass}--pending`}
          style={{ cursor: "default" }}
          title="Scheduled for removal with parent folder"
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
    if (
      (!item.src &&
        (!!item.dst ||
          item.traversalStatus === "not_on_src" ||
          item.dst?.traversalStatus === "not_on_src")) ||
      (existsOnlyOnDst && !item.src)
    ) {
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
    if (deleteStatus === "pending_explicit") {
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

  // Pre-copy plan: copy_status icons with exclude toggle (Clock), not retry.
  if (isCopyPlan) {
    if (
      copyStatus === "exclusion_explicit" ||
      copyStatus === "exclusion_inherited" ||
      copyStatus === "excluded"
    ) {
      const ruleExcluded = isRuleExcluded(item);
      const ruleTip = excludedByRuleText(item);
      return (
        <X
          size={iconSize}
          className={`${baseClass} ${baseClass}--excluded${
            ruleExcluded ? ` ${baseClass}--rule-excluded` : ""
          }`}
          onClick={() => !isLocked && !ruleExcluded && onExcludeClick?.(item, false)}
          style={{ cursor: isLocked || ruleExcluded ? "default" : "pointer" }}
          title={
            ruleTip ||
            (ruleExcluded
              ? PATH_REVIEW_COPY.ruleExcludedLegendTip
              : "Manually excluded. Click to include again.")
          }
        />
      );
    }
    if (existsOnlyOnDst) {
      return (
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists-only-dst`}
          style={{ cursor: "default" }}
        />
      );
    }
    if (isCopyComplete(copyStatus)) {
      return (
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists ${baseClass}--exists-on-both`}
          style={{ cursor: "default" }}
        />
      );
    }
    if (copyStatus === "pending" || copyStatus === "") {
      return (
        <Clock
          size={iconSize}
          className={`${baseClass} ${baseClass}--pending`}
          onClick={() => !isLocked && onExcludeClick?.(item, true)}
          style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
          title="Will be copied. Click to exclude."
        />
      );
    }
    return null;
  }

  if (isCopy) {
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

    if (
      copyStatus === "exclusion_explicit" ||
      copyStatus === "exclusion_inherited" ||
      copyStatus === "excluded"
    ) {
      const ruleTip = excludedByRuleText(item);
      return (
        <X
          size={iconSize}
          className={`${baseClass} ${baseClass}--excluded${
            isRuleExcluded(item) ? ` ${baseClass}--rule-excluded` : ""
          }`}
          style={{ cursor: "default" }}
          title={ruleTip || "Excluded from copy"}
        />
      );
    }

    if (existsOnlyOnDst) {
      return (
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists-only-dst`}
          style={{ cursor: "default" }}
        />
      );
    }

    if (isCopyComplete(copyStatus)) {
      return (
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists ${baseClass}--exists-on-both`}
          style={{ cursor: "default" }}
        />
      );
    }
    return null;
  }

  // Traversal review: icons mean traversal_status only.
  const hasFailedStatus = hasTraversalFailure(item);
  const hasPendingRetry = isTraversalRetryPending(item) || isMarkedForRetry;
  const skippedDiscovery = isTraversalSkipped(item);

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

  const primaryTraversalStatus = item.traversalStatus;
  if (
    primaryTraversalStatus === "not_on_src" ||
    srcTraversalStatus === "not_on_src" ||
    dstTraversalStatus === "not_on_src"
  ) {
    return (
      <Check
        size={iconSize}
        className={`${baseClass} ${baseClass}--exists-only-dst`}
        style={{ cursor: "default" }}
      />
    );
  }

  if (item.src || item.dst) {
    return (
      <Check
        size={iconSize}
        className={`${baseClass} ${baseClass}--exists`}
        style={{ cursor: "default" }}
        title="Discovered successfully"
      />
    );
  }

  return null;
}
