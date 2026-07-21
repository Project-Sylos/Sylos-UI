export function buildMicrosoftAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}): string {
  const search = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: params.scopes.join(" "),
    state: params.state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${search.toString()}`;
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
