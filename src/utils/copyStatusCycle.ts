import type { DiffItem } from "../api/services";
import {
  reviewCycleClickTarget,
  runReviewStatusCycleClick,
  type ReviewStatusCycleDeps,
} from "./reviewStatusCycle";

/**
 * Next step of the copy status button cycle for one item, or null when the
 * status does not cycle. Failed items mark for retry; pending items exclude;
 * excluded items restore failed when excluded from a marked failure and
 * return to pending otherwise.
 *
 * Kept as a thin adapter over the shared review status cycle.
 */
export type CopyCycleStep = "mark" | "exclude" | "restore-failed" | "include";

export function copyCycleStep(item: DiffItem): CopyCycleStep | null {
  const target = reviewCycleClickTarget(item, "copy");
  if (!target) return null;
  if (target === "pending") {
    const cs = item.src?.copyStatus || item.copyStatus || "";
    const excluded =
      cs === "exclusion_explicit" ||
      cs === "exclusion_inherited" ||
      cs === "excluded";
    return excluded && !item.src?.copyExcludedFromFailed ? "include" : "mark";
  }
  if (target === "failed") return "restore-failed";
  return "exclude";
}

export const COPY_CYCLE_LABELS: Record<CopyCycleStep, string> = {
  mark: "Mark for retry",
  exclude: "Exclude",
  "restore-failed": "Restore as failed",
  include: "Include for retry",
};

export type CopyCycleDeps = ReviewStatusCycleDeps;

/**
 * Runs one copy status button cycle step for an item via the shared
 * review-status PUT.
 */
export async function runCopyCycleClick(
  migrationId: string,
  item: DiffItem,
  deps: CopyCycleDeps
): Promise<void> {
  await runReviewStatusCycleClick(migrationId, item, "copy", deps);
}
