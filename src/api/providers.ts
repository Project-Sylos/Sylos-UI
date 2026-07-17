import {
  CloudConnection,
  CloudRoot,
  ConnectionStatusResponse,
  ConnectionTokenResponse,
  ProviderDescriptor,
  SFTPHostKeyProbePayload,
  SFTPHostKeyProbeResponse,
  SFTPCredentialsPayload,
} from "../types/providers";
import { ChildrenResponse, Folder, PaginationInfo } from "../types/services";
import { apiFetch, readErrorMessage } from "./client";
import { DeleteBrowseNodesResult } from "./services";

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
    size:
      typeof folder.size === "number"
        ? folder.size
        : typeof folder.Size === "number"
          ? folder.Size
          : undefined,
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
    migrationRootForbidden: Boolean(
      raw.migrationRootForbidden ?? raw.MigrationRootForbidden ?? false
    ),
    migrationRootForbiddenReason:
      raw.migrationRootForbiddenReason != null
        ? String(raw.migrationRootForbiddenReason)
        : raw.MigrationRootForbiddenReason != null
          ? String(raw.MigrationRootForbiddenReason)
          : undefined,
  };
}

function normalizeConnectionResponse(
  data: Record<string, unknown>,
  providerId: string,
  connectionId?: string
): ConnectionTokenResponse {
  return {
    connectionId: String(data.connectionId ?? connectionId ?? ""),
    providerId: String(data.providerId ?? providerId),
    valid: Boolean(data.valid ?? true),
    expiresAt: data.expiresAt != null ? String(data.expiresAt) : undefined,
    accountEmail:
      data.accountEmail != null
        ? String(data.accountEmail)
        : data.account_email != null
          ? String(data.account_email)
          : undefined,
    accountDisplayName:
      data.accountDisplayName != null
        ? String(data.accountDisplayName)
        : data.account_display_name != null
          ? String(data.account_display_name)
          : undefined,
  };
}

export async function fetchProviders(): Promise<ProviderDescriptor[]> {
  const response = await apiFetch("/api/providers", { method: "GET" });

  if (!response.ok) {
    throw new Error(`Failed to fetch providers: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Array<Record<string, unknown>>;
  return data.map((item) => ({
    id: String(item.id ?? ""),
    displayName: String(item.displayName ?? item.name ?? item.id ?? ""),
    serviceId: String(item.serviceId ?? ""),
    authType: String(item.authType ?? "oauth_server_exchange"),
    scopes: Array.isArray(item.scopes) ? item.scopes.map(String) : [],
    oauthClientId:
      item.oauthClientId != null
        ? String(item.oauthClientId)
        : item.oauth_client_id != null
          ? String(item.oauth_client_id)
          : undefined,
  }));
}

export async function createConnection(
  providerId: string,
  options?: { migrationId?: string }
): Promise<CloudConnection> {
  const response = await apiFetch(`/api/providers/${providerId}/connections`, {
    method: "POST",
    body: JSON.stringify(options?.migrationId ? { migrationId: options.migrationId } : {}),
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

export async function probeSftpHostKey(
  providerId: string,
  payload: SFTPHostKeyProbePayload
): Promise<SFTPHostKeyProbeResponse> {
  const response = await apiFetch(`/api/providers/${providerId}/host-key/probe`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to verify server host key: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    hostKey: String(data.hostKey ?? ""),
    fingerprint: String(data.fingerprint ?? ""),
  };
}

export async function postProviderCredentials(
  providerId: string,
  connectionId: string,
  payload: SFTPCredentialsPayload
): Promise<ConnectionTokenResponse> {
  const response = await apiFetch(
    `/api/providers/${providerId}/connections/${connectionId}/credentials`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to store credentials: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return normalizeConnectionResponse(data, providerId, connectionId);
}

export async function exchangeOAuthCode(
  providerId: string,
  connectionId: string,
  payload: { code: string; redirect_uri: string; scopes?: string[] }
): Promise<ConnectionTokenResponse> {
  const response = await apiFetch(
    `/api/providers/${providerId}/connections/${connectionId}/oauth/exchange`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to complete OAuth sign-in: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return normalizeConnectionResponse(data, providerId, connectionId);
}

export async function getConnectionStatus(
  providerId: string,
  connectionId: string
): Promise<ConnectionStatusResponse> {
  const response = await apiFetch(
    `/api/providers/${providerId}/connections/${connectionId}/status`,
    { method: "GET" }
  );

  if (!response.ok) {
    throw new Error(`Failed to get connection status: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return normalizeConnectionResponse(data, providerId, connectionId);
}

export async function deleteConnection(
  providerId: string,
  connectionId: string
): Promise<void> {
  const response = await apiFetch(
    `/api/providers/${providerId}/connections/${connectionId}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    throw new Error(`Failed to disconnect: ${await readErrorMessage(response)}`);
  }
}

export async function listCloudRoots(
  providerId: string,
  connectionId: string
): Promise<CloudRoot[]> {
  const response = await apiFetch(
    `/api/providers/${providerId}/connections/${connectionId}/roots`,
    { method: "GET" }
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
    /** Required for virtual roots from /roots (e.g. shared_with_me). */
    rootType?: string;
    driveId?: string;
  }
): Promise<ChildrenResponse> {
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
  if (options?.rootType) {
    params.append("rootType", options.rootType);
  }
  if (options?.driveId) {
    params.append("driveId", options.driveId);
  }

  const response = await apiFetch(
    `/api/providers/${providerId}/connections/${connectionId}/children?${params.toString()}`,
    { method: "GET" }
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

export async function createCloudBrowseFolder(
  providerId: string,
  connectionId: string,
  body: {
    parentId: string;
    name: string;
    role?: "source" | "destination";
    rootType?: string;
    driveId?: string;
  }
): Promise<Folder> {
  const response = await apiFetch(
    `/api/providers/${providerId}/connections/${connectionId}/folders`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to create folder: ${await readErrorMessage(response)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return normalizeCloudFolder(data);
}

export async function deleteCloudBrowseNodes(
  providerId: string,
  connectionId: string,
  body: {
    nodes: Array<{ id: string; type: "file" | "folder" }>;
    contextId: string;
    role?: "source" | "destination";
    rootType?: string;
    driveId?: string;
  }
): Promise<DeleteBrowseNodesResult> {
  const response = await apiFetch(
    `/api/providers/${providerId}/connections/${connectionId}/nodes/delete`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

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
