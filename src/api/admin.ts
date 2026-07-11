import { apiFetch, readErrorMessage } from "./client";

export type AdminActionResponse = {
  message: string;
};

/** @deprecated Use clearAllMigrations */
export async function cleanSlate(): Promise<AdminActionResponse> {
  return clearAllMigrations();
}

export async function clearAllMigrations(): Promise<AdminActionResponse> {
  const response = await apiFetch("/api/admin/clear-migrations", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as AdminActionResponse;
}

export async function wipeInstall(): Promise<AdminActionResponse> {
  const response = await apiFetch("/api/admin/wipe-install", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as AdminActionResponse;
}
