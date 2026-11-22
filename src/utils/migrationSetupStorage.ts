import { Folder } from "../types/services";

export const MIGRATION_SETUP_KEY = "sylos.migrationSetup";

export type MigrationStateSnapshot = {
  migrationId?: string;
  sourceConnectionId?: string;
  destinationConnectionId?: string;
  sourceAccountEmail?: string;
  sourceAccountDisplayName?: string;
  destinationAccountEmail?: string;
  destinationAccountDisplayName?: string;
  ready: boolean;
  spectraLocked?: boolean;
  spectraPrimaryRole?: "source" | "destination";
  sourceRootPrepared?: boolean;
  destinationRootPrepared?: boolean;
  sourceRootChildNames?: string[];
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
  const raw = JSON.stringify(setup);
  try {
    sessionStorage.setItem(MIGRATION_SETUP_KEY, raw);
  } catch {
    // A previous save of the full include tree can fill the origin quota.
    // Drop that entry and write the small snapshot so history.pushState can run.
    sessionStorage.removeItem(MIGRATION_SETUP_KEY);
    sessionStorage.setItem(MIGRATION_SETUP_KEY, raw);
  }
}

export function clearMigrationSetup(): void {
  sessionStorage.removeItem(MIGRATION_SETUP_KEY);
}
