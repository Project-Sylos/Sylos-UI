import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { fetchServices } from "../api/services";
import { usePreferences } from "../contexts/PreferencesContext";
import { getPresetRootForServiceType } from "../data/presetRoots";
import { RootInfo } from "../types/migrations";
import { Folder, ServiceDescriptor } from "../types/services";
import { loadOAuthPendingSession } from "../utils/cloudOAuth";
import {
  clearMigrationSetup,
  loadMigrationSetup,
  saveMigrationSetup,
} from "../utils/migrationSetupStorage";

type SelectedService = {
  service: ServiceDescriptor;
  root?: Folder;
};

type MigrationState = {
  migrationId?: string;
  sourceConnectionId?: string;
  destinationConnectionId?: string;
  sourceAccountEmail?: string;
  sourceAccountDisplayName?: string;
  destinationAccountEmail?: string;
  destinationAccountDisplayName?: string;
  ready: boolean;
  /** Spectra sets both roots at once; locks the auto-set endpoint. */
  spectraLocked?: boolean;
  /** Which endpoint the user configured when Spectra was chosen. */
  spectraPrimaryRole?: "source" | "destination";
  sourceRootPrepared?: boolean;
  destinationRootPrepared?: boolean;
  sourceRootChildNames?: string[];
};

type SelectionContextValue = {
  services: ServiceDescriptor[];
  loading: boolean;
  error: string | null;
  source?: SelectedService;
  destination?: SelectedService;
  migration: MigrationState;
  refreshServices: () => Promise<void>;
  selectSource: (service: ServiceDescriptor, root?: Folder) => void;
  selectDestination: (service: ServiceDescriptor, root?: Folder) => void;
  updateMigration: (update: Partial<MigrationState>) => void;
  /** Rehydrate source/destination from server-persisted roots.
   *  When force is true (resume flow), always replace current endpoints so a prior
   *  migration's selection cannot stick around.
   */
  applyServerRoots: (source?: RootInfo, destination?: RootInfo, force?: boolean) => void;
  clearSelections: () => void;
  /** Flush current setup to sessionStorage (e.g. before OAuth full-page redirect). */
  persistSelections: (migrationPatch?: Partial<MigrationState>) => void;
};

const SelectionContext = createContext<SelectionContextValue | undefined>(
  undefined
);

function mergeOAuthPendingMigration(base: MigrationState): MigrationState {
  const pending = loadOAuthPendingSession();
  if (!pending) {
    return base;
  }

  const next = { ...base };
  if (pending.migrationId && !next.migrationId) {
    next.migrationId = pending.migrationId;
  }
  if (pending.role === "source" && pending.connectionId) {
    next.sourceConnectionId = next.sourceConnectionId ?? pending.connectionId;
  }
  if (pending.role === "destination" && pending.connectionId) {
    next.destinationConnectionId =
      next.destinationConnectionId ?? pending.connectionId;
  }
  return next;
}

function getInitialMigrationState(): MigrationState {
  const stored = loadMigrationSetup()?.migration;
  const base: MigrationState = stored ?? { ready: false };
  return mergeOAuthPendingMigration(base);
}

function endpointFromRootInfo(
  info: RootInfo | undefined
): SelectedService | undefined {
  if (!info || !info.serviceId) {
    return undefined;
  }
  const service: ServiceDescriptor = {
    id: info.serviceId,
    displayName: info.serviceName || info.serviceId,
    type: info.serviceType || "local",
  };
  const nativeId = info.nativePath || info.serviceId;
  const root: Folder = {
    ServiceID: nativeId,
    Id: nativeId,
    name: info.name || nativeId,
    locationPath: info.locationPath || "/",
    type: info.type || "folder",
    depthLevel: 0,
  };
  return { service, root };
}

function endpointFromStorage(
  endpoint: { serviceId: string; root?: Folder } | undefined,
  services: ServiceDescriptor[]
): SelectedService | undefined {
  if (!endpoint) {
    return undefined;
  }

  const service = services.find((item) => item.id === endpoint.serviceId);
  if (!service) {
    return undefined;
  }

  return { service, root: endpoint.root };
}

function buildPersistedSetup(
  migration: MigrationState,
  source?: SelectedService,
  destination?: SelectedService
) {
  saveMigrationSetup({
    v: 1,
    migration,
    source: source
      ? { serviceId: source.service.id, root: source.root }
      : undefined,
    destination: destination
      ? { serviceId: destination.service.id, root: destination.root }
      : undefined,
  });
}

export function SelectionProvider({ children }: { children: ReactNode }) {
  const { isLoading: prefsLoading, preferencesRevision } = usePreferences();
  const [services, setServices] = useState<ServiceDescriptor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SelectedService | undefined>();
  const [destination, setDestination] = useState<SelectedService | undefined>();
  const [migration, setMigration] = useState<MigrationState>(getInitialMigrationState);

  const hydratedRef = useRef(false);
  const stateRef = useRef({ migration, source, destination });
  stateRef.current = { migration, source, destination };

  const persistSelections = useCallback((migrationPatch?: Partial<MigrationState>) => {
    const { migration: current, source: src, destination: dst } = stateRef.current;
    const merged = migrationPatch
      ? { ...current, ...migrationPatch }
      : current;
    buildPersistedSetup(merged, src, dst);
  }, []);

  const servicesRef = useRef(services);
  servicesRef.current = services;

  const loadServices = useCallback(async () => {
    const isInitialLoad = servicesRef.current.length === 0;
    if (isInitialLoad) {
      setLoading(true);
    }
    setError(null);
    try {
      const list = await fetchServices();
      setServices(list);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to load services list."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch after prefs are loaded/saved so Spectra gating on the API stays in sync.
  useEffect(() => {
    if (prefsLoading) {
      return;
    }
    void loadServices();
  }, [prefsLoading, preferencesRevision, loadServices]);

  useEffect(() => {
    if (hydratedRef.current || loading) {
      return;
    }

    const stored = loadMigrationSetup();
    if (stored?.source && services.length > 0) {
      setSource((current) => current ?? endpointFromStorage(stored.source, services));
    }
    if (stored?.destination && services.length > 0) {
      setDestination(
        (current) => current ?? endpointFromStorage(stored.destination, services)
      );
    }

    setMigration((current) => mergeOAuthPendingMigration(current));
    hydratedRef.current = true;
  }, [services, loading]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    persistSelections();
  }, [migration, source, destination, persistSelections]);

  const selectSource = useCallback(
    (service: ServiceDescriptor, root?: Folder) => {
      if (root) {
        setSource({ service, root });
        return;
      }
      if (service.type === "cloud") {
        setSource({ service });
        return;
      }
      const preset = getPresetRootForServiceType(service.type);
      setSource({ service, root: preset });
    },
    []
  );

  const selectDestination = useCallback(
    (service: ServiceDescriptor, root?: Folder) => {
      if (root) {
        setDestination({ service, root });
        return;
      }
      if (service.type === "cloud") {
        setDestination({ service });
        return;
      }
      const preset = getPresetRootForServiceType(service.type);
      setDestination({ service, root: preset });
    },
    []
  );

  const updateMigration = useCallback((update: Partial<MigrationState>) => {
    setMigration((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(update) as Array<
        [keyof MigrationState, MigrationState[keyof MigrationState]]
      >) {
        // Allow explicit undefined to clear optional fields (e.g. disconnect).
        next[key] = value as never;
      }
      return next;
    });
  }, []);

  const applyServerRoots = useCallback(
    (sourceRoot?: RootInfo, destinationRoot?: RootInfo, force?: boolean) => {
      const nextSource = endpointFromRootInfo(sourceRoot);
      const nextDestination = endpointFromRootInfo(destinationRoot);
      if (nextSource) {
        setSource((current) => (force || !current?.root ? nextSource : current));
      }
      if (nextDestination) {
        setDestination((current) =>
          force || !current?.root ? nextDestination : current
        );
      }
    },
    []
  );

  const clearSelections = useCallback(() => {
    setSource(undefined);
    setDestination(undefined);
    setMigration({ ready: false });
    clearMigrationSetup();
  }, []);

  const value = useMemo(
    () => ({
      services,
      loading,
      error,
      source,
      destination,
      migration,
      refreshServices: loadServices,
      selectSource,
      selectDestination,
      updateMigration,
      applyServerRoots,
      clearSelections,
      persistSelections,
    }),
    [
      services,
      loading,
      error,
      source,
      destination,
      migration,
      loadServices,
      selectSource,
      selectDestination,
      updateMigration,
      applyServerRoots,
      clearSelections,
      persistSelections,
    ]
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error("useSelection must be used within a SelectionProvider");
  }
  return context;
}
