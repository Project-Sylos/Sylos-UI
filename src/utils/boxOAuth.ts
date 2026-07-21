export const DEFAULT_BOX_SCOPES = ["root_readwrite"];

export function buildBoxAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}): string {
  const search = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: params.scopes.join(" "),
    state: params.state,
  });
  return `https://account.box.com/api/oauth2/authorize?${search.toString()}`;
}
