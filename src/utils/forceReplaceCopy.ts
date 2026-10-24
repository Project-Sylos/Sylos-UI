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

/** Prefer-source enroll: already_existed on SRC. */
export function canForceReplaceCopy(
  item: DiffItem,
  reviewAllows: boolean
): boolean {
  if (!reviewAllows || !item.src?.id) return false;
  return srcCopyStatus(item) === "already_existed";
}

/**
 * Undo prefer-source: forced pending file, or folder container (cascades undo
 * to forced descendants under the path).
 */
export function canUnforceReplaceCopy(
  item: DiffItem,
  reviewAllows: boolean
): boolean {
  if (!reviewAllows || !item.src?.id) return false;
  const cs = srcCopyStatus(item);
  if (item.src.copyForceReplaceMarked && (cs === "pending" || cs === "")) {
    return true;
  }
  return item.type === "folder" && cs === "already_existed";
}
