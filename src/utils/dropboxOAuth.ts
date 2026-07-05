import { OAuthTokenResponse, getOAuthRedirectUri } from "./cloudOAuth";

export const DROPBOX_AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
export const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

export type DropboxAccountType = "personal" | "work";

/** Individual My Dropbox - no team scopes (avoids work-only login prompt). */
export const DROPBOX_PERSONAL_SCOPES = [
  "files.metadata.read",
  "files.content.read",
  "files.content.write",
  "account_info.read",
  "sharing.read",
];

/** Dropbox Business / team folders and team space. */
export const DROPBOX_TEAM_SCOPES = ["team_data.member", "team_data.team_space"];

export const DROPBOX_WORK_SCOPES = [
  ...DROPBOX_PERSONAL_SCOPES,
  ...DROPBOX_TEAM_SCOPES,
];

export function parseDropboxAccountType(
  value: string | null | undefined
): DropboxAccountType | null {
  if (value === "personal" || value === "work") return value;
  return null;
}

export function getDropboxScopesForAccountType(
  accountType: DropboxAccountType
): string[] {
  return accountType === "work" ? [...DROPBOX_WORK_SCOPES] : [...DROPBOX_PERSONAL_SCOPES];
}

export function getDropboxAccountTypeLabel(accountType: DropboxAccountType): string {
  return accountType === "work" ? "Work / Team" : "Personal";
}

export function getDropboxAccountTypeSummary(accountType: DropboxAccountType): string {
  return accountType === "work"
    ? "Dropbox Business account - team space, team folders, and shared folders."
    : "Individual My Dropbox account.";
}

export function getDropboxClientId(): string {
  return import.meta.env.VITE_DROPBOX_CLIENT_ID ?? "";
}

export function getDropboxClientSecret(): string {
  return import.meta.env.VITE_DROPBOX_CLIENT_SECRET ?? "";
}

export function isDropboxOAuthConfigured(): boolean {
  return Boolean(getDropboxClientId() && getDropboxClientSecret());
}

export function buildDropboxAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}): string {
  const search = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    token_access_type: "offline",
    scope: params.scopes.join(" "),
    state: params.state,
  });
  return `${DROPBOX_AUTH_URL}?${search.toString()}`;
}

export async function exchangeDropboxAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Dropbox token exchange failed");
  }

  return (await response.json()) as OAuthTokenResponse;
}

export { getOAuthRedirectUri };
