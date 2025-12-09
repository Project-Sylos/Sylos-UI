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

export async function listMigrations(): Promise<MigrationMetadata[]> {
  const token = getAuthToken() ?? undefined;

  const response = await fetch(`${API_BASE}/api/migrations`, {
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

  const data = await response.json();
  // Ensure we always return an array, even if API returns null or undefined
  return Array.isArray(data) ? data : [];
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
  
  // Normalize API response: API returns capitalized fields (Folders, Files, Id, DisplayName)
  // but frontend expects lowercase (folders, files, id, displayName)
  const normalizeFolder = (folder: any): Folder => ({
    id: folder.Id || folder.id,
    displayName: folder.DisplayName || folder.displayName,
    locationPath: folder.LocationPath || folder.locationPath,
    parentId: folder.ParentId || folder.parentId,
    parentPath: folder.ParentPath || folder.parentPath,
    lastUpdated: folder.LastUpdated || folder.lastUpdated,
    depthLevel: folder.DepthLevel || folder.depthLevel,
    type: folder.Type || folder.type,
  });

  const folders = (data.Folders || data.folders || []).map(normalizeFolder);
  const files = data.Files || data.files || [];

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
  id: string;                 // Unique node identifier
  parentId?: string;          // Parent node ID (optional)
  parentPath?: string;        // Parent node path (optional)
  displayName: string;        // Display name (basename of the path)
  locationPath: string;       // Full path to the item
  lastUpdated?: string;       // Last updated timestamp (RFC3339 format)
  depthLevel: number;         // Depth in the directory tree (0 = root)
  type: string;               // "folder" or "file"
  size?: number;              // File size in bytes (only present for files)
  traversalStatus: string;    // "pending", "successful", "failed", or "not_on_src"
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
  path: string;              // The path key from items map
  id: string;                // ID from src if available, otherwise dst
  parentId?: string;
  parentPath?: string;
  displayName: string;       // From src if available, otherwise dst
  locationPath: string;      // From src if available, otherwise dst
  lastUpdated?: string;      // From src if available, otherwise dst
  depthLevel: number;        // From src if available, otherwise dst
  type: "folder" | "file";   // From src if available, otherwise dst
  size?: number;             // From src if available, otherwise dst
  traversalStatus: string;   // From src if available, otherwise dst
  copyStatus?: string;       // From src if available, otherwise dst
  inSrc: boolean;            // Whether src node exists
  inDst: boolean;            // Whether dst node exists
  src?: PathNodeItem;        // Full src node (for hover card)
  dst?: PathNodeItem;        // Full dst node (for hover card)
}

export async function getMigrationDiffs(
  migrationId: string,
  options?: {
    path?: string;
    offset?: number;
    limit?: number;
    foldersOnly?: boolean;
  }
): Promise<{ items: DiffItem[]; pagination: PaginationInfo }> {
  const token = getAuthToken() ?? undefined;

  const params = new URLSearchParams();
  if (options?.path) {
    params.append("path", options.path);
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
      path,
      id: primaryNode.id,
      parentId: primaryNode.parentId,
      parentPath: primaryNode.parentPath,
      displayName: primaryNode.displayName,
      locationPath: primaryNode.locationPath,
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
 * @param nodeId The locationPath of the node to unmark for retry
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

