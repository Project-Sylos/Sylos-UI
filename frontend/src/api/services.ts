import {
  MigrationRootRequest,
  MigrationRootResponse,
  MigrationResponse,
  StartMigrationPayload,
  MigrationDBFile,
  MigrationUploadResponse,
  MigrationStatusResponse,
  MigrationInspectResponse,
} from "../types/migrations";
import { ServiceDescriptor } from "../types/services";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";
const AUTH_STORAGE_KEY = "sylos.authToken";

const fallbackServices: ServiceDescriptor[] = [
  { id: "local-default", displayName: "Local Filesystem", type: "local" },
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

