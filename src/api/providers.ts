import {
  CloudConnection,
  CloudRoot,
  ConnectionStatusResponse,
  ConnectionTokenPayload,
  ConnectionTokenResponse,
  ProviderDescriptor,
} from "../types/providers";
import { ChildrenResponse, Folder, PaginationInfo } from "../types/services";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8086";
const AUTH_STORAGE_KEY = "sylos.authToken";

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

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return response.statusText || "Unknown error";
  }
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return parsed.message || parsed.error || text;
  } catch {
    return text;
  }
}

export function normalizeCloudFolder(folder: Record<string, unknown>): Folder {
  return {
    ServiceID: String(folder.serviceId ?? folder.ServiceID ?? folder.id ?? ""),
    Id: String(folder.id ?? folder.Id ?? folder.serviceId ?? folder.ServiceID ?? ""),
    name: String(
      folder.displayName ?? folder.DisplayName ?? folder.name ?? "Untitled"
    ),
    locationPath: String(folder.locationPath ?? folder.LocationPath ?? "/"),
    parentId:
      folder.parentId != null
        ? String(folder.parentId)
        : folder.ParentId != null
          ? String(folder.ParentId)
          : undefined,
    parentPath:
      folder.parentPath != null
        ? String(folder.parentPath)
        : folder.ParentPath != null
          ? String(folder.ParentPath)
          : undefined,
    lastUpdated:
      folder.lastUpdated != null
        ? String(folder.lastUpdated)
        : folder.LastUpdated != null
          ? String(folder.LastUpdated)
          : undefined,
    depthLevel:
      typeof folder.depthLevel === "number"
        ? folder.depthLevel
        : typeof folder.DepthLevel === "number"
          ? folder.DepthLevel
          : undefined,
    type: String(folder.type ?? folder.Type ?? "folder"),
  };
}

function normalizePagination(
  raw: Record<string, unknown> | undefined
): PaginationInfo | undefined {
  if (!raw) return undefined;
  return {
    offset: Number(raw.offset ?? raw.Offset ?? 0),
    limit: Number(raw.limit ?? raw.Limit ?? 100),
    total: Number(raw.total ?? raw.Total ?? 0),
    totalFolders: Number(raw.totalFolders ?? raw.TotalFolders ?? 0),
    totalFiles: Number(raw.totalFiles ?? raw.TotalFiles ?? 0),
    hasMore: Boolean(raw.hasMore ?? raw.HasMore ?? false),
  };
}

function normalizeCloudRoot(raw: Record<string, unknown>): CloudRoot {
  return {
    id: String(raw.id ?? raw.Id ?? ""),
    displayName: String(raw.displayName ?? raw.DisplayName ?? raw.name ?? "Root"),
    rootType: String(raw.rootType ?? raw.RootType ?? raw.type ?? "folder"),
    driveId:
      raw.driveId != null
        ? String(raw.driveId)
        : raw.DriveId != null
          ? String(raw.DriveId)
          : undefined,
  };
}

export async function fetchProviders(): Promise<ProviderDescriptor[]> {
  const token = getAuthToken() ?? undefined;
  const response = await fetch(`${API_BASE}/api/providers`, {
    method: "GET",
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch providers: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Array<Record<string, unknown>>;
  return data.map((item) => ({
    id: String(item.id ?? ""),
    displayName: String(item.displayName ?? item.name ?? item.id ?? ""),
    serviceId: String(item.serviceId ?? ""),
    authType: String(item.authType ?? "oauth_ui_tokens"),
    scopes: Array.isArray(item.scopes) ? item.scopes.map(String) : [],
  }));
}

export async function createConnection(
  providerId: string,
  options?: { migrationId?: string }
): Promise<CloudConnection> {
  const token = getAuthToken() ?? undefined;
  const response = await fetch(`${API_BASE}/api/providers/${providerId}/connections`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(
      options?.migrationId ? { migrationId: options.migrationId } : {}
    ),
  });

  if (!response.ok) {
    throw new Error(`Failed to create connection: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    connectionId: String(data.connectionId ?? data.ConnectionId ?? ""),
    providerId: String(data.providerId ?? data.ProviderId ?? providerId),
  };
}

export async function postConnectionTokens(
  providerId: string,
  connectionId: string,
  payload: ConnectionTokenPayload
): Promise<ConnectionTokenResponse> {
  const token = getAuthToken() ?? undefined;
  const response = await fetch(
    `${API_BASE}/api/providers/${providerId}/connections/${connectionId}/tokens`,
    {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to store tokens: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    connectionId: String(data.connectionId ?? connectionId),
    providerId: String(data.providerId ?? providerId),
    valid: Boolean(data.valid ?? true),
    expiresAt: data.expiresAt != null ? String(data.expiresAt) : undefined,
  };
}

export async function getConnectionStatus(
  providerId: string,
  connectionId: string
): Promise<ConnectionStatusResponse> {
  const token = getAuthToken() ?? undefined;
  const response = await fetch(
    `${API_BASE}/api/providers/${providerId}/connections/${connectionId}/status`,
    {
      method: "GET",
      headers: buildHeaders(token),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get connection status: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    connectionId: String(data.connectionId ?? connectionId),
    providerId: String(data.providerId ?? providerId),
    valid: Boolean(data.valid ?? false),
    expiresAt: data.expiresAt != null ? String(data.expiresAt) : undefined,
  };
}

export async function deleteConnection(
  providerId: string,
  connectionId: string
): Promise<void> {
  const token = getAuthToken() ?? undefined;
  const response = await fetch(
    `${API_BASE}/api/providers/${providerId}/connections/${connectionId}`,
    {
      method: "DELETE",
      headers: buildHeaders(token),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to disconnect: ${await readErrorMessage(response)}`);
  }
}

export async function listCloudRoots(
  providerId: string,
  connectionId: string
): Promise<CloudRoot[]> {
  const token = getAuthToken() ?? undefined;
  const response = await fetch(
    `${API_BASE}/api/providers/${providerId}/connections/${connectionId}/roots`,
    {
      method: "GET",
      headers: buildHeaders(token),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to list cloud roots: ${await readErrorMessage(response)}`);
  }

  const data = await response.json();
  const roots = Array.isArray(data) ? data : [];
  return roots.map((item) => normalizeCloudRoot(item as Record<string, unknown>));
}

export async function listCloudChildren(
  providerId: string,
  connectionId: string,
  identifier: string,
  options?: {
    offset?: number;
    limit?: number;
    foldersOnly?: boolean;
  }
): Promise<ChildrenResponse> {
  const token = getAuthToken() ?? undefined;
  const params = new URLSearchParams({ identifier });
  if (options?.offset !== undefined) {
    params.append("offset", String(options.offset));
  }
  if (options?.limit !== undefined) {
    params.append("limit", String(options.limit));
  }
  if (options?.foldersOnly !== undefined) {
    params.append("foldersOnly", String(options.foldersOnly));
  }

  const response = await fetch(
    `${API_BASE}/api/providers/${providerId}/connections/${connectionId}/children?${params.toString()}`,
    {
      method: "GET",
      headers: buildHeaders(token),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to list cloud folders: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const foldersRaw = (data.folders ?? data.Folders ?? []) as Array<Record<string, unknown>>;
  const filesRaw = (data.files ?? data.Files ?? []) as Array<Record<string, unknown>>;
  const paginationRaw = (data.pagination ?? data.Pagination) as
    | Record<string, unknown>
    | undefined;

  return {
    folders: foldersRaw.map(normalizeCloudFolder),
    files: filesRaw.map(normalizeCloudFolder),
    pagination: normalizePagination(paginationRaw),
  };
}
