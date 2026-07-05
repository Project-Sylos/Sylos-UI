import { Folder } from "../types/services";

export const MIGRATION_SETUP_KEY = "sylos.migrationSetup";

export type MigrationStateSnapshot = {
  migrationId?: string;
  sourceConnectionId?: string;
  destinationConnectionId?: string;
  ready: boolean;
  spectraLocked?: boolean;
  spectraPrimaryRole?: "source" | "destination";
};

export type PersistedEndpoint = {
  serviceId: string;
  root?: Folder;
};

export type PersistedMigrationSetup = {
  v: 1;
  migration: MigrationStateSnapshot;
  source?: PersistedEndpoint;
  destination?: PersistedEndpoint;
};

export function loadMigrationSetup(): PersistedMigrationSetup | null {
  const raw = sessionStorage.getItem(MIGRATION_SETUP_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedMigrationSetup;
    if (parsed.v !== 1 || !parsed.migration || typeof parsed.migration.ready !== "boolean") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveMigrationSetup(setup: PersistedMigrationSetup): void {
  sessionStorage.setItem(MIGRATION_SETUP_KEY, JSON.stringify(setup));
}

export function clearMigrationSetup(): void {
  sessionStorage.removeItem(MIGRATION_SETUP_KEY);
}
