import type { PathReviewDisplayPhase } from "./pathReviewPhase";

/** Dual vs merged Path Review browse layout. */

export type PathReviewBrowseLayout = "dual" | "merged";

export type PathReviewSearchSide = "src" | "dst" | "both";

/** Preference buckets: discovery vs copy (plan+results) vs delete/cleanup. */
export type PathReviewBrowseLayoutPhase = "traversal" | "copy" | "delete";

export const PATH_REVIEW_BROWSE_LAYOUT_KEY = "sylos.pathReview.browseLayout";

export function browseLayoutPhaseKey(
  displayPhase: PathReviewDisplayPhase
): PathReviewBrowseLayoutPhase {
  if (displayPhase === "traversal") return "traversal";
  if (displayPhase === "delete" || displayPhase === "source-cleanup") {
    return "delete";
  }
  return "copy";
}

/** Discovery defaults to dual; copy plan/results and delete default to merged. */
export function defaultBrowseLayoutForPhase(
  phase: PathReviewBrowseLayoutPhase
): PathReviewBrowseLayout {
  return phase === "traversal" ? "dual" : "merged";
}

function storageKeyForPhase(phase: PathReviewBrowseLayoutPhase): string {
  return `${PATH_REVIEW_BROWSE_LAYOUT_KEY}.${phase}`;
}

export function loadBrowseLayout(
  phase: PathReviewBrowseLayoutPhase
): PathReviewBrowseLayout {
  // Traversal is dual-only; ignore any stale saved preference.
  if (phase === "traversal") {
    return "dual";
  }
  try {
    const v = localStorage.getItem(storageKeyForPhase(phase));
    if (v === "merged" || v === "dual") return v;
  } catch {
    /* ignore */
  }
  return defaultBrowseLayoutForPhase(phase);
}

export function saveBrowseLayout(
  phase: PathReviewBrowseLayoutPhase,
  layout: PathReviewBrowseLayout
): void {
  // Traversal has no user preference; do not persist overrides.
  if (phase === "traversal") {
    return;
  }
  try {
    localStorage.setItem(storageKeyForPhase(phase), layout);
  } catch {
    /* ignore */
  }
}

/**
 * Resolve browse layout for the current review mode.
 * Traversal is always dual. Delete / source-cleanup force merged.
 * Copy uses the caller preference (localStorage-backed).
 */
export function effectiveBrowseLayout(
  preferred: PathReviewBrowseLayout,
  srcOnlyPhase: boolean,
  layoutPhase: PathReviewBrowseLayoutPhase = "copy"
): PathReviewBrowseLayout {
  if (layoutPhase === "traversal") return "dual";
  if (srcOnlyPhase) return "merged";
  return preferred;
}

export function searchSideAllowsCopyFilters(side: PathReviewSearchSide): boolean {
  return side === "src" || side === "both";
}

export function searchSideAllowsPathIssueFilters(
  side: PathReviewSearchSide
): boolean {
  return side === "src" || side === "both";
}
