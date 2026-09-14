import { getOAuthRedirectUri } from "./cloudOAuth";

/** Scopes for Dropbox user (My Dropbox) access. Team-data scopes are not requested. */
export const DROPBOX_PERSONAL_SCOPES = [
  "files.metadata.read",
  "files.content.read",
  "files.content.write",
  "account_info.read",
  "sharing.read",
];

export function getDropboxScopes(): string[] {
  return [...DROPBOX_PERSONAL_SCOPES];
}

export { getOAuthRedirectUri };
