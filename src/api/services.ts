import {
  MigrationRootRequest,
  MigrationRootResponse,
  MigrationResponse,
  StartMigrationPayload,
  MigrationDBFile,
  MigrationUploadResponse,
  MigrationStatusResponse,
  MigrationInspectResponse,
  MigrationMetadata,
  MigrationWithStatus,
  MigrationLogsRequest,
  MigrationLogsResponse,
  MigrationQueueMetricsResponse,
  ListMigrationsResponse,
} from "../types/migrations";
import { ServiceDescriptor, Drive, ChildrenResponse, Folder } from "../types/services";
import { UserPreferences, DEFAULT_PREFERENCES, normalizeAppTheme } from "../types/preferences";
import { finiteNonNeg } from "../utils/formatBytes";
import { parseOptionalTotal } from "../utils/listSearch";
import {
  CreateRulesetRequest,
  FilterRuleset,
  MigrationRulesetResponse,
  RuleExclusion,
  RulesetSummary,
  UpdateRulesetRequest,
} from "../types/rulesets";
import { apiFetch, getAuthToken, readErrorMessage } from "./client";

export type { FilterRuleset, RuleExclusion } from "../types/rulesets";

const fallbackServices: ServiceDescriptor[] = [
  { id: "local", displayName: "Local Filesystem", type: "local" },
  { id: "spectra-primary", displayName: "Spectra Simulator", type: "spectra" },
];

export async function fetchServices(): Promise<ServiceDescriptor[]> {
  try {
    const response = await apiFetch(`/api/services`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch services: ${response.statusText}`);
    }

    const data = (await response.json()) as ServiceDescriptor[];
    return data.length ? data : fallbackServices;
  } catch (error) {
    console.error("Error fetching services, falling back to defaults", error);
    return fallbackServices;
  }
}

export async function setMigrationRoot(
  payload: MigrationRootRequest
): Promise<MigrationRootResponse> {

  const response = await apiFetch(`/api/migrations/roots`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to set migration root (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  return (await response.json()) as MigrationRootResponse;
}

export async function startMigration(
  payload: StartMigrationPayload
): Promise<MigrationResponse> {

  const response = await apiFetch(`/api/migrations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to start migration (${response.status}): ${message || "Unknown"}`
    );
  }

  return (await response.json()) as MigrationResponse;
}

export async function uploadMigrationDB(
  file: File,
  filename: string,
  overwrite = false
): Promise<MigrationUploadResponse> {

  const formData = new FormData();
  formData.append("file", file);
  formData.append("filename", filename);
  if (overwrite) {
    formData.append("overwrite", "true");
  }

  const response = await apiFetch(`/api/migrations/db/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const data = (await response.json()) as MigrationUploadResponse;
    if (data.error) {
      throw new Error(data.error);
    }
    const message = await response.text();
    throw new Error(
      `Failed to upload migration DB (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  return (await response.json()) as MigrationUploadResponse;
}

export async function listMigrationDBs(): Promise<MigrationDBFile[]> {

  const response = await apiFetch(`/api/migrations/db/list`, {
    method: "GET",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to list migration DBs (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  const data = await response.json();
  // Ensure we always return an array, even if API returns null or undefined
  return Array.isArray(data) ? data : [];
}

export async function getMigrationStatus(
  migrationId: string
): Promise<MigrationStatusResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to get migration status (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  return (await response.json()) as MigrationStatusResponse;
}

export async function renameMigration(
  migrationId: string,
  name: string
): Promise<MigrationStatusResponse> {
  const response = await apiFetch(`/api/migrations/${migrationId}/rename`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to rename migration (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  return (await response.json()) as MigrationStatusResponse;
}

export async function inspectMigration(
  migrationId: string
): Promise<MigrationInspectResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/inspect`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to inspect migration (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  return (await response.json()) as MigrationInspectResponse;
}

export async function listMigrations(options?: {
  offset?: number;
  limit?: number;
}): Promise<ListMigrationsResponse> {

  const params = new URLSearchParams();
  if (options?.offset !== undefined) {
    params.append("offset", options.offset.toString());
  }
  if (options?.limit !== undefined) {
    params.append("limit", options.limit.toString());
  }

  const url = `/api/migrations${params.toString() ? `?${params.toString()}` : ""}`;

  const response = await apiFetch(url, {
    method: "GET",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to list migrations (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  return (await response.json()) as ListMigrationsResponse;
}

export async function loadMigration(
  migrationId: string
): Promise<MigrationResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/load`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    let errorMessage = "Unknown error";
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      const message = await response.text();
      errorMessage = message || errorMessage;
    }

    if (response.status === 400) {
      throw new Error(`Invalid request: ${errorMessage}`);
    } else if (response.status === 404) {
      throw new Error(`Migration not found: ${errorMessage}`);
    } else if (response.status === 500) {
      throw new Error(`Server error while resuming migration: ${errorMessage}`);
    } else {
      throw new Error(
        `Failed to load migration (${response.status}): ${errorMessage}`
      );
    }
  }

  return (await response.json()) as MigrationResponse;
}

export async function stopMigration(
  migrationId: string
): Promise<MigrationStatusResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/stop`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    let errorMessage = "Unknown error";
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      const message = await response.text();
      errorMessage = message || errorMessage;
    }

    if (response.status === 400) {
      throw new Error(`Invalid request: ${errorMessage}`);
    } else if (response.status === 404) {
      throw new Error(`Migration not found or not running: ${errorMessage}`);
    } else if (response.status === 500) {
      throw new Error(`Server error while stopping migration: ${errorMessage}`);
    } else {
      throw new Error(
        `Failed to stop migration (${response.status}): ${errorMessage}`
      );
    }
  }

  return (await response.json()) as MigrationStatusResponse;
}

export async function forceStopMigration(
  migrationId: string
): Promise<MigrationStatusResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/force-stop`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    let errorMessage = "Unknown error";
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      const message = await response.text();
      errorMessage = message || errorMessage;
    }
    throw new Error(
      `Failed to force-stop migration (${response.status}): ${errorMessage}`
    );
  }

  return (await response.json()) as MigrationStatusResponse;
}

function mapDriveFromAPI(drive: Record<string, unknown>): Drive {
  return {
    path: String(drive.path ?? ""),
    name: String(drive.displayName ?? drive.name ?? drive.path ?? ""),
    displayName: drive.displayName != null ? String(drive.displayName) : undefined,
    type: String(drive.type ?? ""),
    mountPoint: drive.mountPoint != null ? String(drive.mountPoint) : undefined,
    device: drive.device != null ? String(drive.device) : undefined,
    fileSystem: drive.fileSystem != null ? String(drive.fileSystem) : undefined,
    mounted: typeof drive.mounted === "boolean" ? drive.mounted : undefined,
    label: drive.label != null ? String(drive.label) : undefined,
    totalBytes: typeof drive.totalBytes === "number" ? drive.totalBytes : undefined,
    freeBytes: typeof drive.freeBytes === "number" ? drive.freeBytes : undefined,
    usedBytes: typeof drive.usedBytes === "number" ? drive.usedBytes : undefined,
  };
}

export async function listDrives(
  serviceId: string
): Promise<Drive[]> {

  const response = await apiFetch(
    `/api/services/${serviceId}/drives`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to list drives (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  const data = await response.json();
  return Array.isArray(data)
    ? data.map((drive: Record<string, unknown>) => mapDriveFromAPI(drive))
    : [];
}

/** Process-user home directory on the machine running Sylos (local FS only). */
export async function getHomeFolder(serviceId: string): Promise<Folder> {
  const response = await apiFetch(
    `/api/services/${encodeURIComponent(serviceId)}/home`,
    { method: "GET" }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to resolve home directory (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    ServiceID: String(data.id ?? data.ID ?? data.ServiceID ?? ""),
    Id: String(data.id ?? data.ID ?? data.ServiceID ?? ""),
    name: String(data.displayName ?? data.DisplayName ?? data.name ?? "Home"),
    locationPath: String(data.locationPath ?? data.LocationPath ?? ""),
    parentId:
      data.parentId != null
        ? String(data.parentId)
        : data.ParentId != null
          ? String(data.ParentId)
          : undefined,
    parentPath:
      data.parentPath != null
        ? String(data.parentPath)
        : data.ParentPath != null
          ? String(data.ParentPath)
          : undefined,
    lastUpdated:
      data.lastUpdated != null
        ? String(data.lastUpdated)
        : data.LastUpdated != null
          ? String(data.LastUpdated)
          : undefined,
    type: String(data.type ?? data.Type ?? "folder"),
  };
}

export interface StorageInfo {
  available: boolean;
  unlimited?: boolean;
  totalBytes?: number;
  usedBytes?: number;
  freeBytes?: number;
  source?: string;
}

/** Best-effort free/total capacity for a service root or cloud account. */
export async function getStorageInfo(
  serviceId: string,
  options?: {
    path?: string;
    connectionId?: string;
    rootType?: string;
    driveId?: string;
    role?: string;
  }
): Promise<StorageInfo> {
  const params = new URLSearchParams();
  if (options?.path) params.set("path", options.path);
  if (options?.connectionId) params.set("connectionId", options.connectionId);
  if (options?.rootType) params.set("rootType", options.rootType);
  if (options?.driveId) params.set("driveId", options.driveId);
  if (options?.role) params.set("role", options.role);
  const qs = params.toString();
  const response = await apiFetch(
    `/api/services/${encodeURIComponent(serviceId)}/storage${qs ? `?${qs}` : ""}`
  );
  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to get storage info (${response.status}): ${message || "Unknown error"}`
    );
  }
  return (await response.json()) as StorageInfo;
}

export async function mountDrive(
  serviceId: string,
  device: string
): Promise<Drive> {

  const response = await apiFetch(
    `/api/services/${serviceId}/drives/mount`,
    {
      method: "POST",
            body: JSON.stringify({ device }),
    }
  );

  if (!response.ok) {
    let message = await response.text();
    try {
      const parsed = JSON.parse(message) as { message?: string; error?: string };
      message = parsed.message || parsed.error || message;
    } catch {
      // use raw text
    }
    throw new Error(message || "Failed to mount drive");
  }

  const data = (await response.json()) as Record<string, unknown>;
  return mapDriveFromAPI(data);
}

export type BrowseNodeRef = {
  id: string;
  type: "file" | "folder";
};

export type DeleteBrowseNodesResult = {
  deleted: string[];
  errors: Array<{ id: string; message: string }>;
};

export async function createBrowseFolder(
  serviceId: string,
  body: {
    parentId: string;
    name: string;
    connectionId?: string;
    role?: "source" | "destination";
    rootType?: string;
    driveId?: string;
  }
): Promise<Folder> {
  const response = await apiFetch(`/api/services/${serviceId}/folders`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to create folder: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    ServiceID: String(data.id ?? data.ID ?? ""),
    Id: String(data.id ?? data.ID ?? ""),
    name: String(data.displayName ?? data.DisplayName ?? body.name),
    locationPath: String(data.locationPath ?? data.LocationPath ?? ""),
    parentId: data.parentId != null ? String(data.parentId) : undefined,
    parentPath: data.parentPath != null ? String(data.parentPath) : undefined,
    type: "folder",
  };
}

export async function deleteBrowseNodes(
  serviceId: string,
  body: {
    nodes: BrowseNodeRef[];
    contextId: string;
    connectionId?: string;
    role?: "source" | "destination";
    rootType?: string;
    driveId?: string;
  }
): Promise<DeleteBrowseNodesResult> {
  const response = await apiFetch(`/api/services/${serviceId}/nodes/delete`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  let data: DeleteBrowseNodesResult = { deleted: [], errors: [] };
  try {
    data = (await response.json()) as DeleteBrowseNodesResult;
  } catch {
    if (!response.ok) {
      throw new Error(`Failed to delete items: ${await readErrorMessage(response)}`);
    }
  }

  if (!response.ok && data.errors.length === 0) {
    throw new Error(`Failed to delete items: ${await readErrorMessage(response)}`);
  }

  return {
    deleted: data.deleted ?? [],
    errors: data.errors ?? [],
  };
}

export async function listChildren(
  serviceId: string,
  identifier: string,
  role?: "source" | "destination",
  options?: {
    offset?: number;
    limit?: number;
    foldersOnly?: boolean;
  }
): Promise<ChildrenResponse> {

  const params = new URLSearchParams({ identifier });
  if (role) {
    params.append("role", role);
  }
  if (options?.offset !== undefined) {
    params.append("offset", options.offset.toString());
  }
  if (options?.limit !== undefined) {
    params.append("limit", options.limit.toString());
  }
  if (options?.foldersOnly !== undefined) {
    params.append("foldersOnly", options.foldersOnly.toString());
  }

  const response = await apiFetch(
    `/api/services/${serviceId}/children?${params.toString()}`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to list children (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  const data = await response.json();
  
  // Normalize API response: API returns capitalized field names inside objects
  // and lowercase collection names (folders, files)
  const normalizeBrowseItem = (item: Record<string, unknown>): Folder => ({
    ServiceID: String(item.ServiceID ?? item.serviceId ?? ""),
    Id: String(item.Id ?? item.id ?? item.ServiceID ?? item.serviceId ?? ""),
    name: String(item.DisplayName ?? item.displayName ?? item.name ?? "Untitled"),
    locationPath: String(item.LocationPath ?? item.locationPath ?? ""),
    parentId:
      item.ParentId != null
        ? String(item.ParentId)
        : item.parentId != null
          ? String(item.parentId)
          : undefined,
    parentPath:
      item.ParentPath != null
        ? String(item.ParentPath)
        : item.parentPath != null
          ? String(item.parentPath)
          : undefined,
    lastUpdated:
      item.LastUpdated != null
        ? String(item.LastUpdated)
        : item.lastUpdated != null
          ? String(item.lastUpdated)
          : undefined,
    depthLevel:
      typeof item.DepthLevel === "number"
        ? item.DepthLevel
        : typeof item.depthLevel === "number"
          ? item.depthLevel
          : undefined,
    type: String(item.Type ?? item.type ?? "folder"),
    size:
      typeof item.Size === "number"
        ? item.Size
        : typeof item.size === "number"
          ? item.size
          : undefined,
  });

  const folders = (data.folders || []).map((item: Record<string, unknown>) =>
    normalizeBrowseItem(item)
  );
  const files = (data.files || []).map((item: Record<string, unknown>) =>
    normalizeBrowseItem(item)
  );

  // Normalize pagination info
  const pagination = data.Pagination || data.pagination;
  const paginationInfo = pagination ? {
    offset: pagination.Offset || pagination.offset || 0,
    limit: pagination.Limit || pagination.limit || 100,
    total: pagination.Total || pagination.total || 0,
    totalFolders: pagination.TotalFolders || pagination.totalFolders || 0,
    totalFiles: pagination.TotalFiles || pagination.totalFiles || 0,
    hasMore: pagination.HasMore || pagination.hasMore || false,
  } : undefined;

  return { folders, files, pagination: paginationInfo };
}

export async function getMigrationLogs(
  migrationId: string,
  request: MigrationLogsRequest = {}
): Promise<MigrationLogsResponse> {

  // Don't send lastSeenIds - we filter duplicates on the frontend
  const response = await apiFetch(
    `/api/migrations/${migrationId}/logs`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to get migration logs (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  const data = (await response.json()) as MigrationLogsResponse;
  
  // Return structured response - may have success=false for non-critical errors
  return data;
}

export async function getMigrationQueueMetrics(
  migrationId: string
): Promise<MigrationQueueMetricsResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/queue-metrics`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to get queue metrics (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  const data = (await response.json()) as MigrationQueueMetricsResponse;
  
  // Return structured response - may have success=false for non-critical errors
  return data;
}

// Diff types for path review - matching new API structure
export interface PathNodeItem {
  queue: string;              // "SRC" or "DST"
  id: string;                 // Migration Engine ULID (26 chars) - USE THIS FOR API OPERATIONS
  ServiceID?: string;         // Service's native identifier (e.g., "C:/$Recycle.Bin" for local, file ID for cloud services)
  parentId?: string;          // Migration Engine ULID (26 chars) - parent node ID
  parentPath?: string;        // Parent id_path (for navigation)
  name: string;        // Display name (basename of the path)
  locationPath: string;       // id_path for tree nav (e.g. "/uuid/uuid")
  /** Friendly name path for display (e.g. "/Reports/a.txt"). */
  displayPath?: string;
  lastUpdated?: string;       // Last updated timestamp (RFC3339 format)
  depthLevel: number;         // Depth in the directory tree (0 = root)
  type: string;               // "folder" or "file"
  size?: number;              // File bytes, or folder total of everything underneath
  traversalStatus: "pending" | "successful" | "failed" | "excluded" | "not_on_src";
  copyStatus?: string;        // "pending", "successful", "failed", …
  deleteStatus?: string;      // delete: pending_explicit, pending_inherited, skipped, deleted, failed
  copyRetryMarked?: boolean;  // copy pending queued for retry from a previous copy failure
  copyExcludedFromFailed?: boolean; // copy excluded from a retry-marked failure; unexcluding restores failed
  copyForceReplaceMarked?: boolean; // pending prefer-source overwrite from already_existed
  failureLogId?: string;
  failureMessage?: string;
  ruleExclusion?: RuleExclusion;
}

export interface PathNodes {
  src?: PathNodeItem;  // Source node (present if item exists in SRC queue)
  dst?: PathNodeItem;  // Destination node (present if item exists in DST queue)
  /** Accepted/committed destination basename when remapped for compatibility. */
  resolvedDstName?: string;
}

export interface PaginationInfo {
  offset: number;       // Current pagination offset
  limit: number;        // Current pagination limit
  /** Total matches when known; omit/undefined when the server skipped counting. */
  total?: number;
  totalFolders?: number; // Total folders when counted
  totalFiles?: number;   // Total files when counted
  hasMore: boolean;     // Whether there are more items beyond the current page
}

export interface ListChildrenDiffsResponse {
  items: { [path: string]: PathNodes };  // Map of path -> { src?, dst? }
  pagination: PaginationInfo;
}

/** Response from GET /api/migrations/{id}/diffs/stats and POST .../search/count */
export interface DiffsStatsResponse {
  total: number;
  totalFolders: number;
  totalFiles: number;
  /** True when total is a lower bound (count stopped early, e.g. 2m deadline). */
  truncated?: boolean;
}

// Transformed item for UI consumption
export interface DiffItem {
  id: string;                // Migration Engine ULID (26 chars) from src if available, otherwise dst - USE THIS FOR API OPERATIONS
  ServiceID?: string;        // Service's native identifier from src if available, otherwise dst - e.g., "C:/$Recycle.Bin" for local
  parentId?: string;         // Migration Engine ULID (26 chars) - parent node ID
  parentPath?: string;       // UI-constructed parent path (for display/navigation)
  name: string;       // Display name from src if available, otherwise dst
  locationPath: string;      // id_path from src if available, otherwise dst (tree nav)
  /** Friendly name path for UI columns / inspector. */
  displayPath?: string;
  lastUpdated?: string;      // Last updated timestamp from src if available, otherwise dst
  depthLevel: number;        // Depth level from src if available, otherwise dst
  type: "folder" | "file";   // Type from src if available, otherwise dst
  size?: number;             // File bytes, or folder total from src if available, otherwise dst
  traversalStatus: string;   // Traversal status from src if available, otherwise dst
  copyStatus?: string;       // Copy status from src if available, otherwise dst
  src?: PathNodeItem;        // Full src node (for hover card)
  dst?: PathNodeItem;        // Full dst node (for hover card)
  /** Suggested destination basename from path-name review queue */
  proposedPath?: string;
  /** Accepted/committed destination basename after remap (may differ from name). */
  resolvedDstName?: string;
  pathIssueStatus?: string;
  pathIssueSummary?: string;
  pathIssueMessages?: PathIssueMessage[];
  /** True when the compatibility warning is dismissed for this item. */
  pathIssueIgnored?: boolean;
}

export async function getMigrationDiffs(
  migrationId: string,
  options?: {
    locationPath?: string;  // Relative path (locationPath) - "/" for root, "/folder1" for children, etc.
    offset?: number;
    limit?: number;
    foldersOnly?: boolean;
    includeDestinationOnly?: boolean;
  }
): Promise<{ items: DiffItem[]; pagination: PaginationInfo }> {

  const params = new URLSearchParams();
  // Append path if provided (defaults to "/" for root if not provided)
  if (options?.locationPath) {
    params.append("path", options.locationPath);
  }
  // If locationPath is not provided, API defaults to "/" (root)
  
  if (options?.offset !== undefined) {
    params.append("offset", options.offset.toString());
  }
  if (options?.limit !== undefined) {
    params.append("limit", options.limit.toString());
  }
  if (options?.foldersOnly !== undefined) {
    params.append("foldersOnly", options.foldersOnly.toString());
  }
  if (options?.includeDestinationOnly !== undefined) {
    params.append("includeDestinationOnly", options.includeDestinationOnly.toString());
  }

  const response = await apiFetch(
    `/api/migrations/${migrationId}/diffs?${params.toString()}`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to get migration diffs (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  const data = (await response.json()) as any;

  // Handle different response structures:
  // 1. { items: {...}, pagination: {...} } - expected structure
  // 2. Just the items object directly - fallback
  const itemsMap = data.items || data;
  
  if (!itemsMap || typeof itemsMap !== "object") {
    console.error("getMigrationDiffs: Invalid response structure", data);
    throw new Error("Invalid API response: items not found");
  }
  const pagination = normalizeSearchPagination(
    data.pagination as Record<string, unknown> | undefined,
    {
      offset: options?.offset || 0,
      limit: options?.limit || 100,
      itemCount: Object.keys(itemsMap).length,
    }
  );

  // Transform the API response into a flat array of DiffItems for UI consumption
  const transformedItems: DiffItem[] = [];

  const itemOrderDiffs = Array.isArray(data.itemOrder) ? (data.itemOrder as string[]) : undefined;
  const entriesDiffs: [string, PathNodes][] = itemOrderDiffs?.length
    ? itemOrderDiffs
        .map((p) => [p, itemsMap[p] as PathNodes | undefined])
        .filter((e): e is [string, PathNodes] => e[1] != null)
    : Object.entries(itemsMap);

  for (const [path, pathNodes] of entriesDiffs) {
    const nodes = pathNodes as PathNodes;
    const hasSrc = nodes.src !== undefined;
    const hasDst = nodes.dst !== undefined;

    // Include all items (src-only, dst-only, and both)
    // Use src as primary if available, otherwise use dst
    const primaryNode = nodes.src || nodes.dst;
    
    if (!primaryNode) {
      // Skip items with neither src nor dst (shouldn't happen, but safety check)
      continue;
    }
    
    const diffItem: DiffItem = {
      id: primaryNode.id,
      parentId: primaryNode.parentId,
      parentPath: primaryNode.parentPath,
      name: primaryNode.name,
      locationPath: primaryNode.locationPath,
      displayPath: primaryNode.displayPath || undefined,
      ServiceID: primaryNode.ServiceID,
      lastUpdated: primaryNode.lastUpdated,
      depthLevel: primaryNode.depthLevel,
      type: primaryNode.type as "folder" | "file",
      size: primaryNode.size,
      traversalStatus: primaryNode.traversalStatus,
      copyStatus: primaryNode.copyStatus,
      src: nodes.src,
      dst: nodes.dst,
      resolvedDstName: nodes.resolvedDstName || undefined,
    };

    transformedItems.push(diffItem);
  }

  return {
    items: transformedItems,
    pagination,
  };
}

/**
 * Get diffs stats (total, totalFolders, totalFiles) for a path.
 * Use this when you need counts for footers or "Page X of Y"; the diffs list endpoint no longer includes stats.
 */
export async function getMigrationDiffsStats(
  migrationId: string,
  options?: {
    path?: string;       // locationPath, default "/"
    foldersOnly?: boolean;
    includeDestinationOnly?: boolean;
  }
): Promise<DiffsStatsResponse> {

  const params = new URLSearchParams();
  if (options?.path !== undefined) {
    params.append("path", options.path);
  }
  if (options?.foldersOnly !== undefined) {
    params.append("foldersOnly", options.foldersOnly.toString());
  }
  if (options?.includeDestinationOnly !== undefined) {
    params.append("includeDestinationOnly", options.includeDestinationOnly.toString());
  }

  const query = params.toString();
  const url = `/api/migrations/${migrationId}/diffs/stats${query ? `?${query}` : ""}`;

  const response = await apiFetch(url, {
    method: "GET",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to get migration diffs stats (${response.status}): ${message || "Unknown error"}`
    );
  }

  const data = (await response.json()) as DiffsStatsResponse;
  return {
    total: data.total ?? 0,
    totalFolders: data.totalFolders ?? 0,
    totalFiles: data.totalFiles ?? 0,
  };
}

// TODO: API endpoint needed - Update item copy status
// This should update whether an item should be copied or not
// Path review action result: engine returns deltas for UI to apply without refetching stats
export interface PathReviewActionResult {
  affectedCount: number;
  deltas: Record<string, number>;
}
// Exclusion API types (success responses may include action result deltas)
export interface ExclusionResponse {
  success: boolean;
  error?: string;
  taskID?: string;  // Present for bulk operations (all: true)
  affectedCount?: number;
  unchangedCount?: number;
  unchangedReasons?: BulkReasonGroup[];
  deltas?: Record<string, number>;  // Per-status deltas to apply to local stats
}

export interface BulkReasonGroup {
  reason: string;
  count: number;
}

/**
 * Exclude a node from the migration
 * @param migrationId The ID of the migration
 * @param nodeId The ID of the node to exclude (from PathNodeItem.id)
 * @returns Promise resolving to ExclusionResponse
 */
export async function excludeNode(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/exclude`,
    {
      method: "POST",
      body: JSON.stringify({
        nodeIDs: [nodeId],
      }),
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to exclude node";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return {
      success: false,
      error: errorMessage,
    };
  }

  const data = await response.json();
  return data;
}

/**
 * Unexclude a node from the migration
 * @param migrationId The ID of the migration
 * @param nodeId The ID of the node to unexclude (from PathNodeItem.id)
 * @returns Promise resolving to ExclusionResponse
 */
export async function unexcludeNode(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/unexclude`,
    {
      method: "POST",
      body: JSON.stringify({
        nodeIDs: [nodeId],
      }),
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to unexclude node";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return {
      success: false,
      error: errorMessage,
    };
  }

  const data = await response.json();
  return data;
}

/**
 * Mark a node for retry (re-traversal)
 * @param migrationId The ID of the migration
 * @param nodeId The ID of the node to mark for retry (from PathNodeItem.id)
 * @returns Promise resolving to ExclusionResponse
 */
/**
 * Mark a node for discovery/traversal retry
 * @param migrationId The ID of the migration
 * @param nodeId The ULID of the node to mark for retry (from PathNodeItem.id)
 * @returns Promise resolving to ExclusionResponse
 */
export async function markNodeForRetryDiscovery(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/mark-retry-discovery`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to mark node for discovery retry";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return {
      success: false,
      error: errorMessage,
    };
  }

  const data = await response.json();
  return data;
}

/**
 * Unmark a node for discovery/traversal retry
 * @param migrationId The ID of the migration
 * @param nodeId The ULID of the node to unmark for retry (from PathNodeItem.id)
 * @returns Promise resolving to ExclusionResponse
 */
export async function unmarkNodeForRetryDiscovery(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/unmark-retry-discovery`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to unmark node for discovery retry";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return {
      success: false,
      error: errorMessage,
    };
  }

  const data = await response.json();
  return data;
}

/**
 * Mark a node for copy retry (src nodes only)
 * @param migrationId The ID of the migration
 * @param nodeId The ULID of the src node to mark for retry (from PathNodeItem.id)
 * @returns Promise resolving to ExclusionResponse
 */
export async function markNodeForRetryCopy(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/mark-retry-copy`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to mark node for copy retry";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return {
      success: false,
      error: errorMessage,
    };
  }

  const data = await response.json();
  return data;
}

/**
 * Unmark a node for copy retry
 * @param migrationId The ID of the migration
 * @param nodeId The ULID of the src node to unmark for retry (from PathNodeItem.id)
 * @returns Promise resolving to ExclusionResponse
 */
export async function unmarkNodeForRetryCopy(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/unmark-retry-copy`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to unmark node for copy retry";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return {
      success: false,
      error: errorMessage,
    };
  }

  const data = await response.json();
  return data;
}

/** Prefer source overwrite for exists-on-both (already_existed → pending). Folders cascade to descendants. */
export async function forceReplaceCopyNode(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/force-replace-copy`,
    { method: "POST" }
  );
  if (!response.ok) {
    let errorMessage = "Failed to force-replace with source";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return { success: false, error: errorMessage };
  }
  return response.json();
}

/** Undo prefer-source force-replace (forced pending → already_existed). */
export async function unforceReplaceCopyNode(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/unforce-replace-copy`,
    { method: "POST" }
  );
  if (!response.ok) {
    let errorMessage = "Failed to undo force-replace";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return { success: false, error: errorMessage };
  }
  return response.json();
}

// Phase change API types and functions
export interface PhaseChangeRequest {
  phase: "traversal" | "copy";
  migrationId: string;
  options?: {
    workerCount?: number;
    maxRetries?: number;
    maxKnownDepth?: number;
    logAddress?: string;
    logLevel?: string;
    skipListener?: boolean;
    startupDelaySeconds?: number;
    progressTickMillis?: number;
  };
}

export interface PhaseChangeResponse {
  success: boolean;
  message?: string;
  error?: string;
  errorCode?: string;
  count?: number;
  issues?: PathIssue[];
}

/**
 * Change migration phase (traversal or copy)
 * This endpoint checks pending work, runs exclusion sweep if needed,
 * blocks copy phase if there are pending retries, then starts the phase.
 * @param migrationId The ID of the migration
 * @param phase The phase to change to ("traversal" or "copy")
 * @param options Optional configuration options
 * @returns Promise resolving to PhaseChangeResponse
 */
export async function changePhase(
  migrationId: string,
  phase: "traversal" | "copy" | "delete",
  options?: PhaseChangeRequest["options"]
): Promise<PhaseChangeResponse> {

  const requestBody: PhaseChangeRequest = {
    phase,
    migrationId,
    options,
  };

  const response = await apiFetch(
    `/api/migrations/${migrationId}/phase-change`,
    {
      method: "POST",
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    let errorMessage = `Failed to change phase to ${phase}`;
    let errorCode: string | undefined;
    let count: number | undefined;
    let issues: PathIssue[] | undefined;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
      errorCode = errorData.errorCode;
      count = errorData.count;
      issues = errorData.issues;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return {
      success: false,
      error: errorMessage,
      errorCode,
      count,
      issues,
    };
  }

  const data = await response.json();
  return data;
}

export interface PathIssue {
  nodeId: string;
  path: string;
  /** Stored display basename of the node the issue is about. */
  name?: string;
  proposedPath: string;
  status: string;
  category?: string;
  summary?: string;
  eventTime?: number;
  messages?: PathIssueMessage[];
  /** True when the warning is dismissed (original name kept). */
  ignored?: boolean;
}

export interface PathIssuesListResponse {
  issues: PathIssue[];
  count: number;
  pathChecksEnabled?: boolean;
}

export interface PathIssueMessage {
  category?: string;
  message: string;
  /** GPL structured attribute (e.g. InvalidChar: forbidden runes found). */
  detail?: string;
  docsURL?: string;
}

export interface ValidatePathProposalResponse {
  valid: boolean;
  messages?: PathIssueMessage[];
  pathChecksEnabled?: boolean;
}

export interface PathIssuesMutationResponse {
  success: boolean;
  accepted?: number;
  ignored?: number;
  issues?: PathIssue[];
  count?: number;
  message?: string;
  error?: string;
  pathChecksEnabled?: boolean;
}

export async function listPathIssues(
  migrationId: string
): Promise<PathIssuesListResponse> {
  const response = await apiFetch(`/api/migrations/${migrationId}/path-issues`);
  if (!response.ok) {
    throw new Error(`Failed to load naming issues (${response.status})`);
  }
  return response.json();
}

export interface PathCheckTargetResponse {
  pathCheckTarget: string;
  pathChecksEnabled: boolean;
  windowsCompat?: boolean;
}

export async function getPathCheckTarget(
  migrationId: string
): Promise<PathCheckTargetResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/path-check-target`
  );
  if (!response.ok) {
    throw new Error(`Failed to load path check settings (${response.status})`);
  }
  return response.json();
}

export async function setPathCheckTarget(
  migrationId: string,
  pathCheckTarget: string,
  windowsCompat?: boolean
): Promise<PathCheckTargetResponse> {
  const body: { pathCheckTarget: string; windowsCompat?: boolean } = {
    pathCheckTarget,
  };
  if (windowsCompat !== undefined) {
    body.windowsCompat = windowsCompat;
  }
  const response = await apiFetch(
    `/api/migrations/${migrationId}/path-check-target`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to save path check settings (${response.status})`);
  }
  return response.json();
}

export async function validatePathProposal(
  migrationId: string,
  nodeId: string,
  proposedPath: string
): Promise<ValidatePathProposalResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/path-issues/validate`,
    {
      method: "POST",
      body: JSON.stringify({ nodeId, proposedPath }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to check name (${response.status})`);
  }
  return response.json();
}

export async function acceptPathProposal(
  migrationId: string,
  nodeId: string,
  proposedPath?: string
): Promise<PathIssuesMutationResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/path-issues/${encodeURIComponent(nodeId)}/accept`,
    {
      method: "POST",
      body: JSON.stringify({ proposedPath: proposedPath || "" }),
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      message: data.message || data.error || "Could not apply suggested name.",
    };
  }
  return data;
}

export async function remapPathManual(
  migrationId: string,
  nodeId: string,
  proposedPath: string,
  forceSkipValidation = false
): Promise<PathIssuesMutationResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/path-issues/${encodeURIComponent(nodeId)}/remap`,
    {
      method: "POST",
      body: JSON.stringify({ proposedPath, forceSkipValidation }),
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      message: data.message || data.error || "Could not rename destination.",
    };
  }
  return data;
}

export async function resetPathRemap(
  migrationId: string,
  nodeId: string
): Promise<PathIssuesMutationResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/path-issues/${encodeURIComponent(nodeId)}/reset`,
    { method: "POST" }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      message: data.message || data.error || "Could not reset name.",
    };
  }
  return data;
}

export async function acceptAllPathProposals(
  migrationId: string
): Promise<PathIssuesMutationResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/path-issues/accept-all`,
    { method: "POST" }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      message: data.message || data.error || "Could not apply suggested names.",
    };
  }
  return data;
}

export async function ignoreRemainingPathIssues(
  migrationId: string
): Promise<PathIssuesMutationResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/path-issues/ignore-remaining`,
    { method: "POST" }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      message: data.message || data.error || "Could not dismiss name warnings.",
    };
  }
  return data;
}

/** Dismiss destination naming warnings for one node and its contents. */
export async function ignorePathIssueSubtree(
  migrationId: string,
  nodeId: string
): Promise<PathIssuesMutationResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/path-issues/${encodeURIComponent(nodeId)}/ignore`,
    { method: "POST" }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      message: data.message || data.error || "Could not dismiss this name warning.",
    };
  }
  return data;
}

/** Restore previously dismissed destination naming warnings for one node and its contents. */
export async function unignorePathIssueSubtree(
  migrationId: string,
  nodeId: string
): Promise<PathIssuesMutationResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/path-issues/${encodeURIComponent(nodeId)}/unignore`,
    { method: "POST" }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      message: data.message || data.error || "Could not restore this name warning.",
    };
  }
  return data;
}

/** Merge path-issue queue fields onto diff items by node id. */
export function applyPathIssuesToDiffItems(
  items: DiffItem[],
  issues: PathIssue[]
): DiffItem[] {
  if (!issues.length) {
    return items.map((item) => ({
      ...item,
      proposedPath: undefined,
      pathIssueStatus: undefined,
      pathIssueSummary: undefined,
      pathIssueMessages: undefined,
      pathIssueIgnored: undefined,
    }));
  }
  const byId = new Map(issues.map((i) => [i.nodeId, i]));
  return items.map((item) => {
    const issue = byId.get(item.id);
    if (!issue) {
      return {
        ...item,
        proposedPath: undefined,
        pathIssueStatus: undefined,
        pathIssueSummary: undefined,
        pathIssueMessages: undefined,
        pathIssueIgnored: undefined,
      };
    }
    const ignored = !!issue.ignored;
    return {
      ...item,
      // Ignored warnings keep original names (no auto remap hint).
      proposedPath: ignored ? undefined : issue.proposedPath || undefined,
      pathIssueStatus: issue.status,
      pathIssueSummary: issue.summary,
      pathIssueMessages: issue.messages?.length ? issue.messages : undefined,
      pathIssueIgnored: ignored || undefined,
    };
  });
}

export interface DeleteSummaryResponse {
  sourceRootPath: string;
  sourceHost?: string;
  pending: number;
  failed: number;
  deleted: number;
}

export async function getDeleteSummary(migrationId: string): Promise<DeleteSummaryResponse> {
  const response = await apiFetch(`/api/migrations/${migrationId}/delete-summary`);
  if (!response.ok) {
    throw new Error(`Failed to load delete summary (${response.status})`);
  }
  return response.json();
}

export async function markNodeForRetryDelete(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/mark-retry-delete`,
    { method: "POST" }
  );
  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}` };
  }
  return response.json();
}

export async function unmarkNodeForRetryDelete(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/unmark-retry-delete`,
    { method: "POST" }
  );
  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}` };
  }
  return response.json();
}

export interface PrepareSourceCleanupRequest {
  nodeIds?: string[];
  deselectedNodeIds?: string[];
}

export async function prepareSourceCleanup(
  migrationId: string,
  payload: PrepareSourceCleanupRequest
): Promise<ExclusionResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/prepare-source-cleanup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return {
      success: false,
      error: (body as { error?: string }).error || `HTTP ${response.status}`,
    };
  }
  return response.json();
}

export async function skipNodeDelete(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/skip-delete`,
    { method: "POST" }
  );
  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}` };
  }
  return response.json();
}

export async function unskipNodeDelete(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {
  const response = await apiFetch(
    `/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/unskip-delete`,
    { method: "POST" }
  );
  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}` };
  }
  return response.json();
}

// Pending work API types and functions
export interface PendingWorkResponse {
  hasPendingRetries: boolean;
  hasPathReviewChanges: boolean;
  pendingRetriesCount: number;
}

/**
 * Get pending work status for a migration
 * @param migrationId The ID of the migration
 * @returns Promise resolving to PendingWorkResponse
 */
export async function getPendingWork(
  migrationId: string
): Promise<PendingWorkResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/pending-work`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to get pending work (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  return (await response.json()) as PendingWorkResponse;
}

export interface PathReviewStats {
  /** Omitted on Discover / delete-results; present on copy-plan, copy, and source-cleanup. */
  pendingCount?: number;
  failedCount: number;
  excludedCount: number;
  pendingRetriesCount: number;
  successfulCount?: number;
  foldersCount: number;
  filesCount: number;
  foldersRatio: number;
  filesRatio: number;
  totalFileSize: {
    src: number;
    dst: number;
    selected: number;
  };
}

/** Clamp counters to finite non-negative numbers so a partial response cannot render as NaN. */
function coercePathReviewStats(raw: PathReviewStats): PathReviewStats {
  return {
    ...(raw.pendingCount !== undefined && raw.pendingCount !== null
      ? { pendingCount: finiteNonNeg(raw.pendingCount) }
      : {}),
    failedCount: finiteNonNeg(raw.failedCount),
    excludedCount: finiteNonNeg(raw.excludedCount),
    pendingRetriesCount: finiteNonNeg(raw.pendingRetriesCount),
    successfulCount: finiteNonNeg(raw.successfulCount),
    foldersCount: finiteNonNeg(raw.foldersCount),
    filesCount: finiteNonNeg(raw.filesCount),
    foldersRatio: raw.foldersRatio ?? 0,
    filesRatio: raw.filesRatio ?? 0,
    totalFileSize: {
      src: finiteNonNeg(raw.totalFileSize?.src),
      dst: finiteNonNeg(raw.totalFileSize?.dst),
      selected: finiteNonNeg(raw.totalFileSize?.selected),
    },
  };
}

/**
 * Get path review statistics
 * @param migrationId The ID of the migration
 * @param view Optional review projection; source-cleanup uses delete-plan counters
 * @returns Promise resolving to PathReviewStats
 */
export async function getPathReviewStats(
  migrationId: string,
  view?: "source-cleanup" | "copy-plan"
): Promise<PathReviewStats> {

  const params = new URLSearchParams();
  if (view) params.set("view", view);
  const query = params.toString();
  const response = await apiFetch(
    `/api/migrations/${migrationId}/stats${query ? `?${query}` : ""}`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to get path review stats (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  return coercePathReviewStats((await response.json()) as PathReviewStats);
}

// Search API types and functions
export interface SearchCondition {
  field: string;  // "name", "path", "depth", "size", "type", "traversalStatus", "copyStatus", "pathIssueStatus"
  operator?: string;  // Optional - ignored for name/path/type/traversalStatus/copyStatus, required for depth/size
  value: string | number;  // Value to match against
}

export interface SearchOptions {
  offset?: number;
  limit?: number;
  foldersOnly?: boolean; // Deprecated - use typeFilter instead
  sortField?: string;  // "name", "path", "depth", "size", "type", "traversalStatus", "copyStatus"
  sortDir?: "asc" | "desc";
  query?: string;  // Search query text (name mode, or single path segment fallback)
  /** Ordered "in path" segments when searchField is path; each becomes a path condition. */
  pathSegments?: string[];
  searchField?: "path" | "name"; // Field to search in (path or name) - defaults to "path"
  typeFilter?: "both" | "folder" | "file"; // Type filter - defaults to "both"
  depthFilter?: number | null; // Depth filter (number)
  depthOperator?: "equals" | "gt" | "gte" | "lt" | "lte"; // Depth operator - defaults to "equals"
  sizeFilter?: number | null; // Size filter (number in bytes)
  sizeOperator?: "equals" | "gt" | "gte" | "lt" | "lte"; // Size operator - defaults to "equals"
  traversalStatusFilter?: string | null; // Traversal status filter (pending, failed, etc.)
  copyStatusFilter?: string | null; // Copy status filter (exclusion_explicit, exclusion_inherited, pending, successful, failed)
  deleteStatusFilter?: string | null; // Delete status filter (pending_explicit, pending_inherited, skipped, failed, deleted)
  /** Compatibility filter: issues | accepted | rejected | none | manual */
  pathIssueStatusFilter?: string | null;
  /** Compatibility finding category (InvalidChar, EmptyPart, …) */
  pathIssueCategoryFilter?: string | null;
  statusSearchType?: "traversal" | "copy" | "delete" | "both"; // Controls which status conditions are processed
  phase?: "traversal" | "copy" | "delete"; // Phase to determine which status counts to use in stats transformation
  includeDestinationOnly?: boolean; // When false, hide destination-only rows server-side
  /** Folder + descendants scope (id_path). Empty or "/" = global. */
  underPath?: string;
  /** Optional filter-rules predicate (compiled to SQL server-side). */
  ruleset?: FilterRuleset | null;
}

export interface SearchRequest {
  conditions?: SearchCondition[];
  sort?: {
    field?: string;
    direction?: "asc" | "desc";
  };
  statusSearchType?: "traversal" | "copy" | "delete" | "both"; // Controls which status conditions are processed
  includeDestinationOnly?: boolean;
  underPath?: string;
  ruleset?: FilterRuleset;
}

/** Build the POST body shared by /search and /search/count. */
export function buildSearchRequest(options?: SearchOptions): SearchRequest {
  const requestBody: SearchRequest = {
    conditions: [],
  };

  const searchField = options?.searchField || "path";
  if (searchField === "path") {
    const segments =
      options?.pathSegments && options.pathSegments.length > 0
        ? options.pathSegments
        : options?.query !== undefined && options.query.trim() !== ""
          ? [options.query.trim()]
          : [];
    for (const seg of segments) {
      const value = seg.trim();
      if (value !== "") {
        requestBody.conditions!.push({ field: "path", value });
      }
    }
  } else if (options?.query !== undefined && options.query.trim() !== "") {
    requestBody.conditions!.push({
      field: searchField,
      value: options.query.trim(),
    });
  }

  const typeFilter =
    options?.typeFilter || (options?.foldersOnly ? "folder" : "both");
  if (typeFilter !== "both") {
    requestBody.conditions!.push({
      field: "type",
      value: typeFilter,
    });
  }

  if (
    options?.depthFilter !== undefined &&
    options.depthFilter !== null &&
    !isNaN(options.depthFilter)
  ) {
    requestBody.conditions!.push({
      field: "depth",
      operator: options.depthOperator || "equals",
      value: options.depthFilter,
    });
  }

  if (
    options?.sizeFilter !== undefined &&
    options.sizeFilter !== null &&
    !isNaN(options.sizeFilter) &&
    typeFilter !== "folder"
  ) {
    requestBody.conditions!.push({
      field: "size",
      operator: options.sizeOperator || "equals",
      value: options.sizeFilter,
    });
  }

  let statusSearchType: "traversal" | "copy" | "delete" | "both" | undefined =
    undefined;
  const hasTraversalFilter =
    options?.traversalStatusFilter !== undefined &&
    options.traversalStatusFilter !== null &&
    options.traversalStatusFilter !== "";
  const hasCopyFilter =
    options?.copyStatusFilter !== undefined &&
    options.copyStatusFilter !== null &&
    options.copyStatusFilter !== "";
  const hasDeleteFilter =
    options?.deleteStatusFilter !== undefined &&
    options.deleteStatusFilter !== null &&
    options.deleteStatusFilter !== "";

  if (hasTraversalFilter && hasCopyFilter) {
    statusSearchType = options?.statusSearchType || "both";
  } else if (hasTraversalFilter) {
    statusSearchType = options?.statusSearchType || "traversal";
  } else if (hasCopyFilter) {
    statusSearchType = options?.statusSearchType || "copy";
  } else if (hasDeleteFilter) {
    statusSearchType = options?.statusSearchType || "delete";
  } else if (options?.statusSearchType) {
    statusSearchType = options.statusSearchType;
  }

  if (hasTraversalFilter) {
    requestBody.conditions!.push({
      field: "traversalStatus",
      value: options!.traversalStatusFilter!,
    });
  }

  if (hasCopyFilter) {
    requestBody.conditions!.push({
      field: "copyStatus",
      value: options!.copyStatusFilter!,
    });
  }

  if (hasDeleteFilter) {
    requestBody.conditions!.push({
      field: "deleteStatus",
      value: options!.deleteStatusFilter!,
    });
  }

  const hasPathIssueFilter =
    options?.pathIssueStatusFilter !== undefined &&
    options.pathIssueStatusFilter !== null &&
    options.pathIssueStatusFilter !== "";
  if (hasPathIssueFilter) {
    requestBody.conditions!.push({
      field: "pathIssueStatus",
      value: options!.pathIssueStatusFilter!,
    });
  }

  const hasPathIssueCategoryFilter =
    options?.pathIssueCategoryFilter !== undefined &&
    options.pathIssueCategoryFilter !== null &&
    options.pathIssueCategoryFilter !== "";
  if (hasPathIssueCategoryFilter) {
    requestBody.conditions!.push({
      field: "pathIssueCategory",
      value: options!.pathIssueCategoryFilter!,
    });
  }

  if (statusSearchType) {
    requestBody.statusSearchType = statusSearchType;
  }

  if (options?.includeDestinationOnly !== undefined) {
    requestBody.includeDestinationOnly = options.includeDestinationOnly;
  }

  const under = options?.underPath?.trim();
  if (under && under !== "/") {
    requestBody.underPath = under;
  }

  if (options?.ruleset) {
    requestBody.ruleset = options.ruleset;
  }

  if (requestBody.conditions!.length === 0) {
    requestBody.conditions = undefined;
  }

  return requestBody;
}

function normalizeSearchPagination(
  raw: Record<string, unknown> | undefined,
  fallback: { offset: number; limit: number; itemCount: number }
): PaginationInfo {
  if (!raw) {
    return {
      offset: fallback.offset,
      limit: fallback.limit,
      total: fallback.itemCount,
      totalFolders: undefined,
      totalFiles: undefined,
      hasMore: false,
    };
  }

  const total = parseOptionalTotal(raw.Total ?? raw.total);
  const totalFolders = parseOptionalTotal(raw.TotalFolders ?? raw.totalFolders);
  const totalFiles = parseOptionalTotal(raw.TotalFiles ?? raw.totalFiles);

  return {
    offset: Number(raw.Offset ?? raw.offset ?? fallback.offset) || 0,
    limit: Number(raw.Limit ?? raw.limit ?? fallback.limit) || fallback.limit,
    ...(total !== undefined ? { total } : {}),
    ...(totalFolders !== undefined ? { totalFolders } : {}),
    ...(totalFiles !== undefined ? { totalFiles } : {}),
    hasMore: Boolean(raw.HasMore ?? raw.hasMore ?? false),
  };
}

/**
 * Search path review items. Requires at least one filter condition (UI-enforced).
 * @param migrationId The ID of the migration
 * @param options Search and pagination options
 * @returns Promise resolving to items and pagination info
 */
export async function searchPathReviewItems(
  migrationId: string,
  options?: SearchOptions,
  init?: { signal?: AbortSignal }
): Promise<{ items: DiffItem[]; pagination: PaginationInfo; stats: PathReviewStats | null }> {

  const params = new URLSearchParams();
  if (options?.offset !== undefined) {
    params.append("offset", options.offset.toString());
  }
  if (options?.limit !== undefined) {
    params.append("limit", options.limit.toString());
  }
  if (options?.sortField) {
    params.append("sortField", options.sortField);
  }
  if (options?.sortDir) {
    params.append("sortDir", options.sortDir);
  }

  const requestBody = buildSearchRequest(options);

  const url = `/api/migrations/${migrationId}/search${params.toString() ? `?${params.toString()}` : ""}`;

  const response = await apiFetch(url, {
    method: "POST",
    body: JSON.stringify(requestBody),
    signal: init?.signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to search path review items (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  const data = (await response.json()) as any;

  // Handle response structure (same as getMigrationDiffs)
  const itemsMap = data.items || data;
  
  if (!itemsMap || typeof itemsMap !== "object") {
    console.error("searchPathReviewItems: Invalid response structure", data);
    throw new Error("Invalid API response: items not found");
  }

  const paginationData = normalizeSearchPagination(
    data.pagination as Record<string, unknown> | undefined,
    {
      offset: options?.offset || 0,
      limit: options?.limit || 1000,
      itemCount: Object.keys(itemsMap).length,
    }
  );

  // Count folders and files for pagination if pagination object was absent
  if (!data.pagination) {
    let folderCount = 0;
    let fileCount = 0;
    for (const pathNodes of Object.values(itemsMap)) {
      const nodes = pathNodes as PathNodes;
      const type = nodes.src?.type || nodes.dst?.type;
      if (type === "folder") {
        folderCount++;
      } else if (type === "file") {
        fileCount++;
      }
    }
    paginationData.totalFolders = folderCount;
    paginationData.totalFiles = fileCount;
  }

  // Transform the API response into a flat array of DiffItems for UI consumption
  // (Same transformation logic as getMigrationDiffs)
  const transformedItems: DiffItem[] = [];

  const itemOrder = Array.isArray(data.itemOrder) ? (data.itemOrder as string[]) : undefined;
  const entries: [string, PathNodes][] = itemOrder?.length
    ? itemOrder
        .map((p) => [p, itemsMap[p] as PathNodes | undefined])
        .filter((e): e is [string, PathNodes] => e[1] != null)
    : Object.entries(itemsMap);

  for (const [path, pathNodes] of entries) {
    const nodes = pathNodes as PathNodes;
    const hasSrc = nodes.src !== undefined;
    const hasDst = nodes.dst !== undefined;

    // Include all items (src-only, dst-only, and both)
    // Use src as primary if available, otherwise use dst
    const primaryNode = nodes.src || nodes.dst;
    
    if (!primaryNode) {
      // Skip items with neither src nor dst (shouldn't happen, but safety check)
      continue;
    }
    
    // For status determination:
    
    const diffItem: DiffItem = {
      id: primaryNode.id,
      parentId: primaryNode.parentId,
      parentPath: primaryNode.parentPath,
      name: primaryNode.name,
      locationPath: primaryNode.locationPath,
      displayPath: primaryNode.displayPath || undefined,
      ServiceID: primaryNode.ServiceID,
      lastUpdated: primaryNode.lastUpdated,
      depthLevel: primaryNode.depthLevel,
      type: primaryNode.type as "folder" | "file",
      size: primaryNode.size,
      traversalStatus: primaryNode.traversalStatus,
      copyStatus: primaryNode?.copyStatus || undefined,
      src: nodes.src,
      dst: nodes.dst,
      resolvedDstName: nodes.resolvedDstName || undefined,
    };

    transformedItems.push(diffItem);
  }

  // Extract and transform stats from response if present
  let transformedStats: PathReviewStats | null = null;
  if (data.stats) {
    transformedStats = coercePathReviewStats(data.stats as PathReviewStats);
  }

  return {
    items: transformedItems,
    pagination: paginationData,
    stats: transformedStats,
  };
}

/**
 * Count total matches for the current list-search filters (does not auto-fire from paging).
 * POST /api/migrations/{id}/search/count — same body as search.
 */
export async function countPathReviewSearchMatches(
  migrationId: string,
  options?: SearchOptions,
  init?: { signal?: AbortSignal }
): Promise<DiffsStatsResponse> {
  const requestBody = buildSearchRequest(options);
  const response = await apiFetch(`/api/migrations/${migrationId}/search/count`, {
    method: "POST",
    body: JSON.stringify(requestBody),
    signal: init?.signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to count path review matches (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const total = parseOptionalTotal(data.Total ?? data.total) ?? 0;
  const totalFolders =
    parseOptionalTotal(data.TotalFolders ?? data.totalFolders) ?? 0;
  const totalFiles = parseOptionalTotal(data.TotalFiles ?? data.totalFiles) ?? 0;
  const truncated = data.truncated === true || data.Truncated === true;
  return { total, totalFolders, totalFiles, truncated };
}

/** In-flight path-review writer status (bulk exclude/unexclude). */
export async function getReviewOpsStatus(
  migrationId: string
): Promise<{ bulkMutationInProgress: boolean }> {
  const response = await apiFetch(`/api/migrations/${migrationId}/review-ops`);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to load review ops (${response.status}): ${message || "Unknown error"}`
    );
  }
  const data = (await response.json()) as Record<string, unknown>;
  return {
    bulkMutationInProgress:
      data.bulkMutationInProgress === true ||
      data.BulkMutationInProgress === true,
  };
}

// Bulk exclusion API types and functions
export interface BulkExclusionRequest {
  nodeIDs?: string[];  // Array of node IDs (ULIDs) - optional
  all?: boolean;       // If true, operate on all matching items - optional
  filter?: {
    status?: string;   // Status filter when all: true (e.g., "failed") - optional
  };
  /** Exclude/unexclude by the same SearchRequest as list search. */
  search?: SearchRequest;
  /** Node IDs spared from a search-based exclude. */
  except?: string[];
}

/**
 * Exclude all nodes matching the active list search (optional except list).
 */
export async function excludeMatchingSearch(
  migrationId: string,
  options: SearchOptions,
  except: string[] = []
): Promise<ExclusionResponse> {
  const search = buildSearchRequest(options);
  return bulkExcludeNodes(migrationId, { search, except });
}

/**
 * Unexclude all nodes matching the active list search (optional except list).
 */
export async function unexcludeMatchingSearch(
  migrationId: string,
  options: SearchOptions,
  except: string[] = []
): Promise<ExclusionResponse> {
  const search = buildSearchRequest(options);
  return bulkUnexcludeNodes(migrationId, { search, except });
}

/**
 * Bulk exclude nodes from the migration
 * @param migrationId The ID of the migration
 * @param request Bulk exclusion request
 * @returns Promise resolving to ExclusionResponse (may include taskID for bulk operations)
 */
export async function bulkExcludeNodes(
  migrationId: string,
  request: BulkExclusionRequest
): Promise<ExclusionResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/exclude`,
    {
      method: "POST",
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to exclude nodes";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return {
      success: false,
      error: errorMessage,
    };
  }

  const data = await response.json();
  return data;
}

/**
 * Bulk unexclude nodes from the migration
 * @param migrationId The ID of the migration
 * @param request Bulk unexclusion request
 * @returns Promise resolving to ExclusionResponse (may include taskID for bulk operations)
 */
export async function bulkUnexcludeNodes(
  migrationId: string,
  request: BulkExclusionRequest
): Promise<ExclusionResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/unexclude`,
    {
      method: "POST",
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to unexclude nodes";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return {
      success: false,
      error: errorMessage,
    };
  }

  const data = await response.json();
  return data;
}

export type BulkRetryKind = "discovery" | "copy" | "delete";

export interface BulkRetryRequest {
  nodeIDs: string[];
  kind?: BulkRetryKind;
  markAsFailed?: boolean;
}

/**
 * Bulk mark nodes for retry (or mark as failed when markAsFailed is set).
 */
export async function bulkMarkNodesForRetry(
  migrationId: string,
  request: BulkRetryRequest
): Promise<ExclusionResponse> {
  const response = await apiFetch(`/api/migrations/${migrationId}/mark-retry`, {
    method: "POST",
    body: JSON.stringify({
      nodeIDs: request.nodeIDs,
      kind: request.kind,
      markAsFailed: request.markAsFailed === true,
    }),
  });
  if (!response.ok) {
    let errorMessage = "Failed to update retry status";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return { success: false, error: errorMessage };
  }
  return response.json();
}

/**
 * Bulk mark nodes as failed (clear pending retry).
 */
export async function bulkUnmarkNodesForRetry(
  migrationId: string,
  request: BulkRetryRequest
): Promise<ExclusionResponse> {
  const response = await apiFetch(`/api/migrations/${migrationId}/unmark-retry`, {
    method: "POST",
    body: JSON.stringify({
      nodeIDs: request.nodeIDs,
      kind: request.kind,
    }),
  });
  if (!response.ok) {
    let errorMessage = "Failed to mark nodes failed";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    return { success: false, error: errorMessage };
  }
  return response.json();
}

// Background tasks API types and functions
export type BackgroundTaskType = 
  | "etl"
  | "exclusion_propagate"
  | "unexclusion_propagate"
  | "exclusion_sweep"
  | "retry_sweep"
  | "retry_all";

export type BackgroundTaskStatus = "running" | "completed" | "failed";

export interface BackgroundTask {
  id: string;
  type: BackgroundTaskType;
  status: BackgroundTaskStatus;
  startedAt: string;  // ISO 8601 timestamp
  completedAt?: string;  // ISO 8601 timestamp, present when completed/failed
  error?: string;
  progress?: Record<string, any>;
  path?: string;  // Path associated with the task (for propagation tasks)
}

export interface RunningTasksResponse {
  hasRunningTasks: boolean;
  count: number;
  tasks: BackgroundTask[];
}

/**
 * Get background tasks for a migration
 * @param migrationId The ID of the migration
 * @returns Promise resolving to array of BackgroundTask
 */
export async function getBackgroundTasks(
  migrationId: string
): Promise<BackgroundTask[]> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/bgTasks`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to get background tasks (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Check for running background tasks for a migration
 * @param migrationId The ID of the migration
 * @returns Promise resolving to RunningTasksResponse
 */
export async function getRunningBackgroundTasks(
  migrationId: string
): Promise<RunningTasksResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/bgTasks/running`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to get running background tasks (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  return (await response.json()) as RunningTasksResponse;
}

// Retry sweep API types and functions
export interface RetrySweepRequest {
  workerCount?: number;
  maxRetries?: number;
  maxKnownDepth?: number;
  logAddress?: string;
  logLevel?: string;
  skipListener?: boolean;
  startupDelaySeconds?: number;
  progressTickMillis?: number;
  /** Index-build override for *-finalize-failed retry (0 = engine default 2GB). */
  memoryLimitGB?: number;
  /** Index-build override for *-finalize-failed retry (0 = engine default 1; max 4). */
  threads?: number;
}

export interface RetrySweepResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export async function resumeMigration(
  migrationId: string,
  config?: RetrySweepRequest
): Promise<RetrySweepResponse> {
  const response = await apiFetch(`/api/migrations/${migrationId}/resume`, {
    method: "POST",
    body: JSON.stringify(config || {}),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return {
      success: false,
      error: data.error || `Failed to resume migration (${response.status})`,
    };
  }

  const data = await response.json();
  return data as RetrySweepResponse;
}

/** Retry seal stop / secondary indexes / checkpoint after *-finalize-failed. */
export async function retryFinalize(
  migrationId: string,
  config?: Pick<RetrySweepRequest, "memoryLimitGB" | "threads">
): Promise<RetrySweepResponse> {
  const response = await apiFetch(`/api/migrations/${migrationId}/retry-finalize`, {
    method: "POST",
    body: JSON.stringify(config || {}),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return {
      success: false,
      error: data.error || `Failed to retry finalize (${response.status})`,
    };
  }

  const data = await response.json();
  return data as RetrySweepResponse;
}

/**
 * Trigger retry sweep for a migration
 * @param migrationId The ID of the migration
 * @param config Optional configuration for the retry sweep
 * @returns Promise resolving to RetrySweepResponse
 */
export async function triggerRetrySweep(
  migrationId: string,
  config?: RetrySweepRequest
): Promise<RetrySweepResponse> {

  const response = await apiFetch(
    `/api/migrations/${migrationId}/retry-sweep`,
    {
      method: "POST",
      body: JSON.stringify(config || {}),
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return {
      success: false,
      error: data.error || `Failed to trigger retry sweep (${response.status})`,
    };
  }

  const data = await response.json();
  return data as RetrySweepResponse;
}

/**
 * Get user preferences from the backend
 * @returns Promise resolving to UserPreferences, falls back to defaults on error
 */
export async function getPreferences(): Promise<UserPreferences> {

  try {
    const response = await apiFetch(`/api/preferences`, {
      method: "GET",
    });

    if (!response.ok) {
      // If 404 or other error, return defaults
      console.warn(`Failed to get preferences (${response.status}), using defaults`);
      return DEFAULT_PREFERENCES;
    }

    const data = await response.json();

    const theme = normalizeAppTheme(data.theme);

    return {
      theme,
      sidebarCollapsed: typeof data.sidebarCollapsed === "boolean" ? data.sidebarCollapsed : DEFAULT_PREFERENCES.sidebarCollapsed,
      hideUnsetServices: typeof data.hideUnsetServices === "boolean" ? data.hideUnsetServices : DEFAULT_PREFERENCES.hideUnsetServices,
      defaultRulesetId: typeof data.defaultRulesetId === "string" ? data.defaultRulesetId : DEFAULT_PREFERENCES.defaultRulesetId,
      tips: data.tips && typeof data.tips === "object" ? {
        enabled: typeof data.tips.enabled === "boolean" ? data.tips.enabled : DEFAULT_PREFERENCES.tips!.enabled,
        categories: typeof data.tips.categories === "object" && data.tips.categories !== null ? data.tips.categories : DEFAULT_PREFERENCES.tips!.categories,
      } : DEFAULT_PREFERENCES.tips,
      developer: data.developer && typeof data.developer === "object" ? {
        enabled: typeof data.developer.enabled === "boolean" ? data.developer.enabled : DEFAULT_PREFERENCES.developer!.enabled,
        showSpectraService: typeof data.developer.showSpectraService === "boolean" ? data.developer.showSpectraService : DEFAULT_PREFERENCES.developer!.showSpectraService,
        disableDbQueryTimeout: typeof data.developer.disableDbQueryTimeout === "boolean" ? data.developer.disableDbQueryTimeout : DEFAULT_PREFERENCES.developer!.disableDbQueryTimeout,
      } : DEFAULT_PREFERENCES.developer,
    };
  } catch (error) {
    console.error("Error fetching preferences, using defaults", error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save user preferences to the backend
 * @param prefs UserPreferences to save
 * @returns Promise resolving when save completes, rejects on error
 */
export async function savePreferences(prefs: UserPreferences): Promise<void> {
  const payload: UserPreferences = {
    ...prefs,
    theme: normalizeAppTheme(prefs.theme),
  };

  const response = await apiFetch(`/api/preferences`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to save preferences (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }
}

export async function listRulesets(createdBy?: string): Promise<RulesetSummary[]> {
  const params = createdBy ? `?createdBy=${encodeURIComponent(createdBy)}` : "";
  const response = await apiFetch(`/api/rulesets${params}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to list rulesets"));
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function listPrepackagedRulesets(): Promise<RulesetSummary[]> {
  const response = await apiFetch(`/api/rulesets/prepackaged`, { method: "GET" });
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to list prepackaged rulesets")
    );
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function getRuleset(id: string): Promise<RulesetSummary> {
  const response = await apiFetch(`/api/rulesets/${encodeURIComponent(id)}`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to get ruleset"));
  }
  return (await response.json()) as RulesetSummary;
}

export async function createRuleset(
  payload: CreateRulesetRequest
): Promise<RulesetSummary> {
  const response = await apiFetch(`/api/rulesets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to create ruleset"));
  }
  return (await response.json()) as RulesetSummary;
}

export async function updateRuleset(
  id: string,
  payload: UpdateRulesetRequest
): Promise<RulesetSummary> {
  const response = await apiFetch(`/api/rulesets/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to update ruleset"));
  }
  return (await response.json()) as RulesetSummary;
}

export async function deleteRuleset(id: string): Promise<void> {
  const response = await apiFetch(`/api/rulesets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to delete ruleset"));
  }
}

export async function importRuleset(ruleset: FilterRuleset): Promise<RulesetSummary> {
  const response = await apiFetch(`/api/rulesets/import`, {
    method: "POST",
    body: JSON.stringify(ruleset),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to import ruleset"));
  }
  return (await response.json()) as RulesetSummary;
}

export async function exportRuleset(id: string): Promise<FilterRuleset> {
  const response = await apiFetch(`/api/rulesets/${encodeURIComponent(id)}/export`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to export ruleset"));
  }
  return (await response.json()) as FilterRuleset;
}

export async function getMigrationRuleset(
  migrationId: string
): Promise<MigrationRulesetResponse> {
  const response = await apiFetch(
    `/api/migrations/${encodeURIComponent(migrationId)}/ruleset`,
    { method: "GET" }
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to get migration ruleset")
    );
  }
  return (await response.json()) as MigrationRulesetResponse;
}

export async function setMigrationRuleset(
  migrationId: string,
  ruleset: FilterRuleset
): Promise<void> {
  const response = await apiFetch(
    `/api/migrations/${encodeURIComponent(migrationId)}/ruleset`,
    {
      method: "PUT",
      body: JSON.stringify({ ruleset }),
    }
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to save migration ruleset")
    );
  }
}

export async function reapplyMigrationRuleset(
  migrationId: string,
  config?: { includePending?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const response = await apiFetch(
    `/api/migrations/${encodeURIComponent(migrationId)}/ruleset/reapply`,
    {
      method: "POST",
      body: JSON.stringify(config ?? {}),
    }
  );
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to reapply migration ruleset")
    );
  }
  return (await response.json()) as { success: boolean; error?: string };
}

