import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  FolderOpen,
  Cloud,
  Eye,
  ArrowRight,
  Square,
  Play,
  AlertCircle,
  ClipboardCopy,
} from "lucide-react";

import {
  getMigrationStatus,
  getMigrationQueueMetrics,
  fetchServices,
  stopMigration,
  triggerRetrySweep,
} from "../api/services";
import {
  getMigrationPhase,
  isCopyReviewPhase,
  isMigrationLive,
  isMigrationSuspended,
  isMigrationFailed,
} from "../types/migrations";
import { useSelection } from "../context/SelectionContext";
import HelpTooltip from "../components/HelpTooltip";
import ConfirmDialog from "../components/ConfirmDialog";
import { GlassSurfacePanel } from "../components/GlassSurfacePanel";
import "./ProgressMonitor.css";

const STATUS_POLL_INTERVAL = 1000;
const SOFT_SUSPEND_POLL_TIMEOUT_MS = 120_000;

/** Stop response: engine accepted soft suspend; UI should poll until *-suspended and not live. */
function softSuspendRequestedPayload(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  return (
    o.softSuspendRequested === true || o.SoftSuspendRequested === true
  );
}

/** Resume only when the API explicitly reports not live (omitted `live` means “running” until we know otherwise). */
function isLiveExplicitlyFalse(s: unknown): boolean {
  if (!s || typeof s !== "object") return false;
  const o = s as { live?: boolean; Live?: boolean };
  if ("live" in o && o.live === false) return true;
  if ("Live" in o && o.Live === false) return true;
  return false;
}

export default function ProgressMonitor() {
  const { migrationId } = useParams<{ migrationId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { source, destination, services } = useSelection();

  const [status, setStatus] = useState<any>(null);
  const [queueMetrics, setQueueMetrics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [allServices, setAllServices] = useState(services);
  const [showResultsButton, setShowResultsButton] = useState(false);
  const [confirmKind, setConfirmKind] = useState<null | "stop" | "resume">(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [failureTooltipOpen, setFailureTooltipOpen] = useState(false);
  const [failureCopied, setFailureCopied] = useState(false);

  /** After a retry sweep, status can briefly still say "review" before the run starts — require run activity before re-enabling review. */
  const isRetryRun = searchParams.get("retry") === "1";
  const hasSeenActiveRunRef = useRef(false);
  const isRetryRunRef = useRef(isRetryRun);
  const prevPhaseRef = useRef<string>("");
  const prevCompletedAtRef = useRef<string | null | undefined>(undefined);
  /** Re-run review-button logic when refs change (refs don’t trigger effects). */
  const [runGate, setRunGate] = useState(0);

  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueMetricsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failureWrapRef = useRef<HTMLDivElement>(null);
  const failureLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isRetryRunRef.current = searchParams.get("retry") === "1";
  }, [searchParams]);

  // Intent from navigation: Start Copy → copy, Retry Discovery → discovery. No param = derive from API.
  const modeFromUrl = searchParams.get("mode");
  const showCopyUI =
    modeFromUrl === "copy"
      ? true
      : modeFromUrl === "discovery"
        ? false
        : isCopyReviewPhase(status);

  // Format bytes to human-readable format
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(2)} ${sizes[i]}`;
  };

  // Format bytes per second to human-readable format (e.g., "1.5 MB/s")
  const formatBytesPerSec = (bytesPerSec: number): string => {
    if (bytesPerSec === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    const value = bytesPerSec / Math.pow(k, i);
    return `${value.toFixed(2)} ${sizes[i]}`;
  };

  // Fetch status — keep polling while on this page so phase/live updates after retry (don’t stop on “review” alone).
  const fetchStatus = useCallback(async () => {
    if (!migrationId) return;

    try {
      const statusData = await getMigrationStatus(migrationId);
      setStatus(statusData);
      const phase = getMigrationPhase(statusData);
      const hadRunBefore = hasSeenActiveRunRef.current;

      if (isRetryRunRef.current) {
        const prevPhase = prevPhaseRef.current;
        if (prevPhase !== "") {
          const inReview = (p: string) =>
            p === "awaiting-traversal-review" || p === "awaiting-copy-review";
          if (inReview(prevPhase) && !inReview(phase) && phase) {
            hasSeenActiveRunRef.current = true;
          }
          if (!inReview(prevPhase) && inReview(phase)) {
            hasSeenActiveRunRef.current = true;
          }
        }
        prevPhaseRef.current = phase;

        const ca = statusData.completedAt ?? null;
        // Sweep just reported completion (was null, now set).
        if (
          prevCompletedAtRef.current !== undefined &&
          prevCompletedAtRef.current === null &&
          ca != null
        ) {
          hasSeenActiveRunRef.current = true;
        }
        // Timestamp changed between polls (e.g. sweep finished updating completedAt).
        if (
          prevCompletedAtRef.current != null &&
          ca != null &&
          ca !== prevCompletedAtRef.current
        ) {
          hasSeenActiveRunRef.current = true;
        }
        prevCompletedAtRef.current = ca;
      }

      if (
        isMigrationLive(statusData) ||
        phase === "traversal-in-progress" ||
        phase === "copy-in-progress"
      ) {
        hasSeenActiveRunRef.current = true;
      }

      // Retry: backend may omit live/phase transitions; if review is not live and completedAt
      // is on or after startedAt, the sweep for this run has finished (stale pre-sweep should
      // clear completedAt or move startedAt forward on retry).
      if (isRetryRunRef.current && !isMigrationLive(statusData)) {
        const inReview =
          phase === "awaiting-traversal-review" || phase === "awaiting-copy-review";
        if (inReview && statusData.startedAt && statusData.completedAt) {
          const sa = Date.parse(statusData.startedAt);
          const cd = Date.parse(String(statusData.completedAt));
          if (!Number.isNaN(sa) && !Number.isNaN(cd) && cd >= sa) {
            hasSeenActiveRunRef.current = true;
          }
        }
      }

      if (!hadRunBefore && hasSeenActiveRunRef.current) {
        setRunGate((g) => g + 1);
      }
    } catch (err) {
      console.error("Failed to fetch status:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    }
  }, [migrationId]);

  // Fetch queue metrics
  const fetchQueueMetrics = useCallback(async () => {
    if (!migrationId) return;

    try {
      const response = await getMigrationQueueMetrics(migrationId);
      
      // Handle structured response - ignore non-critical database errors
      if (!response.success) {
        if (response.errorCode === "DATABASE_NOT_AVAILABLE") {
          // Database closed after migration completed - this is expected, ignore it
          return;
        }
        // Other errors - log but don't throw
        console.warn("Queue metrics error:", response.errorCode, response.error);
        return;
      }
      
      // Only update if we have valid data
      if (response.srcTraversal !== undefined || response.dstTraversal !== undefined) {
        setQueueMetrics({
          srcTraversal: response.srcTraversal ?? null,
          dstTraversal: response.dstTraversal ?? null,
          copy: response.copy ?? null,
        });
      }
    } catch (err) {
      // Only log actual network/HTTP errors
      console.error("Failed to fetch queue metrics:", err);
    }
  }, [migrationId]);

  // Show “View … Results” when in the matching review phase and not running. Retries: ignore stale “review” until a run has actually started (see fetchStatus).
  useEffect(() => {
    if (!status) {
      setShowResultsButton(false);
      return;
    }
    const phase = getMigrationPhase(status);
    const inTraversalReview = phase === "awaiting-traversal-review";
    const inCopyReview = phase === "awaiting-copy-review";
    const inMatchingReview =
      (showCopyUI && inCopyReview) || (!showCopyUI && inTraversalReview);
    const live = isMigrationLive(status);
    const canReview =
      inMatchingReview &&
      !live &&
      (!isRetryRun || hasSeenActiveRunRef.current);
    setShowResultsButton(!!canReview);
  }, [status, showCopyUI, isRetryRun, runGate]);

  // Retry sweep: clear metrics and gate review like a fresh run (stale API may still say “review”).
  useEffect(() => {
    if (!isRetryRun) return;
    hasSeenActiveRunRef.current = false;
    prevPhaseRef.current = "";
    prevCompletedAtRef.current = undefined;
    setQueueMetrics(null);
    setShowResultsButton(false);
  }, [migrationId, isRetryRun]);

  // Set up polling intervals
  useEffect(() => {
    if (!migrationId) {
      navigate("/");
      return;
    }

    // Initial fetch
    fetchStatus();
    fetchQueueMetrics();

    // Set up status polling (every 500ms) - always poll status to detect completion
    statusIntervalRef.current = setInterval(() => {
      fetchStatus();
    }, STATUS_POLL_INTERVAL);

    queueMetricsIntervalRef.current = setInterval(() => {
      fetchQueueMetrics();
    }, STATUS_POLL_INTERVAL);

    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
      if (queueMetricsIntervalRef.current) {
        clearInterval(queueMetricsIntervalRef.current);
      }
    };
  }, [migrationId, navigate, fetchStatus, fetchQueueMetrics]);

  const phase = status ? getMigrationPhase(status) : "";
  const inAwaitingReview =
    phase === "awaiting-traversal-review" || phase === "awaiting-copy-review";
  const inRunPhase =
    phase === "traversal-in-progress" || phase === "copy-in-progress";
  const isSuspended = status ? isMigrationSuspended(status) : false;
  const isFailed = status ? isMigrationFailed(status) : false;
  const explicitlyNotLive = status ? isLiveExplicitlyFalse(status) : false;
  const live = status ? isMigrationLive(status) : false;
  const showStopButton = Boolean(
    status &&
      !isFailed &&
      !isSuspended &&
      !inAwaitingReview &&
      (live || (inRunPhase && !explicitlyNotLive))
  );
  const showResumeButton = Boolean(
    status &&
      !inAwaitingReview &&
      (isFailed ||
        isSuspended ||
        (inRunPhase && explicitlyNotLive))
  );

  const failureErrorText =
    (status?.error && String(status.error).trim()) || "Unknown error";
  const failureHoverSummary = showCopyUI
    ? `Copy failed due to error: ${failureErrorText}. Please retry or report this error to our community.`
    : `discovery failed due to error: ${failureErrorText}. Please retry or report this error to our community.`;

  const failureReportJson = useMemo(() => {
    if (!migrationId || !status) return "{}";
    return JSON.stringify(
      {
        migrationId,
        status: status.status ?? "failed",
        phase: getMigrationPhase(status) || undefined,
        error: failureErrorText,
        completedAt: status.completedAt ?? null,
        startedAt: status.startedAt ?? null,
        uiContext: showCopyUI ? "copy" : "discovery",
      },
      null,
      2
    );
  }, [migrationId, status, failureErrorText, showCopyUI]);

  const clearFailureLeaveTimer = () => {
    if (failureLeaveTimerRef.current) {
      clearTimeout(failureLeaveTimerRef.current);
      failureLeaveTimerRef.current = null;
    }
  };

  const openFailureTooltip = () => {
    clearFailureLeaveTimer();
    setFailureTooltipOpen(true);
  };

  const scheduleCloseFailureTooltip = () => {
    clearFailureLeaveTimer();
    failureLeaveTimerRef.current = setTimeout(() => {
      setFailureTooltipOpen(false);
    }, 220);
  };

  const copyFailureJson = async () => {
    try {
      await navigator.clipboard.writeText(failureReportJson);
      setFailureCopied(true);
      window.setTimeout(() => setFailureCopied(false), 2000);
    } catch {
      setFailureCopied(false);
    }
  };

  useEffect(() => {
    if (!isMigrationFailed(status)) {
      setFailureTooltipOpen(false);
    }
  }, [status]);

  useEffect(() => {
    if (!failureTooltipOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (
        failureWrapRef.current &&
        !failureWrapRef.current.contains(e.target as Node)
      ) {
        setFailureTooltipOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFailureTooltipOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [failureTooltipOpen]);

  const restartPollingIfStopped = useCallback(() => {
    if (!migrationId) return;
    if (!statusIntervalRef.current) {
      statusIntervalRef.current = setInterval(() => {
        fetchStatus();
      }, STATUS_POLL_INTERVAL);
    }
    if (!queueMetricsIntervalRef.current) {
      queueMetricsIntervalRef.current = setInterval(() => {
        fetchQueueMetrics();
      }, STATUS_POLL_INTERVAL);
    }
  }, [migrationId, fetchStatus, fetchQueueMetrics]);

  const handleConfirmStop = async () => {
    if (!migrationId) return;
    setConfirmKind(null);
    setActionBusy(true);
    setActionError(null);
    try {
      const next = await stopMigration(migrationId);
      setStatus(next);

      if (softSuspendRequestedPayload(next)) {
        const deadline = Date.now() + SOFT_SUSPEND_POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          const s = await getMigrationStatus(migrationId);
          setStatus(s);
          if (isMigrationSuspended(s) && !isMigrationLive(s)) {
            break;
          }
          await new Promise((r) => setTimeout(r, STATUS_POLL_INTERVAL));
        }
      }
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to stop migration."
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmResume = async () => {
    if (!migrationId) return;
    setConfirmKind(null);
    setActionBusy(true);
    setActionError(null);
    try {
      const result = await triggerRetrySweep(migrationId);
      if (!result.success) {
        setActionError(result.error || "Failed to resume (retry sweep).");
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.set("retry", "1");
      if (!next.get("mode")) {
        next.set("mode", showCopyUI ? "copy" : "discovery");
      }
      setSearchParams(next, { replace: true });
      await fetchStatus();
      await fetchQueueMetrics();
      restartPollingIfStopped();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to resume migration."
      );
    } finally {
      setActionBusy(false);
    }
  };

  // Stop polling when ready for review, suspended, or failed (no live stats until user retries).
  const pausePolling = showResultsButton || isSuspended || isFailed;
  useEffect(() => {
    if (!pausePolling) return;
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    if (queueMetricsIntervalRef.current) {
      clearInterval(queueMetricsIntervalRef.current);
      queueMetricsIntervalRef.current = null;
    }
  }, [pausePolling]);

  if (!migrationId) {
    return null;
  }

  // Fetch services if not available in context
  useEffect(() => {
    if (services.length > 0) {
      setAllServices(services);
    } else if (allServices.length === 0) {
      fetchServices().then(setAllServices).catch(console.error);
    }
  }, [services, allServices.length]);

  // Get service type from status or context
  const getSourceServiceType = () => {
    if (source?.service?.type) return source.service.type;
    if (status?.sourceId) {
      const service = allServices.find((s) => s.id === status.sourceId);
      return service?.type;
    }
    return undefined;
  };

  const getDestinationServiceType = () => {
    if (destination?.service?.type) return destination.service.type;
    if (status?.destinationId) {
      const service = allServices.find((s) => s.id === status.destinationId);
      return service?.type;
    }
    return undefined;
  };

  // Determine icons based on service type
  const getServiceIcon = (serviceType?: string) => {
    if (serviceType === "local") {
      return <FolderOpen size={18} style={{ marginRight: "0.5rem" }} />;
    }
    return <Cloud size={18} style={{ marginRight: "0.5rem" }} />;
  };

  return (
    <section className="progress-monitor">
      <GlassSurfacePanel className="progress-monitor__content">
        <button
          type="button"
          className="progress-monitor__back"
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={16} style={{ marginRight: "0.5rem" }} />
          Back to home
        </button>
        <header className="progress-monitor__header">
          <h1>
            {showCopyUI ? (
              <>Copy <span className="progress-monitor__highlight">Progress</span></>
            ) : (
              <>Discovery <span className="progress-monitor__highlight">Progress</span></>
            )}
          </h1>
        </header>

        {error && (
          <div className="progress-monitor__error">{error}</div>
        )}
        {actionError && (
          <div className="progress-monitor__error progress-monitor__error--action">
            {actionError}
          </div>
        )}

        {/* Metrics Section */}
        <div className="progress-monitor__metrics">
            <div className={`progress-monitor__metric-card ${showCopyUI ? 'progress-monitor__metric-card--split' : ''}`}>
              {showCopyUI ? (
                // Copy phase: split header with Source (left) and Destination (right)
                <>
                  <div className="progress-monitor__metric-header-split">
                    <div className="progress-monitor__metric-header-half progress-monitor__metric-header-half--source">
                      <div className="progress-monitor__metric-header-top">
                        <div className="progress-monitor__metric-service">
                          {getServiceIcon(getSourceServiceType())}
                          <span>{source?.service?.displayName || status?.sourceId || "Unknown"}</span>
                        </div>
                        <h3 className="progress-monitor__metric-title progress-monitor__metric-title--source">
                          Source
                        </h3>
                      </div>
                      {(source?.root?.locationPath && source.root.locationPath !== '/') ? (
                        <div className="progress-monitor__metric-context">
                          <div className="progress-monitor__metric-context-row">
                            <span className="progress-monitor__metric-context-label">Root Path:</span>
                            <span className="progress-monitor__metric-context-value" title={source?.root?.locationPath || source?.root?.name || ""}>
                              {source?.root?.locationPath || source?.root?.name || "Not specified"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="progress-monitor__metric-context progress-monitor__metric-context--empty" />
                      )}
                    </div>
                    <div className="progress-monitor__metric-header-arrow">
                      <ArrowRight size={24} />
                    </div>
                    <div className="progress-monitor__metric-header-half progress-monitor__metric-header-half--destination">
                      <div className="progress-monitor__metric-header-top">
                        <div className="progress-monitor__metric-service">
                          {getServiceIcon(getDestinationServiceType())}
                          <span>{destination?.service?.displayName || status?.destinationId || "Unknown"}</span>
                        </div>
                        <h3 className="progress-monitor__metric-title progress-monitor__metric-title--destination">
                          Destination
                        </h3>
                      </div>
                      {(destination?.root?.locationPath && destination.root.locationPath !== '/') ? (
                        <div className="progress-monitor__metric-context">
                          <div className="progress-monitor__metric-context-row">
                            <span className="progress-monitor__metric-context-label">Root Path:</span>
                            <span className="progress-monitor__metric-context-value" title={destination?.root?.locationPath || destination?.root?.name || ""}>
                              {destination?.root?.locationPath || destination?.root?.name || "Not specified"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="progress-monitor__metric-context progress-monitor__metric-context--empty" />
                      )}
                    </div>
                  </div>
                </>
              ) : (
                // Traversal phase: normal header
                <>
                  <div className="progress-monitor__metric-header">
                    <div className="progress-monitor__metric-service">
                      {getServiceIcon(getSourceServiceType())}
                      <span>{source?.service?.displayName || status?.sourceId || "Unknown"}</span>
                    </div>
                    <h3 className="progress-monitor__metric-title progress-monitor__metric-title--source">
                      Source
                    </h3>
                  </div>
                  {(source?.root?.locationPath && source.root.locationPath !== '/') ? (
                    <div className="progress-monitor__metric-context">
                      <div className="progress-monitor__metric-context-row">
                        <span className="progress-monitor__metric-context-label">Root Path:</span>
                        <span className="progress-monitor__metric-context-value" title={source?.root?.locationPath || source?.root?.name || ""}>
                          {source?.root?.locationPath || source?.root?.name || "Not specified"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="progress-monitor__metric-context progress-monitor__metric-context--empty" />
                  )}
                </>
              )}
              {showCopyUI ? (
                queueMetrics?.copy ? (
                  <div className="progress-monitor__metric-details">
                    {/* Totals */}
                    <div className="progress-monitor__metric-row">
                      <span>Folders:</span>
                      <span>{(queueMetrics.copy.folders || 0).toLocaleString()}</span>
                    </div>
                    <div className="progress-monitor__metric-row">
                      <span>Files:</span>
                      <span>{(queueMetrics.copy.files || 0).toLocaleString()}</span>
                    </div>
                    <div className="progress-monitor__metric-row">
                      <span>Total:</span>
                      <span>{(queueMetrics.copy.total || 0).toLocaleString()}</span>
                    </div>
                    {/* Total bytes moved - API may not return this yet, show 0 if not available */}
                    <div className="progress-monitor__metric-row">
                      <span>Bytes:</span>
                      <span>{formatBytes(
                        queueMetrics.copy.bytes_copied_total || 
                        queueMetrics.copy.total_bytes_copied || 
                        queueMetrics.copy.bytes_total || 
                        0
                      )}</span>
                    </div>
                    {/* Rates */}
                    <div className="progress-monitor__metric-row">
                      <span>Items/sec:</span>
                      <span>{(queueMetrics.copy.items_per_second || 0).toFixed(1)}</span>
                    </div>
                    {/* Bytes per second - API may not return this yet, show 0 if not available */}
                    <div className="progress-monitor__metric-row">
                      <span>Bytes/sec:</span>
                      <span>{formatBytesPerSec(
                        queueMetrics.copy.bytes_per_sec || 
                        queueMetrics.copy.copy_rate_bytes_per_sec || 
                        queueMetrics.copy.bytes_copied_per_sec || 
                        0
                      )}</span>
                    </div>
                  </div>
                ) : (
                  <div className="progress-monitor__metric-empty">Not started</div>
                )
              ) : (
                // Traversal phase: show discovery metrics from srcTraversal
                queueMetrics?.srcTraversal ? (
                  <div className="progress-monitor__metric-details">
                    {queueMetrics.srcTraversal.discovery_rate_items_per_sec !== undefined && (
                      <div className="progress-monitor__metric-row">
                        <span>
                          Discovery Rate:
                          <HelpTooltip
                            tipId="discovery-rate-explanation"
                            category="discovery-rate-source"
                            position="above"
                            content={
                              <p>
                                The discovery rate shows how many files and folders are being discovered per second. This is an exponentially weighted moving average (EMA) that smooths out short-term fluctuations to give you a more stable view of the discovery progress.
                              </p>
                            }
                          />
                        </span>
                        <span>{queueMetrics.srcTraversal.discovery_rate_items_per_sec.toFixed(1)} items/sec</span>
                      </div>
                    )}
                    {queueMetrics.srcTraversal.folders_discovered_total !== undefined && (
                      <div className="progress-monitor__metric-row">
                        <span>Folders Discovered:</span>
                        <span>{queueMetrics.srcTraversal.folders_discovered_total.toLocaleString()}</span>
                      </div>
                    )}
                    {queueMetrics.srcTraversal.files_discovered_total !== undefined && (
                      <div className="progress-monitor__metric-row">
                        <span>Files Discovered:</span>
                        <span>{queueMetrics.srcTraversal.files_discovered_total.toLocaleString()}</span>
                      </div>
                    )}
                    {queueMetrics.srcTraversal.total_discovered !== undefined && (
                      <div className="progress-monitor__metric-row">
                        <span>Total Discovered:</span>
                        <span>{queueMetrics.srcTraversal.total_discovered.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="progress-monitor__metric-empty">Not started</div>
                )
              )}
            </div>

            {/* Destination card - only show in traversal phase */}
            {!showCopyUI && (
              <div className="progress-monitor__metric-card">
                <div className="progress-monitor__metric-header">
                  <div className="progress-monitor__metric-service">
                    {getServiceIcon(getDestinationServiceType())}
                    <span>{destination?.service?.displayName || status?.destinationId || "Unknown"}</span>
                  </div>
                  <h3 className="progress-monitor__metric-title progress-monitor__metric-title--destination">
                    Destination
                  </h3>
                </div>
                {(destination?.root?.locationPath && destination.root.locationPath !== '/') ? (
                  <div className="progress-monitor__metric-context">
                    <div className="progress-monitor__metric-context-row">
                      <span className="progress-monitor__metric-context-label">Root Path:</span>
                      <span className="progress-monitor__metric-context-value" title={destination?.root?.locationPath || destination?.root?.name || ""}>
                        {destination?.root?.locationPath || destination?.root?.name || "Not specified"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="progress-monitor__metric-context progress-monitor__metric-context--empty" />
                )}
                {queueMetrics?.dstTraversal ? (
                  <div className="progress-monitor__metric-details">
                    {queueMetrics.dstTraversal.discovery_rate_items_per_sec !== undefined && (
                      <div className="progress-monitor__metric-row">
                        <span>
                          Discovery Rate:
                          <HelpTooltip
                            tipId="discovery-rate-explanation-dst"
                            category="discovery-rate-destination"
                            position="above"
                            content={
                              <p>
                                The discovery rate shows how many files and folders are being discovered per second. This is an exponentially weighted moving average (EMA) that smooths out short-term fluctuations to give you a more stable view of the discovery progress.
                              </p>
                            }
                          />
                        </span>
                        <span>{queueMetrics.dstTraversal.discovery_rate_items_per_sec.toFixed(1)} items/sec</span>
                      </div>
                    )}
                    {queueMetrics.dstTraversal.folders_discovered_total !== undefined && (
                      <div className="progress-monitor__metric-row">
                        <span>Folders Discovered:</span>
                        <span>{queueMetrics.dstTraversal.folders_discovered_total.toLocaleString()}</span>
                      </div>
                    )}
                    {queueMetrics.dstTraversal.files_discovered_total !== undefined && (
                      <div className="progress-monitor__metric-row">
                        <span>Files Discovered:</span>
                        <span>{queueMetrics.dstTraversal.files_discovered_total.toLocaleString()}</span>
                      </div>
                    )}
                    {queueMetrics.dstTraversal.total_discovered !== undefined && (
                      <div className="progress-monitor__metric-row">
                        <span>
                          Total Discovered:
                          <HelpTooltip
                            tipId="destination-total-discovered-explanation"
                            category="discovery-destination-total"
                            position="above"
                            content={
                              <p>This is specifically only the overlapping items explored, not the total items inside of your destination root folder.</p>
                            }
                          />
                        </span>
                        <span>{queueMetrics.dstTraversal.total_discovered.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="progress-monitor__metric-empty">Not started</div>
                )}
              </div>
            )}
          </div>

        {/* Footer: stop/resume + view results */}
        <div className="progress-monitor__footer">
          <div className="progress-monitor__footer-spacer" />
          <div className="progress-monitor__footer-actions">
            {showStopButton && (
              <button
                type="button"
                className="progress-monitor__control progress-monitor__control--stop"
                disabled={actionBusy}
                onClick={() => setConfirmKind("stop")}
                title="Stop the running migration"
              >
                <Square size={18} style={{ marginRight: "0.5rem" }} fill="currentColor" />
                Stop
              </button>
            )}
            {showResumeButton && (
              <div className="progress-monitor__resume-with-hint">
                {isFailed && (
                  <div
                    ref={failureWrapRef}
                    className="progress-monitor__failure-wrap"
                    onMouseEnter={openFailureTooltip}
                    onMouseLeave={scheduleCloseFailureTooltip}
                  >
                    <button
                      type="button"
                      className="progress-monitor__failure-alert"
                      disabled={actionBusy}
                      aria-label="Migration error details"
                      aria-expanded={failureTooltipOpen}
                      aria-controls="progress-monitor-failure-tooltip"
                      onClick={(e) => {
                        e.stopPropagation();
                        openFailureTooltip();
                      }}
                      onFocus={openFailureTooltip}
                      onBlur={(e) => {
                        if (!failureWrapRef.current?.contains(e.relatedTarget)) {
                          scheduleCloseFailureTooltip();
                        }
                      }}
                    >
                      <AlertCircle size={22} />
                    </button>
                    {failureTooltipOpen && (
                      <div
                        id="progress-monitor-failure-tooltip"
                        className="progress-monitor__failure-tooltip"
                        role="tooltip"
                        onMouseEnter={openFailureTooltip}
                        onMouseLeave={scheduleCloseFailureTooltip}
                      >
                        <p className="progress-monitor__failure-tooltip-text">
                          {failureHoverSummary}
                        </p>
                        <div className="progress-monitor__failure-tooltip-actions">
                          <button
                            type="button"
                            className="progress-monitor__failure-tooltip-button progress-monitor__failure-tooltip-button--copy"
                            onClick={() => void copyFailureJson()}
                          >
                            <ClipboardCopy size={16} />
                            {failureCopied ? "Copied!" : "Copy JSON"}
                          </button>
                          <button
                            type="button"
                            className="progress-monitor__failure-tooltip-button progress-monitor__failure-tooltip-button--report"
                            onClick={() => {}}
                            title="Coming soon"
                          >
                            Report
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className="progress-monitor__control progress-monitor__control--resume"
                  disabled={actionBusy}
                  onClick={() => setConfirmKind("resume")}
                  title={
                    isFailed
                      ? "Run a retry sweep to try again"
                      : "Resume with a retry sweep for the current phase"
                  }
                >
                  <Play size={18} style={{ marginRight: "0.5rem" }} />
                  Resume
                </button>
              </div>
            )}
            <button
              type="button"
              className={`progress-monitor__see-results ${
                showResultsButton ? "progress-monitor__see-results--enabled" : ""
              }`}
              onClick={() => {
                if (showResultsButton && migrationId) {
                  navigate(`/path-review/${migrationId}`);
                }
              }}
              disabled={!showResultsButton}
            >
              <Eye size={20} style={{ marginRight: "0.5rem" }} />
              {showCopyUI
                ? "View Copy Results"
                : "View Discovery Results"}
            </button>
          </div>
        </div>

        {confirmKind === "stop" && (
          <ConfirmDialog
            title="Stop migration?"
            message="This pauses the running migration. Work in progress will stop; you can resume later with a retry sweep (heavy operation). Are you sure?"
            confirmLabel="Stop migration"
            cancelLabel="Cancel"
            onCancel={() => setConfirmKind(null)}
            onConfirm={() => void handleConfirmStop()}
          />
        )}
        {confirmKind === "resume" && (
          <ConfirmDialog
            title="Resume migration?"
            message={
              showCopyUI
                ? "This starts a copy retry sweep to continue copying. It can use significant resources and run for a long time. Continue?"
                : "This starts a discovery retry sweep to continue traversal. It can use significant resources and run for a long time. Continue?"
            }
            confirmLabel="Resume"
            cancelLabel="Cancel"
            onCancel={() => setConfirmKind(null)}
            onConfirm={() => void handleConfirmResume()}
          />
        )}
      </GlassSurfacePanel>
    </section>
  );
}

