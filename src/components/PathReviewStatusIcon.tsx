import type { ReactElement } from "react";
import { Clock, X, Check, AlertCircle, RotateCw, Trash2, Ban } from "lucide-react";
import { DiffItem } from "../api/services";
import InteractionHint from "./InteractionHint";
import { STATUS_HINT } from "./pathReviewStatusHints";
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
import type { MutationOpState } from "../utils/pathReviewMutationGuard";

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
  /** Optimistic glyph stays; overlay spinner then green check while this is set. */
  opState?: MutationOpState;
  /** @deprecated Prefer opState; treated as pending when set. */
  opInProgressTitle?: string;
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
  opState,
  opInProgressTitle,
}: PathReviewStatusIconProps) {
  const iconSize = size || 20 * zoomLevel;
  const resolvedOp: MutationOpState | undefined =
    opState ??
    (opInProgressTitle
      ? { title: opInProgressTitle, phase: "pending" }
      : undefined);
  const isSourceCleanup = phase === "source-cleanup";
  const isDeleteReview = phase === "delete";
  const isCopyPlan = phase === "copy-plan";
  const isCopy = phase === "copy";

  const srcTraversalStatus = item.src?.traversalStatus;
  const dstTraversalStatus = item.dst?.traversalStatus;
  const copyStatus = item.src?.copyStatus || item.copyStatus || "";
  const existsOnlyOnDst = !item.src && !!item.dst;

  const baseClass = className || "path-review__item-status-icon";

  const wrapWithOpOverlay = (glyph: ReactElement): ReactElement => {
    if (!resolvedOp) return glyph;
    const overlay =
      resolvedOp.phase === "confirmed" ? (
        <span
          className="path-review-op-confirm"
          title={resolvedOp.title}
          aria-label="Update confirmed"
          role="status"
        >
          ✓
        </span>
      ) : (
        <span
          className="path-review-op-spinner path-review-op-spinner--overlay"
          title={resolvedOp.title}
          aria-label={resolvedOp.title}
          role="status"
        />
      );
    return (
      <span className="path-review-op-wrap">
        {glyph}
        {overlay}
      </span>
    );
  };

  const maybeHint = (
    tipId: string,
    canToggle: boolean,
    icon: ReactElement
  ): ReactElement => {
    const hinted = !canToggle ? (
      icon
    ) : (
      <InteractionHint tipId={tipId} position="right">
        {icon}
      </InteractionHint>
    );
    return wrapWithOpOverlay(hinted);
  };

  const staticIcon = (icon: ReactElement): ReactElement =>
    wrapWithOpOverlay(icon);

  if (isSourceCleanup) {
    if (existsOnlyOnDst && !item.src) {
      return staticIcon(
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
      return staticIcon(
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
      return staticIcon(
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
      return staticIcon(
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
      return staticIcon(
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists-only-dst`}
          style={{ cursor: "default" }}
        />
      );
    }
    if (isCopyComplete(copyStatus)) {
      return staticIcon(
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
      const retryMarked = item.src?.copyRetryMarked === true;
      if (retryMarked) {
        return maybeHint(
        STATUS_HINT.undoRetry,
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
      return maybeHint(
        STATUS_HINT.exclude,
        canToggle,
        <Clock
          size={iconSize}
          className={`${baseClass} ${baseClass}--pending${interactiveClass(baseClass, canToggle)}`}
          onClick={() => onRetryClick?.(item)}
          style={{ cursor: "pointer" }}
          title="Pending copy. Click to exclude."
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
      return staticIcon(
        <Check
          size={iconSize}
          className={`${baseClass} ${baseClass}--exists-only-dst`}
          style={{ cursor: "default" }}
        />
      );
    }

    if (isCopyComplete(copyStatus)) {
      return staticIcon(
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
    return staticIcon(
        <Check
        size={iconSize}
        className={`${baseClass} ${baseClass}--exists-only-dst`}
        style={{ cursor: "default" }}
      />
      );
  }

  if (item.src || item.dst) {
    return staticIcon(
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
