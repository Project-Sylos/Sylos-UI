import { DiffItem } from "../api/services";

/** Discovery retry is driven by the SRC queue only; DST pending is normal backlog. */
export function isSrcTraversalRetryPending(item: DiffItem): boolean {
  return item.src?.traversalStatus === "pending";
}

export function hasTraversalFailure(item: DiffItem): boolean {
  return (
    item.src?.traversalStatus === "failed" ||
    item.dst?.traversalStatus === "failed" ||
    item.traversalStatus === "failed"
  );
}

/** Item should show the pending-retry icon during traversal review. */
export function isTraversalRetryPending(item: DiffItem): boolean {
  return isSrcTraversalRetryPending(item) && !hasTraversalFailure(item);
}

/** SRC or DST node to mark/unmark for discovery retry (traversal phase). */
export function getTraversalRetryNodeId(item: DiffItem): string | null {
  const srcStatus = item.src?.traversalStatus;
  const dstStatus = item.dst?.traversalStatus;

  if (srcStatus === "failed" && item.src?.id) {
    return item.src.id;
  }
  if (dstStatus === "failed" && item.dst?.id) {
    return item.dst.id;
  }
  if (srcStatus === "pending" && item.src?.id) {
    return item.src.id;
  }
  return null;
}
