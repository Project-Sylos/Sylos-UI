import type { DiffItem } from "../api/services";
import {
  canForceReplaceCopy,
  canUnforceReplaceCopy,
} from "./forceReplaceCopy";
import { isDeletePendingExplicit } from "./pathReviewDeletePlan";
import {
  excludeActionSetsExcluded,
  getPathReviewItemActions,
} from "./pathReviewItemActions";
import type { PathReviewItemStatus } from "./pathReviewItemStatus";
import type { PathReviewDisplayPhase } from "./pathReviewPhase";
import { isTraversalRetryPending } from "./pathReviewTraversalStatus";

export type BulkActionKind =
  | "exclude"
  | "unexclude"
  | "mark_retry"
  | "mark_failed"
  | "force_replace"
  | "unforce_replace";

export const BULK_ACTION_LABELS: Record<BulkActionKind, string> = {
  exclude: "Exclude",
  unexclude: "Unexclude",
  mark_retry: "Mark for retry",
  mark_failed: "Mark failed",
  force_replace: "Replace with source",
  unforce_replace: "Keep destination (undo replace)",
};

export interface BulkInvalidItem {
  item: DiffItem;
  reason: string;
}

export interface BulkActionPartition {
  valid: DiffItem[];
  invalid: BulkInvalidItem[];
}

/** Whether the item is currently marked to be retried, per review display phase. */
function isBulkMarkedForRetry(
  item: DiffItem,
  displayPhase: PathReviewDisplayPhase
): boolean {
  if (displayPhase === "delete" || displayPhase === "source-cleanup") {
    return isDeletePendingExplicit(item.src?.deleteStatus || "");
  }
  if (displayPhase === "copy" || displayPhase === "copy-plan") {
    // Only retry-marked pending counts; a never-attempted pending item has
    // no failure to return to.
    return (
      (item.src?.copyStatus || item.copyStatus || "") === "pending" &&
      item.src?.copyRetryMarked === true
    );
  }
  return isTraversalRetryPending(item);
}

/**
 * Why an item cannot have the action applied, or null when it can.
 * Uses the same eligibility as getPathReviewItemActions.
 */
export function bulkActionInvalidReason(
  action: BulkActionKind,
  item: DiffItem,
  status: PathReviewItemStatus,
  displayPhase: PathReviewDisplayPhase,
  forceReplaceAllowed = false
): string | null {
  const acts = getPathReviewItemActions(item, status, displayPhase, {
    forceReplaceAllowed,
  });
  switch (action) {
    case "exclude": {
      if (!acts.canExclude) {
        return acts.excludeDisabledReason || "Cannot exclude";
      }
      if (!excludeActionSetsExcluded(item, displayPhase, status)) {
        return "Already excluded";
      }
      return null;
    }
    case "unexclude": {
      if (!acts.canExclude) {
        return acts.excludeDisabledReason || "Not excluded";
      }
      if (excludeActionSetsExcluded(item, displayPhase, status)) {
        return "Not excluded";
      }
      return null;
    }
    case "mark_retry": {
      if (isBulkMarkedForRetry(item, displayPhase)) {
        return "Already marked for retry";
      }
      if (acts.canRetry && acts.retryLabel === "Mark for retry") {
        return null;
      }
      // Copy cycle "mark" step
      if (acts.copyStep === "mark") {
        return null;
      }
      if (status.isFailed || status.isTraversalSkipped) {
        return null;
      }
      return acts.retryDisabledReason || "Not in a failed state";
    }
    case "mark_failed":
      return isBulkMarkedForRetry(item, displayPhase)
        ? null
        : "Not marked for retry";
    case "force_replace":
      return canForceReplaceCopy(item, forceReplaceAllowed)
        ? null
        : "Only paired files that keep destination";
    case "unforce_replace":
      return canUnforceReplaceCopy(item, forceReplaceAllowed)
        ? null
        : "Only paired files that prefer source";
  }
}

/** Split a selection into items an action can be applied to and items it cannot. */
export function partitionBulkAction(
  items: DiffItem[],
  action: BulkActionKind,
  statusOf: (item: DiffItem) => PathReviewItemStatus,
  displayPhase: PathReviewDisplayPhase,
  forceReplaceAllowed = false
): BulkActionPartition {
  const valid: DiffItem[] = [];
  const invalid: BulkInvalidItem[] = [];
  for (const item of items) {
    const reason = bulkActionInvalidReason(
      action,
      item,
      statusOf(item),
      displayPhase,
      forceReplaceAllowed
    );
    if (reason === null) {
      valid.push(item);
    } else {
      invalid.push({ item, reason });
    }
  }
  return { valid, invalid };
}

/** Node IDs to send for a batch, covering both sides without duplicates. */
export function bulkNodeIDs(items: DiffItem[]): string[] {
  const nodeIDs: string[] = [];
  for (const item of items) {
    if (item.src?.id) nodeIDs.push(item.src.id);
    if (item.dst?.id && (!item.src?.id || item.dst.id !== item.src.id)) {
      nodeIDs.push(item.dst.id);
    }
  }
  return nodeIDs;
}

/** SRC-only node IDs for force-replace (dest-only rows have no SRC mark). */
export function bulkSrcNodeIDs(items: DiffItem[]): string[] {
  const nodeIDs: string[] = [];
  for (const item of items) {
    if (item.src?.id) nodeIDs.push(item.src.id);
  }
  return nodeIDs;
}
