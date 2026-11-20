import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Search, ChevronRight, Pencil } from "lucide-react";

import PageContainer from "../components/PageContainer";
import CloudConnectionIssues from "../components/CloudConnectionIssues";
import HelpTooltip from "../components/HelpTooltip";
import StorageMeter from "../components/StorageMeter";
import { useSelection } from "../context/SelectionContext";
import {
  getMigrationStatus,
  renameMigration,
  setPathCheckTarget,
  getStorageInfo,
  startMigration,
  probeMigrationFSHealth,
  StorageInfo,
} from "../api/services";
import { ServiceDescriptor, Folder } from "../types/services";
import {
  CloudConnectionCheckResult,
  connectionIdForRole,
  invalidCloudResults,
  resolveCloudNavigation,
} from "../utils/cloudConnections";
import {
  cloudIssuesFromFSHealth,
  formatFSHealthFailure,
} from "../utils/fsHealth";
import {
  accountLabelForRole,
} from "../utils/cloudAccountLabel";
import { isCloudServiceType } from "../utils/cloudProviders";
import {
  formatMigrationPath,
  formatServiceRootLabel,
  getEndpointEditNavigation,
} from "../utils/migrationRoots";
import { storageFetchOptions } from "../utils/storageFetchOptions";
import {
  LOCAL_OS_SUBTYPE_OPTIONS,
  LocalOsSubtype,
  detectHostLocalOs,
  isLocalFilesystemService,
  providerIdFromService,
  resolvePathCheckTargetFromEndpoints,
  supportsWindowsCompatOverlay,
} from "../utils/pathCheckTarget";
import "./MigrationSummary.css";

const LOCAL_OS_CHECKS_ON_NOTE =
  "We'll flag names this OS would reject, so you can fix them before copy.";
const LOCAL_OS_CHECKS_OFF_NOTE =
  "Same OS as source, so destination name checks are skipped.";

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
  const { source, destination, migration, updateMigration } = useSelection();
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
  const [windowsCompat, setWindowsCompat] = useState(false);
  const [persistLogLevel, setPersistLogLevel] = useState("trace");
  const [overwritePolicy, setOverwritePolicy] = useState("newest_mtime");
  const [hashVerify, setHashVerify] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [destStorage, setDestStorage] = useState<StorageInfo | null>(null);
  const [srcStorage, setSrcStorage] = useState<StorageInfo | null>(null);
  const [starting, setStarting] = useState(false);

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

  const sourceConfigured = Boolean(source?.root);
  const destinationConfigured = Boolean(destination?.root);

  const showWindowsCompat =
    destinationConfigured &&
    !destinationIsLocal &&
    supportsWindowsCompatOverlay(destinationProviderId) &&
    pathCheckTarget !== "none";

  const computedDefaultName = useMemo(
    () => computeDefaultName(source, destination),
    [source, destination]
  );

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

  useEffect(() => {
    if (!sourceConfigured || !source?.service?.id) {
      setSrcStorage(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const info = await getStorageInfo(
          source.service.id,
          storageFetchOptions(
            "source",
            {
              locationPath: source.root?.locationPath,
              type: source.root?.type,
              parentId: source.root?.parentId,
            },
            connectionIdForRole("source", migration)
          )
        );
        if (!cancelled) setSrcStorage(info);
      } catch {
        if (!cancelled) setSrcStorage({ available: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    sourceConfigured,
    source?.service?.id,
    source?.root?.locationPath,
    source?.root?.ServiceID,
    source?.root?.type,
    source?.root?.parentId,
    migration.sourceConnectionId,
    migration.migrationId,
  ]);

  useEffect(() => {
    if (!destinationConfigured || !destination?.service?.id) {
      setDestStorage(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const info = await getStorageInfo(
          destination.service.id,
          storageFetchOptions(
            "destination",
            {
              locationPath: destination.root?.locationPath,
              type: destination.root?.type,
              parentId: destination.root?.parentId,
            },
            connectionIdForRole("destination", migration)
          )
        );
        if (!cancelled) setDestStorage(info);
      } catch {
        if (!cancelled) setDestStorage({ available: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    destinationConfigured,
    destination?.service?.id,
    destination?.root?.locationPath,
    destination?.root?.ServiceID,
    destination?.root?.type,
    destination?.root?.parentId,
    migration.destinationConnectionId,
    migration.migrationId,
  ]);

  const startTitle = hasCloudConnectionIssues
    ? "Reconnect cloud accounts before starting discovery."
    : canStart
      ? "Start discovery to build a migration plan. Filters are applied later in path review."
      : "Configure source and destination to continue.";

  useEffect(() => {
    // Only probe sides that are actually configured. Probing "both" before
    // destination is chosen surfaces a pointless "destination needs attention".
    if (!migration.migrationId || (!sourceConfigured && !destinationConfigured)) {
      setConnectionIssues([]);
      return;
    }

    const side: "src" | "dst" | "both" =
      sourceConfigured && destinationConfigured
        ? "both"
        : sourceConfigured
          ? "src"
          : "dst";

    let cancelled = false;

    async function checkConnections() {
      setCheckingConnections(true);
      try {
        const report = await probeMigrationFSHealth(migration.migrationId!, side);
        if (cancelled) return;
        if (report.ok) {
          setConnectionIssues([]);
          return;
        }
        const issues = cloudIssuesFromFSHealth(report, {
          source: source?.service?.displayName,
          destination: destination?.service?.displayName,
        }).filter((issue) => {
          if (issue.role === "source") return sourceConfigured;
          return destinationConfigured;
        });
        setConnectionIssues(issues);
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
        if (cancelled) return;
        if (status.name) {
          setServerName(status.name);
        }
        updateMigration({
          sourceRootPrepared: Boolean(status.sourceRootPrepared),
          destinationRootPrepared: Boolean(status.destinationRootPrepared),
          sourceRootChildNames: status.sourceRootChildNames,
        });
      } catch {
        // Non-fatal: fall back to the computed default name.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [migration.migrationId, updateMigration]);

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
    setStarting(true);
    setError(null);
    try {
      const report = await probeMigrationFSHealth(migration.migrationId, "both");
      if (!report.ok) {
        const issues = cloudIssuesFromFSHealth(report, {
          source: source?.service?.displayName,
          destination: destination?.service?.displayName,
        });
        setConnectionIssues(issues);
        setError(formatFSHealthFailure(report));
        return;
      }
      setConnectionIssues([]);
      try {
        await setPathCheckTarget(
          migration.migrationId,
          pathCheckTarget,
          showWindowsCompat ? windowsCompat : false
        );
      } catch {
        // start options still carry path check target
      }
      const run = await startMigration({
        migrationId: migration.migrationId,
        options: {
          pathCheckTarget,
          windowsCompat: showWindowsCompat ? windowsCompat : false,
          persistLogLevel,
          overwritePolicy,
          hashVerify,
        },
      });
      navigate(`/progress-monitor/${run.id}`);
    } catch (err) {
      const withHealth = err as Error & { fsHealth?: import("../api/services").FSHealthReport };
      if (withHealth.fsHealth) {
        const issues = cloudIssuesFromFSHealth(withHealth.fsHealth, {
          source: source?.service?.displayName,
          destination: destination?.service?.displayName,
        });
        setConnectionIssues(issues);
        setError(formatFSHealthFailure(withHealth.fsHealth));
      } else {
        setError(err instanceof Error ? err.message : "Unable to start discovery.");
      }
    } finally {
      setStarting(false);
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
          Choose your source and destination. When both are configured,
          start discovery to build a migration plan. Exclusion filters are
          applied later during path review.
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

      <div className="migration-summary__panel">
        <div className="migration-summary__checklist">
          <SetupEndpointCard
            label="Source"
            tone="source"
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
            storage={srcStorage}
            storageTipId="migration-summary-src-storage"
            onSelect={() => void navigateToEndpoint("source", source)}
          />

          <div className="migration-summary__checklist-arrow" aria-hidden="true">
            →
          </div>

          <SetupEndpointCard
            label="Destination"
            tone="destination"
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
            localOsHelpTipId={
              sameLocalOsDisablesChecks
                ? "migration-destination-local-os-off"
                : "migration-destination-local-os-on"
            }
            storage={destStorage}
            storageTipId="migration-summary-dst-storage"
            storageWarning={
              destStorage?.available &&
              !destStorage.unlimited &&
              typeof destStorage.freeBytes === "number" &&
              destStorage.freeBytes < 100 * 1024 * 1024
                ? "Very little room; discovery can still run, but copy may fail later."
                : null
            }
            onSelect={() => void navigateToEndpoint("destination", destination)}
          />
        </div>

        <details
          className="migration-summary__advanced"
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="migration-summary__advanced-summary">Advanced</summary>
          <div className="migration-summary__advanced-body">
            <div className="migration-summary__advanced-fields">
              <div className="migration-summary__advanced-row">
                <div className="migration-summary__advanced-label-row">
                  <label
                    className="migration-summary__advanced-label"
                    htmlFor="migration-persist-log-level"
                  >
                    Persist log level
                  </label>
                  <HelpTooltip tipId="migration-setup-persist-log-level" position="above" />
                </div>
                <select
                  id="migration-persist-log-level"
                  className="migration-summary__advanced-select"
                  value={persistLogLevel}
                  onChange={(e) => setPersistLogLevel(e.target.value)}
                >
                  {["trace", "debug", "info", "warning", "error", "critical"].map(
                    (lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl === "trace" ? "trace (default)" : lvl}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="migration-summary__advanced-row">
                <div className="migration-summary__advanced-label-row">
                  <label
                    className="migration-summary__advanced-label"
                    htmlFor="migration-overwrite-policy"
                  >
                    Overwrite policy
                  </label>
                  <HelpTooltip tipId="migration-setup-overwrite-policy" position="above" />
                </div>
                <select
                  id="migration-overwrite-policy"
                  className="migration-summary__advanced-select"
                  value={overwritePolicy}
                  onChange={(e) => setOverwritePolicy(e.target.value)}
                >
                  <option value="newest_mtime">
                    Keep most recently modified (default)
                  </option>
                  <option value="decide">Let me decide (mark all for review)</option>
                  <option value="source_wins">Always bring from source</option>
                </select>
              </div>
            </div>

            <label className="migration-summary__advanced-check">
              <input
                type="checkbox"
                checked={hashVerify}
                onChange={(e) => setHashVerify(e.target.checked)}
              />
              <span className="migration-summary__advanced-check-text">
                <span className="migration-summary__advanced-label-row">
                  <span className="migration-summary__advanced-label">
                    Double-read content verification
                  </span>
                                    <HelpTooltip tipId="migration-setup-hash-verify" position="above" />
                </span>
                <span className="migration-summary__advanced-hint">
                  Compares hashes of paired source and destination files. 
                  This can cause discovery to run slower to read the bytes of
                  every file discovered, but it can be useful to catch content 
                  differences that might otherwise slip through if you need 
                  extra assurance.
                </span>
              </span>
            </label>

            {showWindowsCompat && (
              <label className="migration-summary__advanced-check">
                <input
                  type="checkbox"
                  checked={windowsCompat}
                  onChange={(e) => setWindowsCompat(e.target.checked)}
                />
                <span className="migration-summary__advanced-check-text">
                  <span className="migration-summary__advanced-label">
                    Windows desktop sync path checks
                  </span>
                  <span className="migration-summary__advanced-hint">
                    Flag trailing dots/spaces and similar Windows sync issues. Off
                    by default; does not rename anything unless you accept
                    suggestions later in review.
                  </span>
                </span>
              </label>
            )}
          </div>
        </details>
      </div>

      <CloudConnectionIssues issues={connectionIssues} />

      {error && <div className="migration-summary__error">{error}</div>}

      <div className="migration-summary__footer">
        <button
          type="button"
          className="action-button action-button--primary"
          onClick={() => void handleStartDiscovery()}
          disabled={checkingConnections || starting || !canStart}
          title={startTitle}
        >
          <Search size={20} style={{ marginRight: "0.5rem" }} />
          {starting ? "Starting…" : "Start Discovery"}
        </button>
      </div>
    </PageContainer>
  );
}

type SetupEndpointCardProps = {
  label: string;
  tone: "source" | "destination";
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
  storage?: StorageInfo | null;
  storageTipId?: string;
  storageWarning?: string | null;
  onSelect: () => void;
};

function SetupEndpointCard({
  label,
  tone,
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
  storage,
  storageTipId,
  storageWarning,
  onSelect,
}: SetupEndpointCardProps) {
  const editTitle = configured
    ? `Change ${label.toLowerCase()}`
    : `Select ${label.toLowerCase()}`;
  const showStorage = Boolean(configured && storage?.available);

  return (
    <div
      className={`migration-summary__endpoint migration-summary__endpoint--${tone}${
        configured ? " migration-summary__endpoint--configured" : ""
      }${locked ? " migration-summary__endpoint--locked" : ""}`}
      title={locked ? lockTitle : undefined}
    >
      <div className="migration-summary__endpoint-header">
        <h2 className="migration-summary__endpoint-title">{label}</h2>
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

      <div className="migration-summary__endpoint-body">
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
                  {localOsHelpTipId ? (
                    <HelpTooltip tipId={localOsHelpTipId} position="above" />
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
            {showStorage && storage ? (
              <div className="migration-summary__storage">
                <div className="migration-summary__storage-label-row">
                  <span className="migration-summary__info-label">Storage</span>
                  {storageTipId ? (
                    <HelpTooltip tipId={storageTipId} position="above" />
                  ) : null}
                </div>
                <StorageMeter
                  className="storage-meter--endpoint"
                  {...storage}
                  note={storageWarning}
                />
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
    </div>
  );
}
