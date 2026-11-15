import {
  getMigrationPhase,
  type MigrationStatusResponse,
} from "../types/migrations";

/** Progress-monitor mode query for a lifecycle phase. */
export function progressMonitorModeForPhase(
  phase: string
): "discovery" | "copy" | "delete" {
  if (
    phase === "copy-in-progress" ||
    phase === "copy-suspended" ||
    phase === "copy-finalizing" ||
    phase === "copy-finalize-failed" ||
    phase === "awaiting-copy-review"
  ) {
    return "copy";
  }
  if (
    phase === "delete-in-progress" ||
    phase === "delete-suspended" ||
    phase === "delete-finalizing" ||
    phase === "delete-finalize-failed" ||
    phase === "awaiting-delete-review"
  ) {
    return "delete";
  }
  return "discovery";
}

/**
 * Last known page for a migration: review / progress / summary for setup.
 * Does not start or resume work; that stays on the destination page.
 */
export function navigationPathForStatus(
  statusData: Pick<MigrationStatusResponse, "id" | "phase" | "status">
): string {
  const phase = getMigrationPhase(statusData);
  const migrationId = statusData.id;

  switch (phase) {
    case "awaiting-traversal-review":
    case "awaiting-copy-review":
      return `/path-review/${migrationId}`;
    case "awaiting-delete-review":
      return `/path-review/${migrationId}/source-cleanup`;
    case "traversal-suspended":
    case "traversal-in-progress":
    case "traversal-finalizing":
    case "traversal-finalize-failed":
    case "copy-suspended":
    case "copy-in-progress":
    case "copy-finalizing":
    case "copy-finalize-failed":
    case "delete-suspended":
    case "delete-in-progress":
    case "delete-finalizing":
    case "delete-finalize-failed":
    case "failed": {
      const mode = progressMonitorModeForPhase(phase);
      return `/progress-monitor/${migrationId}?mode=${mode}`;
    }
    case "roots-set":
    case "filters-set":
      return `/summary`;
    default:
      break;
  }

  return `/summary`;
}

/** True when the migration has progressed past root/filter setup. */
export function isPastSetupPhase(
  response: { phase?: string; status?: string } | null | undefined
): boolean {
  const phase = getMigrationPhase(response);
  if (!phase) return false;
  return (
    phase !== "roots-set" &&
    phase !== "filters-set" &&
    phase !== "roots-partial"
  );
}

/** Navigational CTA: open the last page for this migration (does not start work). */
export function openLastPageLabel(
  response: { phase?: string; status?: string } | null | undefined
): string {
  const phase = getMigrationPhase(response);
  if (phase.startsWith("awaiting-") && phase.endsWith("-review")) {
    return "Open review";
  }
  return "Open progress monitor";
}
