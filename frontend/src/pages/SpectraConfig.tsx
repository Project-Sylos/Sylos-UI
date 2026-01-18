import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import PageContainer from "../components/PageContainer";
import FormField from "../components/FormField";
import FormSection from "../components/FormSection";
import ValidationErrors from "../components/ValidationErrors";
import FormFooter from "../components/FormFooter";
import { useSelection } from "../context/SelectionContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { getPresetRootForServiceType } from "../data/presetRoots";
import { setMigrationRoot } from "../api/services";
import { SpectraConfig, DEFAULT_SPECTRA_CONFIG, ServiceDescriptor } from "../types/services";
import "./SpectraConfig.css";

export default function SpectraConfigPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    services,
    migration,
    updateMigration,
    selectSource,
    selectDestination,
  } = useSelection();
  const { preferences } = usePreferences();

  const [config, setConfig] = useState<SpectraConfig>(DEFAULT_SPECTRA_CONFIG);
  // Track input values as strings to allow empty values
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spectraService, setSpectraService] = useState<ServiceDescriptor | null>(null);

  // Get service from location state or find it in services
  useEffect(() => {
    // Check if developer mode and Spectra service are enabled
    if (preferences.developer?.enabled !== true || 
        preferences.developer?.showSpectraService !== true) {
      navigate("/connect");
      return;
    }

    const state = location.state as { serviceId?: string } | null;
    if (state?.serviceId) {
      const service = services.find((s) => s.id === state.serviceId);
      if (service && service.type === "spectra") {
        setSpectraService(service);
      } else {
        navigate("/connect");
      }
    } else {
      // Try to find a Spectra service if no state provided
      const spectra = services.find((s) => s.type === "spectra");
      if (spectra) {
        setSpectraService(spectra);
      } else {
        navigate("/connect");
      }
    }
  }, [location.state, services, navigate, preferences.developer]);

  const getInputValue = (section: string, field: string): string => {
    const key = `${section}.${field}`;
    if (inputValues[key] !== undefined) {
      return inputValues[key];
    }
    // Get from config, handling 0 values properly
    if (section === "seed") {
      return String(config.seed[field as keyof typeof config.seed] ?? "");
    } else if (section === "api") {
      return String(config.api[field as keyof typeof config.api] ?? "");
    } else if (section === "secondary_tables") {
      return String(config.secondary_tables[field] ?? "");
    }
    return "";
  };

  const handleNumberInputChange = (
    section: "seed" | "api" | "secondary_tables",
    field: string,
    value: string
  ) => {
    const key = `${section}.${field}`;
    setInputValues((prev) => ({
      ...prev,
      [key]: value,
    }));

    if (value !== "") {
      const isFloatField = section === "secondary_tables" || 
        field === "folder_backoff_factor" || 
        field === "folder_depth_decay_factor" ||
        field === "file_backoff_factor" ||
        field === "file_depth_decay_factor";
      const numValue = isFloatField 
        ? parseFloat(value) || 0
        : parseInt(value, 10) || 0;
      
      setConfig((prev) => {
        if (section === "secondary_tables") {
          return {
            ...prev,
            secondary_tables: {
              ...prev.secondary_tables,
              [field]: numValue,
            },
          };
        } else {
          return {
            ...prev,
            [section]: {
              ...prev[section],
              [field]: numValue,
            },
          };
        }
      });
    }
  };

  const handleBooleanInputChange = (
    section: "seed",
    field: string,
    checked: boolean
  ) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: checked,
      },
    }));
  };

  const handleNumberInputBlur = (
    section: "seed" | "api" | "secondary_tables",
    field: string,
    defaultValue: number
  ) => {
    const key = `${section}.${field}`;
    const currentValue = inputValues[key];
    
    if (currentValue === "" || currentValue === undefined) {
      setInputValues((prev) => {
        const newValues = { ...prev };
        delete newValues[key];
        return newValues;
      });
      
      setConfig((prev) => {
        if (section === "secondary_tables") {
          return {
            ...prev,
            secondary_tables: {
              ...prev.secondary_tables,
              [field]: defaultValue,
            },
          };
        } else {
          return {
            ...prev,
            [section]: {
              ...prev[section],
              [field]: defaultValue,
            },
          };
        }
      });
    }
  };

  const handleTextInputChange = (
    section: "seed" | "api",
    field: string,
    value: string
  ) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const seed = config.seed;
    
    if (seed.max_depth <= 2) {
      errors.push("Max Depth must be greater than 2");
    }
    
    if (seed.max_folders <= 0) {
      errors.push("Max Folders must be greater than 0");
    }
    
    if (seed.max_files <= 0) {
      errors.push("Max Files must be greater than 0");
    }
    
    return errors;
  }, [config]);

  const isValid = validationErrors.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValid) {
      setError(validationErrors.join(". "));
      return;
    }
    
    if (!spectraService) {
      setError("Spectra service not found.");
      return;
    }

    const root = getPresetRootForServiceType("spectra");
    if (!root) {
      setError("Failed to get preset root for Spectra.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Transform Folder to API request format
      const rootForApi = {
        id: root.ServiceID,
        parentId: root.parentId,
        parentPath: root.parentPath,
        displayName: root.name,
        locationPath: root.locationPath,
        lastUpdated: root.lastUpdated,
        depthLevel: root.depthLevel,
        type: root.type || "folder",
      };

      // First API call: Set source root with config
      const sourceResponse = await setMigrationRoot({
        migrationId: migration.migrationId,
        role: "source",
        serviceId: spectraService.id,
        root: rootForApi,
        config: config,
      });

      updateMigration({
        migrationId: sourceResponse.migrationId,
        sourceConnectionId: sourceResponse.sourceConnectionId,
        destinationConnectionId: sourceResponse.destinationConnectionId,
        ready: sourceResponse.ready,
      });

      selectSource(spectraService, root);

      // Second API call: Set destination root (same service)
      const destResponse = await setMigrationRoot({
        migrationId: sourceResponse.migrationId,
        role: "destination",
        serviceId: spectraService.id,
        root: rootForApi,
        connectionId: sourceResponse.destinationConnectionId,
      });

      updateMigration({
        migrationId: destResponse.migrationId,
        sourceConnectionId: destResponse.sourceConnectionId,
        destinationConnectionId: destResponse.destinationConnectionId,
        ready: destResponse.ready,
      });

      selectDestination(spectraService, root);

      // Navigate to summary page
      navigate("/summary");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to configure Spectra service.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!spectraService) {
    return null; // Will redirect
  }

  return (
    <PageContainer
      className="spectra-config"
      contentClassName="spectra-config__content"
      onBack={() => navigate("/connect")}
      backLabel="← Back to sources"
    >
      <header className="spectra-config__header">
        <p className="spectra-config__eyebrow">Step 1</p>
        <h1>
          Configure <span className="spectra-config__highlight">Spectra</span>
        </h1>
        <p className="spectra-config__summary">
          Set up your Spectra simulator parameters before proceeding. For more information on Spectra, click{" "}
          <a
            href="https://github.com/Project-Sylos/Spectra"
            target="_blank"
            rel="noopener noreferrer"
            className="spectra-config__link"
          >
            here
          </a>
          .
        </p>
      </header>

      {error && (
        <div className="spectra-config__error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="spectra-config__form">
        <FormSection title="Seed Configuration">
          <FormField
            id="max_depth"
            label="Max Depth"
            type="number"
            value={getInputValue("seed", "max_depth")}
            onChange={(value) => handleNumberInputChange("seed", "max_depth", value)}
            onBlur={() => handleNumberInputBlur("seed", "max_depth", 3)}
            min={3}
            required
          />
          <FormField
            id="max_folders"
            label="Max Folders"
            type="number"
            value={getInputValue("seed", "max_folders")}
            onChange={(value) => handleNumberInputChange("seed", "max_folders", value)}
            onBlur={() => handleNumberInputBlur("seed", "max_folders", 8)}
            min={1}
            required
          />
          <FormField
            id="folder_backoff_factor"
            label="Folder Backoff Factor"
            type="number"
            value={getInputValue("seed", "folder_backoff_factor")}
            onChange={(value) => handleNumberInputChange("seed", "folder_backoff_factor", value)}
            onBlur={() => handleNumberInputBlur("seed", "folder_backoff_factor", 0.5)}
            step={0.1}
            min={0}
            max={1}
          />
          <FormField
            id="folder_depth_decay_factor"
            label="Folder Depth Decay Factor"
            type="number"
            value={getInputValue("seed", "folder_depth_decay_factor")}
            onChange={(value) => handleNumberInputChange("seed", "folder_depth_decay_factor", value)}
            onBlur={() => handleNumberInputBlur("seed", "folder_depth_decay_factor", 0.8)}
            step={0.1}
            min={0}
            max={1}
          />
          <FormField
            id="max_files"
            label="Max Files"
            type="number"
            value={getInputValue("seed", "max_files")}
            onChange={(value) => handleNumberInputChange("seed", "max_files", value)}
            onBlur={() => handleNumberInputBlur("seed", "max_files", 20)}
            min={1}
            required
          />
          <FormField
            id="file_backoff_factor"
            label="File Backoff Factor"
            type="number"
            value={getInputValue("seed", "file_backoff_factor")}
            onChange={(value) => handleNumberInputChange("seed", "file_backoff_factor", value)}
            onBlur={() => handleNumberInputBlur("seed", "file_backoff_factor", 0.5)}
            step={0.1}
            min={0}
            max={1}
          />
          <FormField
            id="file_depth_decay_factor"
            label="File Depth Decay Factor"
            type="number"
            value={getInputValue("seed", "file_depth_decay_factor")}
            onChange={(value) => handleNumberInputChange("seed", "file_depth_decay_factor", value)}
            onBlur={() => handleNumberInputBlur("seed", "file_depth_decay_factor", 0.8)}
            step={0.1}
            min={0}
            max={1}
          />
          <FormField
            id="seed"
            label="Seed"
            type="number"
            value={getInputValue("seed", "seed")}
            onChange={(value) => handleNumberInputChange("seed", "seed", value)}
            onBlur={() => handleNumberInputBlur("seed", "seed", 0)}
          />
          <FormField
            id="db_path"
            label="Database Path"
            type="text"
            value={config.seed.db_path}
            onChange={(value) => handleTextInputChange("seed", "db_path", value)}
            required
          />
          <div className="form-field">
            <label htmlFor="enable_cache" className="form-field__label">
              Enable Cache
            </label>
            <input
              id="enable_cache"
              type="checkbox"
              checked={config.seed.enable_cache ?? false}
              onChange={(e) => handleBooleanInputChange("seed", "enable_cache", e.target.checked)}
              className="form-field__input"
            />
          </div>
        </FormSection>

        <FormSection title="API Configuration">
          <FormField
            id="host"
            label="Host"
            type="text"
            value={config.api.host}
            onChange={(value) => handleTextInputChange("api", "host", value)}
            required
          />
          <FormField
            id="port"
            label="Port"
            type="number"
            value={getInputValue("api", "port")}
            onChange={(value) => handleNumberInputChange("api", "port", value)}
            onBlur={() => handleNumberInputBlur("api", "port", 0)}
            min={1}
            max={65535}
            required
          />
        </FormSection>

        <FormSection title="Secondary Tables">
          <FormField
            id="s1"
            label="Destination Probability"
            type="number"
            value={getInputValue("secondary_tables", "s1")}
            onChange={(value) => handleNumberInputChange("secondary_tables", "s1", value)}
            onBlur={() => handleNumberInputBlur("secondary_tables", "s1", 0)}
            step={0.1}
            min={0}
            max={1}
            required
            helpTooltip={{
              tipId: "spectra-destination-probability",
              category: "spectra-config",
              position: "right",
              content: (
                <p>
                  This is the chance each item has for existing on the destination once it's created in the source world.
                </p>
              ),
            }}
          />
        </FormSection>

        <ValidationErrors errors={validationErrors} />

        <FormFooter>
          <button
            type="submit"
            className="glass-button"
            disabled={isSubmitting || !isValid}
          >
            {isSubmitting ? "Configuring..." : "Review Discovery Setup"}
            {!isSubmitting && <ArrowRight size={20} style={{ marginLeft: "0.5rem" }} />}
          </button>
        </FormFooter>
      </form>
    </PageContainer>
  );
}
