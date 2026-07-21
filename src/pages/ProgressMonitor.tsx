import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
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
  resumeMigration,
} from "../api/services";
import {
  getMigrationPhase,
  isCopyReviewPhase,
  isDeleteReviewPhase,
  isMigrationLive,
  isMigrationSuspended,
  isMigrationFailed,
} from "../types/migrations";
import { useSelection } from "../context/SelectionContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { formatMigrationPath } from "../utils/migrationRoots";
import type { QueueMetrics } from "../types/migrations";
import HelpTooltip from "../components/HelpTooltip";
import ConfirmDialog from "../components/ConfirmDialog";
import Toast from "../components/Toast";
import { GlassSurfacePanel } from "../components/GlassSurfacePanel";
import PageBackButton from "../components/PageBackButton";
import "./ProgressMonitor.css";

const STATUS_POLL_INTERVAL = 1000;
const SOFT_SUSPEND_POLL_TIMEOUT_MS = 120_000;

/** Clamp engine-reported progress percent for display. */
function clampProgressPercent(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return 100;
  return n;
}

/**
 * Seconds left on a rate-limit window.
 * Uses remaining_ms when provided; otherwise until − now.
 * Applies a 1s poll-staleness fudge only when remaining > 2s so short windows still show.
 */
function rateLimitCountdownSeconds(
  untilIso?: string | null,
  remainingMs?: number | null
): number | null {
  let remaining = 0;
  if (typeof remainingMs === "number" && Number.isFinite(remainingMs) && remainingMs > 0) {
    remaining = remainingMs;
  } else if (untilIso) {
    const until = Date.parse(untilIso);
    if (!Number.isFinite(until)) return null;
    remaining = until - Date.now();
  } else {
    return null;
  }
  if (remaining <= 0) return null;
  let secs = Math.ceil(remaining / 1000);
  if (secs > 2) secs -= 1; // poll staleness fudge for longer waits
  if (secs < 1) secs = 1;
  return secs;
}

function formatRateLimitCountdown(secs: number): string {
  if (secs >= 60) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  }
  return `${secs}s`;
}

function RateLimitBadge({
  untilIso,
  remainingMs,
  interOpDelayMs,
}: {
  untilIso?: string | null;
  remainingMs?: number | null;
  interOpDelayMs?: number | null;
}) {
  const secs = rateLimitCountdownSeconds(untilIso, remainingMs);
  if (secs != null) {
    return (
      <span
        className="progress-monitor__rate-limit"
        title={`Rate limited. Waiting about ${formatRateLimitCountdown(secs)}`}
      >
        Rate limited · {formatRateLimitCountdown(secs)}
      </span>
    );
  }
  if (typeof interOpDelayMs === "number" && interOpDelayMs > 0) {
    const delaySecs = Math.max(1, Math.ceil(interOpDelayMs / 1000));
    return (
      <span
        className="progress-monitor__rate-limit progress-monitor__rate-limit--pacing"
        title={`Throttle pacing: ${interOpDelayMs}ms inter-op delay`}
      >
        Pacing · {formatRateLimitCountdown(delaySecs)}
      </span>
    );
  }
  return null;
}

/** Console-style queue line for developer mode (matches ME progress ticker). */
function formatSideDebug(label: string, m?: QueueMetrics | null): string | null {
  if (!m) return null;
  const round = m.round ?? 0;
  const exp = m.round_expected ?? 0;
  const comp = m.round_completed ?? 0;
  const pend = m.pending ?? 0;
  const workers = m.workers ?? 0;
  return `${label}: Round ${round} (Exp:${exp} Comp:${comp} Pend:${pend} W:${workers})`;
}

function formatPhaseDebug(
  label: string,
  m?: QueueMetrics | null,
  opts?: { pass?: number }
): string | null {
  if (!m) return null;
  const round = m.round ?? 0;
  const exp = m.round_expected ?? 0;
  const comp = m.round_completed ?? 0;
  const pend = m.pending ?? 0;
  const inProg = m.in_progress ?? m.inProgress ?? 0;
  const workers = m.workers ?? 0;
  const pass = opts?.pass ?? m.copy_pass;
  if (pass && pass > 0) {
    const passName = pass === 2 ? "files" : "folders";
    return `${label}: Pass ${pass} (${passName}) Round ${round} | Exp:${exp} Comp:${comp} | Pend:${pend} InProg:${inProg} | Workers:${workers}`;
  }
  return `${label}: Round ${round} | Exp:${exp} Comp:${comp} | Pend:${pend} InProg:${inProg} | Workers:${workers}`;
}

/** Stop response: engine accepted soft suspend; UI should poll until *-suspended and not live. */
function softSuspendRequestedPayload(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  return (
    o.softSuspendRequested === true || o.SoftSuspendRequested === true
  );
}

/** Stop response: migration was not in a stoppable live phase. */
function stopAlreadyHandled(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  if (o.alreadyStopped === true || o.AlreadyStopped === true) return true;
  if (o.success === false || o.Success === false) return true;
  return false;
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
  const { source, destination, services, applyServerRoots } = useSelection();
  const { preferences } = usePreferences();
  const developerMode = preferences.developer?.enabled === true;

  const [status, setStatus] = useState<any>(null);
  const [queueMetrics, setQueueMetrics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [allServices, setAllServices] = useState(services);
  const [showResultsButton, setShowResultsButton] = useState(false);
  const [confirmKind, setConfirmKind] = useState<null | "stop" | "resume">(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [failureTooltipOpen, setFailureTooltipOpen] = useState(false);
  const [failureCopied, setFailureCopied] = useState(false);
  const [stallTooltipOpen, setStallTooltipOpen] = useState(false);
  /** Local tick so rate-limit countdowns update between 1s metrics polls. */
  const [, setRateLimitTick] = useState(0);

  /** After a retry sweep, status can briefly still say "review" before the run starts - require run activity before re-enabling review. */
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
  const stallWrapRef = useRef<HTMLDivElement>(null);
  const stallLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isRetryRunRef.current = searchParams.get("retry") === "1";
  }, [searchParams]);

  // Intent from navigation: Start Copy → copy, Retry Discovery → discovery. No param = derive from API.
  const modeFromUrl = searchParams.get("mode");
  const showCopyUI =
    modeFromUrl === "copy"
      ? true
      : modeFromUrl === "delete"
        ? false
      : modeFromUrl === "discovery"
        ? false
        : isCopyReviewPhase(status) && !isDeleteReviewPhase(status);
  const showDeleteUI =
    modeFromUrl === "delete"
      ? true
      : isDeleteReviewPhase(status);
  const showDiscoveryUI = !showCopyUI && !showDeleteUI;

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

  // Fetch status - keep polling while on this page so phase/live updates after retry (don’t stop on “review” alone).
  const fetchStatus = useCallback(async () => {
    if (!migrationId) return;

    try {
      const statusData = await getMigrationStatus(migrationId);
      setStatus(statusData);
      // Rehydrate roots from the server when opening directly in a fresh session.
      applyServerRoots(statusData.sourceRoot, statusData.destinationRoot);
      const phase = getMigrationPhase(statusData);
      const hadRunBefore = hasSeenActiveRunRef.current;

      if (isRetryRunRef.current) {
        const prevPhase = prevPhaseRef.current;
        if (prevPhase !== "") {
          const inReview = (p: string) =>
            p === "awaiting-traversal-review" ||
            p === "awaiting-copy-review" ||
            p === "awaiting-delete-review";
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
        phase === "copy-in-progress" ||
        phase === "delete-in-progress"
      ) {
        hasSeenActiveRunRef.current = true;
      }

      // Retry: backend may omit live/phase transitions; if review is not live and completedAt
      // is on or after startedAt, the sweep for this run has finished (stale pre-sweep should
      // clear completedAt or move startedAt forward on retry).
      if (isRetryRunRef.current && !isMigrationLive(statusData)) {
        const inReview =
          phase === "awaiting-traversal-review" ||
          phase === "awaiting-copy-review" ||
          phase === "awaiting-delete-review";
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
  }, [migrationId, applyServerRoots]);

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
      
      // Only update if we have valid data (copy phase may only return `copy`)
      if (
        response.srcTraversal !== undefined ||
        response.dstTraversal !== undefined ||
        response.copy !== undefined ||
        response.delete !== undefined
      ) {
        setQueueMetrics({
          srcTraversal: response.srcTraversal ?? null,
          dstTraversal: response.dstTraversal ?? null,
          copy: response.copy ?? null,
          delete: response.delete ?? null,
          possibleStall: Boolean(response.possibleStall),
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
    const inDeleteReview = phase === "awaiting-delete-review";
    const inMatchingReview =
      (showDeleteUI && inDeleteReview) ||
      (showCopyUI && inCopyReview) ||
      (showDiscoveryUI && inTraversalReview);
    const live = isMigrationLive(status);
    const canReview =
      inMatchingReview &&
      !live &&
      (!isRetryRun || hasSeenActiveRunRef.current);
    setShowResultsButton(!!canReview);
  }, [status, showCopyUI, showDeleteUI, isRetryRun, runGate]);

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

  const rateLimitSrcUntil =
    queueMetrics?.copy?.rate_limited_until_src ||
    queueMetrics?.delete?.rate_limited_until_src ||
    queueMetrics?.srcTraversal?.rate_limited_until_src ||
    null;
  const rateLimitDstUntil =
    queueMetrics?.copy?.rate_limited_until_dst ||
    queueMetrics?.dstTraversal?.rate_limited_until_dst ||
    null;
  const rateLimitSrcRemaining =
    queueMetrics?.copy?.rate_limited_remaining_ms_src ||
    queueMetrics?.delete?.rate_limited_remaining_ms_src ||
    queueMetrics?.srcTraversal?.rate_limited_remaining_ms_src ||
    null;
  const rateLimitDstRemaining =
    queueMetrics?.copy?.rate_limited_remaining_ms_dst ||
    queueMetrics?.dstTraversal?.rate_limited_remaining_ms_dst ||
    null;
  const pacingActive = Boolean(
    (queueMetrics?.copy?.inter_op_delay_ms ?? 0) > 0 ||
      (queueMetrics?.delete?.inter_op_delay_ms ?? 0) > 0 ||
      (queueMetrics?.srcTraversal?.inter_op_delay_ms ?? 0) > 0 ||
      (queueMetrics?.dstTraversal?.inter_op_delay_ms ?? 0) > 0
  );

  useEffect(() => {
    const active =
      rateLimitCountdownSeconds(rateLimitSrcUntil, rateLimitSrcRemaining) != null ||
      rateLimitCountdownSeconds(rateLimitDstUntil, rateLimitDstRemaining) != null ||
      pacingActive;
    if (!active) return;
    const id = window.setInterval(() => {
      setRateLimitTick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [
    rateLimitSrcUntil,
    rateLimitDstUntil,
    rateLimitSrcRemaining,
    rateLimitDstRemaining,
    pacingActive,
  ]);

  const phase = status ? getMigrationPhase(status) : "";
  const inAwaitingReview =
    phase === "awaiting-traversal-review" ||
    phase === "awaiting-copy-review" ||
    phase === "awaiting-delete-review";
  const inRunPhase =
    phase === "traversal-in-progress" ||
    phase === "copy-in-progress" ||
    phase === "delete-in-progress";
  const isSuspended = status ? isMigrationSuspended(status) : false;
  const isFailed = status ? isMigrationFailed(status) : false;
  const explicitlyNotLive = status ? isLiveExplicitlyFalse(status) : false;
  const live = status ? isMigrationLive(status) : false;
  const stoppedMidRun = inRunPhase && !live;
  const showStopButton = Boolean(
    status &&
      !isFailed &&
      !isSuspended &&
      !inAwaitingReview &&
      live
  );
  const showResumeButton = Boolean(
    status &&
      !inAwaitingReview &&
      (isFailed ||
        isSuspended ||
        stoppedMidRun ||
        (inRunPhase && explicitlyNotLive))
  );

  const possibleStall = Boolean(
    status?.possibleStall ||
      (status as { PossibleStall?: boolean } | null)?.PossibleStall ||
      queueMetrics?.possibleStall
  );

  const phaseProgressPercent = showDeleteUI
    ? clampProgressPercent(queueMetrics?.delete?.progress_percent)
    : showCopyUI
      ? clampProgressPercent(queueMetrics?.copy?.progress_percent)
      : 0;
  const showPhaseProgressBar = showCopyUI || showDeleteUI;
  const phaseProgressLabel = showDeleteUI ? "Source removal progress" : "Copy progress";
  const phaseProgressDisplay = Math.round(phaseProgressPercent);

  const developerQueueDebug = useMemo(() => {
    if (!developerMode || !queueMetrics) return null;
    if (showCopyUI) {
      return formatPhaseDebug("Copy", queueMetrics.copy);
    }
    if (showDeleteUI) {
      return formatPhaseDebug("Delete", queueMetrics.delete);
    }
    const src = formatSideDebug("Src", queueMetrics.srcTraversal);
    const dst = formatSideDebug("Dst", queueMetrics.dstTraversal);
    if (src && dst) return `${src} | ${dst}`;
    return src || dst;
  }, [developerMode, queueMetrics, showCopyUI, showDeleteUI]);

  const failureErrorText =
    (status?.error && String(status.error).trim()) || "Unknown error";
  const failureHoverSummary = showDeleteUI
    ? `Source removal failed due to error: ${failureErrorText}. Please retry or report this error to our community.`
    : showCopyUI
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
        uiContext: showDeleteUI ? "delete" : showCopyUI ? "copy" : "discovery",
      },
      null,
      2
    );
  }, [migrationId, status, failureErrorText, showCopyUI, showDeleteUI]);

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

  const clearStallLeaveTimer = () => {
    if (stallLeaveTimerRef.current) {
      clearTimeout(stallLeaveTimerRef.current);
      stallLeaveTimerRef.current = null;
    }
  };

  const openStallTooltip = () => {
    if (!possibleStall) return;
    clearStallLeaveTimer();
    setStallTooltipOpen(true);
  };

  const scheduleCloseStallTooltip = () => {
    clearStallLeaveTimer();
    stallLeaveTimerRef.current = setTimeout(() => {
      setStallTooltipOpen(false);
    }, 220);
  };

  useEffect(() => {
    if (!possibleStall) {
      setStallTooltipOpen(false);
    }
  }, [possibleStall]);

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

      if (stopAlreadyHandled(next)) {
        const fresh = await getMigrationStatus(migrationId);
        setStatus(fresh);
        setStallTooltipOpen(false);
        setToast({ message: "Migration is already stopped.", type: "info" });
        return;
      }

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
      const result = await resumeMigration(migrationId);
      if (!result.success) {
        setActionError(result.error || "Failed to resume migration.");
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.set("retry", "1");
      if (!next.get("mode")) {
        next.set("mode", showDeleteUI ? "delete" : showCopyUI ? "copy" : "discovery");
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
        <PageBackButton
          onClick={() => navigate("/")}
          title="Back to home"
          className="progress-monitor__back"
        />
        <header className="progress-monitor__header">
          <h1>
            {showDeleteUI ? (
              <>Source Removal <span className="progress-monitor__highlight">Progress</span></>
            ) : showCopyUI ? (
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
        {developerQueueDebug && (
          <div className="progress-monitor__dev-metrics" title="Developer mode queue metrics">
            {developerQueueDebug}
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
                          <RateLimitBadge
                            untilIso={queueMetrics?.copy?.rate_limited_until_src}
                            remainingMs={queueMetrics?.copy?.rate_limited_remaining_ms_src}
                            interOpDelayMs={queueMetrics?.copy?.inter_op_delay_ms}
                          />
                        </div>
                        <h3 className="progress-monitor__metric-title progress-monitor__metric-title--source">
                          Source
                        </h3>
                      </div>
                      {source?.root ? (
                        <div className="progress-monitor__metric-context">
                          <div className="progress-monitor__metric-context-row">
                            <span className="progress-monitor__metric-context-label">Root Path:</span>
                            <span className="progress-monitor__metric-context-value" title={formatMigrationPath(source?.root)}>
                              {formatMigrationPath(source?.root)}
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
                          <RateLimitBadge
                            untilIso={queueMetrics?.copy?.rate_limited_until_dst}
                            remainingMs={queueMetrics?.copy?.rate_limited_remaining_ms_dst}
                            interOpDelayMs={queueMetrics?.copy?.inter_op_delay_ms}
                          />
                        </div>
                        <h3 className="progress-monitor__metric-title progress-monitor__metric-title--destination">
                          Destination
                        </h3>
                      </div>
                      {destination?.root ? (
                        <div className="progress-monitor__metric-context">
                          <div className="progress-monitor__metric-context-row">
                            <span className="progress-monitor__metric-context-label">Root Path:</span>
                            <span className="progress-monitor__metric-context-value" title={formatMigrationPath(destination?.root)}>
                              {formatMigrationPath(destination?.root)}
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
                // Traversal / delete: source header
                <>
                  <div className="progress-monitor__metric-header">
                    <div className="progress-monitor__metric-service">
                      {getServiceIcon(getSourceServiceType())}
                      <span>{source?.service?.displayName || status?.sourceId || "Unknown"}</span>
                      <RateLimitBadge
                        untilIso={
                          showDeleteUI
                            ? queueMetrics?.delete?.rate_limited_until_src
                            : queueMetrics?.srcTraversal?.rate_limited_until_src
                        }
                        remainingMs={
                          showDeleteUI
                            ? queueMetrics?.delete?.rate_limited_remaining_ms_src
                            : queueMetrics?.srcTraversal?.rate_limited_remaining_ms_src
                        }
                        interOpDelayMs={
                          showDeleteUI
                            ? queueMetrics?.delete?.inter_op_delay_ms
                            : queueMetrics?.srcTraversal?.inter_op_delay_ms
                        }
                      />
                    </div>
                    <h3 className="progress-monitor__metric-title progress-monitor__metric-title--source">
                      Source
                    </h3>
                  </div>
                  {source?.root ? (
                    <div className="progress-monitor__metric-context">
                      <div className="progress-monitor__metric-context-row">
                        <span className="progress-monitor__metric-context-label">Root Path:</span>
                        <span className="progress-monitor__metric-context-value" title={formatMigrationPath(source?.root)}>
                          {formatMigrationPath(source?.root)}
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
                    {(queueMetrics.copy.in_progress ?? queueMetrics.copy.inProgress ?? 0) > 0 && (
                      <div className="progress-monitor__metric-row">
                        <span>In progress:</span>
                        <span>
                          {(
                            queueMetrics.copy.in_progress ??
                            queueMetrics.copy.inProgress ??
                            0
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {(queueMetrics.copy.total_failed ?? 0) > 0 && (
                      <div className="progress-monitor__metric-row">
                        <span>Failed:</span>
                        <span>{(queueMetrics.copy.total_failed || 0).toLocaleString()}</span>
                      </div>
                    )}
                    {/* Total bytes moved - API may not return this yet, show 0 if not available */}
                    <div className="progress-monitor__metric-row">
                      <span>Bytes:</span>
                      <span>{formatBytes(
                        queueMetrics.copy.bytes ??
                          queueMetrics.copy.bytes_copied_total ??
                          queueMetrics.copy.total_bytes_copied ??
                          queueMetrics.copy.bytes_total ??
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
                        queueMetrics.copy.bytes_per_second ??
                        queueMetrics.copy.bytes_per_sec ??
                        queueMetrics.copy.copy_rate_bytes_per_sec ??
                        queueMetrics.copy.bytes_copied_per_sec ??
                        0
                      )}</span>
                    </div>
                  </div>
                ) : (
                  <div className="progress-monitor__metric-empty">Not started</div>
                )
              ) : showDeleteUI ? (
                queueMetrics?.delete ? (
                  <div className="progress-monitor__metric-details">
                    <div className="progress-monitor__metric-row">
                      <span>Folders removed:</span>
                      <span>{(queueMetrics.delete.folders || 0).toLocaleString()}</span>
                    </div>
                    <div className="progress-monitor__metric-row">
                      <span>Files removed:</span>
                      <span>{(queueMetrics.delete.files || 0).toLocaleString()}</span>
                    </div>
                    <div className="progress-monitor__metric-row">
                      <span>Total removed:</span>
                      <span>{(queueMetrics.delete.total || 0).toLocaleString()}</span>
                    </div>
                    <div className="progress-monitor__metric-row">
                      <span>Bytes removed:</span>
                      <span>{formatBytes(queueMetrics.delete.bytes ?? 0)}</span>
                    </div>
                    <div className="progress-monitor__metric-row">
                      <span>Items/sec:</span>
                      <span>{(queueMetrics.delete.items_per_second || 0).toFixed(1)}</span>
                    </div>
                    <div className="progress-monitor__metric-row">
                      <span>Bytes/sec:</span>
                      <span>{formatBytesPerSec(queueMetrics.delete.bytes_per_second ?? 0)}</span>
                    </div>
                    {(queueMetrics.delete.total_pending ?? 0) > 0 && (
                      <div className="progress-monitor__metric-row">
                        <span>Pending:</span>
                        <span>{(queueMetrics.delete.total_pending || 0).toLocaleString()}</span>
                      </div>
                    )}
                    {(queueMetrics.delete.total_failed ?? 0) > 0 && (
                      <div className="progress-monitor__metric-row">
                        <span>Failed:</span>
                        <span>{(queueMetrics.delete.total_failed || 0).toLocaleString()}</span>
                      </div>
                    )}
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
                                Discovery rate is how many folder list operations complete per second
                                (EMA-smoothed). It tracks traversal work even when folders have few or
                                no new children to discover.
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
              {showPhaseProgressBar && (
                <div className="progress-monitor__progress">
                  <div className="progress-monitor__progress-header">
                    <span className="progress-monitor__progress-label">{phaseProgressLabel}</span>
                    <span className="progress-monitor__progress-value">{phaseProgressDisplay}%</span>
                  </div>
                  <div
                    className="progress-monitor__progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={phaseProgressDisplay}
                    aria-label={phaseProgressLabel}
                  >
                    <div
                      className="progress-monitor__progress-fill"
                      style={{
                        clipPath: `inset(0 ${100 - phaseProgressPercent}% 0 0)`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Destination card - only show in discovery phase */}
            {showDiscoveryUI && (
              <div className="progress-monitor__metric-card">
                <div className="progress-monitor__metric-header">
                  <div className="progress-monitor__metric-service">
                    {getServiceIcon(getDestinationServiceType())}
                    <span>{destination?.service?.displayName || status?.destinationId || "Unknown"}</span>
                    <RateLimitBadge
                      untilIso={queueMetrics?.dstTraversal?.rate_limited_until_dst}
                      remainingMs={queueMetrics?.dstTraversal?.rate_limited_remaining_ms_dst}
                      interOpDelayMs={queueMetrics?.dstTraversal?.inter_op_delay_ms}
                    />
                  </div>
                  <h3 className="progress-monitor__metric-title progress-monitor__metric-title--destination">
                    Destination
                  </h3>
                </div>
                {destination?.root ? (
                  <div className="progress-monitor__metric-context">
                    <div className="progress-monitor__metric-context-row">
                      <span className="progress-monitor__metric-context-label">Root Path:</span>
                      <span className="progress-monitor__metric-context-value" title={formatMigrationPath(destination?.root)}>
                        {formatMigrationPath(destination?.root)}
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
                                Discovery rate is how many folder list operations complete per second
                                (EMA-smoothed). It tracks traversal work even when folders have few or
                                no new children to discover.
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
              <div
                ref={stallWrapRef}
                className={`progress-monitor__stop-wrap${possibleStall ? " progress-monitor__stop-wrap--stall" : ""}`}
                onMouseEnter={openStallTooltip}
                onMouseLeave={scheduleCloseStallTooltip}
              >
                <button
                  type="button"
                  className="progress-monitor__control progress-monitor__control--stop"
                  disabled={actionBusy}
                  onClick={() => setConfirmKind("stop")}
                  title={
                    possibleStall
                      ? "Migration may have stalled. Click to stop"
                      : "Stop the running migration"
                  }
                  aria-describedby={
                    possibleStall && stallTooltipOpen
                      ? "progress-monitor-stall-tooltip"
                      : undefined
                  }
                  onFocus={openStallTooltip}
                  onBlur={(e) => {
                    if (!stallWrapRef.current?.contains(e.relatedTarget)) {
                      scheduleCloseStallTooltip();
                    }
                  }}
                >
                  <Square size={18} style={{ marginRight: "0.5rem" }} fill="currentColor" />
                  Stop
                  {possibleStall && (
                    <span className="progress-monitor__stall-dot" aria-hidden="true" />
                  )}
                </button>
                {possibleStall && stallTooltipOpen && (
                  <div
                    id="progress-monitor-stall-tooltip"
                    className="progress-monitor__stall-tooltip"
                    role="tooltip"
                    onMouseEnter={openStallTooltip}
                    onMouseLeave={scheduleCloseStallTooltip}
                  >
                    <p className="progress-monitor__stall-tooltip-text">
                      It looks like this migration may have stalled. Progress has not updated
                      recently. Would you like to stop the process?
                    </p>
                    <button
                      type="button"
                      className="progress-monitor__stall-tooltip-button"
                      disabled={actionBusy}
                      onClick={() => setConfirmKind("stop")}
                    >
                      Stop migration
                    </button>
                  </div>
                )}
              </div>
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
              className="glass-button glass-button--progress-cta progress-monitor__see-results"
              onClick={() => {
                if (showResultsButton && migrationId) {
                  navigate(`/path-review/${migrationId}`);
                }
              }}
              disabled={!showResultsButton}
            >
              <Eye size={20} style={{ marginRight: "0.5rem" }} />
              {showDeleteUI
                ? "View Removal Results"
                : showCopyUI
                ? "View Copy Results"
                : "View Discovery Results"}
            </button>
          </div>
        </div>

        {confirmKind === "stop" && (
          <ConfirmDialog
            title="Stop migration?"
            message="This pauses the running migration. You can resume later from where it left off. Are you sure?"
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
              showDeleteUI
                ? "This resumes source removal from where it stopped. It can use significant resources and run for a long time. Continue?"
                : showCopyUI
                ? "This resumes the copy phase from where it stopped. It can use significant resources and run for a long time. Continue?"
                : "This starts a discovery retry sweep to continue traversal. It can use significant resources and run for a long time. Continue?"
            }
            confirmLabel="Resume"
            cancelLabel="Cancel"
            onCancel={() => setConfirmKind(null)}
            onConfirm={() => void handleConfirmResume()}
          />
        )}
      </GlassSurfacePanel>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </section>
  );
}

