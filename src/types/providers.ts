export type ProviderAuthType = "oauth_ui_tokens" | string;

export interface ProviderDescriptor {
  id: string;
  displayName: string;
  serviceId: string;
  authType: ProviderAuthType;
  scopes: string[];
  oauthClientId?: string;
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
}

export interface ConnectionStatusResponse {
  connectionId: string;
  providerId: string;
  valid: boolean;
  expiresAt?: string;
}
