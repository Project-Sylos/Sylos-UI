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
import { Folder } from "../types/services";
import { folderToApiRoot, isSpectraEligible } from "../utils/migrationRoots";
import { isCloudServiceType, serviceIdToProviderId } from "../utils/cloudProviders";
import {
  buildCloudConnectPath,
  checkCloudConnection,
  resolveCloudNavigation,
} from "../utils/cloudConnections";

export default function ConnectSource() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    services,
    loading,
    error,
    source,
    destination,
    selectSource,
    migration,
    updateMigration,
  } = useSelection();
  const { preferences } = usePreferences();
  const [isPicking, setIsPicking] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const processedStateRef = useRef<string | null>(null);

  const spectraEligible = isSpectraEligible(
    source?.root,
    destination?.root,
    migration.spectraLocked
  );

  const handleFolderSelected = async (
    serviceId: string,
    root: Folder,
    connectionId?: string
  ) => {
    const selected = services.find((service) => service.id === serviceId);
    if (!selected) {
      alert("Service not found.");
      return;
    }

    const effectiveConnectionId =
      connectionId ?? migration.sourceConnectionId;

    if (isCloudServiceType(selected.type)) {
      if (!effectiveConnectionId) {
        alert("Cloud connection is missing. Please sign in again.");
        navigate(
          buildCloudConnectPath({
            role: "source",
            serviceId: selected.id,
          })
        );
        return;
      }

      try {
        const status = await checkCloudConnection(
          serviceIdToProviderId(selected.id),
          effectiveConnectionId
        );
        if (!status.valid) {
          alert("Your cloud connection expired. Please reconnect.");
          navigate(
            buildCloudConnectPath({
              role: "source",
              serviceId: selected.id,
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
            role: "source",
            serviceId: selected.id,
            connectionId: effectiveConnectionId,
            reconnect: true,
          })
        );
        return;
      }
    }

    try {
      setIsPicking(true);
      setSaveError(null);
      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role: "source",
        serviceId: selected.id,
        root: folderToApiRoot(root),
        connectionId: effectiveConnectionId,
      });

      updateMigration({
        migrationId: response.migrationId,
        sourceConnectionId: response.sourceConnectionId,
        destinationConnectionId: response.destinationConnectionId,
        ready: response.ready,
      });

      selectSource(selected, root);
      navigate("/summary");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to set source root.";
      setSaveError(message);
    } finally {
      setIsPicking(false);
    }
  };

  useEffect(() => {
    const state = location.state as {
      selectedFolder?: Folder;
      serviceId?: string;
      connectionId?: string;
    } | null;

    if (state?.selectedFolder && state?.serviceId) {
      const stateKey = `${state.serviceId}-${state.selectedFolder.ServiceID}-${state.connectionId ?? ""}`;

      if (processedStateRef.current === stateKey) {
        return;
      }

      processedStateRef.current = stateKey;
      handleFolderSelected(
        state.serviceId,
        state.selectedFolder,
        state.connectionId
      );
      window.history.replaceState({}, document.title);
    } else {
      processedStateRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const options = useMemo(
    () =>
      services
        .filter((service) => {
          if (service.type === "spectra") {
            if (!spectraEligible) return false;
            return (
              preferences.developer?.enabled === true &&
              preferences.developer?.showSpectraService === true
            );
          }
          return true;
        })
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
    [services, preferences.developer, spectraEligible]
  );

  const handleSelect = async (id: string) => {
    if (isPicking || migration.spectraLocked) {
      return;
    }

    const selected = services.find((service) => service.id === id);
    if (!selected) {
      console.warn(`Service with id "${id}" not found.`);
      return;
    }

    if (selected.type === "spectra") {
      navigate("/spectra-config", {
        state: { serviceId: selected.id, returnTo: "/connect" },
      });
      return;
    }

    if (selected.type === "local") {
      navigate(`/browse?serviceId=${selected.id}&role=source`);
      return;
    }

    if (isCloudServiceType(selected.type)) {
      setIsPicking(true);
      try {
        const navigation = await resolveCloudNavigation({
          role: "source",
          serviceId: selected.id,
          connectionId: migration.sourceConnectionId,
        });
        navigate(navigation.path);
      } finally {
        setIsPicking(false);
      }
      return;
    }

    const root = getPresetRootForServiceType(selected.type);
    if (!root) {
      alert(
        `No preset root configured for service type "${selected.type}". Please configure a root selection flow.`
      );
      return;
    }

    try {
      setIsPicking(true);
      setSaveError(null);
      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role: "source",
        serviceId: selected.id,
        root: folderToApiRoot(root),
        connectionId: migration.sourceConnectionId,
      });

      updateMigration({
        migrationId: response.migrationId,
        sourceConnectionId: response.sourceConnectionId,
        destinationConnectionId: response.destinationConnectionId,
        ready: response.ready,
      });

      selectSource(selected, root);
      navigate("/summary");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to set source root.";
      setSaveError(message);
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <SelectionPage
      title={
        <>
          Select your{" "}
          <span className="selection-page__highlight--magenta">source</span>{" "}
          service
        </>
      }
      error={saveError ?? error}
      options={options}
      onSelect={handleSelect}
      onBack={() => navigate("/summary")}
      backTitle="Back to migration setup"
      emptyMessage={
        loading
          ? "Loading services..."
          : "No services available. Try refreshing."
      }
      isBusy={isPicking}
    />
  );
}
