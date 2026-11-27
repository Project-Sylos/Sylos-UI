import type { DiffItem } from "../api/services";
import { isCopyComplete } from "./copyStatus";
import {
  COPY_CYCLE_LABELS,
  copyCycleStep,
  type CopyCycleStep,
} from "./copyStatusCycle";
import {
  canForceReplaceCopy,
  canUnforceReplaceCopy,
} from "./forceReplaceCopy";
import {
  canRenameDestinationItem,
  collisionSiblingFromFolderPeers,
  hasAcceptedDestinationRename,
  isSiblingCollisionIssue,
} from "./pathReviewCopy";
import { isDeletePendingExplicit } from "./pathReviewDeletePlan";
import type { PathReviewItemStatus } from "./pathReviewItemStatus";
import type { PathReviewDisplayPhase } from "./pathReviewPhase";
import { isRuleExcluded } from "./pathReviewRuleExclusion";
import {
  hasTraversalFailure,
  isTraversalAckFromFailed,
  isTraversalRetryPending,
  isTraversalSkipped,
} from "./pathReviewTraversalStatus";
import {
  REVIEW_STATUS_LABELS,
  availableReviewStatusTransitions,
  reviewCycleClickTarget,
  type ReviewCycleStatus,
  type ReviewStatusAxis,
} from "./reviewStatusCycle";

export type PathReviewItemActions = {
  /** Show Exclude in inspector / menus for this phase (may be disabled). */
  showExclude: boolean;
  canExclude: boolean;
  excludeLabel: string;
  excludeDisabledReason: string | null;
  /** True when exclude is an acknowledge/unacknowledge of a failure. */
  excludeIsAcknowledge: boolean;
  showRetry: boolean;
  canRetry: boolean;
  retryLabel: string;
  retryDisabledReason: string | null;
  copyStep: CopyCycleStep | null;
  /** Axis for PUT status transitions (results phases). */
  reviewAxis: ReviewStatusAxis | null;
  /** Direct status targets for context menus (omits current). */
  statusTransitions: ReviewCycleStatus[];
  canRename: boolean;
  renameDisabledReason: string | null;
  canForceReplace: boolean;
  canUnforceReplace: boolean;
  canUniqueName: boolean;
  /** Undo accepted unique / remap destination name. */
  canUndoAcceptedRename: boolean;
  /** Suggested free name for Accept unique (server or local fallback). */
  uniqueNameSuggestion: string | null;
  canSkipDelete: boolean;
  skipDeleteLabel: string;
  /** Any status glyph that should look/act interactive. */
  statusIconInteractive: boolean;
  /** Acknowledged-from-failed on the active axis (traversal ack or copy excluded-from-failed). */
  isAcknowledgedExcluded: boolean;
};

export function reviewStatusTransitionLabel(status: ReviewCycleStatus): string {
  return REVIEW_STATUS_LABELS[status];
}

export type PathReviewItemActionsOptions = {
  showCompatUI?: boolean;
  forceReplaceAllowed?: boolean;
  locked?: boolean;
  /** Local optimistic retry mark (tree retryItems set). */
  isMarkedForRetry?: boolean;
  /**
   * Other rows in the same folder (tree/list page). Used to detect soft
   * proposals that collide with a DST-only sibling.
   */
  folderPeers?: DiffItem[];
};

/** Server suggestion, else cleaned base + " (1)" for UI labels before list refresh. */
export function resolveUniqueNameSuggestion(
  item: DiffItem,
  collisionTarget?: string | null
): string {
  const fromServer = (item.suggestedUniqueName || "").trim();
  if (fromServer) return fromServer;
  const base = (
    item.proposedPath ||
    collisionTarget ||
    item.collisionSibling ||
    item.name ||
    ""
  ).trim();
  if (!base) return "";
  const isFile = item.type === "file";
  if (!isFile) return `${base} (1)`;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return `${base} (1)`;
  return `${base.slice(0, dot)} (1)${base.slice(dot)}`;
}

function copyStatusOf(item: DiffItem): string {
  return item.src?.copyStatus || item.copyStatus || "";
}

function deleteStatusOf(item: DiffItem): string {
  return item.src?.deleteStatus || "";
}

function isCopyExcluded(copyStatus: string): boolean {
  return (
    copyStatus === "exclusion_explicit" ||
    copyStatus === "exclusion_inherited" ||
    copyStatus === "excluded"
  );
}

/**
 * Single source of truth for Path Review row actions across Apply, context
 * menus, inspector, and status icons.
 */
export function getPathReviewItemActions(
  item: DiffItem,
  status: PathReviewItemStatus,
  displayPhase: PathReviewDisplayPhase,
  options: PathReviewItemActionsOptions = {}
): PathReviewItemActions {
  const showCompatUI = options.showCompatUI !== false;
  const forceReplaceAllowed = options.forceReplaceAllowed === true;
  const locked = options.locked === true;
  const localRetry = options.isMarkedForRetry === true;

  const copyStatus = copyStatusOf(item);
  const deleteStatus = deleteStatusOf(item);
  const ruleExcluded = isRuleExcluded(item);
  const travAck = isTraversalAckFromFailed(item);
  const travSkipped = isTraversalSkipped(item);
  const travFailed = hasTraversalFailure(item);
  const travRetry =
    isTraversalRetryPending(item) ||
    (localRetry && !travFailed && displayPhase === "traversal");

  const copyStep =
    displayPhase === "copy" && !ruleExcluded ? copyCycleStep(item) : null;
  const copyFailed = copyStatus === "failed";
  const copyExcluded = isCopyExcluded(copyStatus);
  const copyExcludedFromFailed = item.src?.copyExcludedFromFailed === true;
  const copyRetryMarked =
    copyStatus === "pending" && item.src?.copyRetryMarked === true;

  const deleteFailed = deleteStatus === "failed";
  const deleteSkipped = deleteStatus === "skipped";
  const deleteRetry =
    isDeletePendingExplicit(deleteStatus) ||
    (localRetry &&
      (displayPhase === "delete" || displayPhase === "source-cleanup") &&
      deleteStatus !== "deleted");

  const canForceReplace = canForceReplaceCopy(item, forceReplaceAllowed);
  const canUnforceReplace = canUnforceReplaceCopy(item, forceReplaceAllowed);
  const peerCollision = collisionSiblingFromFolderPeers(
    item,
    options.folderPeers ?? []
  );
  const collisionTarget =
    item.collisionSibling ||
    item.pathIssueMessages?.find((m) => m.category === "SiblingCollision")
      ?.detail ||
    peerCollision ||
    null;
  const collision =
    showCompatUI &&
    (isSiblingCollisionIssue(item) ||
      (!!collisionTarget &&
        (!!item.proposedPath || item.pathIssueStatus === "manual_review")));
  const copyOkForUniqueName =
    copyStatus === "pending" ||
    copyStatus === "" ||
    copyStatus === "already_existed";
  const canUniqueName = collision && copyOkForUniqueName;
  const uniqueNameSuggestion = canUniqueName
    ? resolveUniqueNameSuggestion(item, collisionTarget)
    : null;
  const canUndoAcceptedRename =
    showCompatUI &&
    hasAcceptedDestinationRename(item) &&
    (copyStatus === "pending" ||
      copyStatus === "" ||
      copyStatus === "already_existed");

  const base: PathReviewItemActions = {
    showExclude: false,
    canExclude: false,
    excludeLabel: "Exclude",
    excludeDisabledReason: null,
    excludeIsAcknowledge: false,
    showRetry: false,
    canRetry: false,
    retryLabel: "Mark for retry",
    retryDisabledReason: null,
    copyStep,
    reviewAxis: null,
    statusTransitions: [],
    canRename: false,
    renameDisabledReason: null,
    canForceReplace,
    canUnforceReplace,
    canUniqueName,
    canUndoAcceptedRename,
    uniqueNameSuggestion,
    canSkipDelete: false,
    skipDeleteLabel: "Keep on source",
    statusIconInteractive: false,
    isAcknowledgedExcluded: false,
  };

  if (displayPhase === "source-cleanup") {
    const canSkip =
      !!item.src && isCopyComplete(copyStatus) && !status.existsOnlyOnDst;
    base.canSkipDelete = canSkip;
    base.skipDeleteLabel = deleteSkipped
      ? "Schedule removal"
      : "Keep on source";
    base.statusIconInteractive = canSkip;
    return base;
  }

  if (displayPhase === "delete") {
    base.reviewAxis = "delete";
    base.statusTransitions = availableReviewStatusTransitions(item, "delete");
    const clickTarget = reviewCycleClickTarget(item, "delete");
    base.showExclude = true;
    base.excludeIsAcknowledge = true;
    if (status.existsOnlyOnDst || !item.src) {
      base.excludeDisabledReason = "Destination only";
    } else if (deleteFailed) {
      base.canExclude = true;
      base.excludeLabel = "Exclude";
      base.isAcknowledgedExcluded = false;
    } else if (deleteSkipped) {
      base.canExclude = true;
      base.excludeLabel = "Unexclude";
      base.isAcknowledgedExcluded = true;
    } else {
      base.excludeDisabledReason = "Only failed removals can be acknowledged";
    }
    base.showRetry = true;
    if (clickTarget) {
      base.canRetry = true;
      base.retryLabel = REVIEW_STATUS_LABELS[clickTarget];
    } else if (deleteFailed || deleteRetry) {
      base.canRetry = true;
      base.retryLabel = deleteRetry ? "Mark as failed" : "Mark for retry";
    } else {
      base.retryDisabledReason = "Not in a failed state";
    }
    base.statusIconInteractive = base.statusTransitions.length > 0;
    return base;
  }

  if (displayPhase === "copy-plan") {
    base.showExclude = true;
    if (status.existsOnlyOnDst) {
      base.excludeDisabledReason = "Destination only";
    } else if (status.existsOnBoth && item.type === "folder") {
      base.excludeDisabledReason = "Already on the destination";
    } else if (ruleExcluded) {
      base.excludeDisabledReason = "Excluded by filter rule";
    } else if (locked) {
      base.excludeDisabledReason = "Locked";
    } else if (copyExcluded) {
      base.canExclude = true;
      base.excludeLabel = "Unexclude";
    } else if (copyStatus === "pending" || copyStatus === "") {
      base.canExclude = true;
      base.excludeLabel = "Exclude";
    } else {
      base.excludeDisabledReason = "Not pending for copy";
    }
    base.statusIconInteractive = base.canExclude;
    if (showCompatUI) {
      base.canRename = canRenameDestinationItem(item);
      if (!base.canRename) {
        base.renameDisabledReason = "Rename not available for this item";
      }
    }
    return base;
  }

  if (displayPhase === "copy") {
    base.reviewAxis = "copy";
    base.statusTransitions = availableReviewStatusTransitions(item, "copy");
    const clickTarget = reviewCycleClickTarget(item, "copy");
    base.showExclude = true;
    base.excludeIsAcknowledge = true;
    if (status.existsOnlyOnDst) {
      base.excludeDisabledReason = "Destination only";
    } else if (ruleExcluded) {
      base.excludeDisabledReason = "Excluded by filter rule";
    } else if (locked) {
      base.excludeDisabledReason = "Locked";
    } else if (copyFailed) {
      base.canExclude = true;
      base.excludeLabel = "Exclude";
    } else if (copyExcluded) {
      base.canExclude = true;
      base.excludeLabel = copyExcludedFromFailed
        ? "Restore as failed"
        : "Unexclude";
      base.isAcknowledgedExcluded = copyExcludedFromFailed || copyExcluded;
    } else if (copyRetryMarked) {
      base.canExclude = true;
      base.excludeLabel = "Exclude";
    } else {
      base.excludeDisabledReason =
        "Only failed or excluded copy items can be acknowledged";
    }

    base.showRetry = true;
    if (clickTarget) {
      base.canRetry = true;
      base.retryLabel =
        copyStep !== null
          ? COPY_CYCLE_LABELS[copyStep]
          : REVIEW_STATUS_LABELS[clickTarget];
    } else if (copyFailed || copyRetryMarked) {
      base.canRetry = true;
      base.retryLabel = copyRetryMarked ? "Mark as failed" : "Mark for retry";
    } else {
      base.retryDisabledReason = "Not in a failed state";
    }
    base.statusIconInteractive =
      base.statusTransitions.length > 0 ||
      canForceReplace ||
      canUnforceReplace;
    return base;
  }

  // Discovery results (traversal)
  base.reviewAxis = "discovery";
  base.statusTransitions = availableReviewStatusTransitions(item, "discovery");
  const discoveryClick = reviewCycleClickTarget(item, "discovery");
  base.showExclude = true;
  base.excludeIsAcknowledge = true;
  if (status.existsOnlyOnDst) {
    base.excludeDisabledReason = "Destination only";
  } else if (travSkipped) {
    base.excludeDisabledReason = "Skipped at root pick; use mark for retry";
  } else if (travAck) {
    base.canExclude = true;
    base.excludeLabel = "Unexclude";
    base.isAcknowledgedExcluded = true;
  } else if (travFailed || status.isFailed) {
    base.canExclude = true;
    base.excludeLabel = "Exclude";
  } else {
    base.excludeDisabledReason =
      "Only failed discoveries can be acknowledged";
  }

  base.showRetry = true;
  if (discoveryClick) {
    base.canRetry = true;
    base.retryLabel = REVIEW_STATUS_LABELS[discoveryClick];
  } else if (travFailed || travSkipped || travRetry || travAck) {
    base.canRetry = true;
    base.retryLabel = travRetry ? "Mark as failed" : "Mark for retry";
  } else {
    base.retryDisabledReason = "Not in a failed state";
  }

  if (showCompatUI) {
    base.canRename = canRenameDestinationItem(item);
    if (!base.canRename) {
      base.renameDisabledReason = "Rename not available for this item";
    }
  }

  base.statusIconInteractive =
    base.statusTransitions.length > 0 || travSkipped || travAck;
  return base;
}

/** Whether bulk Exclude should appear in Apply menus for this display phase. */
export function displayPhaseAllowsBulkExclude(
  displayPhase: PathReviewDisplayPhase
): boolean {
  return (
    displayPhase === "traversal" ||
    displayPhase === "copy-plan" ||
    displayPhase === "copy" ||
    displayPhase === "delete"
  );
}

/** True when exclude should set excluded=true (vs unexclude). */
export function excludeActionSetsExcluded(
  item: DiffItem,
  displayPhase: PathReviewDisplayPhase,
  status: PathReviewItemStatus
): boolean {
  if (displayPhase === "delete") {
    return deleteStatusOf(item) === "failed";
  }
  if (displayPhase === "copy" || displayPhase === "copy-plan") {
    return !isCopyExcluded(copyStatusOf(item));
  }
  // Discovery: exclude when not already ack-excluded.
  return !isTraversalAckFromFailed(item) && !status.isExcluded;
}

/** Optimistic DiffItem update for Exclude / Unexclude (ack or copy-axis). */
export function applyExcludeOptimistic(
  item: DiffItem,
  excluding: boolean,
  displayPhase: PathReviewDisplayPhase
): DiffItem {
  if (displayPhase === "traversal") {
    if (excluding) {
      return {
        ...item,
        traversalStatus: "excluded",
        src: item.src
          ? {
              ...item.src,
              traversalStatus: "excluded",
              traversalAckFromFailed: true,
            }
          : item.src,
      };
    }
    return {
      ...item,
      traversalStatus: "failed",
      src: item.src
        ? {
            ...item.src,
            traversalStatus: "failed",
            traversalAckFromFailed: false,
          }
        : item.src,
    };
  }
  if (displayPhase === "delete") {
    return {
      ...item,
      src: item.src
        ? {
            ...item.src,
            deleteStatus: excluding ? "skipped" : "failed",
          }
        : item.src,
    };
  }
  const fromFailed =
    excluding &&
    (copyStatusOf(item) === "failed" || item.src?.copyRetryMarked === true);
  const newCopyStatus = excluding
    ? "exclusion_explicit"
    : item.src?.copyExcludedFromFailed
      ? "failed"
      : "pending";
  return {
    ...item,
    copyStatus: newCopyStatus,
    src: item.src
      ? {
          ...item.src,
          copyStatus: newCopyStatus,
          copyRetryMarked: false,
          copyExcludedFromFailed: excluding ? fromFailed : false,
        }
      : item.src,
  };
}
