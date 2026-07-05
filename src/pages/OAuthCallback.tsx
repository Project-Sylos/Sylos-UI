import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { postConnectionTokens } from "../api/providers";
import {
  clearOAuthPendingSession,
  dedupeOAuthCodeExchange,
  formatOAuthExchangeError,
  getOAuthRedirectUri,
  loadOAuthPendingSession,
  readOAuthCallbackParams,
} from "../utils/cloudOAuth";
import {
  buildCloudProviderTokenPayload,
  exchangeCloudProviderAuthCode,
  getCloudProviderOAuthCredentials,
  getCloudProviderSignInBrand,
} from "../utils/cloudProviderOAuth";
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

      const pending = loadOAuthPendingSession();
      const brand = pending
        ? getCloudProviderSignInBrand(pending.providerId)
        : "Cloud provider";

      if (oauthError) {
        setError(`${brand} sign-in was cancelled or failed (${oauthError}).`);
        return;
      }

      if (!code || !state) {
        setError(`Missing OAuth response from ${brand}.`);
        return;
      }

      if (!pending || pending.state !== state) {
        setError("OAuth session expired or invalid. Please try connecting again.");
        return;
      }

      const creds = getCloudProviderOAuthCredentials(pending.providerId);
      if (!creds) {
        setError(`${brand} OAuth is not configured in this app.`);
        return;
      }

      try {
        const tokens = await dedupeOAuthCodeExchange(code, () =>
          exchangeCloudProviderAuthCode(pending.providerId, {
            code,
            clientId: creds.clientId,
            clientSecret: creds.clientSecret,
            redirectUri: getOAuthRedirectUri(),
          })
        );

        if (!tokens.refresh_token) {
          setError(
            `${brand} did not return a refresh token. Try again. You may need to revoke Sylos access in your ${brand} account and reconnect.`
          );
          return;
        }

        await postConnectionTokens(
          pending.providerId,
          pending.connectionId,
          buildCloudProviderTokenPayload(pending.providerId, tokens, pending, creds)
        );

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
        const raw =
          err instanceof Error ? err.message : `Failed to complete ${brand} sign-in.`;
        setError(formatOAuthExchangeError(raw, brand));
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
