import type { Dispatch, SetStateAction } from "react";
import { setNodeStatus, type DiffItem } from "../api/services";
import { isNoItemsChangedError } from "./bulkActionToast";
import {
  EXCLUSION_OP_TITLE,
  MUTATION_CONFIRM_MS,
  MUTATION_FAIL_MS,
  RETRY_OP_TITLE,
  canStartItemMutation,
  itemMutationIds,
  withInFlightOp,
  type MutationOpState,
} from "./pathReviewMutationGuard";
import { isDeletePendingExplicit } from "./pathReviewDeletePlan";
import {
  applyDiscoveryAckOptimistic,
  applyDiscoveryRetryOptimistic,
  getTraversalRetryNodeId,
  hasTraversalFailure,
  isTraversalAckFromFailed,
  isTraversalRetryPending,
  isTraversalSkipped,
} from "./pathReviewTraversalStatus";

/** Review axis for PUT /node/{id}/status. */
export type ReviewStatusAxis = "discovery" | "copy" | "delete";

/** Universal failure-axis statuses: failed → pending (retry) → excluded → failed. */
export type ReviewCycleStatus = "failed" | "pending" | "excluded";

const CYCLE_ORDER: ReviewCycleStatus[] = ["failed", "pending", "excluded"];

export const REVIEW_STATUS_LABELS: Record<ReviewCycleStatus, string> = {
  failed: "Mark as failed",
  pending: "Mark for retry",
  excluded: "Exclude",
};

export function nextReviewCycleStatus(
  current: ReviewCycleStatus
): ReviewCycleStatus {
  const i = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(i + 1) % CYCLE_ORDER.length];
}

function copyStatusOf(item: DiffItem): string {
  return item.src?.copyStatus || item.copyStatus || "";
}

function isCopyExcludedStatus(status: string): boolean {
  return (
    status === "exclusion_explicit" ||
    status === "exclusion_inherited" ||
    status === "excluded"
  );
}

/**
 * Current failure-axis status for an item, or null when the item is not on
 * the failed / retry / excluded cycle (e.g. successful, destination-only).
 */
export function currentReviewCycleStatus(
  item: DiffItem,
  axis: ReviewStatusAxis
): ReviewCycleStatus | null {
  if (axis === "discovery") {
    if (hasTraversalFailure(item)) return "failed";
    if (isTraversalRetryPending(item)) return "pending";
    if (isTraversalAckFromFailed(item)) return "excluded";
    // Root-pick skipped is excluded but not ack-from-failed; still cycle via retry.
    if (isTraversalSkipped(item)) return "excluded";
    return null;
  }
  if (axis === "delete") {
    const ds = item.src?.deleteStatus || "";
    if (ds === "failed") return "failed";
    if (isDeletePendingExplicit(ds)) return "pending";
    if (ds === "skipped") return "excluded";
    return null;
  }
  const cs = copyStatusOf(item);
  if (cs === "failed") return "failed";
  if (cs === "pending") return "pending";
  if (isCopyExcludedStatus(cs)) return "excluded";
  return null;
}

/**
 * Statuses the user may transition to from the current state. Omits the
 * current status. Root-pick skipped discovery only offers retry. Born-pending
 * copy (not retry-marked) only offers exclude / include, not failed.
 */
export function availableReviewStatusTransitions(
  item: DiffItem,
  axis: ReviewStatusAxis
): ReviewCycleStatus[] {
  const current = currentReviewCycleStatus(item, axis);
  if (!current) return [];

  if (axis === "discovery" && isTraversalSkipped(item)) {
    return current === "pending" ? ["excluded"] : ["pending"];
  }

  if (axis === "copy") {
    const cs = copyStatusOf(item);
    const retryMarked = item.src?.copyRetryMarked === true;
    const fromFailed = item.src?.copyExcludedFromFailed === true;
    if (cs === "pending" && !retryMarked) {
      return ["excluded"];
    }
    if (isCopyExcludedStatus(cs) && !fromFailed) {
      return ["pending"];
    }
  }

  return CYCLE_ORDER.filter((s) => s !== current);
}

/** Next click target on the status icon, or null when not interactive. */
export function reviewCycleClickTarget(
  item: DiffItem,
  axis: ReviewStatusAxis
): ReviewCycleStatus | null {
  const current = currentReviewCycleStatus(item, axis);
  if (!current) return null;
  const available = availableReviewStatusTransitions(item, axis);
  if (available.length === 0) return null;

  if (axis === "discovery" && isTraversalSkipped(item)) {
    return current === "excluded" ? "pending" : "excluded";
  }
  if (axis === "copy") {
    const cs = copyStatusOf(item);
    const retryMarked = item.src?.copyRetryMarked === true;
    const fromFailed = item.src?.copyExcludedFromFailed === true;
    if (cs === "pending" && !retryMarked) return "excluded";
    if (isCopyExcludedStatus(cs) && !fromFailed) return "pending";
  }

  const preferred = nextReviewCycleStatus(current);
  if (available.includes(preferred)) return preferred;
  return available[0] ?? null;
}

export function nodeIdForReviewStatus(
  item: DiffItem,
  axis: ReviewStatusAxis
): string | null {
  if (axis === "discovery") {
    return getTraversalRetryNodeId(item);
  }
  return item.src?.id || null;
}

/** Optimistic DiffItem patch when setting a review-cycle status. */
export function applyReviewStatusOptimistic(
  item: DiffItem,
  axis: ReviewStatusAxis,
  status: ReviewCycleStatus
): DiffItem {
  if (axis === "discovery") {
    if (status === "pending") {
      return applyDiscoveryRetryOptimistic(item, true);
    }
    if (status === "failed") {
      if (isTraversalAckFromFailed(item)) {
        return applyDiscoveryAckOptimistic(item, false);
      }
      return applyDiscoveryRetryOptimistic(item, false, "failed");
    }
    // excluded (ack failed sides; successful peers left alone)
    return applyDiscoveryAckOptimistic(item, true);
  }

  if (axis === "delete") {
    const deleteStatus =
      status === "pending"
        ? "pending_explicit"
        : status === "excluded"
          ? "skipped"
          : "failed";
    return {
      ...item,
      src: item.src ? { ...item.src, deleteStatus } : item.src,
    };
  }

  // copy
  if (status === "pending") {
    return {
      ...item,
      copyStatus: "pending",
      src: item.src
        ? {
            ...item.src,
            copyStatus: "pending",
            copyRetryMarked: true,
            copyExcludedFromFailed: false,
          }
        : item.src,
    };
  }
  if (status === "failed") {
    return {
      ...item,
      copyStatus: "failed",
      src: item.src
        ? {
            ...item.src,
            copyStatus: "failed",
            copyRetryMarked: false,
            copyExcludedFromFailed: false,
          }
        : item.src,
    };
  }
  const fromFailed =
    copyStatusOf(item) === "failed" || item.src?.copyRetryMarked === true;
  return {
    ...item,
    copyStatus: "exclusion_explicit",
    src: item.src
      ? {
          ...item.src,
          copyStatus: "exclusion_explicit",
          copyRetryMarked: false,
          copyExcludedFromFailed: fromFailed,
        }
      : item.src,
  };
}

/** Pair key for dual-pane peers in the same folder (name + type). */
export function reviewPeerMatchKey(item: DiffItem): string {
  const name = (
    item.name ||
    item.src?.name ||
    item.dst?.name ||
    ""
  )
    .trim()
    .toLowerCase();
  return `${item.type}:${name}`;
}

function nodeIdsOf(item: DiffItem): string[] {
  const ids: string[] = [];
  if (item.id) ids.push(item.id);
  if (item.src?.id) ids.push(item.src.id);
  if (item.dst?.id) ids.push(item.dst.id);
  return ids;
}

export function isReviewPeerItem(a: DiffItem, b: DiffItem): boolean {
  if (a.id === b.id) return true;
  const aIds = new Set(nodeIdsOf(a));
  for (const id of nodeIdsOf(b)) {
    if (aIds.has(id)) return true;
  }
  const aKey = reviewPeerMatchKey(a);
  const bKey = reviewPeerMatchKey(b);
  return !!aKey && aKey === bKey && !aKey.endsWith(":");
}

/** Apply a status optimistic patch to the clicked row and any dual-pane peer. */
export function applyReviewStatusOptimisticToList(
  list: DiffItem[],
  clicked: DiffItem,
  axis: ReviewStatusAxis,
  status: ReviewCycleStatus
): DiffItem[] {
  return list.map((i) =>
    isReviewPeerItem(i, clicked)
      ? applyReviewStatusOptimistic(i, axis, status)
      : i
  );
}

/** Collect mutation ids for the clicked item and dual-pane peers. */
export function collectReviewStatusOpIds(
  clicked: DiffItem,
  peerLists: DiffItem[][]
): Array<string | null | undefined> {
  const ids = new Set<string>();
  const add = (item: DiffItem) => {
    for (const id of itemMutationIds(item)) {
      if (id) ids.add(id);
    }
  };
  add(clicked);
  for (const list of peerLists) {
    for (const i of list) {
      if (isReviewPeerItem(i, clicked)) add(i);
    }
  }
  return [...ids];
}

export interface ReviewStatusCycleDeps {
  setItems: Dispatch<SetStateAction<DiffItem[]>>;
  /** Dual-browse destination pane; patched so peer icons stay in sync. */
  setDstItems?: Dispatch<SetStateAction<DiffItem[]>>;
  /** Current tree/list rows used to find dual-pane peers and op ids. */
  peerLists?: DiffItem[][];
  mutationOps: ReadonlyMap<string, MutationOpState>;
  setMutationOps: Dispatch<SetStateAction<Map<string, MutationOpState>>>;
  notify: (message: string, type: "success" | "error") => void;
  applyDeltas?: (deltas: Record<string, number>) => void;
  afterSuccess?: () => void | Promise<void>;
  /** Optional local retry-id set used by discovery/delete views. */
  setRetryItems?: Dispatch<SetStateAction<Set<string>>>;
}

/**
 * Applies a status transition (icon click or context menu). Shared by tree
 * and list review views.
 */
export async function runReviewStatusTransition(
  migrationId: string,
  item: DiffItem,
  axis: ReviewStatusAxis,
  status: ReviewCycleStatus,
  deps: ReviewStatusCycleDeps
): Promise<void> {
  const nodeId = nodeIdForReviewStatus(item, axis);
  if (!nodeId) {
    deps.notify("No node available for this status change.", "error");
    return;
  }
  // Spinner already blocks the icon; silent no-op avoids toast spam on double-click.
  // Also treat dual-pane peers as the same in-flight target.
  const blocked =
    !canStartItemMutation(deps.mutationOps, item) ||
    (deps.peerLists ?? []).some((list) =>
      list.some(
        (peer) =>
          isReviewPeerItem(peer, item) &&
          !canStartItemMutation(deps.mutationOps, peer)
      )
    );
  if (blocked) {
    return;
  }

  const peerIds = new Set<string>([item.id]);
  for (const list of deps.peerLists ?? []) {
    for (const i of list) {
      if (isReviewPeerItem(i, item)) peerIds.add(i.id);
    }
  }

  const opTitle =
    status === "pending" || status === "failed"
      ? RETRY_OP_TITLE
      : EXCLUSION_OP_TITLE;
  const opIds: Array<string | null | undefined> = [
    ...collectReviewStatusOpIds(item, deps.peerLists ?? []),
    nodeId,
  ];
  // Keep the current status icon; only show spinner until the API settles.
  deps.setMutationOps((prev) => withInFlightOp(prev, opIds, opTitle));

  const patchList = (prevItems: DiffItem[]) =>
    applyReviewStatusOptimisticToList(prevItems, item, axis, status);

  const applySuccessLocally = () => {
    deps.setItems(patchList);
    deps.setDstItems?.(patchList);
    if (deps.setRetryItems) {
      deps.setRetryItems((prev) => {
        const next = new Set(prev);
        for (const id of peerIds) {
          if (status === "pending") next.add(id);
          else next.delete(id);
        }
        return next;
      });
    }
  };

  const showFailure = (message: string) => {
    deps.setMutationOps((prev) =>
      withInFlightOp(prev, opIds, message || opTitle, "failed")
    );
    window.setTimeout(() => {
      deps.setMutationOps((prev) => withInFlightOp(prev, opIds, null));
    }, MUTATION_FAIL_MS);
    if (!isNoItemsChangedError(message)) {
      deps.notify(message || "Failed to update node. Please try again.", "error");
    }
  };

  try {
    const result = await setNodeStatus(migrationId, nodeId, { axis, status });
    if (!result.success) {
      showFailure(result.error || "Failed to update node. Please try again.");
      return;
    }
    applySuccessLocally();
    if (result.deltas && Object.keys(result.deltas).length > 0) {
      deps.applyDeltas?.(result.deltas);
    }
    deps.setMutationOps((prev) =>
      withInFlightOp(prev, opIds, opTitle, "confirmed")
    );
    window.setTimeout(() => {
      deps.setMutationOps((prev) => withInFlightOp(prev, opIds, null));
    }, MUTATION_CONFIRM_MS);
    await deps.afterSuccess?.();
  } catch (err) {
    showFailure(
      err instanceof Error
        ? err.message
        : "Network error: Failed to update node. Please try again."
    );
  }
}

export async function runReviewStatusCycleClick(
  migrationId: string,
  item: DiffItem,
  axis: ReviewStatusAxis,
  deps: ReviewStatusCycleDeps
): Promise<void> {
  const target = reviewCycleClickTarget(item, axis);
  if (!target) {
    deps.notify("No status action available for this item.", "error");
    return;
  }
  await runReviewStatusTransition(migrationId, item, axis, target, deps);
}
