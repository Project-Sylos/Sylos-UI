import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CheckCircle2, Circle, ChevronRight, Pencil } from "lucide-react";

import PageContainer from "../components/PageContainer";
import CloudConnectionIssues from "../components/CloudConnectionIssues";
import HelpTooltip from "../components/HelpTooltip";
import { useSelection } from "../context/SelectionContext";
import { getMigrationStatus, renameMigration, startMigration, setPathCheckTarget } from "../api/services";
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
  accountLabelForRole,
} from "../utils/cloudAccountLabel";
import { isCloudServiceType } from "../utils/cloudProviders";
import {
  formatMigrationPath,
  formatServiceRootLabel,
  getEndpointEditNavigation,
} from "../utils/migrationRoots";
import {
  LOCAL_OS_SUBTYPE_OPTIONS,
  LocalOsSubtype,
  detectHostLocalOs,
  isLocalFilesystemService,
  providerIdFromService,
  resolvePathCheckTargetFromEndpoints,
} from "../utils/pathCheckTarget";
import "./MigrationSummary.css";

const LOCAL_OS_CHECKS_ON_NOTE =
  "We'll flag names this OS would reject, so you can fix them before copy.";
const LOCAL_OS_CHECKS_OFF_NOTE =
  "Same OS as source, so destination name checks are skipped.";

const LOCAL_OS_CHECKS_ON_HELP = (
  <>
    <p>
      During discovery, Sylos checks each file and folder name against this
      destination OS.
    </p>
    <p>
      Illegal characters, reserved names, length limits, and naming collisions
      are flagged on the review screen so you can rename them before copying
      starts.
    </p>
  </>
);

const LOCAL_OS_CHECKS_OFF_HELP = (
  <>
    <p>
      Source and destination use the same OS naming rules, so names that already
      work on the source should work on the destination.
    </p>
    <p>
      If the destination is actually a different OS (for example Linux files going
      onto a Windows volume), change the destination OS here to turn checks on.
    </p>
  </>
);

const LOCAL_OS_SOURCE_HELP = (
  <p>
    Label which OS this local path lives on. Destination name checks follow the
    destination OS. The source OS is only used to skip those checks when both
    sides match.
  </p>
);

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
  const hostOs = useMemo(() => detectHostLocalOs(), []);
  const [sourceLocalOs, setSourceLocalOs] = useState<LocalOsSubtype>(hostOs);
  const [destinationLocalOs, setDestinationLocalOs] = useState<LocalOsSubtype>(hostOs);
  const [sourceOsDirty, setSourceOsDirty] = useState(false);
  const [destinationOsDirty, setDestinationOsDirty] = useState(false);

  const sourceIsLocal = isLocalFilesystemService(source?.service);
  const destinationIsLocal = isLocalFilesystemService(destination?.service);
  const sourceProviderId = useMemo(
    () => providerIdFromService(source?.service),
    [source?.service]
  );
  const destinationProviderId = useMemo(
    () => providerIdFromService(destination?.service),
    [destination?.service]
  );

  const pathCheckTarget = useMemo(
    () =>
      resolvePathCheckTargetFromEndpoints({
        sourceProvider: sourceProviderId,
        destinationProvider: destinationProviderId,
        sourceIsLocal,
        destinationIsLocal,
        sourceLocalOs,
        destinationLocalOs,
      }),
    [
      sourceProviderId,
      destinationProviderId,
      sourceIsLocal,
      destinationIsLocal,
      sourceLocalOs,
      destinationLocalOs,
    ]
  );

  const sameLocalOsDisablesChecks =
    sourceIsLocal &&
    destinationIsLocal &&
    sourceLocalOs === destinationLocalOs;

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

  // Reset local OS defaults when a local endpoint is (re)selected, until the user edits.
  useEffect(() => {
    if (sourceIsLocal && !sourceOsDirty) {
      setSourceLocalOs(hostOs);
    }
  }, [sourceIsLocal, hostOs, sourceOsDirty, source?.root?.ServiceID]);

  useEffect(() => {
    if (destinationIsLocal && !destinationOsDirty) {
      setDestinationLocalOs(hostOs);
    }
  }, [destinationIsLocal, hostOs, destinationOsDirty, destination?.root?.ServiceID]);

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

      try {
        await setPathCheckTarget(migration.migrationId, pathCheckTarget);
      } catch {
        // Still pass via start options below.
      }
      const run = await startMigration({
        migrationId: migration.migrationId,
        options: { pathCheckTarget },
      });
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
          accountLabel={
            isCloudServiceType(source?.service.type)
              ? accountLabelForRole("source", migration)
              : undefined
          }
          rootPath={formatMigrationPath(source?.root)}
          showLocalOs={sourceConfigured && sourceIsLocal}
          localOs={sourceLocalOs}
          onLocalOsChange={(next) => {
            setSourceOsDirty(true);
            setSourceLocalOs(next);
          }}
          localOsSelectId="source-local-os"
          localOsHelpTipId="migration-source-local-os"
          localOsHelp={LOCAL_OS_SOURCE_HELP}
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
          accountLabel={
            isCloudServiceType(destination?.service.type)
              ? accountLabelForRole("destination", migration)
              : undefined
          }
          rootPath={formatMigrationPath(destination?.root)}
          showLocalOs={destinationConfigured && destinationIsLocal}
          localOs={destinationLocalOs}
          onLocalOsChange={(next) => {
            setDestinationOsDirty(true);
            setDestinationLocalOs(next);
          }}
          localOsSelectId="destination-local-os"
          localOsNote={
            sameLocalOsDisablesChecks
              ? LOCAL_OS_CHECKS_OFF_NOTE
              : destinationIsLocal
                ? LOCAL_OS_CHECKS_ON_NOTE
                : undefined
          }
          localOsHelpTipId="migration-destination-local-os"
          localOsHelp={
            sameLocalOsDisablesChecks
              ? LOCAL_OS_CHECKS_OFF_HELP
              : LOCAL_OS_CHECKS_ON_HELP
          }
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
  accountLabel?: string;
  rootPath: string;
  showLocalOs?: boolean;
  localOs?: LocalOsSubtype;
  onLocalOsChange?: (next: LocalOsSubtype) => void;
  localOsSelectId?: string;
  localOsNote?: string;
  localOsHelpTipId?: string;
  localOsHelp?: ReactNode;
  onSelect: () => void;
};

function SetupEndpointCard({
  label,
  accentClass,
  configured,
  locked,
  lockTitle,
  serviceName,
  accountLabel,
  rootPath,
  showLocalOs,
  localOs,
  onLocalOsChange,
  localOsSelectId,
  localOsNote,
  localOsHelpTipId,
  localOsHelp,
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
          {accountLabel ? (
            <div className="migration-summary__info-row">
              <span className="migration-summary__info-label">Account</span>
              <span className="migration-summary__info-value">{accountLabel}</span>
            </div>
          ) : null}
          <div className="migration-summary__info-row">
            <span className="migration-summary__info-label">Root Path</span>
            <span className="migration-summary__info-value">{rootPath}</span>
          </div>
          {showLocalOs && localOs && onLocalOsChange && localOsSelectId ? (
            <div className="migration-summary__info-row migration-summary__info-row--os">
              <div className="migration-summary__os-label-row">
                <label className="migration-summary__info-label" htmlFor={localOsSelectId}>
                  OS
                </label>
                {localOsHelp && localOsHelpTipId ? (
                  <HelpTooltip
                    tipId={localOsHelpTipId}
                    category="migration-setup"
                    position="above"
                    content={localOsHelp}
                  />
                ) : null}
              </div>
              <select
                id={localOsSelectId}
                className="migration-summary__os-select"
                value={localOs}
                onChange={(event) =>
                  onLocalOsChange(event.target.value as LocalOsSubtype)
                }
                onClick={(event) => event.stopPropagation()}
              >
                {LOCAL_OS_SUBTYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {localOsNote ? (
                <p className="migration-summary__os-note">{localOsNote}</p>
              ) : null}
            </div>
          ) : null}
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
