export const AUTH_STORAGE_KEY = "sylos.authToken";

export function getApiBase(): string {
  return import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "http://localhost:8086" : "");
}

export function getAuthToken(): string | null {
  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

export function setAuthToken(token: string): void {
  window.localStorage.setItem(AUTH_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function buildHeaders(token?: string, extra?: HeadersInit): Headers {
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

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return response.statusText || "Unknown error";
  }
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return parsed.message || parsed.error || text;
  } catch {
    return text;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken() ?? undefined;
  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401 && unauthorizedHandler) {
    unauthorizedHandler();
  }

  return response;
}
