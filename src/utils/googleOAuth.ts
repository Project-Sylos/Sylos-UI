import {
  OAuthTokenResponse,
  captureOAuthCallbackSearch,
  clearOAuthPendingSession,
  createOAuthState,
  getOAuthRedirectUri,
  loadOAuthPendingSession,
  readOAuthCallbackParams,
  saveOAuthPendingSession,
} from "./cloudOAuth";

export {
  captureOAuthCallbackSearch,
  clearOAuthPendingSession,
  createOAuthState,
  getOAuthRedirectUri,
  loadOAuthPendingSession,
  readOAuthCallbackParams,
  saveOAuthPendingSession,
};
export type { OAuthPendingSession, OAuthTokenResponse as GoogleTokenResponse } from "./cloudOAuth";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
}

export function getGoogleClientSecret(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? "";
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}): string {
  const search = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: params.scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: params.state,
  });
  return `${GOOGLE_AUTH_URL}?${search.toString()}`;
}

export async function exchangeGoogleAuthCode(params: {
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

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Google token exchange failed");
  }

  return (await response.json()) as OAuthTokenResponse;
}
