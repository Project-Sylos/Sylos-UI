import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { postConnectionTokens } from "../api/providers";
import {
  clearOAuthPendingSession,
  exchangeGoogleAuthCode,
  getGoogleClientId,
  getGoogleClientSecret,
  getOAuthRedirectUri,
  loadOAuthPendingSession,
  readOAuthCallbackParams,
} from "../utils/googleOAuth";
import "../App.css";

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeOAuth() {
      const params = readOAuthCallbackParams();
      const code = params.get("code");
      const state = params.get("state");
      const oauthError = params.get("error");

      if (oauthError) {
        setError(`Google sign-in was cancelled or failed (${oauthError}).`);
        return;
      }

      if (!code || !state) {
        setError("Missing OAuth response from Google.");
        return;
      }

      const pending = loadOAuthPendingSession();
      if (!pending || pending.state !== state) {
        setError("OAuth session expired or invalid. Please try connecting again.");
        return;
      }

      const clientId = getGoogleClientId();
      const clientSecret = getGoogleClientSecret();
      if (!clientId || !clientSecret) {
        setError("Google OAuth is not configured in this app.");
        return;
      }

      try {
        const tokens = await exchangeGoogleAuthCode({
          code,
          clientId,
          clientSecret,
          redirectUri: getOAuthRedirectUri(),
        });

        if (!tokens.refresh_token) {
          setError(
            "Google did not return a refresh token. Try again — you may need to revoke Sylos access in your Google account and reconnect."
          );
          return;
        }

        const scopes = tokens.scope
          ? tokens.scope.split(" ").filter(Boolean)
          : pending.scopes;

        await postConnectionTokens(pending.providerId, pending.connectionId, {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          scopes,
          client_id: clientId,
          client_secret: clientSecret,
        });

        if (cancelled) return;

        clearOAuthPendingSession();

        const browseParams = new URLSearchParams({
          providerId: pending.providerId,
          connectionId: pending.connectionId,
          serviceId: pending.serviceId,
          role: pending.role,
        });

        navigate(`/browse-cloud?${browseParams.toString()}`, { replace: true });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to complete Google sign-in.";
        setError(message);
      }
    }

    void completeOAuth();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <section className="browse-folder">
      <div className="browse-folder__content glass-surface--panel">
        {error ? (
          <>
            <h1 className="browse-folder__title">Connection failed</h1>
            <p className="browse-folder__error">{error}</p>
            <button
              type="button"
              className="glass-button"
              onClick={() => navigate("/summary", { replace: true })}
            >
              Back to setup
            </button>
          </>
        ) : (
          <>
            <Loader2 className="browse-folder__spin" size={32} aria-hidden="true" />
            <p>Completing sign-in…</p>
          </>
        )}
      </div>
    </section>
  );
}
