import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import SelectionPage from "../components/SelectionPage";
import {
  defaultServiceSelectionOption,
  serviceSelectionOptions,
} from "../data/serviceSelectionOptions";
import { useSelection } from "../context/SelectionContext";
import { getPresetRootForServiceType } from "../data/presetRoots";
import { createMigrationRoots, startMigration } from "../api/services";
import {
  MigrationRootsPayload,
  MigrationRootsResponse,
  StartMigrationPayload,
} from "../types/migrations";
import { pickLocalFolder } from "../utils/folderPicker";

export default function Destination() {
  const navigate = useNavigate();
  const {
    services,
    loading,
    error,
    source,
    selectDestination,
    clearSelections,
  } = useSelection();
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  if (!source) {
    navigate("/connect");
    return null;
  }

  const buildRootsPayload = async (
    destinationId: string
  ): Promise<MigrationRootsPayload | null> => {
    if (!source.root) {
      alert(
        "Source root is missing. Please reselect the source service or implement root browsing."
      );
      return null;
    }

    const destinationService = services.find(
      (service) => service.id === destinationId
    );
    if (!destinationService) {
      alert("Destination service not found.");
      return null;
    }

    let destinationRoot = getPresetRootForServiceType(
      destinationService.type
    );

    if (destinationService.type === "local") {
      const chosen = await pickLocalFolder("Select destination folder");
      if (!chosen) {
        return null;
      }
      destinationRoot = chosen;
    }

    if (!destinationRoot) {
      alert(
        `No preset root configured for service type "${destinationService.type}". Please configure a root selection flow.`
      );
      return null;
    }

    selectDestination(destinationService, destinationRoot);

    const migrationId =
      globalThis.crypto?.randomUUID?.() ?? undefined;

    return {
      migrationId,
      source: {
        serviceId: source.service.id,
        connectionId: undefined,
        root: source.root,
      },
      destination: {
        serviceId: destinationService.id,
        connectionId: undefined,
        root: destinationRoot,
      },
      options: {
        workerCount: 10,
        maxRetries: 3,
        coordinatorLead: 4,
        logAddress: "127.0.0.1:8081",
        skipLogListener: true,
        verification: {
          allowPending: false,
          allowFailed: false,
          allowNotOnSrc: false,
        },
      },
    };
  };

  const handleSelect = async (id: string) => {
    if (isSubmitting) {
      return;
    }

    const rootsPayload = await buildRootsPayload(id);
    if (!rootsPayload) {
      return;
    }

    try {
      setIsSubmitting(true);
      const rootsResponse = await createMigrationRoots(rootsPayload);

      const startPayload: StartMigrationPayload = {
        source: {
          serviceId: rootsPayload.source.serviceId,
          connectionId:
            rootsResponse.sourceConnectionId ??
            rootsPayload.source.connectionId,
        },
        destination: {
          serviceId: rootsPayload.destination.serviceId,
          connectionId:
            rootsResponse.destinationConnectionId ??
            rootsPayload.destination.connectionId,
        },
        options: {
          migrationId: rootsResponse.migrationId ?? rootsPayload.migrationId,
          sourceConnectionId:
            rootsResponse.sourceConnectionId ??
            rootsPayload.options?.sourceConnectionId,
          destinationConnectionId:
            rootsResponse.destinationConnectionId ??
            rootsPayload.options?.destinationConnectionId,
        },
      };

      const response = await startMigration(startPayload);
      alert(
        `Migration started!\nID: ${response.id}\nStatus: ${response.status}`
      );
      clearSelections();
      navigate("/");
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
          : "Tell Sylos where this migration should land. Pick another instance of the services above or point to a different account."
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

