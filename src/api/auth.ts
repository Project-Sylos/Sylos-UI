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
  lastLoginAt?: string;
  lastLogoutAt?: string;
  capabilities?: UserCapabilities;
}

export interface AuthResponse {
  token: string;
  user: SylosUser;
  recoveryCode?: string;
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
}): Promise<CreateUserResponse> {
  const response = await apiFetch("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as CreateUserResponse;
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

export async function deleteUsers(ids: string[]): Promise<string[]> {
  const response = await apiFetch("/api/users/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const data = (await response.json()) as { deleted: string[] };
  return data.deleted;
}

export interface RecoveryCodeStatus {
  hasRecoveryCode: boolean;
  needsAttention: boolean;
}

export interface RecoveryCodeOffer {
  code: string;
  title?: string;
  description?: string;
}

export interface CreateUserResponse extends SylosUser {
  recoveryCode?: string;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const response = await apiFetch("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

export async function fetchRecoveryCodeStatus(): Promise<RecoveryCodeStatus> {
  const response = await apiFetch("/api/auth/recovery-code/status");
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as RecoveryCodeStatus;
}

export async function regenerateRecoveryCode(): Promise<string> {
  const response = await apiFetch("/api/auth/recovery-code/regenerate", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const data = (await response.json()) as { recoveryCode: string };
  return data.recoveryCode;
}

export async function acknowledgeRecoveryCode(): Promise<void> {
  const response = await apiFetch("/api/auth/recovery-code/acknowledge", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

export async function recoverPassword(input: {
  username: string;
  recoveryCode: string;
  newPassword: string;
}): Promise<void> {
  const response = await apiFetch("/api/public/recover-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}
