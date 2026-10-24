import { Folder } from "./services";

// Root object format for API requests (camelCase, id = ServiceID)
export interface MigrationRootRequestRoot {
  id: string;              // Service's native identifier (e.g., "C:\\Program Files (x86)") - this is the ServiceID value
  parentId?: string;
  parentPath?: string;
  displayName?: string;
  locationPath?: string;
  lastUpdated?: string;
  depthLevel?: number;
  type?: string;
}

export interface MigrationRootChild {
  id: string;
  name: string;
  type: string;
  size?: number;
  mtime?: string;
  excluded?: boolean;
  dstOnly?: boolean;
  children?: MigrationRootChild[];
  includeOnly?: string[];
}

export interface MigrationRootRequest {
  migrationId?: string;
  role: "source" | "destination";
  serviceId?: string;       // Service identifier (e.g., "local")
  connectionId?: string;
  root: MigrationRootRequestRoot;
  config?: any;  // Can be SpectraConfig or other config types
  /** Immediate children from root-pick review (no DuckDB write until Start). */
  children?: MigrationRootChild[];
  /** Source-only; ids not in children are ignored. */
  excludedIds?: string[];
}

export interface MigrationRootResponse {
  migrationId: string;
  ready: boolean;
  rootSummary?: {
    srcRoots?: number;
    dstRoots?: number;
  };
  sourceConnectionId?: string;
  destinationConnectionId?: string;
  sourceRootPrepared?: boolean;
  destinationRootPrepared?: boolean;
}

export interface StartMigrationPayload {
  migrationId: string;
  options?: {
    databasePath?: string;
    sourceConnectionId?: string;
    destinationConnectionId?: string;
    workerCount?: number;
    maxRetries?: number;
    coordinatorLead?: number;
    logAddress?: string;
    logLevel?: string;
    enableLoggingTerminal?: boolean;
    /** Destination name rules: "none" | "auto" | provider id (e.g. "windows") */
    pathCheckTarget?: string;
    /** Soft-cloud Windows desktop-sync overlays (Dropbox/Box/Egnyte/ShareFile). */
    windowsCompat?: boolean;
  };
}

export interface MigrationResponse {
  id: string;
  name?: string;
  sourceId: string;
  destinationId: string;
  startedAt: string;
  status: string;
  error?: string;
}

/** Persisted source/destination root, used to rehydrate setup without sessionStorage. */
export interface RootInfo {
  serviceId: string;
  serviceName?: string;
  serviceType?: string;
  connectionId?: string;
  name?: string;
  locationPath?: string;
  nativePath?: string;
  type?: string;
  /** Cloud drive/namespace id (Folder.parentId); used for storage quota. */
  parentId?: string;
}

/** Lifecycle phases (lowercase-with-hyphens). */
export type MigrationPhase =
  | "roots-set"
  | "filters-set"
  | "traversal-in-progress"
  | "traversal-suspended"
  | "traversal-finalizing"
  | "traversal-finalize-failed"
  | "awaiting-traversal-review"
  | "copy-in-progress"
  | "copy-suspended"
  | "copy-finalizing"
  | "copy-finalize-failed"
  | "awaiting-copy-review"
  | "delete-in-progress"
  | "delete-suspended"
  | "delete-finalizing"
  | "delete-finalize-failed"
  | "awaiting-delete-review"
  | "aborted"
  | "failed";

/** User-facing label for a lifecycle phase / status string. */
export function formatMigrationPhaseLabel(
  phaseOrStatus: string | undefined | null
): string {
  const phase = normalizeMigrationPhase(phaseOrStatus ?? "");
  switch (phase) {
    case "roots-set":
      return "Roots selected";
    case "roots-partial":
      return "Roots incomplete";
    case "filters-set":
      return "Filters set";
    case "traversal-in-progress":
      return "Discovering";
    case "traversal-suspended":
      return "Discovery paused";
    case "traversal-finalizing":
      return "Finishing discovery";
    case "traversal-finalize-failed":
      return "Discovery finalize failed";
    case "awaiting-traversal-review":
      return "Ready to review discovery";
    case "copy-in-progress":
      return "Copying";
    case "copy-suspended":
      return "Copy paused";
    case "copy-finalizing":
      return "Finishing copy";
    case "copy-finalize-failed":
      return "Copy finalize failed";
    case "awaiting-copy-review":
      return "Ready to review copy plan";
    case "delete-in-progress":
      return "Removing from source";
    case "delete-suspended":
      return "Removal paused";
    case "delete-finalizing":
      return "Finishing removal";
    case "delete-finalize-failed":
      return "Removal finalize failed";
    case "awaiting-delete-review":
      return "Ready to review removal";
    case "aborted":
      return "Aborted";
    case "failed":
      return "Failed";
    case "":
      return "";
    default:
      return phase
        .split("-")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}

/** CSS tone bucket for resume-list status chips. */
export function migrationPhaseTone(
  phaseOrStatus: string | undefined | null
): "running" | "suspended" | "awaiting" | "failed" | "completed" {
  const phase = normalizeMigrationPhase(phaseOrStatus ?? "");
  if (phase === "failed" || phase.endsWith("-finalize-failed") || phase === "aborted") {
    return "failed";
  }
  if (phase.endsWith("-in-progress") || phase.endsWith("-finalizing")) {
    return "running";
  }
  if (phase.endsWith("-suspended")) {
    return "suspended";
  }
  if (phase.startsWith("awaiting-")) {
    return "awaiting";
  }
  if (phase === "roots-set" || phase === "filters-set") {
    return "completed";
  }
  return "awaiting";
}

/** Normalize phase string for comparison: trim, lowercase, spaces to hyphens. */
export function normalizeMigrationPhase(value: string | undefined): string {
  if (!value || typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Current phase from migration details (phase or status field). */
export function getMigrationPhase(
  response: { phase?: string; status?: string } | null | undefined
): string {
  if (!response) return "";
  const raw = response.phase ?? response.status ?? "";
  return normalizeMigrationPhase(raw);
}

/** True when migration is in traversal (discovery) review step. */
export function isTraversalReviewPhase(
  response: { phase?: string; status?: string } | null | undefined
): boolean {
  return getMigrationPhase(response) === "awaiting-traversal-review";
}

/** True when migration is in copy phase (copy running, suspended mid-copy, or copy review). */
export function isCopyReviewPhase(
  response: { phase?: string; status?: string } | null | undefined
): boolean {
  const phase = getMigrationPhase(response);
  return (
    phase === "copy-in-progress" ||
    phase === "copy-suspended" ||
    phase === "awaiting-copy-review"
  );
}

/** True when migration is in delete phase family. */
export function isDeleteReviewPhase(
  response: { phase?: string; status?: string } | null | undefined
): boolean {
  const phase = getMigrationPhase(response);
  return (
    phase === "delete-in-progress" ||
    phase === "delete-suspended" ||
    phase === "awaiting-delete-review"
  );
}

/** True when a run is active (traversal, copy, or retry in progress). Use for "in progress" UX. */
export function isMigrationLive(response: { live?: boolean; Live?: boolean } | null | undefined): boolean {
  if (!response) return false;
  return (response as { live?: boolean; Live?: boolean }).live === true || (response as { live?: boolean; Live?: boolean }).Live === true;
}

/** Soft suspend complete: engine phase is *-suspended (not generic `suspended`). */
export function isMigrationSoftSuspendedPhase(phase: string): boolean {
  return (
    phase === "traversal-suspended" ||
    phase === "copy-suspended" ||
    phase === "delete-suspended"
  );
}

/** True when migration is paused after soft suspend (UI resumes via retry sweep, not phase change). */
export function isMigrationSuspended(
  response: { phase?: string; status?: string } | null | undefined
): boolean {
  if (!response) return false;
  return isMigrationSoftSuspendedPhase(getMigrationPhase(response));
}

/** Force-aborted: not resumable. */
export function isMigrationAborted(
  response: { phase?: string; status?: string } | null | undefined
): boolean {
  if (!response) return false;
  return getMigrationPhase(response) === "aborted";
}

export interface StopStepPayload {
  id: string;
  label: string;
  status: string;
}

export interface StopProgressPayload {
  active?: boolean;
  mode?: string;
  step?: string;
  label?: string;
  detail?: string;
  inProgress?: number;
  steps?: StopStepPayload[];
}

/** Soft-suspend / generic terminal failure (not durable-teardown finalize-failed). */
export function isMigrationFailed(
  response: { phase?: string; status?: string } | null | undefined
): boolean {
  if (!response) return false;
  return getMigrationPhase(response) === "failed";
}

/** True while seal stop / index rebuild / checkpoint is running after queues finish. */
export function isMigrationFinalizingPhase(phase: string): boolean {
  return (
    phase === "traversal-finalizing" ||
    phase === "copy-finalizing" ||
    phase === "delete-finalizing"
  );
}

export function isMigrationFinalizing(
  response: { phase?: string; status?: string } | null | undefined
): boolean {
  if (!response) return false;
  return isMigrationFinalizingPhase(getMigrationPhase(response));
}

/** Durable teardown failed; retry via retry-finalize (not worker resume). */
export function isMigrationFinalizeFailedPhase(phase: string): boolean {
  return (
    phase === "traversal-finalize-failed" ||
    phase === "copy-finalize-failed" ||
    phase === "delete-finalize-failed"
  );
}

export function isMigrationFinalizeFailed(
  response: { phase?: string; status?: string } | null | undefined
): boolean {
  if (!response) return false;
  return isMigrationFinalizeFailedPhase(getMigrationPhase(response));
}

export interface MigrationDBFile {
  filename: string;
  path: string;
  size: number;
  modifiedAt: string;
}

export interface MigrationUploadResponse {
  success: boolean;
  path?: string;
  error?: string;
}

export interface MigrationStatusResponse extends MigrationResponse {
  phase?: string;
  live?: boolean;
  completedAt?: string | null;
  sourceRoot?: RootInfo;
  destinationRoot?: RootInfo;
  sourceRootPrepared?: boolean;
  destinationRootPrepared?: boolean;
  /** Included source root child names (for destination basename matching). */
  sourceRootChildNames?: string[];
  sourceRootChildren?: MigrationRootChild[];
  /** Stop API: engine accepted soft suspend; poll until phase is *-suspended and not live. */
  softSuspendRequested?: boolean;
  SoftSuspendRequested?: boolean;
  stopped?: boolean;
  Stopped?: boolean;
  /** Live soft/force stop checklist from the engine. */
  stopProgress?: StopProgressPayload;
  StopProgress?: StopProgressPayload;
  /** Stop API: migration was not in a stoppable live phase. */
  alreadyStopped?: boolean;
  AlreadyStopped?: boolean;
  /** Stop API: false when migration was already stopped. */
  success?: boolean;
  Success?: boolean;
  /** True when a queue watchdog recently detected no progress while the migration was live. */
  possibleStall?: boolean;
  PossibleStall?: boolean;
  /** Human-readable DuckDB wait label (index rebuild, checkpoint, etc.). */
  dbActivity?: string;
  DbActivity?: string;
  result?: {
    rootSummary?: {
      srcRoots?: number;
      dstRoots?: number;
    };
    runtime?: {
      duration?: string;
      src?: {
        name?: string;
        round?: number;
        pending?: number;
        inProgress?: number;
        totalTracked?: number;
        workers?: number;
      };
      dst?: {
        name?: string;
        round?: number;
        pending?: number;
        inProgress?: number;
        totalTracked?: number;
        workers?: number;
      };
    };
    verification?: {
      srcTotal?: number;
      dstTotal?: number;
      srcPending?: number;
      dstPending?: number;
      srcFailed?: number;
      dstFailed?: number;
      dstNotOnSrc?: number;
    };
  };
}

export interface MigrationInspectResponse {
  srcTotal: number;
  dstTotal: number;
  srcPending: number;
  dstPending: number;
  srcFailed: number;
  dstFailed: number;
  minPendingDepthSrc: number;
  minPendingDepthDst: number;
}

export interface MigrationMetadata {
  id: string;
  name: string;
  configPath: string;
  createdAt: string;
}

export interface MigrationWithStatus extends MigrationMetadata {
  status?: string;
  phase?: string;
  live?: boolean;
  sourceId?: string;
  destinationId?: string;
  startedAt?: string;
  completedAt?: string | null;
  error?: string;
  result?: MigrationStatusResponse["result"];
}

export interface ListMigrationsResponse {
  migrations: Array<{
    id: string;
    name?: string;
    sourceId: string;
    destinationId: string;
    startedAt: string;
    status: string;
    phase?: string;
    live?: boolean;
    completedAt: string | null;
    error: string;
    result?: MigrationStatusResponse["result"];
    sourceRoot?: RootInfo;
    destinationRoot?: RootInfo;
  }>;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  capabilities?: {
    cleanSlate?: boolean;
  };
}

export type LogLevel = "trace" | "debug" | "info" | "warning" | "error" | "critical";

export interface MigrationLog {
  id: string;
  level: LogLevel;
  data: {
    message?: string;
    timestamp?: string;
    [key: string]: any;
  };
}

export interface MigrationLogsRequest {
  lastSeenIds?: {
    trace?: string;
    debug?: string;
    info?: string;
    warning?: string;
    error?: string;
    critical?: string;
  };
}

export interface MigrationLogsResponse {
  success: boolean;
  errorCode?: string;
  error?: string;
  logs?: {
    trace: MigrationLog[];
    debug: MigrationLog[];
    info: MigrationLog[];
    warning: MigrationLog[];
    error: MigrationLog[];
    critical: MigrationLog[];
  };
}

export interface QueueMetrics {
  name: string;
  round: number;
  pending: number;
  inProgress: number;
  /** Snake_case from API ExternalQueueMetrics JSON. */
  in_progress?: number;
  totalTracked?: number;
  workers: number;
  /** Queue lifecycle: running | paused | stopped | waiting | completed. */
  state?: string;
  // Traversal phase fields
  files_discovered_total?: number;
  folders_discovered_total?: number;
  discovery_rate_items_per_sec?: number;
  total_discovered?: number;
  // Copy phase fields
  folders?: number;
  files?: number;
  total?: number;
  items_per_second?: number;
  total_pending?: number;
  bytes?: number;
  bytes_per_second?: number;
  bytes_copied_total?: number;
  total_bytes_copied?: number;
  /** Already on destination (copy) or not deleting (delete). */
  folders_already_exists?: number;
  files_already_exists?: number;
  bytes_already_exists?: number;
  /** Permanent failures after seal accept. */
  folders_failed?: number;
  files_failed?: number;
  /** Fixed migration-wide eligible file size (copy/delete Data bar denominator). */
  bytes_total?: number;
  /** Permanently failed eligible file bytes (touched, not transferred). */
  bytes_failed?: number;
  /** Segment shares of items bar 0–100. */
  items_ok_percent?: number;
  items_already_exists_percent?: number;
  /** Failed share of items bar 0–100 (painted red at start). */
  items_failed_percent?: number;
  /** Segment shares of bytes bar 0–100. */
  bytes_ok_percent?: number;
  bytes_already_exists_percent?: number;
  /** Failed share of bytes bar 0–100 (painted red at start). */
  bytes_failed_percent?: number;
  bytes_per_sec?: number;
  copy_rate_bytes_per_sec?: number;
  bytes_copied_per_sec?: number;
  possible_stall?: boolean;
  /** Engine-computed copy/delete items progress 0–100 (alias of items_progress_percent). */
  progress_percent?: number;
  items_completed?: number;
  items_total?: number;
  items_progress_percent?: number;
  bytes_progress_percent?: number;
  folders_expected?: number;
  files_expected?: number;
  total_expected?: number;
  /** Current round expected/completed (console progress counters). */
  round_expected?: number;
  round_completed?: number;
  /** Copy pass: 1=folders, 2=files. */
  copy_pass?: number;
  /** Active FS rate-limit window end (RFC3339) for source adapter. */
  rate_limited_until_src?: string;
  /** Active FS rate-limit window end (RFC3339) for destination adapter. */
  rate_limited_until_dst?: string;
  /** Remaining ms for source rate-limit at poll time. */
  rate_limited_remaining_ms_src?: number;
  /** Remaining ms for destination rate-limit at poll time. */
  rate_limited_remaining_ms_dst?: number;
  /** AIMD inter-op pacing delay in ms (workers slowed after throttle). */
  inter_op_delay_ms?: number;
  /** Engine-owned remaining seconds (0 = done). */
  eta_seconds?: number;
  /** Which clock the engine used: "items" | "bytes". */
  eta_basis?: string;
}

export interface MigrationQueueMetricsResponse {
  success: boolean;
  errorCode?: string;
  error?: string;
  srcTraversal?: QueueMetrics | null;
  dstTraversal?: QueueMetrics | null;
  copy?: QueueMetrics | null;
  delete?: QueueMetrics | null;
  sizeFold?: QueueMetrics | null;
  possibleStall?: boolean;
}

