export type ProviderAuthType = "oauth_server_exchange" | "credentials_form" | string;

export interface ProviderDescriptor {
  id: string;
  displayName: string;
  serviceId: string;
  authType: ProviderAuthType;
  scopes: string[];
  oauthClientId?: string;
  oauthTenantId?: string;
}

export type CloudRootType =
  | "my_drive"
  | "shared_with_me"
  | "shared_drive"
  | "user_root"
  | "team_space"
  | "team_folder"
  | "shared_folder"
  | string;

export interface CloudRoot {
  id: string;
  displayName: string;
  rootType: CloudRootType;
  driveId?: string;
  migrationRootForbidden?: boolean;
  migrationRootForbiddenReason?: string;
}

export interface CloudConnection {
  connectionId: string;
  providerId: string;
}

export interface ConnectionTokenPayload {
  access_token?: string;
  refresh_token: string;
  expires_in?: number;
  scopes?: string[];
  client_id?: string;
  client_secret?: string;
}

export interface ConnectionTokenResponse {
  connectionId: string;
  providerId: string;
  valid: boolean;
  expiresAt?: string;
  accountEmail?: string;
  accountDisplayName?: string;
}

export interface ConnectionStatusResponse {
  connectionId: string;
  providerId: string;
  valid: boolean;
  expiresAt?: string;
  accountEmail?: string;
  accountDisplayName?: string;
}

export interface SFTPCredentialsPayload {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  keyPassphrase?: string;
  hostKey?: string;
}

export interface SFTPHostKeyProbePayload {
  host: string;
  port?: number;
}

export interface SFTPHostKeyProbeResponse {
  hostKey: string;
  fingerprint: string;
  /** True when this host:port was previously trusted on this install. */
  trusted?: boolean;
  /** True when a stored pin exists but the live host key differs. */
  hostKeyChanged?: boolean;
}

export type SFTPSavedHostAuthMethod = "password" | "pem";

export interface SFTPSavedHostSummary {
  id: string;
  displayName: string;
  host: string;
  port: number;
  username: string;
  authMethod: SFTPSavedHostAuthMethod | string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface SFTPSavedHostDetail extends SFTPSavedHostSummary {
  password?: string;
  privateKey?: string;
  keyPassphrase?: string;
  hostKey?: string;
}

export interface SFTPSavedHostUpsertPayload {
  id?: string;
  displayName?: string;
  host: string;
  port?: number;
  username: string;
  authMethod: SFTPSavedHostAuthMethod | string;
  password?: string;
  privateKey?: string;
  keyPassphrase?: string;
  hostKey?: string;
}
