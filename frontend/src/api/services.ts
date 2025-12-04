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

  return (await response.json()) as MigrationLogsResponse;
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

  return (await response.json()) as MigrationQueueMetricsResponse;
}

