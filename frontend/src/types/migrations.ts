import { Folder } from "../types/services";

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
  sourceId: string;
  destinationId: string;
  startedAt: string;
  status: string;
  error?: string;
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
  completedAt?: string | null;
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
    sourceId: string;
    destinationId: string;
    startedAt: string;
    status: string;
    completedAt: string | null;
    error: string;
    result?: MigrationStatusResponse["result"];
  }>;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
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
  totalTracked: number;
  workers: number;
  files_discovered_total?: number;
  folders_discovered_total?: number;
  discovery_rate_items_per_sec?: number;
  total_discovered?: number;
}

export interface MigrationQueueMetricsResponse {
  success: boolean;
  errorCode?: string;
  error?: string;
  srcTraversal?: QueueMetrics | null;
  dstTraversal?: QueueMetrics | null;
  copy?: QueueMetrics | null;
}

