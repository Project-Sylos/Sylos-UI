import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { exchangeOAuthCode } from "../api/providers";
import {
  clearOAuthPendingSession,
  dedupeOAuthCodeExchange,
  formatOAuthExchangeError,
  getOAuthRedirectUri,
  loadOAuthPendingSession,
  readOAuthCallbackParams,
} from "../utils/cloudOAuth";
import { getCloudProviderSignInBrand } from "../utils/cloudProviderOAuth";
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

      try {
        await dedupeOAuthCodeExchange(code, () =>
          exchangeOAuthCode(pending.providerId, pending.connectionId, {
            code,
            redirect_uri: getOAuthRedirectUri(),
            scopes: pending.scopes,
          })
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
