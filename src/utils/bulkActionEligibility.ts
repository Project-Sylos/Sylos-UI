import type { DiffItem } from "../api/services";
import {
  canForceReplaceCopy,
  canUnforceReplaceCopy,
} from "./forceReplaceCopy";
import { isDeletePendingExplicit } from "./pathReviewDeletePlan";
import type { PathReviewItemStatus } from "./pathReviewItemStatus";
import type { PathReviewUIPhase } from "./pathReviewPhase";
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

/** Whether the item is currently marked to be retried, per review phase. */
function isBulkMarkedForRetry(item: DiffItem, phase: PathReviewUIPhase): boolean {
  if (phase === "delete") {
    return isDeletePendingExplicit(item.src?.deleteStatus || "");
  }
  if (phase === "copy") {
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
 * Mirrors the single-item rules used by the row context menus.
 */
export function bulkActionInvalidReason(
  action: BulkActionKind,
  item: DiffItem,
  status: PathReviewItemStatus,
  phase: PathReviewUIPhase,
  forceReplaceAllowed = false
): string | null {
  switch (action) {
    case "exclude":
      if (status.existsOnlyOnDst) return "Destination only";
      if (status.existsOnBoth) return "Already on the destination";
      if (status.isExcluded) return "Already excluded";
      if (status.isTraversalSkipped) return "Skipped during discovery";
      return null;
    case "unexclude":
      return status.isExcluded ? null : "Not excluded";
    case "mark_retry":
      if (status.existsOnlyOnDst) return "Destination only";
      if (isBulkMarkedForRetry(item, phase)) return "Already marked for retry";
      if (status.isFailed || status.isTraversalSkipped) return null;
      if (status.existsOnBoth) return "Already on the destination";
      return "Not in a failed state";
    case "mark_failed":
      return isBulkMarkedForRetry(item, phase) ? null : "Not marked for retry";
    case "force_replace":
      return canForceReplaceCopy(item, forceReplaceAllowed)
        ? null
        : "Not exists-on-both";
    case "unforce_replace":
      return canUnforceReplaceCopy(item, forceReplaceAllowed)
        ? null
        : "Not marked to replace with source";
  }
}

/** Split a selection into items an action can be applied to and items it cannot. */
export function partitionBulkAction(
  items: DiffItem[],
  action: BulkActionKind,
  statusOf: (item: DiffItem) => PathReviewItemStatus,
  phase: PathReviewUIPhase,
  forceReplaceAllowed = false
): BulkActionPartition {
  const valid: DiffItem[] = [];
  const invalid: BulkInvalidItem[] = [];
  for (const item of items) {
    const reason = bulkActionInvalidReason(
      action,
      item,
      statusOf(item),
      phase,
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
