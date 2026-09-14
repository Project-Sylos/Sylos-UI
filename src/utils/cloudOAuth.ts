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

export interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export function getOAuthRedirectUri(): string {
  // Stable app root only — never include React route path or hash.
  // Providers (especially Dropbox) require an exact pre-registered match;
  // trailing slash is part of that match. Register e.g. http://localhost:8086/
  const origin = window.location.origin.replace(/\/$/, "");
  return `${origin}/`;
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

/** Capture ?code= from OAuth redirect before HashRouter strips query params. */
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

/** React Strict Mode runs effects twice in dev; OAuth codes are single-use. */
const inFlightExchanges = new Map<string, Promise<OAuthTokenResponse>>();

// Make dedupeOAuthCodeExchange generic, so it works with any promise type.
export function dedupeOAuthCodeExchange<T>(
  code: string,
  exchange: () => Promise<T>
): Promise<T> {
  const existing = inFlightExchanges.get(code) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const pending = exchange().finally(() => {
    inFlightExchanges.delete(code);
  });
  inFlightExchanges.set(code, pending as Promise<OAuthTokenResponse>);
  return pending;
}

export function formatOAuthExchangeError(raw: string, brand: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string; error_description?: string };
    const errorCode = parsed.error?.toLowerCase() ?? "";
    const description = parsed.error_description?.toLowerCase() ?? "";

    if (errorCode === "invalid_grant" && description.includes("already been used")) {
      return `${brand} sign-in was already completed or the link expired. That usually happens if this page refreshed during sign-in. Go back and connect again to get a fresh sign-in link.`;
    }

    if (errorCode === "invalid_grant") {
      return `${brand} sign-in expired or is no longer valid. Go back and connect again.`;
    }

    if (parsed.error_description) {
      return `${brand} sign-in failed: ${parsed.error_description}`;
    }

    if (parsed.error) {
      return `${brand} sign-in failed (${parsed.error}).`;
    }
  } catch {
    // Not JSON - fall through to raw message.
  }

  return raw.trim() || `${brand} sign-in failed.`;
}
