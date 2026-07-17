import { getOAuthRedirectUri } from "./cloudOAuth";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export function buildGoogleAuthUrl(params: {
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
    access_type: "offline",
    prompt: "select_account consent",
    state: params.state,
  });
  return `${GOOGLE_AUTH_URL}?${search.toString()}`;
}

export { getOAuthRedirectUri };
