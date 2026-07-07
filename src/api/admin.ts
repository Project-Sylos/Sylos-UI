import { apiFetch, readErrorMessage } from "./client";

export type CleanSlateResponse = {
  message: string;
};

export async function cleanSlate(): Promise<CleanSlateResponse> {
  const response = await apiFetch("/api/admin/clean-slate", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as CleanSlateResponse;
}
