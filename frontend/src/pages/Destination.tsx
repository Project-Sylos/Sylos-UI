import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import SelectionPage from "../components/SelectionPage";
import {
  defaultServiceSelectionOption,
  serviceSelectionOptions,
} from "../data/serviceSelectionOptions";
import { useSelection } from "../context/SelectionContext";
import { getPresetRootForServiceType } from "../data/presetRoots";
import { setMigrationRoot, startMigration } from "../api/services";
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
    migration,
    updateMigration,
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

    return { destinationService, destinationRoot } as const;
  };

  const handleSelect = async (id: string) => {
    if (isSubmitting) {
      return;
    }

    if (!source.root) {
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
      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role: "destination",
        serviceId: destinationService.id,
        root: destinationRoot,
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

      const run = await startMigration({ migrationId: response.migrationId });
      alert(`Migration started!\nID: ${run.id}\nStatus: ${run.status}`);
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

