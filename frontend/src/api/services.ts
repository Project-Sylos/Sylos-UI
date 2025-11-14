import {
  MigrationResponse,
  MigrationRootsPayload,
  MigrationRootsResponse,
  StartMigrationPayload,
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

export async function createMigrationRoots(
  payload: MigrationRootsPayload
): Promise<MigrationRootsResponse> {
  const token = getAuthToken() ?? undefined;

  const response = await fetch(`${API_BASE}/api/migrations/roots`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Failed to prepare migration roots (${response.status}): ${
        message || "Unknown error"
      }`
    );
  }

  return (await response.json()) as MigrationRootsResponse;
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

