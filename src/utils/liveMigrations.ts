import { listMigrations, stopMigration } from "../api/services";
import {
  isMigrationActivelyRunning,
  type ListMigrationsResponse,
} from "../types/migrations";

export type LiveMigrationSummary = ListMigrationsResponse["migrations"][number];

/** Migrations that are still running in the Sylos process. */
export async function fetchLiveMigrations(): Promise<LiveMigrationSummary[]> {
  const res = await listMigrations();
  return res.migrations.filter((m) => isMigrationActivelyRunning(m));
}

/**
 * Request soft stop for each id (does not wait for drain). Used when signing out
 * with "stop migrations then leave". Failures are ignored so logout can proceed.
 */
export async function softStopMigrationsById(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  await Promise.allSettled(unique.map((id) => stopMigration(id)));
}

/**
 * Where to send the user after login when they have no `from` redirect.
 * One live migration → Progress Monitor; several → Resume list; none → home.
 */
export function postLoginPathForLiveMigrations(
  live: Pick<LiveMigrationSummary, "id">[]
): string {
  if (live.length === 1) {
    return `/progress-monitor/${encodeURIComponent(live[0].id)}`;
  }
  if (live.length > 1) {
    return "/resume";
  }
  return "/";
}
