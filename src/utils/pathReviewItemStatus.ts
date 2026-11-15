import { DiffItem } from "../api/services";
import { isCopyComplete } from "./copyStatus";
import { isDeletePendingExplicit } from "./pathReviewDeletePlan";
import {
  hasTraversalFailure,
  isTraversalRetryPending,
  isTraversalSkipped,
} from "./pathReviewTraversalStatus";
import type { PathReviewDisplayPhase, PathReviewUIPhase } from "./pathReviewPhase";

export type PathReviewItemStatus = {
  isExcluded: boolean;
  isTraversalSkipped: boolean;
  isPending: boolean;
  isSuccessful: boolean;
  isDeleted?: boolean;
  existsOnBoth: boolean;
  existsOnlyOnDst: boolean;
  isFailed: boolean;
};

/** Map display phase to the status axis used for row chrome. */
export function itemStatusPhase(
  displayPhase: PathReviewDisplayPhase
): PathReviewUIPhase {
  if (displayPhase === "source-cleanup" || displayPhase === "delete") {
    return "delete";
  }
  if (displayPhase === "copy" || displayPhase === "copy-plan") {
    return "copy";
  }
  return "traversal";
}

/** Destination-only row: unpaired DEST (engine: DST copy destination_only; legacy trav not_on_src). */
function isDestinationOnly(item: DiffItem): boolean {
  if (item.src) return false;
  return (
    !!item.dst ||
    item.copyStatus === "destination_only" ||
    item.dst?.copyStatus === "destination_only" ||
    item.traversalStatus === "not_on_src" ||
    item.dst?.traversalStatus === "not_on_src"
  );
}

/**
 * Phase-aware row status for tree/list chrome (not icons).
 * Traversal: failure/retry/skip from traversal_status; exclude/exists flags still
 * reflect copy_status so context-menu exclude works without driving the footer.
 * Copy / copy-plan: copy_status axis.
 */
export function getPathReviewItemStatus(
  item: DiffItem,
  phase: PathReviewUIPhase
): PathReviewItemStatus {
  if (phase === "delete") {
    const existsOnlyOnDst = isDestinationOnly(item);
    if (existsOnlyOnDst) {
      return {
        isExcluded: false,
        isTraversalSkipped: false,
        isPending: false,
        isSuccessful: false,
        isDeleted: false,
        existsOnBoth: false,
        existsOnlyOnDst: true,
        isFailed: false,
      };
    }
    const deleteStatus = item.src?.deleteStatus || "";
    const isDeleted = deleteStatus === "deleted";
    const isFailed = deleteStatus === "failed";
    const isPendingRetry = isDeletePendingExplicit(deleteStatus);
    return {
      isExcluded: false,
      isTraversalSkipped: false,
      isPending: isPendingRetry,
      isSuccessful: isDeleted,
      isDeleted,
      existsOnBoth: false,
      existsOnlyOnDst: false,
      isFailed,
    };
  }

  const copyStatus = item.src?.copyStatus || item.copyStatus || "";
  const existsOnlyOnDst = isDestinationOnly(item);

  if (phase === "copy") {
    const isFailed = copyStatus === "failed";
    const isExcluded =
      copyStatus === "exclusion_explicit" ||
      copyStatus === "exclusion_inherited" ||
      copyStatus === "excluded";
    const isPending = copyStatus === "pending" || copyStatus === "";
    const isSuccessful = isCopyComplete(copyStatus) || existsOnlyOnDst;
    return {
      isExcluded,
      isTraversalSkipped: false,
      isPending,
      isSuccessful,
      existsOnBoth: isCopyComplete(copyStatus),
      existsOnlyOnDst,
      isFailed,
    };
  }

  const skippedDiscovery = isTraversalSkipped(item);
  const isFailed = hasTraversalFailure(item);
  const isExcluded =
    !skippedDiscovery &&
    (copyStatus === "exclusion_explicit" ||
      copyStatus === "exclusion_inherited" ||
      copyStatus === "excluded");
  const retryPending = isTraversalRetryPending(item);
  return {
    isExcluded,
    isTraversalSkipped: skippedDiscovery,
    isPending: retryPending,
    isSuccessful:
      !isFailed &&
      !skippedDiscovery &&
      !retryPending &&
      (!!item.src || !!item.dst || existsOnlyOnDst),
    existsOnBoth: isCopyComplete(copyStatus),
    existsOnlyOnDst,
    isFailed,
  };
}
