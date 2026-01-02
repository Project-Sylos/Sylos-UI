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

export default function Destination() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    services,
    loading,
    error,
    source,
    selectSource,
    selectDestination,
    migration,
    updateMigration,
  } = useSelection();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const processedStateRef = useRef<string | null>(null);

  const handleFolderSelected = async (serviceId: string, destinationRoot: Folder) => {
    const destinationService = services.find(
      (service) => service.id === serviceId
    );
    if (!destinationService) {
      alert("Destination service not found.");
      return;
    }

    if (!source?.root) {
      alert("Source root is missing. Please reselect the source service.");
      return;
    }

    try {
      setIsSubmitting(true);
      // Transform Folder to API request format
      const rootForApi = {
        id: destinationRoot.ServiceID,  // Service's native identifier
        parentId: destinationRoot.parentId,
        parentPath: destinationRoot.parentPath,
        displayName: destinationRoot.name,
        locationPath: destinationRoot.locationPath,
        lastUpdated: destinationRoot.lastUpdated,
        depthLevel: destinationRoot.depthLevel,
        type: destinationRoot.type || "folder",
      };

      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role: "destination",
        serviceId: destinationService.id,
        root: rootForApi,
        connectionId: migration.destinationConnectionId,
      });

      updateMigration({
        migrationId: response.migrationId,
        sourceConnectionId: response.sourceConnectionId,
        destinationConnectionId: response.destinationConnectionId,
        ready: response.ready,
      });

      selectDestination(destinationService, destinationRoot);

      if (!response.ready) {
        alert("Destination root saved. Select a source if you have not already.");
        return;
      }

      // Navigate to summary page instead of starting migration immediately
      navigate("/summary");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to start migration.";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle return from folder browser
  useEffect(() => {
    const state = location.state as { 
      selectedFolder?: Folder; 
      serviceId?: string; 
      role?: "source" | "destination";
    } | null;
    console.log("Destination: location.state =", state);
    if (state?.selectedFolder && state?.serviceId) {
      // Create a unique key for this state to prevent double processing
      const folderRole = state.role || "destination"; // Default to destination if not specified
      const stateKey = `${state.serviceId}-${state.selectedFolder.ServiceID}-${folderRole}`;
      
      // Skip if we've already processed this state (prevents double processing from StrictMode)
      if (processedStateRef.current === stateKey) {
        console.log("Destination: Skipping duplicate state processing");
        return;
      }
      
      processedStateRef.current = stateKey;
      
      if (folderRole === "source") {
        // Handle source folder selection
        console.log("Destination: Handling source folder selection");
        handleSourceFolderSelected(state.serviceId, state.selectedFolder);
      } else {
        // Handle destination folder selection
        console.log("Destination: Calling handleFolderSelected with:", state.serviceId, state.selectedFolder);
        handleFolderSelected(state.serviceId, state.selectedFolder);
      }
      // Clear the state to prevent re-triggering
      window.history.replaceState({}, document.title);
    } else {
      // Reset the ref when state is cleared
      processedStateRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Redirect to connect page if no source is set, but only after checking for incoming folder selection
  useEffect(() => {
    const state = location.state as { 
      selectedFolder?: Folder; 
      serviceId?: string; 
      role?: "source" | "destination";
    } | null;
    
    // Don't redirect if we're processing a folder selection (especially for source)
    if (state?.selectedFolder && state?.role === "source") {
      return; // Let the folder selection useEffect handle it
    }
    
    // Only redirect if source is not set and we're not processing a folder selection
    if (!source && !state?.selectedFolder) {
      navigate("/connect");
    }
  }, [source, location.state, navigate]);

  const handleSourceFolderSelected = async (serviceId: string, sourceRoot: Folder) => {
    const sourceService = services.find(
      (service) => service.id === serviceId
    );
    if (!sourceService) {
      alert("Source service not found.");
      return;
    }

    try {
      setIsSubmitting(true);
      // Transform Folder to API request format
      const rootForApi = {
        id: sourceRoot.ServiceID,  // Service's native identifier
        parentId: sourceRoot.parentId,
        parentPath: sourceRoot.parentPath,
        displayName: sourceRoot.name,
        locationPath: sourceRoot.locationPath,
        lastUpdated: sourceRoot.lastUpdated,
        depthLevel: sourceRoot.depthLevel,
        type: sourceRoot.type || "folder",
      };

      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role: "source",
        serviceId: sourceService.id,
        root: rootForApi,
      });

      updateMigration({
        migrationId: response.migrationId,
        sourceConnectionId: response.sourceConnectionId,
        destinationConnectionId: response.destinationConnectionId,
        ready: response.ready,
      });

      selectSource(sourceService, sourceRoot);
      // Stay on destination page - user can now select destination
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to set source root.";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

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

  // Check if we're processing a source folder selection from the browser
  const state = location.state as { 
    selectedFolder?: Folder; 
    serviceId?: string; 
    role?: "source" | "destination";
  } | null;
  const isProcessingSourceSelection = state?.selectedFolder && state?.role === "source";

  // Show loading state while processing source selection, or redirect if no source
  if (!source && !isProcessingSourceSelection) {
    return null; // The useEffect will handle the redirect
  }

  const buildDestinationRoot = async (destinationId: string) => {
    const destinationService = services.find(
      (service) => service.id === destinationId
    );
    if (!destinationService) {
      alert("Destination service not found.");
      return null;
    }

    let destinationRoot = getPresetRootForServiceType(destinationService.type);

    if (destinationService.type === "local") {
      // Navigate to folder browser
      navigate(`/browse?serviceId=${destinationService.id}&role=destination`);
      return null;
    }

    if (!destinationRoot) {
      alert(
        `No preset root configured for service type "${destinationService.type}". Please configure a root selection flow.`
      );
      return null;
    }

    return { destinationService, destinationRoot } as const;
  };

  const handleSelect = async (id: string) => {
    if (isSubmitting) {
      return;
    }

    if (!source?.root) {
      alert("Source root is missing. Please reselect the source service.");
      return;
    }

    const result = await buildDestinationRoot(id);
    if (!result) {
      return;
    }

    const { destinationService, destinationRoot } = result;

    try {
      setIsSubmitting(true);
      // Transform Folder to API request format
      const rootForApi = {
        id: destinationRoot.ServiceID,  // Service's native identifier
        parentId: destinationRoot.parentId,
        parentPath: destinationRoot.parentPath,
        displayName: destinationRoot.name,
        locationPath: destinationRoot.locationPath,
        lastUpdated: destinationRoot.lastUpdated,
        depthLevel: destinationRoot.depthLevel,
        type: destinationRoot.type || "folder",
      };

      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role: "destination",
        serviceId: destinationService.id,
        root: rootForApi,
        connectionId: migration.destinationConnectionId,
      });

      updateMigration({
        migrationId: response.migrationId,
        sourceConnectionId: response.sourceConnectionId,
        destinationConnectionId: response.destinationConnectionId,
        ready: response.ready,
      });

      selectDestination(destinationService, destinationRoot);

      if (!response.ready) {
        alert("Destination root saved. Select a source if you have not already.");
        return;
      }

      // Navigate to summary page instead of starting migration immediately
      navigate("/summary");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to start migration.";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SelectionPage
      eyebrow="Step 2"
      title={
        <>
          Select your{" "}
          <span className="selection-page__highlight--cyan">destination</span>{" "}
          service
        </>
      }
      summary={
        error
          ? error
          : "Where's the data going?"
      }
      options={options}
      onSelect={handleSelect}
      onBack={() => navigate("/connect")}
      backLabel="← Back to sources"
      emptyMessage={
        loading
          ? "Loading services..."
          : "No services available. Try refreshing."
      }
      isBusy={isSubmitting}
    />
  );
}

