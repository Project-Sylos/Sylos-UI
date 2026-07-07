import { getOAuthRedirectUri } from "./cloudOAuth";

export type DropboxAccountType = "personal" | "work";

export const DROPBOX_PERSONAL_SCOPES = [
  "files.metadata.read",
  "files.content.read",
  "files.content.write",
  "account_info.read",
  "sharing.read",
];

export const DROPBOX_TEAM_SCOPES = ["team_data.member", "team_data.team_space"];

export const DROPBOX_WORK_SCOPES = [...DROPBOX_PERSONAL_SCOPES, ...DROPBOX_TEAM_SCOPES];

export function parseDropboxAccountType(
  value: string | null | undefined
): DropboxAccountType | null {
  if (value === "personal" || value === "work") return value;
  return null;
}

export function getDropboxScopesForAccountType(accountType: DropboxAccountType): string[] {
  return accountType === "work" ? [...DROPBOX_WORK_SCOPES] : [...DROPBOX_PERSONAL_SCOPES];
}

export function getDropboxAccountTypeLabel(accountType: DropboxAccountType): string {
  return accountType === "work" ? "Work / Team" : "Personal";
}

export function getDropboxAccountTypeSummary(accountType: DropboxAccountType): string {
  return accountType === "work"
    ? "Dropbox Business account - team space, team folders, and shared folders."
    : "Individual My Dropbox account.";
}

export { getOAuthRedirectUri };
