import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { fetchServices } from "../api/services";
import { getPresetRootForServiceType } from "../data/presetRoots";
import { Folder, ServiceDescriptor } from "../types/services";

type SelectedService = {
  service: ServiceDescriptor;
  root?: Folder;
};

type MigrationState = {
  migrationId?: string;
  sourceConnectionId?: string;
  destinationConnectionId?: string;
  ready: boolean;
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
  clearSelections: () => void;
};

const SelectionContext = createContext<SelectionContextValue | undefined>(
  undefined
);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<ServiceDescriptor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SelectedService | undefined>();
  const [destination, setDestination] = useState<SelectedService | undefined>();
  const [migration, setMigration] = useState<MigrationState>({ ready: false });

  const loadServices = useCallback(async () => {
    setLoading(true);
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

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  const selectSource = useCallback(
    (service: ServiceDescriptor, root?: Folder) => {
      const preset = root ?? getPresetRootForServiceType(service.type);
      setSource({ service, root: preset });
      setDestination(undefined);
      setMigration((prev) => ({
        migrationId: prev.migrationId,
        ready: false,
        sourceConnectionId: prev.sourceConnectionId,
        destinationConnectionId: undefined,
      }));
    },
    []
  );

  const selectDestination = useCallback(
    (service: ServiceDescriptor, root?: Folder) => {
      const preset = root ?? getPresetRootForServiceType(service.type);
      setDestination({ service, root: preset });
    },
    []
  );

  const updateMigration = useCallback((update: Partial<MigrationState>) => {
    setMigration((prev) => ({ ...prev, ...update }));
  }, []);

  const clearSelections = useCallback(() => {
    setSource(undefined);
    setDestination(undefined);
    setMigration({ ready: false });
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
      clearSelections,
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
      clearSelections,
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

