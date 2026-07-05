import { ConnectionTokenPayload } from "../types/providers";
import { OAuthPendingSession, OAuthTokenResponse } from "./cloudOAuth";
import {
  DropboxAccountType,
  buildDropboxAuthUrl,
  exchangeDropboxAuthCode,
  getDropboxClientId,
  getDropboxClientSecret,
  getDropboxScopesForAccountType,
  isDropboxOAuthConfigured,
} from "./dropboxOAuth";
import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  getGoogleClientId,
  getGoogleClientSecret,
  isGoogleOAuthConfigured,
} from "./googleOAuth";

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

export function isCloudProviderOAuthConfigured(providerId: string): boolean {
  switch (providerId) {
    case "google_drive":
      return isGoogleOAuthConfigured();
    case "dropbox":
      return isDropboxOAuthConfigured();
    default:
      return false;
  }
}

export function getCloudProviderOAuthEnvHint(providerId: string): string {
  switch (providerId) {
    case "dropbox":
      return "Set VITE_DROPBOX_CLIENT_ID and VITE_DROPBOX_CLIENT_SECRET in the app environment to enable Dropbox sign-in.";
    case "google_drive":
    default:
      return "Set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET in the app environment to enable Google sign-in.";
  }
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

export function getCloudProviderOAuthCredentials(
  providerId: string
): { clientId: string; clientSecret: string } | null {
  switch (providerId) {
    case "google_drive": {
      const clientId = getGoogleClientId();
      const clientSecret = getGoogleClientSecret();
      if (!clientId || !clientSecret) return null;
      return { clientId, clientSecret };
    }
    case "dropbox": {
      const clientId = getDropboxClientId();
      const clientSecret = getDropboxClientSecret();
      if (!clientId || !clientSecret) return null;
      return { clientId, clientSecret };
    }
    default:
      return null;
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
    case "dropbox":
      return buildDropboxAuthUrl(params);
    case "google_drive":
    default:
      return buildGoogleAuthUrl(params);
  }
}

export async function exchangeCloudProviderAuthCode(
  providerId: string,
  params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }
): Promise<OAuthTokenResponse> {
  switch (providerId) {
    case "dropbox":
      return exchangeDropboxAuthCode(params);
    case "google_drive":
    default:
      return exchangeGoogleAuthCode(params);
  }
}

export function buildCloudProviderTokenPayload(
  providerId: string,
  tokens: OAuthTokenResponse,
  pending: OAuthPendingSession,
  creds: { clientId: string; clientSecret: string }
): ConnectionTokenPayload {
  const scopes = tokens.scope
    ? tokens.scope.split(/[\s,]+/).filter(Boolean)
    : pending.scopes;

  const payload: ConnectionTokenPayload = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token!,
    expires_in: tokens.expires_in,
    scopes,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  };

  return payload;
}
