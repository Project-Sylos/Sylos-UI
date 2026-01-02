import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import SelectionPage from "../components/SelectionPage";
import {
  defaultServiceSelectionOption,
  serviceSelectionOptions,
} from "../data/serviceSelectionOptions";
import { useSelection } from "../context/SelectionContext";
import { getPresetRootForServiceType } from "../data/presetRoots";
import { setMigrationRoot } from "../api/services";
import { Folder } from "../types/services";

export default function ConnectSource() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    services,
    loading,
    error,
    selectSource,
    clearSelections,
    migration,
    updateMigration,
  } = useSelection();
  const [isPicking, setIsPicking] = useState(false);
  const processedStateRef = useRef<string | null>(null);

  const handleFolderSelected = async (serviceId: string, root: Folder) => {
    const selected = services.find((service) => service.id === serviceId);
    if (!selected) {
      alert("Service not found.");
      return;
    }

    try {
      setIsPicking(true);
      // Transform Folder to API request format
      const rootForApi = {
        id: root.ServiceID,  // Service's native identifier
        parentId: root.parentId,
        parentPath: root.parentPath,
        displayName: root.name,
        locationPath: root.locationPath,
        lastUpdated: root.lastUpdated,
        depthLevel: root.depthLevel,
        type: root.type || "folder",
      };

      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role: "source",
        serviceId: selected.id,
        root: rootForApi,
      });

      updateMigration({
        migrationId: response.migrationId,
        sourceConnectionId: response.sourceConnectionId,
        destinationConnectionId: response.destinationConnectionId,
        ready: response.ready,
      });

      selectSource(selected, root);
      navigate("/destination");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to set source root.";
      alert(message);
    } finally {
      setIsPicking(false);
    }
  };

  // Handle return from folder browser
  useEffect(() => {
    const state = location.state as { selectedFolder?: Folder; serviceId?: string } | null;
    
    if (state?.selectedFolder && state?.serviceId) {
      // Create a unique key for this state to prevent double processing
      const stateKey = `${state.serviceId}-${state.selectedFolder.ServiceID}`;
      
      // Skip if we've already processed this state (prevents double processing from StrictMode)
      if (processedStateRef.current === stateKey) {
        return;
      }
      
      processedStateRef.current = stateKey;
      handleFolderSelected(state.serviceId, state.selectedFolder);
      // Clear the state to prevent re-triggering
      window.history.replaceState({}, document.title);
    } else {
      // Reset the ref when state is cleared
      processedStateRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const options = useMemo(
    () =>
      services.map((service) => {
        const visual =
          serviceSelectionOptions[service.type] ?? defaultServiceSelectionOption;
        return {
          id: service.id,
          name: service.displayName,
          description: visual.description,
          icon: visual.icon,
        };
      }),
    [services]
  );

  const handleSelect = async (id: string) => {
    if (isPicking) {
      return;
    }

    const selected = services.find((service) => service.id === id);
    if (!selected) {
      console.warn(`Service with id "${id}" not found.`);
      return;
    }

    let root =
      selected.type === "local"
        ? undefined
        : getPresetRootForServiceType(selected.type);

    if (selected.type === "local") {
      // Navigate to folder browser
      navigate(`/browse?serviceId=${selected.id}&role=source`);
      return;
    }

    if (!root) {
      alert(
        `No preset root configured for service type "${selected.type}". Please configure a root selection flow.`
      );
      return;
    }

    try {
      setIsPicking(true);
      // Transform Folder to API request format
      const rootForApi = {
        id: root.ServiceID,  // Service's native identifier
        parentId: root.parentId,
        parentPath: root.parentPath,
        displayName: root.name,
        locationPath: root.locationPath,
        lastUpdated: root.lastUpdated,
        depthLevel: root.depthLevel,
        type: root.type || "folder",
      };

      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role: "source",
        serviceId: selected.id,
        root: rootForApi,
      });

      updateMigration({
        migrationId: response.migrationId,
        sourceConnectionId: response.sourceConnectionId,
        destinationConnectionId: response.destinationConnectionId,
        ready: response.ready,
      });

      selectSource(selected, root);
      navigate("/destination");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to set source root.";
      alert(message);
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <SelectionPage
      eyebrow="Step 1"
      title={
        <>
          Select your{" "}
          <span className="selection-page__highlight--magenta">source</span>{" "}
          service
        </>
      }
      summary={
        error
          ? error
          : "Where's the data coming from?"
      }
      options={options}
      onSelect={handleSelect}
      onBack={() => {
        clearSelections();
        navigate("/");
      }}
      emptyMessage={
        loading
          ? "Loading services..."
          : "No services available. Try refreshing."
      }
      isBusy={isPicking}
    />
  );
}

