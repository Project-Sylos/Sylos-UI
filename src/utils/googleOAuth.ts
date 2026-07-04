const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const OAUTH_PENDING_KEY = "sylos.oauth.pending";
export const OAUTH_CALLBACK_SEARCH_KEY = "sylos.oauth.callbackSearch";

export interface OAuthPendingSession {
  providerId: string;
  serviceId: string;
  connectionId: string;
  role: "source" | "destination";
  migrationId?: string;
  state: string;
  scopes: string[];
  returnPath: string;
}

export interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
}

export function getGoogleClientSecret(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? "";
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

export function getOAuthRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export function createOAuthState(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function saveOAuthPendingSession(session: OAuthPendingSession): void {
  sessionStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify(session));
}

export function loadOAuthPendingSession(): OAuthPendingSession | null {
  const raw = sessionStorage.getItem(OAUTH_PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthPendingSession;
  } catch {
    return null;
  }
}

export function clearOAuthPendingSession(): void {
  sessionStorage.removeItem(OAUTH_PENDING_KEY);
  sessionStorage.removeItem(OAUTH_CALLBACK_SEARCH_KEY);
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
}): Promise<GoogleTokenResponse> {
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

  return (await response.json()) as GoogleTokenResponse;
}

/** Capture ?code= from Google redirect before HashRouter strips query params. */
export function captureOAuthCallbackSearch(): void {
  const search = window.location.search;
  if (!search.includes("code=")) {
    return;
  }

  sessionStorage.setItem(OAUTH_CALLBACK_SEARCH_KEY, search);
  const hash = window.location.hash || "#/oauth/callback";
  const nextHash = hash.includes("oauth/callback") ? hash : "#/oauth/callback";
  window.history.replaceState({}, document.title, `${window.location.pathname}${nextHash}`);
}

export function readOAuthCallbackParams(): URLSearchParams {
  const stored = sessionStorage.getItem(OAUTH_CALLBACK_SEARCH_KEY);
  if (stored) {
    return new URLSearchParams(stored.startsWith("?") ? stored.slice(1) : stored);
  }
  return new URLSearchParams(window.location.search);
}
