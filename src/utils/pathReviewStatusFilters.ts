/**
 * Maps the shared Path Review status dropdown to engine search fields by UI phase.
 * See Migration-Engine/docs/item_statuses.md (review actions vs lifecycle fields).
 */

export type PathReviewFilterPhase =
  | "traversal"
  | "copy"
  | "copy-plan"
  | "delete"
  | "source-cleanup";

export interface PhaseStatusFilters {
  statusSearchType?: "traversal" | "copy" | "delete" | "both";
  traversalStatusFilter?: string;
  copyStatusFilter?: string;
  deleteStatusFilter?: string;
}

/** Map one UI status dropdown value to API search status fields. */
export function mapPathReviewStatusFilter(
  displayPhase: PathReviewFilterPhase,
  uiValue: string
): PhaseStatusFilters {
  const v = uiValue.trim();
  if (!v) return {};

  switch (displayPhase) {
    case "traversal":
      return mapTraversalReviewStatus(v);
    case "copy":
    case "copy-plan":
      return mapCopyReviewStatus(v);
    case "delete":
      return mapDeleteReviewStatus(v);
    case "source-cleanup":
      return mapSourceCleanupStatus(v);
    default:
      return {};
  }
}

/** Traversal review: filters are traversal_status only (no copy-pending). */
function mapTraversalReviewStatus(v: string): PhaseStatusFilters {
  switch (v) {
    case "failed":
      return { statusSearchType: "traversal", traversalStatusFilter: "failed" };
    case "pending_retry":
      return { statusSearchType: "traversal", traversalStatusFilter: "pending" };
    case "successful":
      return { statusSearchType: "traversal", traversalStatusFilter: "successful" };
    case "excluded":
      return { statusSearchType: "traversal", traversalStatusFilter: "excluded" };
    case "not_on_src":
      return { statusSearchType: "traversal", traversalStatusFilter: "not_on_src" };
    default:
      return {};
  }
}

/** Copy review / copy plan: pending = leftover copy pending. */
function mapCopyReviewStatus(v: string): PhaseStatusFilters {
  switch (v) {
    case "failed":
      return { statusSearchType: "copy", copyStatusFilter: "failed" };
    case "pending_retry":
    case "pending":
      return { statusSearchType: "copy", copyStatusFilter: "pending" };
    case "excluded":
      return { statusSearchType: "copy", copyStatusFilter: "excluded" };
    case "successful":
      return { statusSearchType: "copy", copyStatusFilter: "successful" };
    case "not_on_src":
      return { statusSearchType: "traversal", traversalStatusFilter: "not_on_src" };
    default:
      return {};
  }
}

/** Delete review (post-run): pending retry = delete pending*; successful = deleted. */
function mapDeleteReviewStatus(v: string): PhaseStatusFilters {
  switch (v) {
    case "failed":
      return { statusSearchType: "delete", deleteStatusFilter: "failed" };
    case "pending_retry":
    case "pending":
      return { statusSearchType: "delete", deleteStatusFilter: "pending" };
    case "excluded":
      return { statusSearchType: "delete", deleteStatusFilter: "skipped" };
    case "successful":
      return { statusSearchType: "delete", deleteStatusFilter: "deleted" };
    case "not_on_src":
      return { statusSearchType: "traversal", traversalStatusFilter: "not_on_src" };
    default:
      return {};
  }
}

/** Source cleanup plan: pending = delete pending*; excluded = skipped; exists = copy-complete. */
function mapSourceCleanupStatus(v: string): PhaseStatusFilters {
  switch (v) {
    case "pending":
    case "pending_retry":
      return { statusSearchType: "delete", deleteStatusFilter: "pending" };
    case "excluded":
      return { statusSearchType: "delete", deleteStatusFilter: "skipped" };
    case "failed":
      return { statusSearchType: "delete", deleteStatusFilter: "failed" };
    case "successful":
      return { statusSearchType: "copy", copyStatusFilter: "successful" };
    case "not_on_src":
      return { statusSearchType: "traversal", traversalStatusFilter: "not_on_src" };
    default:
      return {};
  }
}

export function statusFilterOptionLabel(
  displayPhase: PathReviewFilterPhase,
  option: string
): string {
  switch (option) {
    case "pending":
      if (displayPhase === "source-cleanup") {
        return "Pending removal";
      }
      if (displayPhase === "delete") {
        return "Pending removal";
      }
      if (displayPhase === "copy-plan") {
        return "Pending (will be copied over)";
      }
      return "Pending (will be copied over)";
    case "pending_retry":
      if (displayPhase === "delete" || displayPhase === "source-cleanup") {
        return "Pending removal";
      }
      if (displayPhase === "copy") {
        return "Pending Retry (copy queue)";
      }
      return "Pending Retry (discovery)";
    case "excluded":
      if (displayPhase === "delete" || displayPhase === "source-cleanup") {
        return "Skipped (will remain on source)";
      }
      if (displayPhase === "copy") {
        return "Excluded (was not copied over)";
      }
      if (displayPhase === "copy-plan") {
        return "Excluded (will not be copied over)";
      }
      return "Skipped (root pick)";
    case "failed":
      if (displayPhase === "delete" || displayPhase === "source-cleanup") {
        return "Delete failed";
      }
      if (displayPhase === "copy") {
        return "Copy failed";
      }
      return "Failed (discovery)";
    case "successful":
      if (displayPhase === "delete") {
        return "Removed from source";
      }
      if (displayPhase === "traversal") {
        return "Discovered successfully";
      }
      return "Exists (on both)";
    case "not_on_src":
      return "Exists (on destination only)";
    default:
      return option;
  }
}
