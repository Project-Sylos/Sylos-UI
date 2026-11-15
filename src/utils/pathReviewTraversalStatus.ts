import { DiffItem } from "../api/services";

/** True if any side still has a traversal failure. */
export function hasTraversalFailure(item: DiffItem): boolean {
  return (
    item.src?.traversalStatus === "failed" ||
    item.dst?.traversalStatus === "failed" ||
    item.traversalStatus === "failed"
  );
}

/** Traversal excluded because the user acknowledged a discovery failure. */
export function isTraversalAckFromFailed(item: DiffItem): boolean {
  return item.src?.traversalAckFromFailed === true;
}

/** Root-pick / traversal-skipped: subtree was never explored (not ack-from-failed). */
export function isTraversalSkipped(item: DiffItem): boolean {
  return (
    item.src?.traversalStatus === "excluded" && !isTraversalAckFromFailed(item)
  );
}

/**
 * Pending-retry icon: no side is still failed, and a retryable side is pending.
 * DST pending next to a present SRC is normal dest backlog, not retry.
 */
export function isTraversalRetryPending(item: DiffItem): boolean {
  if (hasTraversalFailure(item)) {
    return false;
  }
  if (item.src) {
    return item.src.traversalStatus === "pending";
  }
  return item.dst?.traversalStatus === "pending";
}

/** Node id to send to mark/unmark discovery retry. SRC is preferred when it is involved. */
export function getTraversalRetryNodeId(item: DiffItem): string | null {
  const srcStatus = item.src?.traversalStatus;
  const dstStatus = item.dst?.traversalStatus;

  if ((srcStatus === "failed" || srcStatus === "excluded" || srcStatus === "pending") && item.src?.id) {
    return item.src.id;
  }
  if ((dstStatus === "failed" || dstStatus === "pending") && item.dst?.id) {
    return item.dst.id;
  }
  return null;
}

/** Flip every failed side to pending (or pending sides back) for optimistic discovery retry. */
export function applyDiscoveryRetryOptimistic(
  item: DiffItem,
  marking: boolean,
  unmarkRestore: "failed" | "excluded" = "failed"
): DiffItem {
  const updated: DiffItem = { ...item };
  const srcSt = item.src?.traversalStatus;
  const dstSt = item.dst?.traversalStatus;

  if (item.src) {
    const flipSrc = marking
      ? srcSt === "failed" || srcSt === "excluded"
      : srcSt === "pending";
    if (flipSrc) {
      const nextTrav = marking ? "pending" : unmarkRestore;
      const wasAck = item.src.traversalAckFromFailed === true;
      updated.src = {
        ...item.src,
        traversalStatus: nextTrav,
        traversalAckFromFailed: marking
          ? false
          : unmarkRestore === "excluded" && wasAck
            ? true
            : false,
        ...(marking && srcSt === "excluded" && !wasAck
          ? { copyStatus: "pending" }
          : {}),
        ...(!marking && unmarkRestore === "excluded" && !wasAck
          ? { copyStatus: "excluded" }
          : {}),
      };
      updated.traversalStatus = nextTrav;
      if (marking && srcSt === "excluded" && !wasAck) {
        updated.copyStatus = "pending";
      }
      if (!marking && unmarkRestore === "excluded" && !wasAck) {
        updated.copyStatus = "excluded";
      }
    }
  }

  if (item.dst) {
    const flipDst = marking ? dstSt === "failed" : dstSt === "pending";
    if (flipDst) {
      const nextDst = marking ? "pending" : "failed";
      updated.dst = { ...item.dst, traversalStatus: nextDst };
      if (!updated.src) {
        updated.traversalStatus = nextDst;
      }
    }
  }

  return updated;
}
