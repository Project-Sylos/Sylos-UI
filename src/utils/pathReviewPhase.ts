import {
  MigrationStatusResponse,
  isCopyReviewPhase,
  isDeleteReviewPhase,
  getMigrationPhase,
} from "../types/migrations";

export type PathReviewUIPhase = "traversal" | "copy" | "delete";
export type PathReviewDisplayPhase = PathReviewUIPhase | "source-cleanup";

/** Review UI phase from migration status (default path-review route). */
export function getPathReviewUIPhase(
  status: MigrationStatusResponse | null
): PathReviewUIPhase {
  if (isDeleteReviewPhase(status)) return "delete";
  if (isCopyReviewPhase(status)) return "copy";
  return "traversal";
}

/** Legend/icon phase: source-cleanup plan view vs results phases. */
export function getPathReviewDisplayPhase(
  status: MigrationStatusResponse | null,
  reviewView: "default" | "source-cleanup"
): PathReviewDisplayPhase {
  if (reviewView === "source-cleanup") return "source-cleanup";
  return getPathReviewUIPhase(status);
}

/** True on the deletion-plan route while still in copy review (before delete runs). */
export function isSourceCleanupPlanPhase(
  status: MigrationStatusResponse | null
): boolean {
  return getMigrationPhase(status) === "awaiting-copy-review";
}
