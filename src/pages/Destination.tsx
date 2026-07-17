import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import SelectionPage from "../components/SelectionPage";
import {
  defaultServiceSelectionOption,
  serviceSelectionOptions,
} from "../data/serviceSelectionOptions";
import { useSelection } from "../context/SelectionContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { getPresetRootForServiceType } from "../data/presetRoots";
import { setMigrationRoot } from "../api/services";
import { fetchProviders } from "../api/providers";
import { Folder } from "../types/services";
import { ProviderDescriptor } from "../types/providers";
import { folderToApiRoot, isSpectraEligible } from "../utils/migrationRoots";
import { isCloudServiceType, serviceIdToProviderId } from "../utils/cloudProviders";
import {
  buildCloudConnectPath,
  checkCloudConnection,
  resolveCloudNavigation,
} from "../utils/cloudConnections";
import {
  clearAccountFields,
  clearEndpointCloudState,
} from "../utils/cloudAccountLabel";
import { shouldShowServiceInSelection } from "../utils/serviceSelectionFilter";

export default function Destination() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    services,
    loading,
    error,
    source,
    destination,
    selectDestination,
    migration,
    updateMigration,
    refreshServices,
  } = useSelection();
  const { preferences } = usePreferences();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providers, setProviders] = useState<ProviderDescriptor[]>([]);
  const processedStateRef = useRef<string | null>(null);

  useEffect(() => {
    void refreshServices();
  }, [refreshServices]);

  useEffect(() => {
    let cancelled = false;
    void fetchProviders()
      .then((list) => {
        if (!cancelled) setProviders(list);
      })
      .catch((err) => {
        console.warn("Failed to load providers for service filtering", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const spectraEligible = isSpectraEligible(
    source?.root,
    destination?.root,
    migration.spectraLocked
  );

  const providersById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers]
  );

  const saveDestinationRoot = async (
    destinationServiceId: string,
    destinationRoot: Folder,
    connectionId?: string
  ) => {
    const destinationService = services.find(
      (service) => service.id === destinationServiceId
    );
    if (!destinationService) {
      alert("Destination service not found.");
      return;
    }

    const effectiveConnectionId =
      connectionId ?? migration.destinationConnectionId;

    if (isCloudServiceType(destinationService.type)) {
      if (!effectiveConnectionId) {
        alert("Cloud connection is missing. Please sign in again.");
        navigate(
          buildCloudConnectPath({
            role: "destination",
            serviceId: destinationService.id,
          })
        );
        return;
      }

      try {
        const status = await checkCloudConnection(
          serviceIdToProviderId(destinationService.id),
          effectiveConnectionId
        );
        if (!status.valid) {
          alert("Your cloud connection expired. Please reconnect.");
          navigate(
            buildCloudConnectPath({
              role: "destination",
              serviceId: destinationService.id,
              connectionId: effectiveConnectionId,
              reconnect: true,
            })
          );
          return;
        }
      } catch {
        alert("Could not verify the cloud connection. Please reconnect.");
        navigate(
          buildCloudConnectPath({
            role: "destination",
            serviceId: destinationService.id,
            connectionId: effectiveConnectionId,
            reconnect: true,
          })
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role: "destination",
        serviceId: destinationService.id,
        root: folderToApiRoot(destinationRoot),
        connectionId: effectiveConnectionId,
      });

      updateMigration({
        migrationId: response.migrationId,
        sourceConnectionId: response.sourceConnectionId,
        destinationConnectionId: response.destinationConnectionId,
        ready: response.ready,
        ...(isCloudServiceType(destinationService.type)
          ? {}
          : clearEndpointCloudState("destination")),
      });

      selectDestination(destinationService, destinationRoot);
      navigate("/summary");
    } catch (err) {
      updateMigration(clearAccountFields("destination"));
      const message =
        err instanceof Error ? err.message : "Failed to set destination root.";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFolderSelected = async (
    serviceId: string,
    selectedRoot: Folder,
    connectionId?: string
  ) => {
    await saveDestinationRoot(serviceId, selectedRoot, connectionId);
  };

  useEffect(() => {
    const state = location.state as {
      selectedFolder?: Folder;
      serviceId?: string;
      role?: "source" | "destination";
      connectionId?: string;
    } | null;

    if (state?.selectedFolder && state?.serviceId) {
      const folderRole = state.role || "destination";
      const stateKey = `${state.serviceId}-${state.selectedFolder.ServiceID}-${folderRole}-${state.connectionId ?? ""}`;

      if (processedStateRef.current === stateKey) {
        return;
      }

      processedStateRef.current = stateKey;

      if (folderRole === "destination") {
        void handleFolderSelected(
          state.serviceId,
          state.selectedFolder,
          state.connectionId
        );
      }

      window.history.replaceState({}, document.title);
    } else {
      processedStateRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const options = useMemo(
    () =>
      services
        .filter((service) =>
          shouldShowServiceInSelection({
            service,
            spectraEligible,
            showSpectra:
              preferences.developer?.enabled === true &&
              preferences.developer?.showSpectraService === true,
            hideUnsetServices: preferences.hideUnsetServices === true,
            providersById,
          })
        )
        .map((service) => {
          const visual =
            serviceSelectionOptions[service.id] ??
            serviceSelectionOptions[service.type] ??
            defaultServiceSelectionOption;
          return {
            id: service.id,
            name: service.displayName,
            description: visual.description,
            icon: visual.icon,
            iconAccent: visual.iconAccent,
          };
        }),
    [
      services,
      preferences.developer,
      preferences.hideUnsetServices,
      spectraEligible,
      providersById,
    ]
  );

  const handleSelect = async (id: string) => {
    if (isSubmitting || migration.spectraLocked) {
      return;
    }

    const selected = services.find((service) => service.id === id);
    if (!selected) {
      console.warn(`Service with id "${id}" not found.`);
      return;
    }

    if (selected.type === "spectra") {
      navigate("/spectra-config", {
        state: { serviceId: selected.id, returnTo: "/destination" },
      });
      return;
    }

    if (selected.type === "local") {
      updateMigration(clearEndpointCloudState("destination"));
      navigate(`/browse?serviceId=${selected.id}&role=destination`);
      return;
    }

    if (isCloudServiceType(selected.type)) {
      setIsSubmitting(true);
      try {
        const selectedProviderId = serviceIdToProviderId(selected.id);
        let connectionId = migration.destinationConnectionId;
        if (connectionId) {
          try {
            const status = await checkCloudConnection(
              selectedProviderId,
              connectionId
            );
            if (!status.valid) {
              connectionId = undefined;
              updateMigration({ destinationConnectionId: undefined });
            }
          } catch {
            connectionId = undefined;
            updateMigration({ destinationConnectionId: undefined });
          }
        }
        const navigation = await resolveCloudNavigation({
          role: "destination",
          serviceId: selected.id,
          connectionId,
        });
        navigate(navigation.path);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const destinationRoot = getPresetRootForServiceType(selected.type);
    if (!destinationRoot) {
      alert(
        `No preset root configured for service type "${selected.type}". Please configure a root selection flow.`
      );
      return;
    }

    await saveDestinationRoot(selected.id, destinationRoot);
  };

  return (
    <SelectionPage
      title={
        <>
          Select your{" "}
          <span className="selection-page__highlight--cyan">destination</span>{" "}
          service
        </>
      }
      error={error}
      options={options}
      onSelect={handleSelect}
      onBack={() => navigate("/summary")}
      backTitle="Back to migration setup"
      emptyMessage={
        loading
          ? "Loading services..."
          : "No services available. Try refreshing."
      }
      isBusy={isSubmitting}
    />
  );
}
