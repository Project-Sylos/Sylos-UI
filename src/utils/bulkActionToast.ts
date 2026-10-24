import type { BulkReasonGroup, ExclusionResponse } from "../api/services";

/** True when the API reported a silent no-op (already in desired state). */
export function isNoItemsChangedError(error?: string | null): boolean {
  return (error ?? "").trim().toLowerCase() === "no items changed";
}

/** Build a short toast for bulk path-review actions (success / mixed / failure). */
export function formatBulkActionToast(
  actionLabel: string,
  result: Pick<
    ExclusionResponse,
    "success" | "error" | "affectedCount" | "unchangedCount" | "unchangedReasons"
  >
): { message: string; type: "success" | "error" } | null {
  const changed = result.affectedCount ?? 0;
  const unchanged = result.unchangedCount ?? 0;
  const reasons = (result.unchangedReasons ?? []).slice(0, 3);
  const reasonText = formatReasonGroups(reasons);

  if (changed > 0 && unchanged > 0) {
    return {
      type: "success",
      message: `Mixed results: ${actionLabel} succeeded for ${changed}, failed for ${unchanged}${
        reasonText ? ` (${reasonText})` : ""
      }.`,
    };
  }
  if (changed > 0) {
    return {
      type: "success",
      message: `${actionLabel} succeeded for ${changed} item${changed === 1 ? "" : "s"}.`,
    };
  }
  if (reasonText) {
    return {
      type: "error",
      message: `${actionLabel} failed for ${unchanged || "all"} items: ${reasonText}`,
    };
  }
  // API "no items changed" (and similar empty failures) — no toast needed.
  if (isNoItemsChangedError(result.error) || !result.error) {
    return null;
  }
  return {
    type: "error",
    message: result.error,
  };
}

function formatReasonGroups(groups: BulkReasonGroup[]): string {
  if (groups.length === 0) return "";
  return groups
    .map((g) => (g.count > 1 ? `${g.reason} ×${g.count}` : g.reason))
    .join("; ");
}
