import type { DiffItem } from "../api/services";

export const FORCE_REPLACE_FOLDER_CONFIRM =
  "Force replace from source for this folder and everything under it that already exists on dest?";

export const FORCE_REPLACE_BULK_FOLDER_CONFIRM =
  "Force replace from source for the selected folders and everything under them that already exists on dest?";

/** Copy-plan route, or post-copy review before source cleanup. */
export function isForceReplaceReviewView(
  isCopyPlanView: boolean,
  isSourceCleanupView: boolean,
  awaitingCopyReview: boolean
): boolean {
  if (isCopyPlanView) return true;
  return awaitingCopyReview && !isSourceCleanupView;
}

function srcCopyStatus(item: DiffItem): string {
  return item.src?.copyStatus || item.copyStatus || "";
}

/** Paired SRC+DST file (discovery match or cascade map). */
export function isExistsOnBothFile(item: DiffItem): boolean {
  if (item.type !== "file") return false;
  return !!item.src?.id && !!item.dst?.id;
}

/**
 * Replace with source: exists-on-both file currently keeping destination
 * (already_existed).
 */
export function canForceReplaceCopy(
  item: DiffItem,
  reviewAllows: boolean
): boolean {
  if (!reviewAllows || !isExistsOnBothFile(item)) return false;
  return srcCopyStatus(item) === "already_existed";
}

/**
 * Keep destination: exists-on-both file currently preferring source (pending),
 * including force-replace and mtime keep-src picks.
 */
export function canUnforceReplaceCopy(
  item: DiffItem,
  reviewAllows: boolean
): boolean {
  if (!reviewAllows || !isExistsOnBothFile(item)) return false;
  const cs = srcCopyStatus(item);
  return cs === "pending" || cs === "";
}
