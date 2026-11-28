import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  FolderOpen,
  Cloud,
  Eye,
  ArrowRight,
  Square,
  Play,
  AlertCircle,
  ClipboardCopy,
  ChevronDown,
  ChevronRight,
  Pencil,
  Loader2,
  Check,
  X,
} from "lucide-react";

import {
  getMigrationStatus,
  getMigrationQueueMetrics,
  getMigrationLogs,
  fetchServices,
  stopMigration,
  forceStopMigration,
  resumeMigration,
  retryFinalize,
  probeMigrationFSHealth,
  cancelMigrationInFlight,
} from "../api/services";
import CloudConnectionIssues from "../components/CloudConnectionIssues";
import type { CloudConnectionCheckResult } from "../utils/cloudConnections";
import {
  cloudIssuesFromFSHealth,
  formatFSHealthFailure,
} from "../utils/fsHealth";
import {
  fetchScalingDefaults,
  getMigrationAutoscaler,
  getMigrationScaling,
  putMigrationScaling,
  deleteProviderScalingOverrides,
} from "../api/scaling";
import AutoscalerPanel from "../components/AutoscalerPanel";
import type { AutoscalerWaitBudget } from "../types/autoscaler";
import {
  waitBudgetInstantDelta,
  workingOnActivityChip,
  type WaitBudgetInstant,
} from "../utils/waitBudgetActivity";
import WorkerCapOverridesDialog from "../components/WorkerCapOverridesDialog";
import type {
  ModeWorkerCaps,
  ProviderWorkerCaps,
  WorkerCapMode,
} from "../types/scaling";
import {
  getMigrationPhase,
  isCopyReviewPhase,
  isDeleteReviewPhase,
  isMigrationLive,
  isMigrationSuspended,
  isMigrationFailed,
  isMigrationAborted,
  isMigrationHardStoppedResumable,
  isMigrationFinalizing,
  isMigrationFinalizeFailed,
  type InFlightTask,
  type SettledInFlightTask,
  type LogLevel,
  type MigrationLog,
  type QueueMetrics,
  type StopProgressPayload,
} from "../types/migrations";
import { useSelection } from "../context/SelectionContext";
import { formatMigrationPath } from "../utils/migrationRoots";
import { formatEtaSeconds } from "../utils/formatBytes";
import HelpTooltip from "../components/HelpTooltip";
import FileTypeIcon from "../components/FileTypeIcon";
import { useScreenWakeLock } from "../hooks/useScreenWakeLock";
import ConfirmDialog from "../components/ConfirmDialog";
import FinalizeRetryDialog from "../components/FinalizeRetryDialog";
import StopProgressPopover from "../components/StopProgressPopover";
import Toast from "../components/Toast";
import { PageShell } from "../components/PageShell";
import PageBackButton from "../components/PageBackButton";
import "./ProgressMonitor.css";

const STATUS_POLL_INTERVAL = 1000;
const LOG_POLL_INTERVAL = 1000;
const MAX_LOG_LINES = 1000;
const SOFT_SUSPEND_POLL_TIMEOUT_MS = 120_000;
const LOG_LEVELS: LogLevel[] = ["trace", "debug", "info", "warning", "error", "critical"];

function isMigrationNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("(404)") || /migration not found/i.test(msg);
}

/** Clamp engine-reported progress percent for display. */
function clampProgressPercent(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return 100;
  return n;
}

function metricCount(n: number | undefined): string {
  return (n ?? 0).toLocaleString();
}

function queueMetricNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function itemsPerSec(m?: QueueMetrics | null): number {
  const fromItems = queueMetricNumber(m?.items_per_second);
  if (fromItems > 0) return fromItems;
  return queueMetricNumber(m?.discovery_rate_items_per_sec);
}

function bytesPerSec(m?: QueueMetrics | null): number {
  return (
    queueMetricNumber(m?.bytes_per_second) ||
    queueMetricNumber(m?.bytes_per_sec) ||
    queueMetricNumber(m?.copy_rate_bytes_per_sec) ||
    queueMetricNumber(m?.bytes_copied_per_sec)
  );
}

function inflightItemType(
  task: Pick<InFlightTask, "itemKind" | "taskType">
): "folder" | "file" | null {
  if (task.itemKind === "folder" || task.taskType === "copy-folder" || task.taskType === "delete-folder") {
    return "folder";
  }
  if (task.itemKind === "file" || task.taskType === "copy-file" || task.taskType === "delete-file") {
    return "file";
  }
  return null;
}

function inflightBaseName(path?: string): string {
  if (!path) return "";
  const trimmed = path.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

function formatLeaseElapsed(leaseAgeMs?: number, pollSkewMs = 0): string {
  const ms = Math.max(0, (leaseAgeMs ?? 0) + Math.max(0, pollSkewMs));
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isCopyFileTask(task: Pick<InFlightTask, "taskType" | "itemKind">): boolean {
  // Ring progress is copy-file only. itemKind===file also matches delete rows.
  return task.taskType === "copy-file";
}

type WorkingOnRow = {
  nodeId: string;
  path?: string;
  workerId?: string;
  taskType?: string;
  itemKind?: string;
  leaseAgeMs?: number;
  bytesDone?: number;
  bytesTotal?: number;
  settled?: "success" | "fail";
};

/** Stable Working-on stack: keep prior positions; append newcomers at the bottom; drop cleared. */
function mergeWorkingOnStack(
  active: InFlightTask[] | undefined,
  settled: SettledInFlightTask[] | undefined,
  prevOrder: string[]
): { rows: WorkingOnRow[]; order: string[] } {
  const byId = new Map<string, WorkingOnRow>();
  for (const t of settled ?? []) {
    const id = t.nodeId;
    if (!id) continue;
    byId.set(id, {
      nodeId: id,
      path: t.path,
      taskType: t.taskType,
      itemKind: t.itemKind,
      bytesDone: t.bytesDone,
      bytesTotal: t.bytesTotal,
      settled: t.success ? "success" : "fail",
    });
  }
  for (const t of active ?? []) {
    const id = t.nodeId ?? t.path;
    if (!id) continue;
    byId.set(id, {
      nodeId: id,
      path: t.path,
      workerId: t.workerId,
      taskType: t.taskType,
      itemKind: t.itemKind,
      leaseAgeMs: t.leaseAgeMs,
      bytesDone: t.bytesDone,
      bytesTotal: t.bytesTotal,
    });
  }
  const alive = new Set(byId.keys());
  const order = prevOrder.filter((id) => alive.has(id));
  const seen = new Set(order);
  const newcomers: string[] = [];
  for (const id of alive) {
    if (!seen.has(id)) newcomers.push(id);
  }
  // Oldest among the new batch first so they sit higher in the appended block.
  newcomers.sort(
    (a, b) => (byId.get(b)?.leaseAgeMs ?? 0) - (byId.get(a)?.leaseAgeMs ?? 0)
  );
  order.push(...newcomers);
  return { rows: order.map((id) => byId.get(id)!), order };
}

function CircularCopyProgress({
  done,
  total,
  settled,
}: {
  done: number;
  total: number;
  settled?: "success" | "fail";
}) {
  const r = 7;
  const c = 2 * Math.PI * r;
  const pct =
    settled === "success"
      ? 1
      : settled === "fail"
        ? Math.min(1, Math.max(0, total > 0 ? done / total : 0))
        : Math.min(1, Math.max(0, total > 0 ? done / total : 0));
  const stroke =
    settled === "fail"
      ? "var(--color-danger, #c44)"
      : settled === "success"
        ? "var(--color-success, #2a8)"
        : "var(--brand-cyan)";
  return (
    <svg
      className="progress-monitor__inflight-ring"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden
    >
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="2"
      />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

function InFlightGlyph({
  task,
  hot,
}: {
  task: WorkingOnRow;
  hot: boolean;
}) {
  if (hot && task.settled == null) {
    return <X size={16} className="progress-monitor__inflight-fail" />;
  }
  const copyFile = isCopyFileTask(task);
  // Skip ring until bytes move (or settle) so tiny files do not flash 0→full.
  const showRing =
    copyFile &&
    (task.bytesTotal ?? 0) > 0 &&
    (task.settled != null || (task.bytesDone ?? 0) > 0);
  if (task.settled === "success") {
    return showRing ? (
      <CircularCopyProgress done={task.bytesTotal ?? 1} total={task.bytesTotal ?? 1} settled="success" />
    ) : (
      <Check size={14} className="progress-monitor__inflight-ok" />
    );
  }
  if (task.settled === "fail") {
    return showRing ? (
      <CircularCopyProgress
        done={task.bytesDone ?? 0}
        total={task.bytesTotal ?? 1}
        settled="fail"
      />
    ) : (
      <X size={14} className="progress-monitor__inflight-fail" />
    );
  }
  if (showRing) {
    return (
      <CircularCopyProgress done={task.bytesDone ?? 0} total={task.bytesTotal ?? 1} />
    );
  }
  return <Loader2 size={14} className="progress-monitor__inflight-spin" />;
}

function InFlightRow({
  task,
  pollSkewMs,
  cancelling,
  onCancel,
}: {
  task: WorkingOnRow;
  pollSkewMs: number;
  cancelling: boolean;
  onCancel?: (nodeId: string) => void;
}) {
  const [hot, setHot] = useState(false);
  const kind = inflightItemType(task);
  const live = task.settled == null;
  return (
    <li
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
    >
      {kind ? (
        <FileTypeIcon
          name={inflightBaseName(task.path) || task.path || "item"}
          type={kind}
          size={18}
          className="progress-monitor__inflight-icon"
        />
      ) : null}
      <span className="progress-monitor__inflight-path" title={task.path}>
        {task.path || task.nodeId || "…"}
      </span>
      <span className="progress-monitor__inflight-meta">
        {live ? (
          <span className="progress-monitor__inflight-elapsed">
            {formatLeaseElapsed(task.leaseAgeMs, pollSkewMs)}
          </span>
        ) : null}
        {live ? (
          <button
            type="button"
            className={
              hot
                ? "progress-monitor__inflight-glyph progress-monitor__inflight-glyph--hot"
                : "progress-monitor__inflight-glyph"
            }
            title="Cancel task"
            aria-label="Cancel task"
            disabled={cancelling}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel?.(task.nodeId);
            }}
          >
            <InFlightGlyph task={task} hot={hot || cancelling} />
          </button>
        ) : (
          <span className="progress-monitor__inflight-glyph" aria-hidden>
            <InFlightGlyph task={task} hot={false} />
          </span>
        )}
      </span>
    </li>
  );
}

function InFlightTaskList({
  activeTasks,
  settledTasks,
  pollSkewMs = 0,
  cancellingIds,
  onCancel,
}: {
  activeTasks?: InFlightTask[];
  settledTasks?: SettledInFlightTask[];
  pollSkewMs?: number;
  cancellingIds?: Set<string>;
  onCancel?: (nodeId: string) => void;
}) {
  const stackOrderRef = useRef<string[]>([]);
  const { rows, order } = mergeWorkingOnStack(
    activeTasks,
    settledTasks,
    stackOrderRef.current
  );
  stackOrderRef.current = order;
  if (rows.length === 0) {
    return <p className="progress-monitor__inflight-empty">Idle</p>;
  }
  return (
    <ul className="progress-monitor__inflight-list">
      {rows.map((t) => (
        <InFlightRow
          key={t.nodeId}
          task={t}
          pollSkewMs={pollSkewMs}
          cancelling={cancellingIds?.has(t.nodeId) ?? false}
          onCancel={onCancel}
        />
      ))}
    </ul>
  );
}

/** True when a queue-metrics side is more than a blank live-startup snapshot. */
function queueSideHasData(m?: QueueMetrics | null): boolean {
  if (!m) return false;
  return (
    queueMetricNumber(m.folders_discovered_total) > 0 ||
    queueMetricNumber(m.files_discovered_total) > 0 ||
    queueMetricNumber(m.total_discovered) > 0 ||
    queueMetricNumber(m.folders) > 0 ||
    queueMetricNumber(m.files) > 0 ||
    queueMetricNumber(m.items_completed) > 0 ||
    queueMetricNumber(m.items_total) > 0 ||
    queueMetricNumber(m.pending) > 0 ||
    queueMetricNumber(m.inProgress) > 0 ||
    queueMetricNumber(m.in_progress) > 0 ||
    (Array.isArray(m.activeTasks) && m.activeTasks.length > 0)
  );
}

function keepQueueSide(
  incoming: QueueMetrics | null | undefined,
  prev: QueueMetrics | null | undefined
): QueueMetrics | null {
  if (queueSideHasData(incoming)) return incoming ?? null;
  if (prev) {
    // Parked totals stay, but refresh the live lease snapshot when the API sends one.
    if (incoming && incoming.activeTasks !== undefined) {
      return {
        ...prev,
        activeTasks: incoming.activeTasks,
        recentlySettled: incoming.recentlySettled,
      };
    }
    return prev;
  }
  return incoming ?? null;
}

/** Folders/Files outcome grid: Ok | middle | Failed | Expected. */
function PhaseOutcomeGrid({
  metrics,
  middleLabel,
  middleTitle,
}: {
  metrics: {
    folders?: number;
    files?: number;
    folders_already_exists?: number;
    files_already_exists?: number;
    folders_failed?: number;
    files_failed?: number;
    folders_expected?: number;
    files_expected?: number;
  };
  middleLabel: string;
  middleTitle: string;
}) {
  return (
    <div className="progress-monitor__outcome-grid" role="table" aria-label="Phase outcome counts">
      <div className="progress-monitor__outcome-grid-row progress-monitor__outcome-grid-row--head" role="row">
        <span role="columnheader" />
        <span role="columnheader">Ok</span>
        <span role="columnheader" title={middleTitle}>
          {middleLabel}
        </span>
        <span role="columnheader">Failed</span>
        <span role="columnheader">Expected</span>
      </div>
      <div className="progress-monitor__outcome-grid-row" role="row">
        <span role="rowheader">Folders</span>
        <span role="cell">{metricCount(metrics.folders)}</span>
        <span role="cell">{metricCount(metrics.folders_already_exists)}</span>
        <span role="cell">{metricCount(metrics.folders_failed)}</span>
        <span role="cell">{metricCount(metrics.folders_expected)}</span>
      </div>
      <div className="progress-monitor__outcome-grid-row" role="row">
        <span role="rowheader">Files</span>
        <span role="cell">{metricCount(metrics.files)}</span>
        <span role="cell">{metricCount(metrics.files_already_exists)}</span>
        <span role="cell">{metricCount(metrics.files_failed)}</span>
        <span role="cell">{metricCount(metrics.files_expected)}</span>
      </div>
    </div>
  );
}

/** Stacked fill: ok (accent) → already exists (green) → failed (red). */
function StackedProgressTrack({
  okPercent,
  alreadyExistsPercent,
  failedPercent,
  totalPercent,
  ariaLabel,
}: {
  okPercent: number;
  alreadyExistsPercent: number;
  failedPercent: number;
  totalPercent: number;
  ariaLabel: string;
}) {
  const ok = clampProgressPercent(okPercent);
  const mid = clampProgressPercent(alreadyExistsPercent);
  const fail = clampProgressPercent(failedPercent);
  const total = clampProgressPercent(totalPercent);
  return (
    <div
      className="progress-monitor__progress-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(total)}
      aria-label={ariaLabel}
    >
      {ok > 0 && (
        <div
          className="progress-monitor__progress-fill progress-monitor__progress-fill--ok"
          style={{ left: 0, width: `${ok}%` }}
        />
      )}
      {mid > 0 && (
        <div
          className="progress-monitor__progress-fill progress-monitor__progress-fill--already-exists"
          style={{ left: `${ok}%`, width: `${mid}%` }}
          title="Already on the destination; counted without re-transfer"
        />
      )}
      {fail > 0 && (
        <div
          className="progress-monitor__progress-fill progress-monitor__progress-fill--failed"
          style={{ left: `${ok + mid}%`, width: `${fail}%` }}
        />
      )}
    </div>
  );
}

function ProgressSegmentLegend({
  middleLabel,
  middleTitle,
}: {
  middleLabel: string;
  middleTitle: string;
}) {
  return (
    <div className="progress-monitor__progress-legend" aria-label="Progress legend">
      <span className="progress-monitor__progress-legend-item">
        <span className="progress-monitor__progress-legend-swatch progress-monitor__progress-legend-swatch--ok" />
        Ok
      </span>
      <span className="progress-monitor__progress-legend-item" title={middleTitle}>
        <span className="progress-monitor__progress-legend-swatch progress-monitor__progress-legend-swatch--already-exists" />
        {middleLabel}
      </span>
      <span className="progress-monitor__progress-legend-item">
        <span className="progress-monitor__progress-legend-swatch progress-monitor__progress-legend-swatch--failed" />
        Failed
      </span>
    </div>
  );
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
      <span className="progress-monitor__rate-limit-wrap">
        <span
          className="progress-monitor__rate-limit"
          title={`Rate limited. Waiting about ${formatRateLimitCountdown(secs)}`}
        >
          Rate limited · {formatRateLimitCountdown(secs)}
        </span>
        <HelpTooltip tipId="progress-rate-limited" position="below" />
      </span>
    );
  }
  if (typeof interOpDelayMs === "number" && interOpDelayMs > 0) {
    const delaySecs = Math.max(1, Math.ceil(interOpDelayMs / 1000));
    return (
      <span className="progress-monitor__rate-limit-wrap">
        <span
          className="progress-monitor__rate-limit progress-monitor__rate-limit--pacing"
          title={`Throttle pacing: ${interOpDelayMs}ms inter-op delay`}
        >
          Pacing · {formatRateLimitCountdown(delaySecs)}
        </span>
        <HelpTooltip tipId="progress-pacing" position="below" />
      </span>
    );
  }
  return null;
}

/** Fill percent for the current discovery batch (0-100). */
function batchProgressPercent(m?: QueueMetrics | null, complete = false): number {
  if (complete) return 100;
  if (!m) return 0;
  const expected = m.round_expected ?? 0;
  if (expected <= 0) return 0;
  const completed = m.round_completed ?? 0;
  return Math.max(0, Math.min(100, (100 * completed) / expected));
}

function isDiscoveryQueueComplete(
  m?: QueueMetrics | null,
  discoveryPhaseDone = false
): boolean {
  if (discoveryPhaseDone) return true;
  return m?.state === "completed";
}

/** Left caption for discovery batch bar. No em dashes. */
function batchProgressCaption(
  m?: QueueMetrics | null,
  complete = false
): string {
  if (complete) return "Completed";
  if (!m) return "This batch: starting…";
  const expected = m.round_expected ?? 0;
  const completed = m.round_completed ?? 0;
  if (expected <= 0) {
    return "This batch: starting…";
  }
  return `This batch: ${completed.toLocaleString()} / ${expected.toLocaleString()}`;
}

function DiscoveryBatchProgressBar({
  metrics,
  complete = false,
  tone,
}: {
  metrics: QueueMetrics;
  complete?: boolean;
  tone: "source" | "destination";
}) {
  const done = isDiscoveryQueueComplete(metrics, complete);
  const pct = batchProgressPercent(metrics, done);
  const etaSeconds =
    typeof metrics.eta_seconds === "number" && Number.isFinite(metrics.eta_seconds)
      ? metrics.eta_seconds
      : null;
  const showEta =
    !done && metrics.eta_basis != null && metrics.eta_basis !== "";
  return (
    <div
      className={`progress-monitor__progress-bar-block progress-monitor__progress--${tone}${
        done ? " progress-monitor__progress--complete" : ""
      }`}
    >
      <div className="progress-monitor__progress-header">
        <span className="progress-monitor__progress-label">
          {batchProgressCaption(metrics, done)}
        </span>
        <div className="progress-monitor__progress-header-end">
          {showEta && (
            <span
              className="progress-monitor__progress-eta"
              title="Estimated time remaining for this batch"
            >
              ETA {formatEtaSeconds(etaSeconds)}
            </span>
          )}
          {done ? (
            <span
              className="progress-monitor__progress-complete-mark"
              aria-hidden="true"
            >
              ✓
            </span>
          ) : null}
          <span className="progress-monitor__progress-value">
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <div
        className="progress-monitor__progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={done ? "Discovery complete" : "Current batch progress"}
      >
        <div
          className="progress-monitor__progress-fill"
          style={{
            clipPath: `inset(0 ${100 - pct}% 0 0)`,
          }}
        />
      </div>
    </div>
  );
}

/** Format remaining duration for ETA display. */
function SizeFoldProgress({ metrics }: { metrics?: QueueMetrics | null }) {
  if (!metrics) return null;
  const done = metrics.items_completed ?? 0;
  const total = metrics.items_total ?? 0;
  const rate = metrics.items_per_second ?? 0;
  const eta =
    typeof metrics.eta_seconds === "number" && Number.isFinite(metrics.eta_seconds)
      ? metrics.eta_seconds
      : null;
  const depth = metrics.round;
  return (
    <p>
      Updating folder sizes
      {total > 0 ? `: ${done.toLocaleString()} / ${total.toLocaleString()} folders` : ""}
      {typeof depth === "number" ? ` (depth ${depth})` : ""}.
      {rate > 0 ? ` ${rate.toFixed(1)} folders/s.` : ""}
      {eta != null && eta > 0 ? ` ETA ${formatEtaSeconds(eta)}.` : ""}
    </p>
  );
}

function flattenMigrationLogs(logs: {
  trace?: MigrationLog[];
  debug?: MigrationLog[];
  info?: MigrationLog[];
  warning?: MigrationLog[];
  error?: MigrationLog[];
  critical?: MigrationLog[];
} | undefined): MigrationLog[] {
  if (!logs) return [];
  const out: MigrationLog[] = [];
  for (const level of LOG_LEVELS) {
    const arr = logs[level];
    if (Array.isArray(arr)) out.push(...arr);
  }
  out.sort((a, b) => {
    const ta = a.data?.timestamp ? Date.parse(a.data.timestamp) : 0;
    const tb = b.data?.timestamp ? Date.parse(b.data.timestamp) : 0;
    return ta - tb;
  });
  return out;
}

/** Stable key for rolling-window log dedupe (never use per-response index ids). */
function migrationLogKey(line: MigrationLog): string {
  const content = `${line.level}|${line.data?.timestamp ?? ""}|${line.data?.message ?? ""}`;
  // Index-only ids from older API responses are not stable across polls.
  if (line.id && !/^\d+$/.test(line.id)) return line.id;
  return content;
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

  const [status, setStatus] = useState<any>(null);
  const [queueMetrics, setQueueMetrics] = useState<any>(null);
  const [waitInstant, setWaitInstant] = useState<WaitBudgetInstant | null>(null);
  const waitBudgetPrevRef = useRef<AutoscalerWaitBudget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [migrationNotFound, setMigrationNotFound] = useState(false);
  const [allServices, setAllServices] = useState(services);
  const [showResultsButton, setShowResultsButton] = useState(false);
  const [confirmKind, setConfirmKind] = useState<null | "stop" | "resume" | "hardStop">(null);
  const [stopPopoverOpen, setStopPopoverOpen] = useState(false);
  const [stopProgress, setStopProgress] = useState<StopProgressPayload | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fsHealthIssues, setFsHealthIssues] = useState<CloudConnectionCheckResult[]>(
    []
  );
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [failureTooltipOpen, setFailureTooltipOpen] = useState(false);
  const [failureCopied, setFailureCopied] = useState(false);
  const [stallTooltipOpen, setStallTooltipOpen] = useState(false);
  /** Local tick so rate-limit countdowns update between 1s metrics polls. */
  const [, setRateLimitTick] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [inflightOpen, setInflightOpen] = useState(true);
  const [settledFlash, setSettledFlash] = useState<{
    source: SettledInFlightTask[];
    destination: SettledInFlightTask[];
  }>({ source: [], destination: [] });
  const settledFlashUntilRef = useRef<Map<string, number>>(new Map());
  const [metricsPollAt, setMetricsPollAt] = useState(0);
  const [elapsedTick, setElapsedTick] = useState(0);
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(() => new Set());
  const [logsOpen, setLogsOpen] = useState(false);
  const [logFilter, setLogFilter] = useState<LogLevel | "all">("all");
  const [logLines, setLogLines] = useState<MigrationLog[]>([]);
  const [logsPaused, setLogsPaused] = useState(false);
  const [workerCapDialogOpen, setWorkerCapDialogOpen] = useState(false);
  const [workerCapBusy, setWorkerCapBusy] = useState(false);
  const [workerCapError, setWorkerCapError] = useState<string | null>(null);
  const [workerCapDefaults, setWorkerCapDefaults] = useState<
    Partial<Record<WorkerCapMode, ModeWorkerCaps>>
  >({});
  const [workerCapModes, setWorkerCapModes] = useState<
    Partial<Record<WorkerCapMode, number>>
  >({});
  const logIdsRef = useRef<Set<string>>(new Set());
  const logTerminalRef = useRef<HTMLDivElement | null>(null);
  /** Auto-follow the log tail only while the user is at (or near) the bottom. */
  const logsStickToBottomRef = useRef(true);

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
    setMigrationNotFound(false);
    setError(null);
    setStatus(null);
    setQueueMetrics(null);
    setSettledFlash({ source: [], destination: [] });
    settledFlashUntilRef.current.clear();
    setCancellingIds(new Set());
  }, [migrationId]);

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
        phase === "delete-in-progress" ||
        phase === "traversal-finalizing" ||
        phase === "copy-finalizing" ||
        phase === "delete-finalizing"
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
      if (isMigrationNotFoundError(err)) {
        setMigrationNotFound(true);
        setError(
          "This migration is not loaded on the server. Resume an existing migration or start a new one."
        );
        return;
      }
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
      
      // Keep the last snapshot when a live run has not published metrics yet
      // (observer empty) so Resume does not flash zeros / "Not started".
      if (
        response.srcTraversal !== undefined ||
        response.dstTraversal !== undefined ||
        response.copy !== undefined ||
        response.delete !== undefined ||
        response.sizeFold !== undefined
      ) {
        const polledAt = Date.now();
        setMetricsPollAt(polledAt);
        setQueueMetrics((prev: {
          srcTraversal?: QueueMetrics | null;
          dstTraversal?: QueueMetrics | null;
          copy?: QueueMetrics | null;
          delete?: QueueMetrics | null;
          sizeFold?: QueueMetrics | null;
        } | null) => ({
          srcTraversal: keepQueueSide(response.srcTraversal, prev?.srcTraversal),
          dstTraversal: keepQueueSide(response.dstTraversal, prev?.dstTraversal),
          copy: keepQueueSide(response.copy, prev?.copy),
          delete: keepQueueSide(response.delete, prev?.delete),
          sizeFold: response.sizeFold ?? prev?.sizeFold ?? null,
          possibleStall: Boolean(response.possibleStall),
        }));
        const mergeFlash = (
          prev: SettledInFlightTask[],
          incoming: SettledInFlightTask[] | undefined
        ) => {
          const map = new Map<string, SettledInFlightTask>();
          for (const t of prev) {
            if (!t.nodeId) continue;
            const until = settledFlashUntilRef.current.get(t.nodeId);
            if (until != null && until > polledAt) map.set(t.nodeId, t);
          }
          for (const t of incoming ?? []) {
            if (!t.nodeId) continue;
            map.set(t.nodeId, t);
            settledFlashUntilRef.current.set(t.nodeId, polledAt + 1800);
          }
          return Array.from(map.values());
        };
        setSettledFlash((prev) => {
          if (showDeleteUI) {
            return {
              source: mergeFlash(prev.source, response.delete?.recentlySettled),
              destination: [],
            };
          }
          if (showCopyUI) {
            return {
              source: [],
              destination: mergeFlash(
                prev.destination,
                response.copy?.recentlySettled
              ),
            };
          }
          return {
            source: mergeFlash(
              prev.source,
              response.srcTraversal?.recentlySettled
            ),
            destination: mergeFlash(
              prev.destination,
              response.dstTraversal?.recentlySettled
            ),
          };
        });
      }
    } catch (err) {
      if (isMigrationNotFoundError(err)) {
        setMigrationNotFound(true);
        return;
      }
      // Only log actual network/HTTP errors
      console.error("Failed to fetch queue metrics:", err);
    }
  }, [migrationId, showCopyUI, showDeleteUI]);

  // Smooth elapsed + expire settled flash between metrics polls.
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedTick((n) => n + 1);
      const now = Date.now();
      setSettledFlash((prev) => {
        const keep = (list: SettledInFlightTask[]) =>
          list.filter((t) => {
            if (!t.nodeId) return false;
            const until = settledFlashUntilRef.current.get(t.nodeId);
            return until != null && until > now;
          });
        const source = keep(prev.source);
        const destination = keep(prev.destination);
        if (
          source.length === prev.source.length &&
          destination.length === prev.destination.length
        ) {
          return prev;
        }
        return { source, destination };
      });
    }, 250);
    return () => window.clearInterval(id);
  }, []);

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

  // Retry sweep: gate review like a fresh run (stale API may still say “review”).
  // Keep parked queue metrics until a live snapshot with real counts arrives.
  useEffect(() => {
    if (!isRetryRun) return;
    hasSeenActiveRunRef.current = false;
    prevPhaseRef.current = "";
    prevCompletedAtRef.current = undefined;
    setShowResultsButton(false);
  }, [migrationId, isRetryRun]);

  // One snapshot on load so a parked (suspended / review) page can render. Interval
  // polling starts once the phase looks like a run (including the async start window
  // before live/in-progress is visible). See shouldPollStatusAndMetrics.
  useEffect(() => {
    if (!migrationId) {
      navigate("/");
      return;
    }
    fetchStatus();
    fetchQueueMetrics();
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
  const discoveryPhaseDone = phase === "awaiting-traversal-review";
  const inAwaitingReview =
    phase === "awaiting-traversal-review" ||
    phase === "awaiting-copy-review" ||
    phase === "awaiting-delete-review";
  const inRunPhase =
    phase === "traversal-in-progress" ||
    phase === "copy-in-progress" ||
    phase === "delete-in-progress";
  const isFinalizing = status ? isMigrationFinalizing(status) : false;
  const isFinalizeFailed = status ? isMigrationFinalizeFailed(status) : false;
  const isSuspended = status ? isMigrationSuspended(status) : false;
  const isAborted = status ? isMigrationAborted(status) : false;
  const needsRecoverySweep = status
    ? isMigrationHardStoppedResumable(status)
    : false;
  const isFailed = status ? isMigrationFailed(status) : false;
  const explicitlyNotLive = status ? isLiveExplicitlyFalse(status) : false;
  const live = status ? isMigrationLive(status) : false;
  // Keep the screen awake only while a run is actively progressing, not once
  // results are ready (View results) or the migration is waiting in review.
  useScreenWakeLock(live && (inRunPhase || isFinalizing) && !showResultsButton);
  const stoppedMidRun = inRunPhase && !live;
  const showStopButton = Boolean(
    status &&
      !isFailed &&
      !isFinalizeFailed &&
      !isAborted &&
      !isSuspended &&
      !inAwaitingReview &&
      !isFinalizing &&
      (live || stopPopoverOpen)
  );
  const showResumeButton = Boolean(
    status &&
      !inAwaitingReview &&
      !isFinalizing &&
      (isFailed ||
        isFinalizeFailed ||
        isSuspended ||
        isAborted ||
        stoppedMidRun ||
        (inRunPhase && explicitlyNotLive))
  );

  const possibleStall = Boolean(
    status?.possibleStall ||
      (status as { PossibleStall?: boolean } | null)?.PossibleStall ||
      queueMetrics?.possibleStall
  );

  const phaseMetrics = showDeleteUI
    ? queueMetrics?.delete
    : showCopyUI
      ? queueMetrics?.copy
      : null;
  const itemsProgressPercent = clampProgressPercent(
    phaseMetrics?.items_progress_percent ?? phaseMetrics?.progress_percent
  );
  const bytesProgressPercent = clampProgressPercent(phaseMetrics?.bytes_progress_percent);
  const itemsOkPercent = clampProgressPercent(
    phaseMetrics?.items_ok_percent ??
      Math.max(
        0,
        itemsProgressPercent -
          clampProgressPercent(phaseMetrics?.items_already_exists_percent) -
          clampProgressPercent(phaseMetrics?.items_failed_percent)
      )
  );
  const itemsAlreadyExistsPercent = clampProgressPercent(
    phaseMetrics?.items_already_exists_percent
  );
  const itemsFailedPercent = clampProgressPercent(phaseMetrics?.items_failed_percent);
  const bytesOkPercent = clampProgressPercent(
    phaseMetrics?.bytes_ok_percent ??
      Math.max(
        0,
        bytesProgressPercent -
          clampProgressPercent(phaseMetrics?.bytes_already_exists_percent) -
          clampProgressPercent(phaseMetrics?.bytes_failed_percent)
      )
  );
  const bytesAlreadyExistsPercent = clampProgressPercent(
    phaseMetrics?.bytes_already_exists_percent
  );
  const bytesFailedPercent = clampProgressPercent(phaseMetrics?.bytes_failed_percent);
  const showPhaseProgressBar = showCopyUI || showDeleteUI;
  const phaseProgressComplete = itemsProgressPercent >= 100 && bytesProgressPercent >= 100;
  const itemsFractionLabel = `${(phaseMetrics?.items_completed ?? 0).toLocaleString()} / ${(phaseMetrics?.items_total ?? 0).toLocaleString()}`;
  const bytesDone = phaseMetrics?.bytes ?? 0;
  const bytesAlreadyExists = phaseMetrics?.bytes_already_exists ?? 0;
  const bytesFailed = phaseMetrics?.bytes_failed ?? 0;
  const bytesTotal = phaseMetrics?.bytes_total ?? 0;
  const dataFractionParts: string[] = [`${formatBytes(bytesDone)} moved`];
  if (bytesAlreadyExists > 0) {
    dataFractionParts.push(`${formatBytes(bytesAlreadyExists)} already exists`);
  }
  if (bytesFailed > 0) {
    dataFractionParts.push(`${formatBytes(bytesFailed)} failed`);
  }
  const dataFractionLabel =
    bytesAlreadyExists > 0 || bytesFailed > 0
      ? `${dataFractionParts.join(" · ")} / ${formatBytes(bytesTotal)}`
      : `${formatBytes(bytesDone)} / ${formatBytes(bytesTotal)}`;
  const progressMiddleLabel = showDeleteUI ? "Not deleting" : "Already exists";
  const progressMiddleTitle = showDeleteUI
    ? "Opted out of source removal during cleanup planning"
    : "Already on the destination; counted without re-transfer";
  const copyPass = phaseMetrics?.copy_pass ?? 0;
  const workerCapHighlightMode: WorkerCapMode = showDeleteUI
    ? "delete"
    : showCopyUI
      ? copyPass === 1
        ? "copy_folders"
        : "copy_files"
      : "traversal";
  const persistProviderId = String(
    status?.destinationRoot?.serviceId ||
      status?.destinationId ||
      status?.sourceRoot?.serviceId ||
      status?.sourceId ||
      "generic"
  );
  // Engine-owned ETA: UI only renders eta_seconds / eta_basis from queue-metrics.
  const etaSeconds =
    typeof phaseMetrics?.eta_seconds === "number" && Number.isFinite(phaseMetrics.eta_seconds)
      ? phaseMetrics.eta_seconds
      : null;
  const etaBasis = phaseMetrics?.eta_basis ?? "";
  const etaIsFolders =
    etaBasis === "items" &&
    ((showCopyUI && copyPass === 1) || (showDeleteUI && copyPass === 2));
  const etaLabel = etaIsFolders
    ? "ETA (folders)"
    : etaBasis === "bytes"
      ? "ETA (data)"
      : etaBasis === "items"
        ? "ETA (items)"
        : "ETA";
  const etaTitle =
    etaBasis === "bytes"
      ? "Estimated time remaining from engine byte transfer rate"
      : etaBasis === "items"
        ? etaIsFolders
          ? "Estimated time remaining from engine folder/item completion rate"
          : "Estimated time remaining from engine item completion rate"
        : "Estimated time remaining from the migration engine";

  const scrollLogTerminalToBottom = useCallback(() => {
    const el = logTerminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const syncLogsStickToBottom = useCallback(() => {
    const el = logTerminalRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    logsStickToBottomRef.current = distance <= 48;
  }, []);

  // Reset log buffer when switching migrations.
  useEffect(() => {
    setLogLines([]);
    logIdsRef.current = new Set();
    setLogsPaused(false);
    logsStickToBottomRef.current = true;
  }, [migrationId]);

  const toggleLogsPaused = useCallback(() => {
    setLogsPaused((paused) => !paused);
  }, []);

  // Only poll logs while a phase is actively running. Soft-stop, suspended/aborted,
  // failed, and awaiting-*-review (finished) should not keep hitting the logs API.
  const shouldPollLogs = Boolean(
    migrationId &&
      !migrationNotFound &&
      !logsPaused &&
      inRunPhase &&
      !explicitlyNotLive &&
      !stopPopoverOpen &&
      !isSuspended &&
      !isAborted &&
      !isFailed &&
      !inAwaitingReview &&
      !Boolean(
        status?.softSuspendRequested ||
          (status as { SoftSuspendRequested?: boolean } | null)?.SoftSuspendRequested
      )
  );

  // Buffer live logs whenever this page is mounted (rolling ~1K window, client-side
  // dedupe). Advanced UI only controls rendering / autoscroll, not polling.
  useEffect(() => {
    if (!shouldPollLogs || !migrationId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await getMigrationLogs(migrationId);
        if (cancelled || !res.success || !res.logs) return;
        const incoming = flattenMigrationLogs(res.logs);
        if (incoming.length === 0) return;
        setLogLines((prev) => {
          const ids = logIdsRef.current;
          const merged = [...prev];
          let added = 0;
          for (const line of incoming) {
            const id = migrationLogKey(line);
            if (ids.has(id)) continue;
            ids.add(id);
            merged.push({ ...line, id });
            added += 1;
          }
          if (added === 0) return prev;
          if (merged.length > MAX_LOG_LINES) {
            const drop = merged.length - MAX_LOG_LINES;
            for (let i = 0; i < drop; i++) {
              ids.delete(merged[i].id);
            }
            return merged.slice(drop);
          }
          return merged;
        });
      } catch {
        // Non-fatal: keep last snapshot.
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), LOG_POLL_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [migrationId, shouldPollLogs]);

  // Light autoscaler poll for the Working-on activity chip (independent of Advanced panel).
  // Diff cumulative wait totals so the chip tracks the current second, not EMA averages.
  useEffect(() => {
    if (!migrationId || !live || !inRunPhase) {
      waitBudgetPrevRef.current = null;
      setWaitInstant(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const view = await getMigrationAutoscaler(migrationId);
        if (cancelled) return;
        const next = view.snapshot?.waitBudget ?? null;
        const instant = waitBudgetInstantDelta(waitBudgetPrevRef.current, next);
        waitBudgetPrevRef.current = next;
        if (instant) setWaitInstant(instant);
      } catch {
        if (!cancelled) {
          waitBudgetPrevRef.current = null;
          setWaitInstant(null);
        }
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [migrationId, live, inRunPhase]);

  const filteredLogLines = useMemo(() => {
    if (logFilter === "all") return logLines;
    const minIx = LOG_LEVELS.indexOf(logFilter);
    if (minIx < 0) return logLines;
    return logLines.filter((l) => {
      const ix = LOG_LEVELS.indexOf(l.level);
      return ix >= minIx;
    });
  }, [logLines, logFilter]);

  const inflightSides = useMemo(() => {
    const take = (list?: InFlightTask[] | null, limit = 8) =>
      Array.isArray(list) ? list.slice(0, limit) : [];
    if (showDeleteUI) {
      return {
        source: take(queueMetrics?.delete?.activeTasks),
        destination: [] as InFlightTask[],
        sourceSettled: settledFlash.source,
        destinationSettled: [] as SettledInFlightTask[],
      };
    }
    if (showCopyUI) {
      return {
        source: [] as InFlightTask[],
        destination: take(queueMetrics?.copy?.activeTasks, 12),
        sourceSettled: [] as SettledInFlightTask[],
        destinationSettled: settledFlash.destination,
      };
    }
    return {
      source: take(queueMetrics?.srcTraversal?.activeTasks),
      destination: take(queueMetrics?.dstTraversal?.activeTasks),
      sourceSettled: settledFlash.source,
      destinationSettled: settledFlash.destination,
    };
  }, [queueMetrics, showCopyUI, showDeleteUI, settledFlash]);

  const inflightSourceCount =
    inflightSides.source.length + inflightSides.sourceSettled.length;
  const inflightDestinationCount =
    inflightSides.destination.length + inflightSides.destinationSettled.length;
  const inflightTaskCount = inflightSourceCount + inflightDestinationCount;

  const workingPhase = showDeleteUI
    ? "delete"
    : showCopyUI
      ? "copy"
      : "discovery";
  const workingOnLabel =
    workingPhase === "delete"
      ? "Deleting"
      : workingPhase === "copy"
        ? "Copying over the following"
        : "Looking inside of";
  const activityChip = useMemo(
    () =>
      workingOnActivityChip({
        instant: waitInstant,
        phase: workingPhase,
        activeTasks: [
          ...inflightSides.source,
          ...inflightSides.destination,
        ],
      }),
    [waitInstant, workingPhase, inflightSides.source, inflightSides.destination]
  );

  const pollSkewMs =
    metricsPollAt > 0 ? Math.max(0, Date.now() - metricsPollAt) : 0;
  void elapsedTick;

  const handleCancelInFlight = useCallback(
    async (nodeId: string) => {
      if (!migrationId || !nodeId) return;
      setCancellingIds((prev) => new Set(prev).add(nodeId));
      try {
        const res = await cancelMigrationInFlight(migrationId, nodeId);
        if (res.ok && res.result === "cancelled") {
          void fetchQueueMetrics();
          return;
        }
        const msg =
          res.message ||
          (res.result === "already_succeeded"
            ? "Task already completed"
            : res.result === "already_failed"
              ? "Task already failed"
              : "No longer in progress");
        setToast({ message: msg, type: "info" });
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : "Cancel failed",
          type: "error",
        });
      } finally {
        setCancellingIds((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }
    },
    [migrationId, fetchQueueMetrics]
  );

  // Follow the live tail only while the user is at the bottom. Layout effect so the
  // jump happens before paint (a post-paint scroll shows the old position for a frame).
  useLayoutEffect(() => {
    if (!logsOpen || logsPaused || !logsStickToBottomRef.current) return;
    scrollLogTerminalToBottom();
  }, [filteredLogLines, logsOpen, logsPaused, scrollLogTerminalToBottom]);

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
      const progress =
        next.stopProgress ??
        (next as { StopProgress?: StopProgressPayload }).StopProgress ??
        null;
      setStopProgress(progress);
      setStopPopoverOpen(true);
      setStallTooltipOpen(false);
      // Soft stop accepted: unlock Hard stop while we poll drain progress.
      setActionBusy(false);

      if (softSuspendRequestedPayload(next) || progress?.active) {
        const deadline = Date.now() + SOFT_SUSPEND_POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          const s = await getMigrationStatus(migrationId);
          setStatus(s);
          const p =
            s.stopProgress ??
            (s as { StopProgress?: StopProgressPayload }).StopProgress ??
            null;
          if (p) setStopProgress(p);
          if (
            (isMigrationSuspended(s) || isMigrationAborted(s)) &&
            !isMigrationLive(s)
          ) {
            setStopPopoverOpen(false);
            setStopProgress(null);
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

  const handleConfirmHardStop = async () => {
    if (!migrationId) return;
    setConfirmKind(null);
    setActionBusy(true);
    setActionError(null);
    try {
      const next = await forceStopMigration(migrationId);
      setStatus(next);
      setStopPopoverOpen(false);
      setStopProgress(null);
      // Drop status/metrics polls immediately (same as soft-suspend → suspended).
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      if (queueMetricsIntervalRef.current) {
        clearInterval(queueMetricsIntervalRef.current);
        queueMetricsIntervalRef.current = null;
      }
      setToast({
        message:
          "Hard-stopped without a clean checkpoint. Use Resume when ready; Sylos will run a recovery sweep.",
        type: "info",
      });
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to force-stop migration."
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
    setFsHealthIssues([]);
    try {
      const health = await probeMigrationFSHealth(migrationId, "both");
      if (!health.ok) {
        setFsHealthIssues(cloudIssuesFromFSHealth(health));
        setActionError(formatFSHealthFailure(health));
        return;
      }
      const result = await resumeMigration(migrationId);
      if (!result.success) {
        if (result.fsHealth) {
          setFsHealthIssues(cloudIssuesFromFSHealth(result.fsHealth));
          setActionError(formatFSHealthFailure(result.fsHealth));
        } else {
          setActionError(result.error || "Failed to resume migration.");
        }
        return;
      }
      const next = new URLSearchParams(searchParams);
      if (isFailed && !isSuspended) {
        next.set("retry", "1");
      } else {
        next.delete("retry");
      }
      if (!next.get("mode")) {
        next.set("mode", showDeleteUI ? "delete" : showCopyUI ? "copy" : "discovery");
      }
      setSearchParams(next, { replace: true });
      await fetchStatus();
      restartPollingIfStopped();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to resume migration."
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmRetryFinalize = async (overrides: {
    memoryLimitGB: number;
    threads: number;
  }) => {
    if (!migrationId) return;
    setConfirmKind(null);
    setActionBusy(true);
    setActionError(null);
    try {
      const result = await retryFinalize(migrationId, overrides);
      if (!result.success) {
        setActionError(result.error || "Failed to retry finalize.");
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.set("retry", "1");
      if (!next.get("mode")) {
        next.set("mode", showDeleteUI ? "delete" : showCopyUI ? "copy" : "discovery");
      }
      setSearchParams(next, { replace: true });
      await fetchStatus();
      restartPollingIfStopped();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to retry finalize."
      );
    } finally {
      setActionBusy(false);
    }
  };

  // Poll while work is moving. StartMigration returns before the engine is live, so
  // also poll through filters-set / starting. Omitted `live` still means in-progress
  // is moving; only an explicit live:false parks a dead in-progress page.
  const awaitingEngineStart =
    !migrationNotFound &&
    (!status ||
    phase === "starting" ||
    phase === "created" ||
    phase === "roots-set" ||
    phase === "filters-set");
  const shouldPollStatusAndMetrics =
    Boolean(migrationId) &&
    !migrationNotFound &&
    !showResultsButton &&
    !isSuspended &&
    !isAborted &&
    !isFailed &&
    !isFinalizeFailed &&
    (live ||
      isFinalizing ||
      stopPopoverOpen ||
      isRetryRun ||
      awaitingEngineStart ||
      (inRunPhase && !explicitlyNotLive));
  useEffect(() => {
    if (!shouldPollStatusAndMetrics) {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      if (queueMetricsIntervalRef.current) {
        clearInterval(queueMetricsIntervalRef.current);
        queueMetricsIntervalRef.current = null;
      }
      return;
    }
    fetchStatus();
    fetchQueueMetrics();
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
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      if (queueMetricsIntervalRef.current) {
        clearInterval(queueMetricsIntervalRef.current);
        queueMetricsIntervalRef.current = null;
      }
    };
  }, [shouldPollStatusAndMetrics, fetchStatus, fetchQueueMetrics]);

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
      <PageShell className="progress-monitor__content">
        <PageBackButton
          onClick={() => navigate("/choose")}
          title="Back to start or resume"
          className="progress-monitor__back"
        />
        <div className="progress-monitor__scroll">
        <header className="progress-monitor__header">
          <h1>
            {showDeleteUI ? (
              <>
                <span className="progress-monitor__highlight--magenta">Source</span>{" "}
                Removal <span className="progress-monitor__highlight">Progress</span>
              </>
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
        {migrationNotFound && (
          <div className="progress-monitor__error" role="status">
            <p>
              The browser restored an old progress-monitor link, but this migration
              is not loaded (for example after restarting Sylos).
            </p>
            <button
              type="button"
              className="progress-monitor__results-button"
              onClick={() => navigate("/resume")}
            >
              Go to Resume Migration
            </button>
          </div>
        )}
        {fsHealthIssues.length > 0 && (
          <CloudConnectionIssues issues={fsHealthIssues} returnTo={`/progress-monitor/${migrationId}`} />
        )}
        {actionError && (
          <div className="progress-monitor__error progress-monitor__error--action">
            {actionError}
          </div>
        )}
        {isFinalizing && (
          <div className="progress-monitor__finalize-status" role="status">
            <span className="progress-monitor__finalize-spinner" aria-hidden />
            <div>
              <strong>Finalizing database…</strong>
              <p>
                {(status?.dbActivity || status?.DbActivity || "").trim() ||
                  (queueMetrics?.sizeFold
                    ? "Calculating folder size totals."
                    : "Rebuilding indexes and checkpointing so review can open safely.")}
              </p>
              <SizeFoldProgress metrics={queueMetrics?.sizeFold} />
            </div>
          </div>
        )}
        {isFinalizeFailed && (
          <div className="progress-monitor__error" role="status">
            Database finalize failed after the queues finished. Use Resume to
            retry indexes and checkpoint with optional memory/thread overrides.
            {(status?.error && String(status.error).trim()) ? (
              <p className="progress-monitor__error-detail">
                {String(status.error).trim()}
              </p>
            ) : null}
          </div>
        )}

        {/* Metrics + live activity in one panel */}
        <div className="progress-monitor__panel">
          <div
            className={`progress-monitor__metrics${
              showDiscoveryUI ? " progress-monitor__metrics--discovery" : ""
            }`}
          >
            <div
              className={`progress-monitor__metric-card${
                showCopyUI || showDiscoveryUI
                  ? " progress-monitor__metric-card--split"
                  : ""
              }`}
            >
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
              ) : showDiscoveryUI ? (
                <div className="progress-monitor__metric-header-split">
                  <div className="progress-monitor__metric-header-half progress-monitor__metric-header-half--source">
                    <div className="progress-monitor__metric-header-top">
                      <div className="progress-monitor__metric-service">
                        {getServiceIcon(getSourceServiceType())}
                        <span>{source?.service?.displayName || status?.sourceId || "Unknown"}</span>
                        <RateLimitBadge
                          untilIso={queueMetrics?.srcTraversal?.rate_limited_until_src}
                          remainingMs={queueMetrics?.srcTraversal?.rate_limited_remaining_ms_src}
                          interOpDelayMs={queueMetrics?.srcTraversal?.inter_op_delay_ms}
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
                  </div>
                </div>
              ) : (
                // Delete: source header only
                <>
                  <div className="progress-monitor__metric-header">
                    <div className="progress-monitor__metric-service">
                      {getServiceIcon(getSourceServiceType())}
                      <span>{source?.service?.displayName || status?.sourceId || "Unknown"}</span>
                      <RateLimitBadge
                        untilIso={queueMetrics?.delete?.rate_limited_until_src}
                        remainingMs={queueMetrics?.delete?.rate_limited_remaining_ms_src}
                        interOpDelayMs={queueMetrics?.delete?.inter_op_delay_ms}
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
                    <PhaseOutcomeGrid
                      metrics={queueMetrics.copy}
                      middleLabel="Already exists"
                      middleTitle="Already on the destination; counted without re-transfer"
                    />
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
                    <div className="progress-monitor__metric-row">
                      <span>
                        Items/sec:
                        <HelpTooltip tipId="copy-items-per-sec-explanation" position="above" />
                      </span>
                      <span>{itemsPerSec(queueMetrics.copy).toFixed(1)}</span>
                    </div>
                    <div className="progress-monitor__metric-row">
                      <span>Bytes/sec:</span>
                      <span>{formatBytesPerSec(bytesPerSec(queueMetrics.copy))}</span>
                    </div>
                  </div>
                ) : (
                  <div className="progress-monitor__metric-empty">Not started</div>
                )
              ) : showDeleteUI ? (
                queueMetrics?.delete ? (
                  <div className="progress-monitor__metric-details">
                    <PhaseOutcomeGrid
                      metrics={queueMetrics.delete}
                      middleLabel="Not deleting"
                      middleTitle="Opted out of source removal during cleanup planning"
                    />
                    <div className="progress-monitor__metric-row">
                      <span>Items/sec:</span>
                      <span>{itemsPerSec(queueMetrics.delete).toFixed(1)}</span>
                    </div>
                    <div className="progress-monitor__metric-row">
                      <span>Bytes/sec:</span>
                      <span>{formatBytesPerSec(bytesPerSec(queueMetrics.delete))}</span>
                    </div>
                    {(queueMetrics.delete.total_pending ?? 0) > 0 && (
                      <div className="progress-monitor__metric-row">
                        <span>Pending:</span>
                        <span>{(queueMetrics.delete.total_pending || 0).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="progress-monitor__metric-empty">Not started</div>
                )
              ) : (
                // Traversal phase: side-by-side discovery metrics + batch bars
                <div className="progress-monitor__metric-details progress-monitor__metric-details--split">
                  <div className="progress-monitor__metric-pane">
                    {queueMetrics?.srcTraversal ? (
                      <>
                        <div className="progress-monitor__metric-row">
                          <span>
                            Items/sec:
                            <HelpTooltip tipId="discovery-rate-explanation" position="above" />
                          </span>
                          <span>{itemsPerSec(queueMetrics.srcTraversal).toFixed(1)}</span>
                        </div>
                        <div className="progress-monitor__metric-row">
                          <span>
                            Batch:
                            <HelpTooltip tipId="discovery-batch-explanation" position="above" />
                          </span>
                          <span>{(queueMetrics.srcTraversal.round ?? 0).toLocaleString()}</span>
                        </div>
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
                      </>
                    ) : (
                      <div className="progress-monitor__metric-empty">Not started</div>
                    )}
                    <div className="progress-monitor__metric-pane-progress">
                      {queueMetrics?.srcTraversal ? (
                        <DiscoveryBatchProgressBar
                          metrics={queueMetrics.srcTraversal}
                          complete={discoveryPhaseDone}
                          tone="source"
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="progress-monitor__metric-pane-gap" aria-hidden="true" />
                  <div className="progress-monitor__metric-pane">
                    {queueMetrics?.dstTraversal ? (
                      <>
                        <div className="progress-monitor__metric-row">
                          <span>
                            Items/sec:
                            <HelpTooltip tipId="discovery-rate-explanation-dst" position="above" />
                          </span>
                          <span>{itemsPerSec(queueMetrics.dstTraversal).toFixed(1)}</span>
                        </div>
                        <div className="progress-monitor__metric-row">
                          <span>
                            Batch:
                            <HelpTooltip tipId="discovery-batch-explanation-dst" position="above" />
                          </span>
                          <span>{(queueMetrics.dstTraversal.round ?? 0).toLocaleString()}</span>
                        </div>
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
                              <HelpTooltip tipId="destination-total-discovered-explanation" position="above" />
                            </span>
                            <span>{queueMetrics.dstTraversal.total_discovered.toLocaleString()}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="progress-monitor__metric-empty">Not started</div>
                    )}
                    <div className="progress-monitor__metric-pane-progress">
                      {queueMetrics?.dstTraversal ? (
                        <DiscoveryBatchProgressBar
                          metrics={queueMetrics.dstTraversal}
                          complete={discoveryPhaseDone}
                          tone="destination"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {showPhaseProgressBar && (
            <div
              className={
                phaseProgressComplete
                  ? "progress-monitor__progress progress-monitor__progress--complete"
                  : "progress-monitor__progress"
              }
            >
              <div className="progress-monitor__progress-stack">
                <div className="progress-monitor__progress-bar-block">
                  <div className="progress-monitor__progress-header">
                    <span className="progress-monitor__progress-label">
                      Items: {itemsFractionLabel}
                    </span>
                    <div className="progress-monitor__progress-header-end">
                      <span
                        className="progress-monitor__progress-eta"
                        title={etaTitle}
                      >
                        {etaLabel} {formatEtaSeconds(etaSeconds)}
                      </span>
                      {phaseProgressComplete && (
                        <span className="progress-monitor__progress-complete-mark" aria-hidden="true">
                          ✓
                        </span>
                      )}
                      <span className="progress-monitor__progress-value">
                        {Math.round(itemsProgressPercent)}%
                      </span>
                    </div>
                  </div>
                  <StackedProgressTrack
                    okPercent={itemsOkPercent}
                    alreadyExistsPercent={itemsAlreadyExistsPercent}
                    failedPercent={itemsFailedPercent}
                    totalPercent={itemsProgressPercent}
                    ariaLabel="Items progress"
                  />
                </div>
                <div className="progress-monitor__progress-bar-block">
                  <div className="progress-monitor__progress-header">
                    <span className="progress-monitor__progress-label">
                      Data: {dataFractionLabel}
                    </span>
                    <span className="progress-monitor__progress-value">
                      {Math.round(bytesProgressPercent)}%
                    </span>
                  </div>
                  <StackedProgressTrack
                    okPercent={bytesOkPercent}
                    alreadyExistsPercent={bytesAlreadyExistsPercent}
                    failedPercent={bytesFailedPercent}
                    totalPercent={bytesProgressPercent}
                    ariaLabel="Data progress"
                  />
                </div>
                <ProgressSegmentLegend
                  middleLabel={progressMiddleLabel}
                  middleTitle={progressMiddleTitle}
                />
              </div>
            </div>
          )}

          {(live || inflightTaskCount > 0) && inRunPhase && (
            <details
              className="progress-monitor__inflight"
              open={inflightOpen}
              onToggle={(e) => setInflightOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="progress-monitor__inflight-summary">
                {inflightOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {workingOnLabel}
                {activityChip ? (
                  <span
                    className={`progress-monitor__activity-chip progress-monitor__activity-chip--${activityChip.tone}`}
                    title={activityChip.detail}
                  >
                    {activityChip.label}
                  </span>
                ) : null}
              </summary>
              <div className="progress-monitor__inflight-body">
                {showDeleteUI ? (
                  <div className="progress-monitor__inflight-pane">
                    <div className="progress-monitor__inflight-pane-title progress-monitor__inflight-pane-title--source">
                      <span>Source</span>
                      {inflightSourceCount > 0 ? (
                        <span className="progress-monitor__inflight-count">
                          {inflightSourceCount}
                        </span>
                      ) : null}
                    </div>
                    <InFlightTaskList
                      activeTasks={inflightSides.source}
                      settledTasks={inflightSides.sourceSettled}
                      pollSkewMs={pollSkewMs}
                      cancellingIds={cancellingIds}
                      onCancel={handleCancelInFlight}
                    />
                  </div>
                ) : showCopyUI ||
                  (Array.isArray(queueMetrics?.copy?.activeTasks) &&
                    queueMetrics.copy.activeTasks.length > 0) ? (
                  <div className="progress-monitor__inflight-pane">
                    <div className="progress-monitor__inflight-pane-title">
                      <span>Active transfers</span>
                      {inflightDestinationCount > 0 ? (
                        <span className="progress-monitor__inflight-count">
                          {inflightDestinationCount}
                        </span>
                      ) : null}
                    </div>
                    <InFlightTaskList
                      activeTasks={
                        showCopyUI
                          ? inflightSides.destination
                          : queueMetrics?.copy?.activeTasks
                      }
                      settledTasks={
                        showCopyUI
                          ? inflightSides.destinationSettled
                          : settledFlash.destination
                      }
                      pollSkewMs={pollSkewMs}
                      cancellingIds={cancellingIds}
                      onCancel={handleCancelInFlight}
                    />
                  </div>
                ) : (
                  <div className="progress-monitor__inflight-split">
                    <div className="progress-monitor__inflight-pane">
                      <div className="progress-monitor__inflight-pane-title progress-monitor__inflight-pane-title--source">
                        <span>Source</span>
                        {inflightSourceCount > 0 ? (
                          <span className="progress-monitor__inflight-count">
                            {inflightSourceCount}
                          </span>
                        ) : null}
                      </div>
                      <InFlightTaskList
                        activeTasks={inflightSides.source}
                        settledTasks={inflightSides.sourceSettled}
                        pollSkewMs={pollSkewMs}
                        cancellingIds={cancellingIds}
                        onCancel={handleCancelInFlight}
                      />
                    </div>
                    <div className="progress-monitor__inflight-pane-gap" aria-hidden="true" />
                    <div className="progress-monitor__inflight-pane">
                      <div className="progress-monitor__inflight-pane-title progress-monitor__inflight-pane-title--destination">
                        <span>Destination</span>
                        {inflightDestinationCount > 0 ? (
                          <span className="progress-monitor__inflight-count">
                            {inflightDestinationCount}
                          </span>
                        ) : null}
                      </div>
                      <InFlightTaskList
                        activeTasks={inflightSides.destination}
                        settledTasks={inflightSides.destinationSettled}
                        pollSkewMs={pollSkewMs}
                        cancellingIds={cancellingIds}
                        onCancel={handleCancelInFlight}
                      />
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}

          <details
            className="progress-monitor__logs-panel"
            open={logsOpen}
            onToggle={(e) => setLogsOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="progress-monitor__logs-panel-summary">
              {logsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Live logs
            </summary>
            <div className="progress-monitor__logs-panel-body">
              <div className="progress-monitor__logs-toolbar">
                <label className="progress-monitor__logs-filter">
                  Level
                  <select
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value as LogLevel | "all")}
                  >
                    <option value="all">all</option>
                    {LOG_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="progress-monitor__logs-pause"
                  onClick={toggleLogsPaused}
                >
                  {logsPaused ? "Resume logs" : "Pause logs"}
                </button>
                <span className="progress-monitor__logs-count">
                  {filteredLogLines.length.toLocaleString()} lines
                </span>
              </div>
              <div
                ref={logTerminalRef}
                className="progress-monitor__logs-terminal"
                onScroll={syncLogsStickToBottom}
              >
                {filteredLogLines.length === 0 ? (
                  <div className="progress-monitor__logs-empty">
                    Waiting for log entries…
                  </div>
                ) : (
                  filteredLogLines.map((line) => (
                    <div
                      key={line.id}
                      className={`progress-monitor__log-line progress-monitor__log-line--${line.level}`}
                    >
                      <span className="progress-monitor__log-level">{line.level}</span>
                      <span className="progress-monitor__log-time">
                        {line.data?.timestamp
                          ? new Date(line.data.timestamp).toLocaleTimeString()
                          : ""}
                      </span>
                      <span className="progress-monitor__log-msg">
                        {line.data?.message ?? JSON.stringify(line.data)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </details>
        </div>

        <details
          className="progress-monitor__advanced"
          open={advancedOpen}
          onToggle={(e) => {
            // Nested subsection <details> also fire toggle (bubbles); only sync the outer.
            if (e.target !== e.currentTarget) return;
            setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open);
          }}
        >
          <summary className="progress-monitor__advanced-summary">
            {advancedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Advanced info
          </summary>
          <div className="progress-monitor__advanced-body">
            {migrationId ? (
              <details className="progress-monitor__subsection" open>
                <summary className="progress-monitor__subsection-summary">
                  <span className="progress-monitor__subsection-title progress-monitor__subsection-title--with-tip">
                    Autoscaler
                    <span
                      className="progress-monitor__subsection-tip"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      <HelpTooltip tipId="autoscaler-overview" position="above" />
                    </span>
                  </span>
                </summary>
                <div className="progress-monitor__subsection-body">
                  <AutoscalerPanel
                    migrationId={migrationId}
                    enabled={advancedOpen}
                  />
                </div>
              </details>
            ) : null}
            <details className="progress-monitor__subsection">
              <summary className="progress-monitor__subsection-summary">
                <span className="progress-monitor__subsection-title">Workers</span>
              </summary>
              <div className="progress-monitor__subsection-body">
                <div className="progress-monitor__worker-caps">
                  <div className="progress-monitor__workers-row">
                    <span className="progress-monitor__workers-label">Workers:</span>
                    <span className="progress-monitor__workers-value">
                      {(
                        (showDeleteUI
                          ? queueMetrics?.delete?.workers
                          : showCopyUI
                            ? queueMetrics?.copy?.workers
                            : queueMetrics?.srcTraversal?.workers) ?? 0
                      ).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      className="progress-monitor__workers-edit"
                      disabled={workerCapBusy || !migrationId}
                      title="Override worker limits"
                      aria-label="Override worker limits"
                      onClick={async () => {
                        if (!migrationId) return;
                        setWorkerCapError(null);
                        try {
                          setWorkerCapBusy(true);
                          const [defaultsMap, scaling] = await Promise.all([
                            fetchScalingDefaults(),
                            getMigrationScaling(migrationId),
                          ]);
                          const providerDefaults =
                            (defaultsMap[persistProviderId] as ProviderWorkerCaps | undefined) ||
                            defaultsMap.generic ||
                            defaultsMap.local;
                          setWorkerCapDefaults(providerDefaults?.modes || {});
                          setWorkerCapModes(scaling.modes || {});
                          setWorkerCapDialogOpen(true);
                        } catch (err) {
                          setWorkerCapError(
                            err instanceof Error
                              ? err.message
                              : "Failed to load worker limits"
                          );
                        } finally {
                          setWorkerCapBusy(false);
                        }
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                  {workerCapError && !workerCapDialogOpen ? (
                    <p className="progress-monitor__worker-caps-error">{workerCapError}</p>
                  ) : null}
                </div>
              </div>
            </details>
          </div>
        </details>

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
                {stopPopoverOpen ? (
                  <StopProgressPopover
                    progress={stopProgress}
                    busy={false}
                    onHardStop={() => setConfirmKind("hardStop")}
                    onDismiss={() => setStopPopoverOpen(false)}
                  />
                ) : null}
                <button
                  type="button"
                  className="progress-monitor__control progress-monitor__control--stop"
                  disabled={actionBusy || stopPopoverOpen}
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
                    isFinalizeFailed
                      ? "Retry database finalize (indexes and checkpoint)"
                      : isFailed
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
              className="action-button action-button--primary progress-monitor__see-results"
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


        {workerCapDialogOpen && (
          <WorkerCapOverridesDialog
            title="Override worker hard caps"
            defaults={workerCapDefaults}
            initialModes={workerCapModes}
            highlightMode={workerCapHighlightMode}
            busy={workerCapBusy}
            error={workerCapError}
            showPersist
            onClose={() => {
              setWorkerCapDialogOpen(false);
              setWorkerCapError(null);
            }}
            onApply={async (modes) => {
              if (!migrationId) return;
              try {
                setWorkerCapBusy(true);
                setWorkerCapError(null);
                const view = await putMigrationScaling(migrationId, { modes });
                setWorkerCapModes(view.modes || {});
                setToast({ message: "Worker limits applied to this migration.", type: "success" });
                setWorkerCapDialogOpen(false);
              } catch (err) {
                setWorkerCapError(err instanceof Error ? err.message : "Apply failed");
              } finally {
                setWorkerCapBusy(false);
              }
            }}
            onPersist={async (modes) => {
              if (!migrationId) return;
              try {
                setWorkerCapBusy(true);
                setWorkerCapError(null);
                const view = await putMigrationScaling(migrationId, {
                  modes,
                  persist: true,
                  persistTarget: "provider",
                  persistKey: persistProviderId,
                });
                setWorkerCapModes(view.modes || {});
                setToast({
                  message: `Saved as default for ${persistProviderId} and applied live.`,
                  type: "success",
                });
                setWorkerCapDialogOpen(false);
              } catch (err) {
                setWorkerCapError(err instanceof Error ? err.message : "Save failed");
              } finally {
                setWorkerCapBusy(false);
              }
            }}
            onResetAll={async () => {
              if (!migrationId) return;
              try {
                setWorkerCapBusy(true);
                setWorkerCapError(null);
                await putMigrationScaling(migrationId, { modes: {} });
                try {
                  await deleteProviderScalingOverrides(persistProviderId);
                } catch {
                  // Session clear still succeeded; persisted default may not exist.
                }
                setWorkerCapModes({});
                setToast({ message: "Worker limits reset to shipped defaults.", type: "info" });
                setWorkerCapDialogOpen(false);
              } catch (err) {
                setWorkerCapError(err instanceof Error ? err.message : "Reset failed");
              } finally {
                setWorkerCapBusy(false);
              }
            }}
          />
        )}

        {confirmKind === "stop" && (
          <ConfirmDialog
            title="Stop migration?"
            message="This pauses the running migration safely and saves progress so you can resume later. Continue?"
            confirmLabel="Stop migration"
            cancelLabel="Cancel"
            confirmTone="danger"
            onCancel={() => setConfirmKind(null)}
            onConfirm={() => void handleConfirmStop()}
          />
        )}
        {confirmKind === "hardStop" && (
          <ConfirmDialog
            title="Hard stop migration?"
            message="Not recommended. Hard stop skips a clean checkpoint. Prefer soft stop unless it is stuck. You can still Resume later; Sylos will run a recovery sweep and may re-check or redo some work. Continue?"
            confirmLabel="Hard stop"
            cancelLabel="Cancel"
            confirmTone="danger"
            onCancel={() => setConfirmKind(null)}
            onConfirm={() => void handleConfirmHardStop()}
          />
        )}
        {confirmKind === "resume" && isFinalizeFailed && (
          <FinalizeRetryDialog
            errorMessage={
              (status?.error && String(status.error).trim()) || null
            }
            busy={actionBusy}
            onCancel={() => setConfirmKind(null)}
            onConfirm={(overrides) => void handleConfirmRetryFinalize(overrides)}
          />
        )}
        {confirmKind === "resume" && !isFinalizeFailed && (
          <ConfirmDialog
            title="Resume migration?"
            message={
              needsRecoverySweep
                ? "This migration was interrupted without a clean checkpoint. Resume runs a recovery sweep first (it may re-check or redo some work), then continues. Continue?"
                : showDeleteUI
                ? "This resumes source removal from where it stopped. It can use significant resources and run for a long time. Continue?"
                : showCopyUI
                ? "This resumes the copy phase from where it stopped. It can use significant resources and run for a long time. Continue?"
                : isSuspended || stoppedMidRun
                ? "This resumes discovery from where it stopped. Continue?"
                : "This starts a discovery retry sweep to continue traversal. It can use significant resources and run for a long time. Continue?"
            }
            confirmLabel="Resume"
            cancelLabel="Cancel"
            onCancel={() => setConfirmKind(null)}
            onConfirm={() => void handleConfirmResume()}
          />
        )}
        </div>
      </PageShell>
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

