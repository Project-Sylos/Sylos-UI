import { DropboxAccountType, getDropboxScopesForAccountType } from "./dropboxOAuth";
import { buildGoogleAuthUrl } from "./googleOAuth";

const DEFAULT_GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive"];

export function getCloudProviderDisplayName(providerId: string): string {
  switch (providerId) {
    case "google_drive":
      return "Google Drive";
    case "dropbox":
      return "Dropbox";
    default:
      return providerId.replace(/_/g, " ");
  }
}

export function getCloudProviderSignInBrand(providerId: string): string {
  switch (providerId) {
    case "google_drive":
      return "Google";
    case "dropbox":
      return "Dropbox";
    default:
      return getCloudProviderDisplayName(providerId);
  }
}

export function isCloudProviderOAuthConfigured(oauthClientId?: string): boolean {
  return Boolean(oauthClientId?.trim());
}

export function getCloudProviderOAuthEnvHint(providerId: string): string {
  const name = getCloudProviderDisplayName(providerId);
  return `${name} OAuth credentials are not configured. An administrator must add a developer app Client ID and Client Secret before you can sign in.`;
}

export function resolveCloudProviderScopes(
  providerId: string,
  apiScopes?: string[],
  options?: { dropboxAccountType?: DropboxAccountType }
): string[] {
  if (providerId === "dropbox") {
    const accountType = options?.dropboxAccountType ?? "personal";
    const base = getDropboxScopesForAccountType(accountType);
    if (!apiScopes?.length) return base;

    const extra =
      accountType === "personal"
        ? apiScopes.filter((scope) => !scope.startsWith("team_data."))
        : apiScopes;
    return [...new Set([...base, ...extra])];
  }
  if (apiScopes?.length) return apiScopes;
  switch (providerId) {
    case "google_drive":
    default:
      return DEFAULT_GOOGLE_SCOPES;
  }
}

export function buildCloudProviderAuthUrl(
  providerId: string,
  params: {
    clientId: string;
    redirectUri: string;
    scopes: string[];
    state: string;
  }
): string {
  switch (providerId) {
    case "dropbox": {
      const search = new URLSearchParams({
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        response_type: "code",
        token_access_type: "offline",
        scope: params.scopes.join(" "),
        state: params.state,
      });
      return `https://www.dropbox.com/oauth2/authorize?${search.toString()}`;
    }
    case "google_drive":
    default:
      return buildGoogleAuthUrl(params);
  }
}
