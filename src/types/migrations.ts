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

export interface MigrationRootRequest {
  migrationId?: string;
  role: "source" | "destination";
  serviceId?: string;       // Service identifier (e.g., "local")
  connectionId?: string;
  root: MigrationRootRequestRoot;
  config?: any;  // Can be SpectraConfig or other config types
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
}

/** Lifecycle phases (lowercase-with-hyphens). */
export type MigrationPhase =
  | "roots-set"
  | "filters-set"
  | "traversal-in-progress"
  | "traversal-suspended"
  | "awaiting-traversal-review"
  | "copy-in-progress"
  | "copy-suspended"
  | "awaiting-copy-review"
  | "delete-in-progress"
  | "delete-suspended"
  | "awaiting-delete-review"
  | "failed";

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

/** Soft suspend complete: engine phase is traversal- or copy-suspended (not generic `suspended`). */
export function isMigrationSoftSuspendedPhase(phase: string): boolean {
  return phase === "traversal-suspended" || phase === "copy-suspended";
}

/** True when migration is paused after soft suspend (UI resumes via retry sweep, not phase change). */
export function isMigrationSuspended(
  response: { phase?: string; status?: string } | null | undefined
): boolean {
  if (!response) return false;
  return isMigrationSoftSuspendedPhase(getMigrationPhase(response));
}

/** Terminal failure from status/phase (e.g. soft suspend checkpoint error). */
export function isMigrationFailed(
  response: { phase?: string; status?: string } | null | undefined
): boolean {
  if (!response) return false;
  return getMigrationPhase(response) === "failed";
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
  /** Stop API: engine accepted soft suspend; poll until phase is *-suspended and not live. */
  softSuspendRequested?: boolean;
  SoftSuspendRequested?: boolean;
  stopped?: boolean;
  Stopped?: boolean;
  /** Stop API: migration was not in a stoppable live phase. */
  alreadyStopped?: boolean;
  AlreadyStopped?: boolean;
  /** Stop API: false when migration was already stopped. */
  success?: boolean;
  Success?: boolean;
  /** True when a queue watchdog recently detected no progress while the migration was live. */
  possibleStall?: boolean;
  PossibleStall?: boolean;
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
  totalTracked?: number;
  workers: number;
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
  bytes_copied_total?: number;
  total_bytes_copied?: number;
  bytes_total?: number;
  bytes_per_sec?: number;
  copy_rate_bytes_per_sec?: number;
  bytes_copied_per_sec?: number;
  possible_stall?: boolean;
  /** Engine-computed copy/delete progress 0–100. */
  progress_percent?: number;
}

export interface MigrationQueueMetricsResponse {
  success: boolean;
  errorCode?: string;
  error?: string;
  srcTraversal?: QueueMetrics | null;
  dstTraversal?: QueueMetrics | null;
  copy?: QueueMetrics | null;
  delete?: QueueMetrics | null;
  possibleStall?: boolean;
}

