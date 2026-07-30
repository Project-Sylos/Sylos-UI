import { apiFetch, readErrorMessage } from "./client";

export type OAuthHealthStatus =
  | "healthy"
  | "unhealthy"
  | "skipped"
  | "not_configured"
  | "unknown";

export type OAuthAppSummary = {
  providerId: string;
  displayName: string;
  configured: boolean;
  clientId?: string;
  tenantId?: string;
  healthStatus: OAuthHealthStatus;
  healthError?: string;
  lastCheckedAt?: string;
  healthMonitorEnabled?: boolean;
};

export type OAuthHealthSummary = {
  hasIssues: boolean;
  unhealthyCount: number;
  configuredCount: number;
};

export type OAuthHealthSettings = {
  scanIntervalMinutes: number;
};

export const OAUTH_HEALTH_SCAN_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 0, label: "Disabled" },
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 30, label: "Every 30 minutes" },
  { minutes: 60, label: "Every hour" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 720, label: "Every 12 hours" },
  { minutes: 1440, label: "Every day" },
  { minutes: 10080, label: "Every week" },
  { minutes: 43200, label: "Every 30 days" },
];

export async function listOAuthApps(): Promise<OAuthAppSummary[]> {
  const response = await apiFetch("/api/oauth-apps");
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json();
}

export async function fetchOAuthHealthSummary(): Promise<OAuthHealthSummary> {
  const response = await apiFetch("/api/oauth-apps/health/summary");
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json();
}

export async function fetchOAuthHealthSettings(): Promise<OAuthHealthSettings> {
  const response = await apiFetch("/api/oauth-apps/health/settings");
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json();
}

export async function saveOAuthHealthSettings(
  settings: OAuthHealthSettings
): Promise<void> {
  const response = await apiFetch("/api/oauth-apps/health/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

export async function deleteOAuthApp(providerId: string): Promise<void> {
  const response = await apiFetch(`/api/oauth-apps/${providerId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

export async function saveOAuthApp(
  providerId: string,
  body: {
    clientId: string;
    clientSecret: string;
    tenantId?: string;
    displayName?: string;
    alsoApplyTo?: string;
  }
): Promise<void> {
  const response = await apiFetch(`/api/oauth-apps/${providerId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

export async function testOAuthApp(
  providerId: string,
  body: { clientId?: string; clientSecret?: string; tenantId?: string }
): Promise<void> {
  const response = await apiFetch(`/api/oauth-apps/${providerId}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

export function formatOAuthHealthStatus(status: OAuthHealthStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "unhealthy":
      return "Unhealthy";
    case "skipped":
      return "Skipped";
    case "not_configured":
      return "Not configured";
    default:
      return "Unknown";
  }
}

export function formatOAuthLastChecked(value?: string): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}
