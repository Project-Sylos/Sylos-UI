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

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8086";
const AUTH_STORAGE_KEY = "sylos.authToken";

const fallbackServices: ServiceDescriptor[] = [
  { id: "local", displayName: "Local Filesystem", type: "local" },
  { id: "spectra-primary", displayName: "Spectra Simulator", type: "spectra" },
];

function getAuthToken(): string | null {
  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

function buildHeaders(token?: string, extra?: HeadersInit): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (extra) {
    const wrapper = new Headers(extra);
    wrapper.forEach((value, key) => headers.set(key, value));
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

export async function fetchServices(): Promise<ServiceDescriptor[]> {
  const token = getAuthToken() ?? undefined;
  try {
    const response = await fetch(`${API_BASE}/api/services`, {
      method: "GET",
      headers: buildHeaders(token),
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(`${API_BASE}/api/migrations/roots`, {
    method: "POST",
    headers: buildHeaders(token),
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(`${API_BASE}/api/migrations`, {
    method: "POST",
    headers: buildHeaders(token),
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
  const token = getAuthToken() ?? undefined;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("filename", filename);
  if (overwrite) {
    formData.append("overwrite", "true");
  }

  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}/api/migrations/db/upload`, {
    method: "POST",
    headers,
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(`${API_BASE}/api/migrations/db/list`, {
    method: "GET",
    headers: buildHeaders(token),
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}`,
    {
      method: "GET",
      headers: buildHeaders(token),
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

export async function inspectMigration(
  migrationId: string
): Promise<MigrationInspectResponse> {
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/inspect`,
    {
      method: "GET",
      headers: buildHeaders(token),
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
  const token = getAuthToken() ?? undefined;

  const params = new URLSearchParams();
  if (options?.offset !== undefined) {
    params.append("offset", options.offset.toString());
  }
  if (options?.limit !== undefined) {
    params.append("limit", options.limit.toString());
  }

  const url = `${API_BASE}/api/migrations${params.toString() ? `?${params.toString()}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders(token),
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/load`,
    {
      method: "POST",
      headers: buildHeaders(token),
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/stop`,
    {
      method: "POST",
      headers: buildHeaders(token),
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

export async function listDrives(
  serviceId: string
): Promise<Drive[]> {
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/services/${serviceId}/drives`,
    {
      method: "GET",
      headers: buildHeaders(token),
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
  return Array.isArray(data) ? data : [];
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
  const token = getAuthToken() ?? undefined;

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

  const response = await fetch(
    `${API_BASE}/api/services/${serviceId}/children?${params.toString()}`,
    {
      method: "GET",
      headers: buildHeaders(token),
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
  const normalizeFolder = (folder: any): Folder => ({
    ServiceID: folder.ServiceID,
    Id: folder.Id || folder.ServiceID, // Fallback to ServiceID if Id not provided
    name: folder.name,
    locationPath: folder.LocationPath,
    parentId: folder.ParentId,
    parentPath: folder.ParentPath,
    lastUpdated: folder.LastUpdated,
    depthLevel: folder.DepthLevel,
    type: folder.Type,
  });

  const folders = (data.folders || []).map(normalizeFolder);
  const files = data.files || [];

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
  const token = getAuthToken() ?? undefined;

  // Don't send lastSeenIds - we filter duplicates on the frontend
  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/logs`,
    {
      method: "POST",
      headers: buildHeaders(token),
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/queue-metrics`,
    {
      method: "GET",
      headers: buildHeaders(token),
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
  parentPath?: string;        // UI-constructed parent path (for display/navigation)
  name: string;        // Display name (basename of the path)
  locationPath: string;       // UI-constructed path (e.g., "/$Recycle.Bin")
  lastUpdated?: string;       // Last updated timestamp (RFC3339 format)
  depthLevel: number;         // Depth in the directory tree (0 = root)
  type: string;               // "folder" or "file"
  size?: number;              // File size in bytes (only present for files)
  traversalStatus: "pending" | "successful" | "failed" | "excluded" | "not_on_src";
  copyStatus?: string;        // "pending", "successful", or "failed" (for future copy phase)
}

export interface PathNodes {
  src?: PathNodeItem;  // Source node (present if item exists in SRC queue)
  dst?: PathNodeItem;  // Destination node (present if item exists in DST queue)
}

export interface PaginationInfo {
  offset: number;       // Current pagination offset
  limit: number;        // Current pagination limit
  total: number;        // Total number of items (folders + files, or just folders if foldersOnly=true)
  totalFolders: number; // Total number of folders across all pages
  totalFiles: number;   // Total number of files across all pages
  hasMore: boolean;     // Whether there are more items beyond the current page
}

export interface ListChildrenDiffsResponse {
  items: { [path: string]: PathNodes };  // Map of path -> { src?, dst? }
  pagination: PaginationInfo;
}

// Transformed item for UI consumption
export interface DiffItem {
  id: string;                // Migration Engine ULID (26 chars) from src if available, otherwise dst - USE THIS FOR API OPERATIONS
  ServiceID?: string;        // Service's native identifier from src if available, otherwise dst - e.g., "C:/$Recycle.Bin" for local
  parentId?: string;         // Migration Engine ULID (26 chars) - parent node ID
  parentPath?: string;       // UI-constructed parent path (for display/navigation)
  name: string;       // Display name from src if available, otherwise dst
  locationPath: string;      // UI-constructed path from src if available, otherwise dst - e.g., "/$Recycle.Bin"
  lastUpdated?: string;      // Last updated timestamp from src if available, otherwise dst
  depthLevel: number;        // Depth level from src if available, otherwise dst
  type: "folder" | "file";   // Type from src if available, otherwise dst
  size?: number;             // File size from src if available, otherwise dst
  traversalStatus: string;   // Traversal status from src if available, otherwise dst
  copyStatus?: string;       // Copy status from src if available, otherwise dst
  inSrc: boolean;            // Whether src node exists
  inDst: boolean;            // Whether dst node exists
  src?: PathNodeItem;        // Full src node (for hover card)
  dst?: PathNodeItem;        // Full dst node (for hover card)
}

export async function getMigrationDiffs(
  migrationId: string,
  options?: {
    locationPath?: string;  // Relative path (locationPath) - "/" for root, "/folder1" for children, etc.
    offset?: number;
    limit?: number;
    foldersOnly?: boolean;
  }
): Promise<{ items: DiffItem[]; pagination: PaginationInfo }> {
  const token = getAuthToken() ?? undefined;

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

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/diffs?${params.toString()}`,
    {
      method: "GET",
      headers: buildHeaders(token),
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
  const paginationData = data.pagination || {
    offset: options?.offset || 0,
    limit: options?.limit || 100,
    total: Object.keys(itemsMap).length,
    totalFolders: 0,
    totalFiles: 0,
    hasMore: false,
  };

  // Count folders and files for pagination if not provided
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
  const transformedItems: DiffItem[] = [];

  for (const [path, pathNodes] of Object.entries(itemsMap)) {
    const nodes = pathNodes as PathNodes;
    const hasSrc = nodes.src !== undefined;
    const hasDst = nodes.dst !== undefined;

    // Skip DST-only items (items that don't exist in source)
    // We only show items that exist in source
    if (!hasSrc) {
      continue;
    }

    // Use src as primary, fallback to dst if src doesn't exist (shouldn't happen due to filter above)
    const primaryNode = nodes.src || nodes.dst!;
    
    const diffItem: DiffItem = {
      id: primaryNode.id,
      parentId: primaryNode.parentId,
      parentPath: primaryNode.parentPath,
      name: primaryNode.name,
      locationPath: primaryNode.locationPath,
      ServiceID: primaryNode.ServiceID,
      lastUpdated: primaryNode.lastUpdated,
      depthLevel: primaryNode.depthLevel,
      type: primaryNode.type as "folder" | "file",
      size: primaryNode.size,
      traversalStatus: primaryNode.traversalStatus,
      copyStatus: primaryNode.copyStatus,
      inSrc: hasSrc,
      inDst: hasDst,
      src: nodes.src,
      dst: nodes.dst,
    };

    transformedItems.push(diffItem);
  }

  return {
    items: transformedItems,
    pagination: paginationData,
  };
}

// TODO: API endpoint needed - Update item copy status
// This should update whether an item should be copied or not
// Exclusion API types
export interface ExclusionResponse {
  success: boolean;
  error?: string;
  taskID?: string;  // Present for bulk operations (all: true)
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/exclude`,
    {
      method: "POST",
      headers: buildHeaders(token),
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/unexclude`,
    {
      method: "POST",
      headers: buildHeaders(token),
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
export async function markNodeForRetry(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/mark-retry`,
    {
      method: "POST",
      headers: buildHeaders(token),
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to mark node for retry";
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
 * Unmark a node for retry (remove from retry queue)
 * @param migrationId The ID of the migration
 * @param nodeId The ULID of the node to unmark for retry (from PathNodeItem.id)
 * @returns Promise resolving to ExclusionResponse
 */
export async function unmarkNodeForRetry(
  migrationId: string,
  nodeId: string
): Promise<ExclusionResponse> {
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/node/${encodeURIComponent(nodeId)}/unmark-retry`,
    {
      method: "POST",
      headers: buildHeaders(token),
    }
  );

  if (!response.ok) {
    let errorMessage = "Failed to unmark node for retry";
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

// Legacy function - kept for backwards compatibility but should use exclude/unexclude instead
export async function updateItemCopyStatus(
  migrationId: string,
  itemId: string,
  shouldCopy: boolean
): Promise<void> {
  // This function is deprecated - use excludeNode/unexcludeNode instead
  // Keeping for backwards compatibility
  if (shouldCopy) {
    await unexcludeNode(migrationId, itemId);
  } else {
    await excludeNode(migrationId, itemId);
  }
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
  phase: "traversal" | "copy",
  options?: PhaseChangeRequest["options"]
): Promise<PhaseChangeResponse> {
  const token = getAuthToken() ?? undefined;

  const requestBody: PhaseChangeRequest = {
    phase,
    migrationId,
    options,
  };

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/phase-change`,
    {
      method: "POST",
      headers: {
        ...buildHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    let errorMessage = `Failed to change phase to ${phase}`;
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

// Pending work API types and functions
export interface PendingWorkResponse {
  hasPendingExclusions: boolean;
  hasPendingRetries: boolean;
  hasPathReviewChanges: boolean;
  pendingExclusionsCount: number;
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/pending-work`,
    {
      method: "GET",
      headers: buildHeaders(token),
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

// Path Review Statistics API types and functions
export interface PathReviewStats {
  pendingCount: number;
  failedCount: number;
  excludedCount: number;
  foldersCount: number;
  filesCount: number;
  foldersRatio: number;  // 0-100, rounded to 2 decimal places
  filesRatio: number;    // 0-100, rounded to 2 decimal places
  totalFileSize: {
    src: number;  // Total bytes in src_nodes
    dst: number;  // Total bytes in dst_nodes
  };
}

/**
 * Get path review statistics
 * @param migrationId The ID of the migration
 * @returns Promise resolving to PathReviewStats
 */
export async function getPathReviewStats(
  migrationId: string
): Promise<PathReviewStats> {
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/stats`,
    {
      method: "GET",
      headers: buildHeaders(token),
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

  return (await response.json()) as PathReviewStats;
}

// Search API types and functions
export interface SearchCondition {
  field: string;  // "name", "path", "depth", "size", "type", "traversalStatus", "copyStatus"
  operator?: string;  // Optional - ignored for name/path/type/traversalStatus/copyStatus, required for depth/size
  value: string | number;  // Value to match against
}

export interface SearchOptions {
  offset?: number;
  limit?: number;
  foldersOnly?: boolean; // Deprecated - use typeFilter instead
  sortField?: string;  // "name", "path", "depth", "size", "type", "traversalStatus", "copyStatus"
  sortDir?: "asc" | "desc";
  query?: string;  // Search query text
  searchField?: "path" | "name"; // Field to search in (path or name) - defaults to "path"
  typeFilter?: "both" | "folder" | "file"; // Type filter - defaults to "both"
  depthFilter?: number | null; // Depth filter (number)
  depthOperator?: "equals" | "gt" | "gte" | "lt" | "lte"; // Depth operator - defaults to "equals"
  sizeFilter?: number | null; // Size filter (number in bytes)
  sizeOperator?: "equals" | "gt" | "gte" | "lt" | "lte"; // Size operator - defaults to "equals"
  traversalStatusFilter?: string | null; // Traversal status filter (pending, failed, etc.)
}

export interface SearchRequest {
  conditions?: SearchCondition[];
  sort?: {
    field?: string;
    direction?: "asc" | "desc";
  };
}

/**
 * Search path review items (lists all items when no search criteria provided)
 * @param migrationId The ID of the migration
 * @param options Search and pagination options
 * @returns Promise resolving to items and pagination info
 */
export async function searchPathReviewItems(
  migrationId: string,
  options?: SearchOptions
): Promise<{ items: DiffItem[]; pagination: PaginationInfo; stats: PathReviewStats | null }> {
  const token = getAuthToken() ?? undefined;

  const params = new URLSearchParams();
  if (options?.offset !== undefined) {
    params.append("offset", options.offset.toString());
  }
  if (options?.limit !== undefined) {
    params.append("limit", options.limit.toString());
  }
  // Note: foldersOnly is now handled via conditions in the request body
  if (options?.sortField) {
    params.append("sortField", options.sortField);
  }
  if (options?.sortDir) {
    params.append("sortDir", options.sortDir);
  }

  // Build request body with conditions
  const requestBody: SearchRequest = {
    conditions: [],
  };

  // Add search query condition (searches specified field - operator is optional/ignored for text fields)
  const searchField = options?.searchField || "path"; // Default to "path"
  if (options?.query !== undefined && options.query.trim() !== "") {
    requestBody.conditions!.push({
      field: searchField,
      value: options.query.trim(),
      // operator is optional for name/path fields - always uses substring matching
    });
  }

  // Add type filter condition (operator is optional/ignored for type field)
  const typeFilter = options?.typeFilter || (options?.foldersOnly ? "folder" : "both"); // Support deprecated foldersOnly
  if (typeFilter !== "both") {
    requestBody.conditions!.push({
      field: "type",
      value: typeFilter,
      // operator is optional for type field - always uses exact match (case-insensitive)
    });
  }

  // Add depth filter condition (numeric comparison)
  if (options?.depthFilter !== undefined && options.depthFilter !== null && !isNaN(options.depthFilter)) {
    requestBody.conditions!.push({
      field: "depth",
      operator: options.depthOperator || "equals",
      value: options.depthFilter,
    });
  }

  // Add size filter condition (numeric comparison) - only if not filtering folders only
  if (options?.sizeFilter !== undefined && options.sizeFilter !== null && !isNaN(options.sizeFilter) && typeFilter !== "folder") {
    requestBody.conditions!.push({
      field: "size",
      operator: options.sizeOperator || "equals",
      value: options.sizeFilter,
    });
  }

  // Add traversal status filter condition (operator is optional/ignored for traversalStatus field)
  // Note: "excluded" is handled specially by the API to match both exclusion_explicit and exclusion_inherited
  if (options?.traversalStatusFilter !== undefined && options.traversalStatusFilter !== null && options.traversalStatusFilter !== "") {
    requestBody.conditions!.push({
      field: "traversalStatus",
      value: options.traversalStatusFilter,
      // operator is optional for traversalStatus field - always uses exact match (case-insensitive)
      // Special: "excluded" value matches both exclusion_explicit and exclusion_inherited on the backend
    });
  }

  // If no conditions, set to undefined to send empty object
  if (requestBody.conditions!.length === 0) {
    requestBody.conditions = undefined;
  }

  const url = `${API_BASE}/api/migrations/${migrationId}/search${params.toString() ? `?${params.toString()}` : ""}`;

  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(requestBody),
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

  const paginationData = data.pagination || {
    offset: options?.offset || 0,
    limit: options?.limit || 1000,
    total: Object.keys(itemsMap).length,
    totalFolders: 0,
    totalFiles: 0,
    hasMore: false,
  };

  // Count folders and files for pagination if not provided
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

  for (const [path, pathNodes] of Object.entries(itemsMap)) {
    const nodes = pathNodes as PathNodes;
    const hasSrc = nodes.src !== undefined;
    const hasDst = nodes.dst !== undefined;

    // Skip DST-only items (items that don't exist in source)
    // We only show items that exist in source
    if (!hasSrc) {
      continue;
    }

    // Use src as primary, fallback to dst if src doesn't exist (shouldn't happen due to filter above)
    const primaryNode = nodes.src || nodes.dst!;
    
    const diffItem: DiffItem = {
      id: primaryNode.id,
      parentId: primaryNode.parentId,
      parentPath: primaryNode.parentPath,
      name: primaryNode.name,
      locationPath: primaryNode.locationPath,
      ServiceID: primaryNode.ServiceID,
      lastUpdated: primaryNode.lastUpdated,
      depthLevel: primaryNode.depthLevel,
      type: primaryNode.type as "folder" | "file",
      size: primaryNode.size,
      traversalStatus: primaryNode.traversalStatus,
      copyStatus: primaryNode.copyStatus,
      inSrc: hasSrc,
      inDst: hasDst,
      src: nodes.src,
      dst: nodes.dst,
    };

    transformedItems.push(diffItem);
  }

  // Extract stats from response if present
  const stats = data.stats || null;

  return {
    items: transformedItems,
    pagination: paginationData,
    stats: stats as PathReviewStats | null,
  };
}

// Bulk exclusion API types and functions
export interface BulkExclusionRequest {
  nodeIDs?: string[];  // Array of node IDs (ULIDs) - optional
  all?: boolean;       // If true, operate on all matching items - optional
  filter?: {
    status?: string;   // Status filter when all: true (e.g., "failed") - optional
  };
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/exclude`,
    {
      method: "POST",
      headers: buildHeaders(token),
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
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/unexclude`,
    {
      method: "POST",
      headers: buildHeaders(token),
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

/**
 * Get background tasks for a migration
 * @param migrationId The ID of the migration
 * @returns Promise resolving to array of BackgroundTask
 */
export async function getBackgroundTasks(
  migrationId: string
): Promise<BackgroundTask[]> {
  const token = getAuthToken() ?? undefined;

  const response = await fetch(
    `${API_BASE}/api/migrations/${migrationId}/bgTasks`,
    {
      method: "GET",
      headers: buildHeaders(token),
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

