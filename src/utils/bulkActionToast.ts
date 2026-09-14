import type { BulkReasonGroup, ExclusionResponse } from "../api/services";

/** Build a short toast for bulk path-review actions (success / mixed / failure). */
export function formatBulkActionToast(
  actionLabel: string,
  result: Pick<
    ExclusionResponse,
    "success" | "error" | "affectedCount" | "unchangedCount" | "unchangedReasons"
  >
): { message: string; type: "success" | "error" } {
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
  return {
    type: "error",
    message:
      reasonText
        ? `${actionLabel} failed for ${unchanged || "all"} items: ${reasonText}`
        : result.error || `${actionLabel} failed.`,
  };
}

function formatReasonGroups(groups: BulkReasonGroup[]): string {
  if (groups.length === 0) return "";
  return groups
    .map((g) => (g.count > 1 ? `${g.reason} ×${g.count}` : g.reason))
    .join("; ");
}
