import { apiFetch } from "./client";
import type {
  MigrationScalingView,
  ProviderWorkerCaps,
  ScalingOverrideEntry,
  SetMigrationScalingRequest,
  WorkerCapMode,
} from "../types/scaling";

export async function fetchScalingDefaults(): Promise<
  Record<string, ProviderWorkerCaps>
> {
  const response = await apiFetch(`/api/scaling/defaults`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Failed to load scaling defaults (${response.status})`);
  }
  return response.json();
}

export async function fetchScalingOverrides(): Promise<ScalingOverrideEntry[]> {
  const response = await apiFetch(`/api/scaling/overrides`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Failed to load scaling overrides (${response.status})`);
  }
  return response.json();
}

export async function saveProviderScalingOverrides(
  providerId: string,
  modes: Partial<Record<WorkerCapMode, number>>
): Promise<void> {
  const response = await apiFetch(
    `/api/scaling/overrides/provider/${encodeURIComponent(providerId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modes }),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to save overrides (${response.status})`);
  }
}

export async function deleteProviderScalingOverrides(
  providerId: string
): Promise<void> {
  const response = await apiFetch(
    `/api/scaling/overrides/provider/${encodeURIComponent(providerId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    throw new Error(`Failed to reset overrides (${response.status})`);
  }
}

export async function saveSftpScalingOverrides(
  hostId: string,
  modes: Partial<Record<WorkerCapMode, number>>
): Promise<void> {
  const response = await apiFetch(
    `/api/scaling/overrides/sftp/${encodeURIComponent(hostId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modes }),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to save overrides (${response.status})`);
  }
}

export async function deleteSftpScalingOverrides(hostId: string): Promise<void> {
  const response = await apiFetch(
    `/api/scaling/overrides/sftp/${encodeURIComponent(hostId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    throw new Error(`Failed to reset overrides (${response.status})`);
  }
}

export async function getMigrationScaling(
  migrationId: string
): Promise<MigrationScalingView> {
  const response = await apiFetch(
    `/api/migrations/${encodeURIComponent(migrationId)}/scaling`,
    { method: "GET" }
  );
  if (!response.ok) {
    throw new Error(`Failed to load migration scaling (${response.status})`);
  }
  return response.json();
}

export async function putMigrationScaling(
  migrationId: string,
  req: SetMigrationScalingRequest
): Promise<MigrationScalingView> {
  const response = await apiFetch(
    `/api/migrations/${encodeURIComponent(migrationId)}/scaling`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to apply scaling (${response.status})`);
  }
  return response.json();
}
