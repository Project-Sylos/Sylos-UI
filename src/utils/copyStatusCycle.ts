import type { Dispatch, SetStateAction } from "react";
import {
  excludeNode,
  markNodeForRetryCopy,
  unexcludeNode,
  type DiffItem,
} from "../api/services";
import { isNoItemsChangedError } from "./bulkActionToast";
import {
  EXCLUSION_OP_TITLE,
  MUTATION_CONFIRM_MS,
  RETRY_OP_TITLE,
  canStartMutation,
  withInFlightOp,
  type MutationOpState,
} from "./pathReviewMutationGuard";

/**
 * Next step of the copy status button cycle for one item, or null when the
 * status does not cycle. Failed items mark for retry; pending items exclude
 * (a retry-marked pending keeps its failed origin under the hood); excluded
 * items restore failed when they were excluded from a marked failure and
 * return to pending otherwise. Ordinary include (post-copy review) becomes
 * retry-marked pending so the retry CTA updates.
 */
export type CopyCycleStep = "mark" | "exclude" | "restore-failed" | "include";

export function copyCycleStep(item: DiffItem): CopyCycleStep | null {
  const copyStatus = item.src?.copyStatus || item.copyStatus || "";
  if (copyStatus === "failed") return "mark";
  if (copyStatus === "pending") return "exclude";
  if (
    copyStatus === "exclusion_explicit" ||
    copyStatus === "exclusion_inherited" ||
    copyStatus === "excluded"
  ) {
    return item.src?.copyExcludedFromFailed ? "restore-failed" : "include";
  }
  return null;
}

export const COPY_CYCLE_LABELS: Record<CopyCycleStep, string> = {
  mark: "Mark for retry",
  exclude: "Exclude",
  "restore-failed": "Restore as failed",
  include: "Include for retry",
};

export interface CopyCycleDeps {
  setItems: Dispatch<SetStateAction<DiffItem[]>>;
  mutationOps: ReadonlyMap<string, MutationOpState>;
  setMutationOps: Dispatch<SetStateAction<Map<string, MutationOpState>>>;
  notify: (message: string, type: "success" | "error") => void;
  applyDeltas?: (deltas: Record<string, number>) => void;
  afterSuccess?: () => void | Promise<void>;
}

/**
 * Runs one copy status button cycle step for an item: optimistic update,
 * phase endpoint call, stats deltas, and rollback on failure. Shared by the
 * tree and list review views; view-specific follow-up goes in afterSuccess.
 */
export async function runCopyCycleClick(
  migrationId: string,
  item: DiffItem,
  deps: CopyCycleDeps
): Promise<void> {
  const step = copyCycleStep(item);
  const srcNodeId = item.src?.id;
  if (!step || !srcNodeId) {
    deps.notify("No copy status action available for this item.", "error");
    return;
  }
  if (!canStartMutation(deps.mutationOps, srcNodeId)) {
    deps.notify(
      "An operation is already running on this path; try again once it finishes.",
      "error"
    );
    return;
  }

  const originalItem = { ...item };
  const opTitle =
    step === "mark" || step === "include" ? RETRY_OP_TITLE : EXCLUSION_OP_TITLE;
  const opIds: Array<string | null | undefined> = [srcNodeId, item.id];
  deps.setMutationOps((prev) => withInFlightOp(prev, opIds, opTitle));
  const next =
    step === "mark"
      ? { copyStatus: "pending", copyRetryMarked: true, copyExcludedFromFailed: false }
      : step === "exclude"
        ? {
            copyStatus: "exclusion_explicit",
            copyRetryMarked: false,
            copyExcludedFromFailed: item.src?.copyRetryMarked === true,
          }
        : step === "restore-failed"
          ? { copyStatus: "failed", copyRetryMarked: false, copyExcludedFromFailed: false }
          : // Post-copy include: engine marks retry_mark_copy (PhaseCopyReview).
            { copyStatus: "pending", copyRetryMarked: true, copyExcludedFromFailed: false };
  deps.setItems((prevItems) =>
    prevItems.map((i) => {
      if (i.id !== item.id) {
        return i;
      }
      return {
        ...i,
        copyStatus: next.copyStatus,
        src: i.src ? { ...i.src, ...next } : i.src,
      };
    })
  );

  let succeeded = false;
  try {
    const result =
      step === "mark"
        ? await markNodeForRetryCopy(migrationId, srcNodeId)
        : step === "exclude"
          ? await excludeNode(migrationId, srcNodeId)
          : await unexcludeNode(migrationId, srcNodeId);
    if (!result.success) {
      deps.setItems((prevItems) =>
        prevItems.map((i) => (i.id === item.id ? originalItem : i))
      );
      if (!isNoItemsChangedError(result.error)) {
        deps.notify(
          result.error || "Failed to update node. Please try again.",
          "error"
        );
      }
      return;
    }
    succeeded = true;
    if (result.deltas && Object.keys(result.deltas).length > 0) {
      deps.applyDeltas?.(result.deltas);
    }
    if (step === "mark" || step === "include") {
      deps.notify("Item marked for retry", "success");
    }
    deps.setMutationOps((prev) =>
      withInFlightOp(prev, opIds, opTitle, "confirmed")
    );
    window.setTimeout(() => {
      deps.setMutationOps((prev) => withInFlightOp(prev, opIds, null));
    }, MUTATION_CONFIRM_MS);
    await deps.afterSuccess?.();
  } catch (err) {
    deps.setItems((prevItems) =>
      prevItems.map((i) => (i.id === item.id ? originalItem : i))
    );
    deps.notify(
      err instanceof Error
        ? err.message
        : "Network error: Failed to update node. Please try again.",
      "error"
    );
  } finally {
    if (!succeeded) {
      deps.setMutationOps((prev) => withInFlightOp(prev, opIds, null));
    }
  }
}
