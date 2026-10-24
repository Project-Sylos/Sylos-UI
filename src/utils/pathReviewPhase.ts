import {
  MigrationStatusResponse,
  isCopyReviewPhase,
  isDeleteReviewPhase,
  getMigrationPhase,
} from "../types/migrations";

export type PathReviewUIPhase = "traversal" | "copy" | "delete";
export type PathReviewRouteView = "default" | "copy-plan" | "source-cleanup";
export type PathReviewDisplayPhase =
  | PathReviewUIPhase
  | "copy-plan"
  | "source-cleanup";

/** High-level lifecycle rail on Path Review (Discover → Copy → Remove). */
export type PathReviewLifecycleStep = "discover" | "copy" | "remove";

export type PathReviewStepperState = {
  active: PathReviewLifecycleStep;
  /** Steps already completed (not including the active one). */
  completed: PathReviewLifecycleStep[];
  subtitle: string | null;
};

/** Review UI phase from migration status (default path-review route). */
export function getPathReviewUIPhase(
  status: MigrationStatusResponse | null
): PathReviewUIPhase {
  if (isDeleteReviewPhase(status)) return "delete";
  if (isCopyReviewPhase(status)) return "copy";
  return "traversal";
}

/** Legend/icon/filter phase: plan sub-routes override migration status. */
export function getPathReviewDisplayPhase(
  status: MigrationStatusResponse | null,
  reviewView: PathReviewRouteView
): PathReviewDisplayPhase {
  if (reviewView === "source-cleanup") return "source-cleanup";
  if (reviewView === "copy-plan") return "copy-plan";
  return getPathReviewUIPhase(status);
}

/**
 * Footer Pending column: plan/preview only (copy-plan, source-cleanup).
 * Discover and post-review (copy results, delete results) omit it.
 * Live delete-in-progress still shows remaining delete-pending work.
 */
export function showsPathReviewPendingColumn(
  displayPhase: PathReviewDisplayPhase,
  status: MigrationStatusResponse | null = null
): boolean {
  if (displayPhase === "copy-plan" || displayPhase === "source-cleanup") {
    return true;
  }
  if (displayPhase === "delete") {
    return getMigrationPhase(status) !== "awaiting-delete-review";
  }
  return false;
}

/** True on the deletion-plan route while still in copy review (before delete runs). */
export function isSourceCleanupPlanPhase(
  status: MigrationStatusResponse | null
): boolean {
  return getMigrationPhase(status) === "awaiting-copy-review";
}

/** True on the copy-plan route while still in traversal review (before copy runs). */
export function isCopyPlanPhase(
  status: MigrationStatusResponse | null
): boolean {
  return getMigrationPhase(status) === "awaiting-traversal-review";
}

/**
 * Stepper-style page Back (not browser history).
 * Prep → prior phase results; results → that phase's progress monitor.
 */
export function getPathReviewPageBackPath(
  migrationId: string,
  status: MigrationStatusResponse | null,
  reviewView: PathReviewRouteView
): string {
  const id = migrationId.trim();
  if (!id) return "/choose";

  if (reviewView === "copy-plan") {
    return `/path-review/${id}`;
  }
  // Source-cleanup prep (before delete) → copy results. Delete *results* on
  // that same route → delete progress monitor (avoid prep↔results history loop).
  if (reviewView === "source-cleanup" && isSourceCleanupPlanPhase(status)) {
    return `/path-review/${id}`;
  }

  const uiPhase = getPathReviewUIPhase(status);
  if (reviewView === "source-cleanup" || uiPhase === "delete") {
    return `/progress-monitor/${id}?mode=delete`;
  }
  if (uiPhase === "copy") {
    return `/progress-monitor/${id}?mode=copy`;
  }
  return `/progress-monitor/${id}?mode=discovery`;
}

export function getPathReviewPageBackTitle(
  status: MigrationStatusResponse | null,
  reviewView: PathReviewRouteView
): string {
  if (reviewView === "copy-plan") return "Back to discovery review";
  if (reviewView === "source-cleanup" && isSourceCleanupPlanPhase(status)) {
    return "Back to copy review";
  }
  const uiPhase = getPathReviewUIPhase(status);
  if (reviewView === "source-cleanup" || uiPhase === "delete") {
    return "Back to source removal progress";
  }
  if (uiPhase === "copy") return "Back to copy progress";
  return "Back to discovery progress";
}

/**
 * Derive Discover / Copy / Remove stepper state from migration status + review view.
 * Retry sweeps stay on the same active step until the user advances.
 */
export function getPathReviewStepperState(
  status: MigrationStatusResponse | null,
  reviewView: PathReviewRouteView = "default"
): PathReviewStepperState {
  if (reviewView === "source-cleanup" || isDeleteReviewPhase(status)) {
    return {
      active: "remove",
      completed: ["discover", "copy"],
      subtitle: null,
    };
  }
  if (reviewView === "copy-plan") {
    return {
      active: "copy",
      completed: ["discover"],
      subtitle: "Nothing has been copied yet. Adjust what will move, then start copying.",
    };
  }
  if (isCopyReviewPhase(status)) {
    return {
      active: "copy",
      completed: ["discover"],
      subtitle: null,
    };
  }
  return {
    active: "discover",
    completed: [],
    subtitle: "Scan only. Nothing is copied yet.",
  };
}
