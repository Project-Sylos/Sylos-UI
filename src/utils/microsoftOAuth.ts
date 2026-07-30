export type MicrosoftAccountType = "personal" | "business";

export function parseMicrosoftAccountType(
  value: string | null | undefined
): MicrosoftAccountType | null {
  if (value === "personal" || value === "business") return value;
  return null;
}

export function getMicrosoftAccountTypeLabel(accountType: MicrosoftAccountType): string {
  return accountType === "business" ? "Work / School" : "Personal";
}

export function getMicrosoftAccountTypeSummary(accountType: MicrosoftAccountType): string {
  return accountType === "business"
    ? "Microsoft 365 work or school account with OneDrive for Business."
    : "Personal Microsoft account (Outlook.com / Microsoft 365 Basic or Personal).";
}

/** Entra authority tenant segment for authorize + token URLs. Always common for now. */
export function resolveMicrosoftOAuthTenant(
  _accountType?: MicrosoftAccountType | null,
  _configuredTenantId?: string
): string {
  return "common";
}

export function buildMicrosoftAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  tenantId?: string;
  accountType?: MicrosoftAccountType;
}): string {
  const tenant = resolveMicrosoftOAuthTenant(params.accountType, params.tenantId);
  const search = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: params.scopes.join(" "),
    state: params.state,
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${search.toString()}`;
}

export const DEFAULT_ONEDRIVE_SCOPES = [
  "Files.ReadWrite.All",
  "offline_access",
  "User.Read",
];

export const DEFAULT_SHAREPOINT_SCOPES = [
  "Sites.ReadWrite.All",
  "Files.ReadWrite.All",
  "offline_access",
  "User.Read",
];
