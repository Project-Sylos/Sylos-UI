import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import PageContainer from "../components/PageContainer";
import FormField from "../components/FormField";
import FormSection from "../components/FormSection";
import ValidationErrors from "../components/ValidationErrors";
import FormFooter from "../components/FormFooter";
import HelpTooltip from "../components/HelpTooltip";
import { useSelection } from "../context/SelectionContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { getPresetRootForServiceType } from "../data/presetRoots";
import { setMigrationRoot } from "../api/services";
import { SpectraConfig, DEFAULT_SPECTRA_CONFIG, ServiceDescriptor } from "../types/services";
import { folderToApiRoot } from "../utils/migrationRoots";
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

  const locationState = location.state as {
    serviceId?: string;
    returnTo?: string;
  } | null;
  const returnTo = locationState?.returnTo || "/summary";

  // Get service from location state or find it in services
  useEffect(() => {
    // Check if developer mode and Spectra service are enabled
    if (preferences.developer?.enabled !== true || 
        preferences.developer?.showSpectraService !== true) {
      navigate("/summary");
      return;
    }

    if (locationState?.serviceId) {
      const service = services.find((s) => s.id === locationState.serviceId);
      if (service && service.type === "spectra") {
        setSpectraService(service);
      } else {
        navigate("/summary");
      }
    } else {
      // Try to find a Spectra service if no state provided
      const spectra = services.find((s) => s.type === "spectra");
      if (spectra) {
        setSpectraService(spectra);
      } else {
        navigate("/summary");
      }
    }
  }, [location.state, services, navigate, preferences.developer, locationState?.serviceId]);

  const getInputValue = (section: string, field: string): string => {
    const key = `${section}.${field}`;
    if (inputValues[key] !== undefined) {
      return inputValues[key];
    }
    // Get from config, handling 0 values properly
    if (section === "seed") {
      return String(config.seed[field as keyof typeof config.seed] ?? "");
    }
    if (section === "api") {
      return String(config.api[field as keyof typeof config.api] ?? "");
    }
    if (section === "secondary_tables") {
      return String(config.secondary_tables[field] ?? "");
    }
    if (section === "auth") {
      if (field === "access_token_ttl_seconds") {
        return String(config.auth?.access_token_ttl_seconds ?? 3600);
      }
    }
    if (section === "chaos") {
      if (field === "list_children_cps") {
        return String(
          config.chaos?.rate_limits?.operations?.list_children?.calls_per_second ?? 5000
        );
      }
      if (field === "packet_loss") {
        return String(config.chaos?.packet_loss?.probability ?? 0);
      }
      if (field === "list_children_latency_ms") {
        return String(config.chaos?.latency?.list_children_ms ?? 0);
      }
    }
    return "";
  };

  const isFloatField = (section: string, field: string) =>
    section === "secondary_tables" ||
    field === "folder_backoff_factor" ||
    field === "folder_depth_decay_factor" ||
    field === "file_backoff_factor" ||
    field === "file_depth_decay_factor" ||
    field === "packet_loss";

  const applyNumberToConfig = (
    prev: SpectraConfig,
    section: "seed" | "api" | "secondary_tables" | "auth" | "chaos",
    field: string,
    numValue: number
  ): SpectraConfig => {
    if (section === "secondary_tables") {
      return {
        ...prev,
        secondary_tables: {
          ...prev.secondary_tables,
          [field]: numValue,
        },
      };
    }
    if (section === "auth") {
      return {
        ...prev,
        auth: {
          enabled: prev.auth?.enabled ?? false,
          access_token_ttl_seconds:
            field === "access_token_ttl_seconds"
              ? numValue
              : (prev.auth?.access_token_ttl_seconds ?? 3600),
        },
      };
    }
    if (section === "chaos") {
      const chaos = prev.chaos ?? {
        enabled: false,
        rate_limits: {
          poll_interval_ms: 1000,
          global: { calls_per_second: 0, burst: 0 },
          operations: {},
          bandwidth: { bytes_per_second: 1073741824 },
        },
        backoff: { base_retry_after_ms: 100, exponential_factor: 2 },
        latency: { list_children_ms: 0, jitter_ms: 0 },
        packet_loss: { probability: 0, retry_after_ms: 500 },
      };
      if (field === "list_children_cps") {
        return {
          ...prev,
          chaos: {
            ...chaos,
            rate_limits: {
              ...chaos.rate_limits,
              operations: {
                ...chaos.rate_limits.operations,
                list_children: {
                  calls_per_second: numValue,
                  burst: numValue,
                },
              },
            },
          },
        };
      }
      if (field === "packet_loss") {
        return {
          ...prev,
          chaos: {
            ...chaos,
            packet_loss: {
              ...chaos.packet_loss,
              probability: numValue,
            },
          },
        };
      }
      if (field === "list_children_latency_ms") {
        return {
          ...prev,
          chaos: {
            ...chaos,
            latency: {
              ...chaos.latency,
              list_children_ms: numValue,
            },
          },
        };
      }
      return prev;
    }
    return {
      ...prev,
      [section]: {
        ...prev[section],
        [field]: numValue,
      },
    };
  };

  const handleNumberInputChange = (
    section: "seed" | "api" | "secondary_tables" | "auth" | "chaos",
    field: string,
    value: string
  ) => {
    const key = `${section}.${field}`;
    setInputValues((prev) => ({
      ...prev,
      [key]: value,
    }));

    // Keep the draft empty while typing; commit a number only when present.
    if (value === "" || value === "-" || value === "." || value === "-.") {
      return;
    }

    const numValue = isFloatField(section, field)
      ? parseFloat(value)
      : parseInt(value, 10);
    if (Number.isNaN(numValue)) {
      return;
    }

    setConfig((prev) => applyNumberToConfig(prev, section, field, numValue));
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

  const handleModeChange = (checked: boolean) => {
    setConfig((prev) => ({
      ...prev,
      mode: checked ? "ephemeral" : "persistent",
      seed: {
        ...prev.seed,
        // Disable diverging_tree_mode when NOT ephemeral
        diverging_tree_mode: checked ? prev.seed.diverging_tree_mode : false,
      },
      secondary_tables: {
        ...prev.secondary_tables,
        // Reset destination probability to 0 when ephemeral mode is enabled
        s1: checked ? 0 : prev.secondary_tables.s1,
      },
    }));
  };

  const handleNumberInputBlur = (
    section: "seed" | "api" | "secondary_tables" | "auth" | "chaos",
    field: string,
    defaultValue: number
  ) => {
    const key = `${section}.${field}`;
    const currentValue = inputValues[key];

    if (
      currentValue === "" ||
      currentValue === undefined ||
      currentValue === "-" ||
      currentValue === "." ||
      currentValue === "-." ||
      Number.isNaN(
        isFloatField(section, field)
          ? parseFloat(currentValue)
          : parseInt(currentValue, 10)
      )
    ) {
      setInputValues((prev) => {
        const newValues = { ...prev };
        delete newValues[key];
        return newValues;
      });

      setConfig((prev) => applyNumberToConfig(prev, section, field, defaultValue));
    } else {
      // Clear draft so display falls back to the committed config value.
      setInputValues((prev) => {
        const newValues = { ...prev };
        delete newValues[key];
        return newValues;
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
      const rootForApi = folderToApiRoot(root);

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

      const spectraPrimaryRole =
        returnTo === "/destination"
          ? "destination"
          : returnTo === "/connect"
            ? "source"
            : migration.spectraPrimaryRole ?? "source";

      updateMigration({
        migrationId: destResponse.migrationId,
        sourceConnectionId: destResponse.sourceConnectionId,
        destinationConnectionId: destResponse.destinationConnectionId,
        ready: destResponse.ready,
        spectraLocked: true,
        spectraPrimaryRole,
      });

      selectDestination(spectraService, root);

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
      onBack={() => navigate(returnTo)}
      backTitle="Back to migration setup"
    >
      <header className="spectra-config__header">
        <h1>
          Configure <span className="spectra-config__highlight">Spectra</span>
        </h1>
      </header>

      {error && (
        <div className="spectra-config__error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="spectra-config__form">
        {/* Ephemeral Mode and Diverging Tree Mode controls grouped */}
        <div className="spectra-config__checkbox-row" style={{ display: "flex", gap: "2rem", marginBottom: '1rem' }}>
          <div className="spectra-config__checkbox-field">
            <input
              id="ephemeral_mode"
              type="checkbox"
              checked={config.mode === "ephemeral"}
              onChange={(e) => handleModeChange(e.target.checked)}
              className="spectra-config__checkbox-input"
            />
            <label htmlFor="ephemeral_mode" className="form-field__label-with-tooltip" style={{ margin: 0 }}>
              Ephemeral Mode
              <HelpTooltip
                tipId="spectra-ephemeral-mode"
                category="spectra-config"
                position="right"
                content={
                  <>
                    <p>
                      When enabled, Spectra will run in ephemeral mode, skipping database operations in spectra's internals.
                    </p>
                    <p style={{ marginTop: '0.5rem' }}>
                      This automatically disables caching and destination probability since ephemeral mode doesn't persist data between sessions.
                    </p>
                  </>
                }
              />
            </label>
          </div>
          <div className="spectra-config__checkbox-field">
            <input
              id="diverging_tree_mode"
              type="checkbox"
              checked={config.seed.diverging_tree_mode ?? false}
              onChange={(e) => handleBooleanInputChange("seed", "diverging_tree_mode", e.target.checked)}
              disabled={config.mode !== "ephemeral"}
              className="spectra-config__checkbox-input"
            />
            <label htmlFor="diverging_tree_mode" className="form-field__label-with-tooltip" style={{ margin: 0 }}>
              Diverging Tree Mode
              <HelpTooltip
                tipId="spectra-diverging-tree-mode"
                category="spectra-config"
                position="right"
                content={
                  <p>When enabled, and if ephermal mode is selected, the tree structure may diverge. Without ephemeral, trees diverge by default.</p>
                }
              />
            </label>
          </div>
        </div>

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
            disabled={config.mode === "ephemeral"}
          />
        </FormSection>

        {/* Remove original location of Diverging Tree Mode Section */}

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
            disabled={config.mode === "ephemeral"}
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

        <FormSection title="Auth">
          <div className="spectra-config__checkbox-field">
            <input
              id="auth_enabled"
              type="checkbox"
              checked={config.auth?.enabled ?? false}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  auth: {
                    enabled: e.target.checked,
                    access_token_ttl_seconds: prev.auth?.access_token_ttl_seconds ?? 3600,
                  },
                }))
              }
              className="spectra-config__checkbox-input"
            />
            <label htmlFor="auth_enabled" className="form-field__label" style={{ margin: 0 }}>
              Enable Auth Tokens
            </label>
          </div>
          <FormField
            id="access_token_ttl_seconds"
            label="Access Token TTL (seconds)"
            type="number"
            value={getInputValue("auth", "access_token_ttl_seconds")}
            onChange={(value) =>
              handleNumberInputChange("auth", "access_token_ttl_seconds", value)
            }
            onBlur={() =>
              handleNumberInputBlur("auth", "access_token_ttl_seconds", 3600)
            }
            helpTooltip={{
              tipId: "spectra-auth-ttl",
              category: "spectra-config",
              position: "right",
              content: (
                <p>
                  Access token lifetime in seconds. Use -1 for tokens that never expire. Refresh tokens always last forever.
                </p>
              ),
            }}
          />
        </FormSection>

        <FormSection title="Chaos Simulation">
          <div className="spectra-config__checkbox-field">
            <input
              id="chaos_enabled"
              type="checkbox"
              checked={config.chaos?.enabled ?? false}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  chaos: {
                    ...(prev.chaos ?? {
                      enabled: false,
                      rate_limits: {
                        poll_interval_ms: 1000,
                        global: { calls_per_second: 0, burst: 0 },
                        operations: {},
                        bandwidth: { bytes_per_second: 1073741824 },
                      },
                      backoff: { base_retry_after_ms: 100, exponential_factor: 2 },
                      latency: { list_children_ms: 0, jitter_ms: 0 },
                      packet_loss: { probability: 0, retry_after_ms: 500 },
                    }),
                    enabled: e.target.checked,
                  },
                }))
              }
              className="spectra-config__checkbox-input"
            />
            <label htmlFor="chaos_enabled" className="form-field__label" style={{ margin: 0 }}>
              Enable Chaos
            </label>
          </div>
          <FormField
            id="list_children_cps"
            label="ListChildren calls/sec"
            type="number"
            value={getInputValue("chaos", "list_children_cps")}
            onChange={(value) =>
              handleNumberInputChange("chaos", "list_children_cps", value)
            }
            onBlur={() => handleNumberInputBlur("chaos", "list_children_cps", 5000)}
            min={0}
          />
          <FormField
            id="packet_loss"
            label="Packet Loss Probability"
            type="number"
            value={getInputValue("chaos", "packet_loss")}
            onChange={(value) =>
              handleNumberInputChange("chaos", "packet_loss", value)
            }
            onBlur={() => handleNumberInputBlur("chaos", "packet_loss", 0)}
            step={0.01}
            min={0}
            max={1}
          />
          <FormField
            id="list_children_latency_ms"
            label="ListChildren Latency (ms)"
            type="number"
            value={getInputValue("chaos", "list_children_latency_ms")}
            onChange={(value) =>
              handleNumberInputChange("chaos", "list_children_latency_ms", value)
            }
            onBlur={() =>
              handleNumberInputBlur("chaos", "list_children_latency_ms", 0)
            }
            min={0}
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
