import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CheckCircle2, Circle, ChevronRight, Pencil } from "lucide-react";

import PageContainer from "../components/PageContainer";
import CloudConnectionIssues from "../components/CloudConnectionIssues";
import { useSelection } from "../context/SelectionContext";
import { getMigrationStatus, renameMigration, startMigration } from "../api/services";
import { ServiceDescriptor, Folder } from "../types/services";
import {
  CloudConnectionCheckResult,
  connectionIdForRole,
  formatCloudConnectionIssues,
  invalidCloudResults,
  resolveCloudNavigation,
  verifyConfiguredMigrationCloudConnections,
} from "../utils/cloudConnections";
import {
  formatMigrationPath,
  formatServiceRootLabel,
  getEndpointEditNavigation,
} from "../utils/migrationRoots";
import "./MigrationSummary.css";

function computeDefaultName(
  source?: { service?: { displayName?: string }; root?: Folder },
  destination?: { service?: { displayName?: string }; root?: Folder }
): string {
  const src = source ? formatServiceRootLabel(source) : "";
  const dst = destination ? formatServiceRootLabel(destination) : "";
  if (src && dst) return `${src} \u2192 ${dst}`;
  return src || dst || "";
}

export default function MigrationSummary() {
  const navigate = useNavigate();
  const { source, destination, migration } = useSelection();
  const [isStarting, setIsStarting] = useState(false);
  const [checkingConnections, setCheckingConnections] = useState(false);
  const [connectionIssues, setConnectionIssues] = useState<CloudConnectionCheckResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameDirty, setNameDirty] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [serverName, setServerName] = useState<string | undefined>(undefined);

  const computedDefaultName = useMemo(
    () => computeDefaultName(source, destination),
    [source, destination]
  );

  const sourceConfigured = Boolean(source?.root);
  const destinationConfigured = Boolean(destination?.root);
  const spectraLocked = migration.spectraLocked === true;
  const spectraPrimaryRole = migration.spectraPrimaryRole ?? "source";
  const spectraLockTitle =
    "Locked. Spectra sets the same root on both source and destination";
  const hasCloudConnectionIssues = invalidCloudResults(connectionIssues).length > 0;
  const canStart =
    migration.ready &&
    sourceConfigured &&
    destinationConfigured &&
    !hasCloudConnectionIssues;

  const startDiscoveryTitle = isStarting
    ? "Starting discovery..."
    : hasCloudConnectionIssues
      ? "Reconnect cloud accounts before starting discovery."
      : canStart
        ? "Start discovery to map differences and build a migration plan."
        : "Configure source and destination to continue.";

  useEffect(() => {
    if (!sourceConfigured && !destinationConfigured) {
      setConnectionIssues([]);
      return;
    }

    let cancelled = false;

    async function checkConnections() {
      setCheckingConnections(true);
      try {
        const results = await verifyConfiguredMigrationCloudConnections(
          source,
          destination,
          migration
        );
        if (!cancelled) {
          setConnectionIssues(results);
        }
      } catch {
        if (!cancelled) {
          setConnectionIssues([]);
        }
      } finally {
        if (!cancelled) {
          setCheckingConnections(false);
        }
      }
    }

    void checkConnections();
    return () => {
      cancelled = true;
    };
  }, [source, destination, migration, sourceConfigured, destinationConfigured]);

  // Load the persisted name for this migration (present when resuming/editing).
  useEffect(() => {
    const migrationId = migration.migrationId;
    if (!migrationId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const status = await getMigrationStatus(migrationId);
        if (!cancelled && status.name) {
          setServerName(status.name);
        }
      } catch {
        // Non-fatal: fall back to the computed default name.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [migration.migrationId]);

  // Keep the input showing the server/default name until the user edits it.
  useEffect(() => {
    if (!nameDirty) {
      setNameInput(serverName ?? computedDefaultName);
    }
  }, [serverName, computedDefaultName, nameDirty]);

  const handleSaveName = async () => {
    const migrationId = migration.migrationId;
    const trimmed = nameInput.trim();
    if (!migrationId || !trimmed || trimmed === (serverName ?? computedDefaultName)) {
      setNameDirty(false);
      setNameInput(trimmed || serverName || computedDefaultName);
      return;
    }
    try {
      setNameSaving(true);
      const status = await renameMigration(migrationId, trimmed);
      setServerName(status.name ?? trimmed);
      setNameDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename migration.");
    } finally {
      setNameSaving(false);
    }
  };

  const handleStartDiscovery = async () => {
    if (!migration.migrationId) {
      setError("Migration ID is missing. Please configure source and destination.");
      return;
    }

    try {
      setIsStarting(true);
      setError(null);

      const results = await verifyConfiguredMigrationCloudConnections(
        source,
        destination,
        migration
      );
      setConnectionIssues(results);
      const invalid = invalidCloudResults(results);
      if (invalid.length > 0) {
        setError(formatCloudConnectionIssues(invalid));
        return;
      }

      const run = await startMigration({ migrationId: migration.migrationId });
      navigate(`/progress-monitor/${run.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to start migration.";
      setError(message);
    } finally {
      setIsStarting(false);
    }
  };

  const navigateToEndpoint = async (
    role: "source" | "destination",
    selected?: { service: ServiceDescriptor; root?: Folder }
  ) => {
    if (selected?.service.type === "cloud") {
      const connectionId = connectionIdForRole(role, migration);
      const navigation = await resolveCloudNavigation({
        role,
        serviceId: selected.service.id,
        connectionId,
      });
      navigate(
        navigation.path,
        selected.root ? { state: { resumeFolder: selected.root } } : undefined
      );
      return;
    }

    const target = getEndpointEditNavigation(role, selected, migration);
    navigate(target.path, target.state ? { state: target.state } : undefined);
  };

  return (
    <PageContainer
      className="migration-summary"
      contentClassName="migration-summary__content"
      onBack={() => navigate("/choose")}
      backTitle="Back to migration type"
    >
      <header className="migration-summary__header">
        <h1>
          Set up your <span className="migration-summary__highlight">migration</span>
        </h1>
        <p className="migration-summary__summary">
          Choose your source and destination. Once both are configured,
          start discovery to map differences and build a migration plan.
        </p>
      </header>

      {migration.migrationId && (sourceConfigured || destinationConfigured) && (
        <div className="migration-summary__name">
          <label className="migration-summary__name-label" htmlFor="migration-name">
            Migration name
          </label>
          <div className="migration-summary__name-row">
            <input
              id="migration-name"
              className="migration-summary__name-input"
              type="text"
              value={nameInput}
              placeholder={computedDefaultName || "Name this migration"}
              onChange={(event) => {
                setNameDirty(true);
                setNameInput(event.target.value);
              }}
              onBlur={() => void handleSaveName()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              disabled={nameSaving}
            />
            {nameSaving && (
              <span className="migration-summary__name-status">Saving…</span>
            )}
          </div>
        </div>
      )}

      <div className="migration-summary__checklist">
        <SetupEndpointCard
          label="Source"
          accentClass="migration-summary__highlight--magenta"
          configured={sourceConfigured}
          locked={spectraLocked && spectraPrimaryRole !== "source"}
          lockTitle={spectraLocked && spectraPrimaryRole !== "source" ? spectraLockTitle : undefined}
          serviceName={source?.service.displayName}
          rootPath={formatMigrationPath(source?.root)}
          onSelect={() => void navigateToEndpoint("source", source)}
        />

        <div className="migration-summary__checklist-arrow" aria-hidden="true">
          →
        </div>

        <SetupEndpointCard
          label="Destination"
          accentClass="migration-summary__highlight--cyan"
          configured={destinationConfigured}
          locked={spectraLocked && spectraPrimaryRole !== "destination"}
          lockTitle={
            spectraLocked && spectraPrimaryRole !== "destination"
              ? spectraLockTitle
              : undefined
          }
          serviceName={destination?.service.displayName}
          rootPath={formatMigrationPath(destination?.root)}
          onSelect={() => void navigateToEndpoint("destination", destination)}
        />
      </div>

      <CloudConnectionIssues issues={connectionIssues} />

      {error && <div className="migration-summary__error">{error}</div>}

      <div className="migration-summary__footer">
        <button
          type="button"
          className="glass-button glass-button--progress-cta"
          onClick={() => void handleStartDiscovery()}
          disabled={isStarting || checkingConnections || !canStart}
          title={startDiscoveryTitle}
        >
          <Search size={20} style={{ marginRight: "0.5rem" }} />
          {isStarting ? "Starting discovery..." : "Start Discovery"}
        </button>
      </div>
    </PageContainer>
  );
}

type SetupEndpointCardProps = {
  label: string;
  accentClass: string;
  configured: boolean;
  locked: boolean;
  lockTitle?: string;
  serviceName?: string;
  rootPath: string;
  onSelect: () => void;
};

function SetupEndpointCard({
  label,
  accentClass,
  configured,
  locked,
  lockTitle,
  serviceName,
  rootPath,
  onSelect,
}: SetupEndpointCardProps) {
  const StatusIcon = configured ? CheckCircle2 : Circle;
  const editTitle = configured
    ? `Change ${label.toLowerCase()}`
    : `Select ${label.toLowerCase()}`;

  return (
    <div
      className={`migration-summary__endpoint${
        configured ? " migration-summary__endpoint--configured" : ""
      }${locked ? " migration-summary__endpoint--locked" : ""}`}
      title={locked ? lockTitle : undefined}
    >
      <div className="migration-summary__endpoint-header">
        <StatusIcon
          size={22}
          className={`migration-summary__endpoint-status${
            configured
              ? " migration-summary__endpoint-status--done"
              : " migration-summary__endpoint-status--pending"
          }`}
        />
        <h2 className={`migration-summary__endpoint-title ${accentClass}`}>
          {label}
        </h2>
        {!locked && configured && (
          <button
            type="button"
            className="migration-summary__endpoint-edit"
            onClick={onSelect}
            title={editTitle}
            aria-label={editTitle}
          >
            <Pencil size={16} />
          </button>
        )}
      </div>

      {configured && (
        <div className="migration-summary__info-card">
          <div className="migration-summary__info-row">
            <span className="migration-summary__info-label">Service</span>
            <span className="migration-summary__info-value">{serviceName}</span>
          </div>
          <div className="migration-summary__info-row">
            <span className="migration-summary__info-label">Root Path</span>
            <span className="migration-summary__info-value">{rootPath}</span>
          </div>
        </div>
      )}

      {!locked && !configured && (
        <button
          type="button"
          className="migration-summary__endpoint-action"
          onClick={onSelect}
        >
          {`Select ${label.toLowerCase()}`}
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}
