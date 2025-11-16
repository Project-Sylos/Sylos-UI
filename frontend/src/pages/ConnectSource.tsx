import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import SelectionPage from "../components/SelectionPage";
import {
  defaultServiceSelectionOption,
  serviceSelectionOptions,
} from "../data/serviceSelectionOptions";
import { useSelection } from "../context/SelectionContext";
import { getPresetRootForServiceType } from "../data/presetRoots";
import { pickLocalFolder } from "../utils/folderPicker";
import { setMigrationRoot } from "../api/services";

export default function ConnectSource() {
  const navigate = useNavigate();
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
      setIsPicking(true);
      try {
        const chosen = await pickLocalFolder("Select source folder");
        if (!chosen) {
          return;
        }
        root = chosen;
      } finally {
        setIsPicking(false);
      }
    }

    if (!root) {
      alert(
        `No preset root configured for service type "${selected.type}". Please configure a root selection flow.`
      );
      return;
    }

    try {
      setIsPicking(true);
      const response = await setMigrationRoot({
        migrationId: migration.migrationId,
        role: "source",
        serviceId: selected.id,
        root,
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
          : "Choose where Sylos should pull data from. We support on-prem storage and common SaaS providers."
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

