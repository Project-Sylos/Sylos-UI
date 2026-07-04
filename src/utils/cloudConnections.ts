import { deleteConnection, getConnectionStatus } from "../api/providers";
import { ConnectionStatusResponse } from "../types/providers";
import { ServiceDescriptor } from "../types/services";
import { serviceIdToProviderId } from "./cloudProviders";

export type CloudEndpointRole = "source" | "destination";

export interface CloudEndpointRef {
  role: CloudEndpointRole;
  serviceId: string;
  providerId: string;
  connectionId: string;
  label: string;
}

export interface CloudConnectionCheckResult {
  role: CloudEndpointRole;
  serviceId: string;
  providerId: string;
  connectionId: string;
  label: string;
  valid: boolean;
  expiresAt?: string;
  error?: string;
}

type SelectedEndpoint = {
  service: ServiceDescriptor;
  root?: { name?: string; locationPath?: string };
};

type MigrationConnections = {
  sourceConnectionId?: string;
  destinationConnectionId?: string;
};

export function collectConfiguredCloudEndpoints(
  source: SelectedEndpoint | undefined,
  destination: SelectedEndpoint | undefined,
  migration: MigrationConnections | undefined
): CloudEndpointRef[] {
  const endpoints: CloudEndpointRef[] = [];

  if (source?.service.type === "cloud" && source.root && migration?.sourceConnectionId) {
    endpoints.push({
      role: "source",
      serviceId: source.service.id,
      providerId: serviceIdToProviderId(source.service.id),
      connectionId: migration.sourceConnectionId,
      label: source.service.displayName || "Source",
    });
  }

  if (
    destination?.service.type === "cloud" &&
    destination.root &&
    migration?.destinationConnectionId
  ) {
    endpoints.push({
      role: "destination",
      serviceId: destination.service.id,
      providerId: serviceIdToProviderId(destination.service.id),
      connectionId: migration.destinationConnectionId,
      label: destination.service.displayName || "Destination",
    });
  }

  return endpoints;
}

export async function checkCloudConnection(
  providerId: string,
  connectionId: string
): Promise<ConnectionStatusResponse> {
  return getConnectionStatus(providerId, connectionId);
}

export async function verifyCloudEndpoint(
  endpoint: CloudEndpointRef
): Promise<CloudConnectionCheckResult> {
  try {
    const status = await checkCloudConnection(endpoint.providerId, endpoint.connectionId);
    return {
      role: endpoint.role,
      serviceId: endpoint.serviceId,
      providerId: endpoint.providerId,
      connectionId: endpoint.connectionId,
      label: endpoint.label,
      valid: status.valid,
      expiresAt: status.expiresAt,
    };
  } catch (err) {
    return {
      role: endpoint.role,
      serviceId: endpoint.serviceId,
      providerId: endpoint.providerId,
      connectionId: endpoint.connectionId,
      label: endpoint.label,
      valid: false,
      error: err instanceof Error ? err.message : "Connection check failed",
    };
  }
}

export async function verifyCloudEndpoints(
  endpoints: CloudEndpointRef[]
): Promise<CloudConnectionCheckResult[]> {
  return Promise.all(endpoints.map(verifyCloudEndpoint));
}

export async function verifyConfiguredMigrationCloudConnections(
  source: SelectedEndpoint | undefined,
  destination: SelectedEndpoint | undefined,
  migration: MigrationConnections | undefined
): Promise<CloudConnectionCheckResult[]> {
  const endpoints = collectConfiguredCloudEndpoints(source, destination, migration);
  return verifyCloudEndpoints(endpoints);
}

export function buildCloudConnectPath(params: {
  role: CloudEndpointRole;
  serviceId: string;
  providerId?: string;
  connectionId?: string;
  reconnect?: boolean;
}): string {
  const providerId = params.providerId ?? serviceIdToProviderId(params.serviceId);
  const search = new URLSearchParams({
    serviceId: params.serviceId,
    providerId,
    role: params.role,
  });
  if (params.connectionId) {
    search.set("connectionId", params.connectionId);
  }
  if (params.reconnect) {
    search.set("reconnect", "1");
  }
  return `/cloud/connect?${search.toString()}`;
}

export function buildCloudBrowsePath(params: {
  role: CloudEndpointRole;
  serviceId: string;
  connectionId: string;
  providerId?: string;
}): string {
  const providerId = params.providerId ?? serviceIdToProviderId(params.serviceId);
  const search = new URLSearchParams({
    serviceId: params.serviceId,
    providerId,
    connectionId: params.connectionId,
    role: params.role,
  });
  return `/browse-cloud?${search.toString()}`;
}

/** Valid connection → browse; missing/invalid → connect (optionally reconnect). */
export async function resolveCloudNavigation(params: {
  role: CloudEndpointRole;
  serviceId: string;
  connectionId?: string;
}): Promise<{ path: string; valid: boolean }> {
  const providerId = serviceIdToProviderId(params.serviceId);

  if (params.connectionId) {
    try {
      const status = await checkCloudConnection(providerId, params.connectionId);
      if (status.valid) {
        return {
          path: buildCloudBrowsePath({
            role: params.role,
            serviceId: params.serviceId,
            connectionId: params.connectionId,
            providerId,
          }),
          valid: true,
        };
      }
    } catch {
      // fall through to reconnect
    }

    return {
      path: buildCloudConnectPath({
        role: params.role,
        serviceId: params.serviceId,
        providerId,
        connectionId: params.connectionId,
        reconnect: true,
      }),
      valid: false,
    };
  }

  return {
    path: buildCloudConnectPath({
      role: params.role,
      serviceId: params.serviceId,
      providerId,
    }),
    valid: false,
  };
}

export async function disconnectCloudConnection(
  providerId: string,
  connectionId: string
): Promise<void> {
  await deleteConnection(providerId, connectionId);
}

export function connectionIdForRole(
  role: CloudEndpointRole,
  migration: MigrationConnections | undefined
): string | undefined {
  return role === "source"
    ? migration?.sourceConnectionId
    : migration?.destinationConnectionId;
}

export function invalidCloudResults(
  results: CloudConnectionCheckResult[]
): CloudConnectionCheckResult[] {
  return results.filter((result) => !result.valid);
}

export function formatCloudConnectionIssues(
  invalid: CloudConnectionCheckResult[]
): string {
  if (invalid.length === 0) return "";
  const labels = invalid.map((item) => item.label).join(" and ");
  return `Cloud connection for ${labels} is no longer valid. Reconnect before continuing.`;
}
