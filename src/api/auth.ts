import { apiFetch, readErrorMessage, setAuthToken } from "./client";

export type UserRole = "admin" | "user";

export interface UserCapabilities {
  cleanSlate?: boolean;
}

export interface SylosUser {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
  disabled: boolean;
  capabilities?: UserCapabilities;
}

export interface AuthResponse {
  token: string;
  user: SylosUser;
}

export interface SetupStatus {
  needsSetup: boolean;
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const response = await apiFetch("/api/public/setup/status");
  if (!response.ok) {
    throw new Error(`Failed to fetch setup status: ${await readErrorMessage(response)}`);
  }
  return (await response.json()) as SetupStatus;
}

export async function setupAdmin(username: string, password: string): Promise<AuthResponse> {
  const response = await apiFetch("/api/public/setup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const data = (await response.json()) as AuthResponse;
  setAuthToken(data.token);
  return data;
}

export async function login(
  username: string,
  password: string,
  remember = false
): Promise<AuthResponse> {
  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password, remember }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const data = (await response.json()) as AuthResponse;
  setAuthToken(data.token);
  return data;
}

export async function fetchCurrentUser(): Promise<SylosUser> {
  const response = await apiFetch("/api/auth/me");
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as SylosUser;
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

export async function listUsers(): Promise<SylosUser[]> {
  const response = await apiFetch("/api/users");
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as SylosUser[];
}

export async function createUser(input: {
  username: string;
  password: string;
  role: UserRole;
}): Promise<SylosUser> {
  const response = await apiFetch("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as SylosUser;
}

export async function updateUser(
  id: string,
  input: { password?: string; role?: UserRole; disabled?: boolean }
): Promise<SylosUser> {
  const response = await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as SylosUser;
}

export async function deleteUser(id: string): Promise<void> {
  const response = await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}
