import type { ReactElement } from "react";
import { Clock, X, Check, AlertCircle, RotateCw, Trash2, Ban } from "lucide-react";
import { DiffItem } from "../api/services";
import InteractionHint from "./InteractionHint";
import {
  STATUS_HINT,
  STATUS_HINT_COPY,
} from "./pathReviewStatusHints";
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

function maybeHint(
  tipId: string,
  content: string,
  canToggle: boolean,
  icon: ReactElement
): ReactElement {
  if (!canToggle) return icon;
  return (
    <InteractionHint tipId={tipId} content={content} position="right">
      {icon}
    </InteractionHint>
  );
}

function interactiveClass(baseClass: string, canToggle: boolean): string {
  return canToggle ? ` ${baseClass}--interactive` : "";
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
      const canToggle = true;
      return maybeHint(
        STATUS_HINT.include,
        STATUS_HINT_COPY.include,
        canToggle,
        <X
          size={iconSize}
          className={`${baseClass} ${baseClass}--excluded${interactiveClass(baseClass, canToggle)}`}
          onClick={() => onSkipDeleteClick?.(item)}
          style={{ cursor: "pointer" }}
          title="Skipped for removal. Click to include again."
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
    const canToggle = true;
    return maybeHint(
      STATUS_HINT.exclude,
      STATUS_HINT_COPY.exclude,
      canToggle,
      <Trash2
        size={iconSize}
        className={`${baseClass} ${baseClass}--pending${interactiveClass(baseClass, canToggle)}`}
        onClick={() => onSkipDeleteClick?.(item)}
        style={{ cursor: "pointer" }}
        title="Scheduled for removal. Click to skip."
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
      const canToggle = true;
      return maybeHint(
        STATUS_HINT.markRetry,
        STATUS_HINT_COPY.markRetry,
        canToggle,
        <AlertCircle
          size={iconSize}
          className={`${baseClass} ${baseClass}--failed${interactiveClass(baseClass, canToggle)}`}
          onClick={() => onRetryClick?.(item)}
          style={{ cursor: "pointer" }}
          title="Removal failed. Click to mark for retry."
        />
      );
    }
    if (deleteStatus === "pending_explicit") {
      const canToggle = true;
      return maybeHint(
        STATUS_HINT.undoRetry,
        STATUS_HINT_COPY.undoRetry,
        canToggle,
        <RotateCw
          size={iconSize}
          className={`${baseClass} ${baseClass}--retry${interactiveClass(baseClass, canToggle)}`}
          onClick={() => onRetryClick?.(item)}
          style={{ cursor: "pointer" }}
          title="Marked for removal retry. Click to undo."
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
      const canToggle = !isLocked && !ruleExcluded;
      return maybeHint(
        STATUS_HINT.include,
        STATUS_HINT_COPY.include,
        canToggle,
        <X
          size={iconSize}
          className={`${baseClass} ${baseClass}--excluded${
            ruleExcluded ? ` ${baseClass}--rule-excluded` : ""
          }${interactiveClass(baseClass, canToggle)}`}
          onClick={() => canToggle && onExcludeClick?.(item, false)}
          style={{ cursor: canToggle ? "pointer" : "default" }}
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
      const canToggle = !isLocked;
      return maybeHint(
        STATUS_HINT.exclude,
        STATUS_HINT_COPY.exclude,
        canToggle,
        <Clock
          size={iconSize}
          className={`${baseClass} ${baseClass}--pending${interactiveClass(baseClass, canToggle)}`}
          onClick={() => canToggle && onExcludeClick?.(item, true)}
          style={{ cursor: canToggle ? "pointer" : "not-allowed" }}
          title="Will be copied. Click to exclude."
        />
      );
    }
    return null;
  }

  if (isCopy) {
    if (copyStatus === "failed") {
      const canToggle = true;
      return maybeHint(
        STATUS_HINT.markRetry,
        STATUS_HINT_COPY.markRetry,
        canToggle,
        <AlertCircle
          size={iconSize}
          className={`${baseClass} ${baseClass}--failed${interactiveClass(baseClass, canToggle)}`}
          onClick={() => onRetryClick?.(item)}
          style={{ cursor: "pointer" }}
          title="Copy failed. Click to mark for retry."
        />
      );
    }

    if (copyStatus === "pending") {
      const canToggle = true;
      return maybeHint(
        STATUS_HINT.undoRetry,
        STATUS_HINT_COPY.undoRetry,
        canToggle,
        <RotateCw
          size={iconSize}
          className={`${baseClass} ${baseClass}--retry${interactiveClass(baseClass, canToggle)}`}
          onClick={() => onRetryClick?.(item)}
          style={{ cursor: "pointer" }}
          title="Marked for copy retry. Click to undo."
        />
      );
    }

    if (
      copyStatus === "exclusion_explicit" ||
      copyStatus === "exclusion_inherited" ||
      copyStatus === "excluded"
    ) {
      const ruleExcluded = isRuleExcluded(item);
      const ruleTip = excludedByRuleText(item);
      const canToggle = !isLocked && !ruleExcluded;
      return maybeHint(
        STATUS_HINT.include,
        STATUS_HINT_COPY.include,
        canToggle,
        <X
          size={iconSize}
          className={`${baseClass} ${baseClass}--excluded${
            ruleExcluded ? ` ${baseClass}--rule-excluded` : ""
          }${interactiveClass(baseClass, canToggle)}`}
          onClick={() => canToggle && onRetryClick?.(item)}
          style={{ cursor: canToggle ? "pointer" : "default" }}
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
    const canToggle = true;
    return maybeHint(
      STATUS_HINT.markRetry,
      STATUS_HINT_COPY.markRetry,
      canToggle,
      <Ban
        size={iconSize}
        className={`${baseClass} ${baseClass}--traversal-skipped${interactiveClass(baseClass, canToggle)}`}
        onClick={() => onRetryClick?.(item)}
        style={{ cursor: "pointer" }}
        title="Skipped at root pick. Click to mark for discovery retry."
      />
    );
  }

  if (hasFailedStatus) {
    const canToggle = true;
    return maybeHint(
      STATUS_HINT.markRetry,
      STATUS_HINT_COPY.markRetry,
      canToggle,
      <AlertCircle
        size={iconSize}
        className={`${baseClass} ${baseClass}--failed${interactiveClass(baseClass, canToggle)}`}
        onClick={() => onRetryClick?.(item)}
        style={{ cursor: "pointer" }}
        title="Discovery failed. Click to mark for retry."
      />
    );
  }

  if (hasPendingRetry) {
    const canToggle = true;
    return maybeHint(
      STATUS_HINT.undoRetry,
      STATUS_HINT_COPY.undoRetry,
      canToggle,
      <RotateCw
        size={iconSize}
        className={`${baseClass} ${baseClass}--retry${interactiveClass(baseClass, canToggle)}`}
        onClick={() => onRetryClick?.(item)}
        style={{ cursor: "pointer" }}
        title="Marked for discovery retry. Click to undo."
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
