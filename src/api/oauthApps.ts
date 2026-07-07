import { apiFetch, readErrorMessage } from "./client";

export type OAuthAppSummary = {
  providerId: string;
  displayName: string;
  configured: boolean;
  clientId?: string;
};

export async function listOAuthApps(): Promise<OAuthAppSummary[]> {
  const response = await apiFetch("/api/oauth-apps");
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json();
}

export async function saveOAuthApp(
  providerId: string,
  body: { clientId: string; clientSecret: string; displayName?: string }
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
  body: { clientId: string; clientSecret?: string }
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
