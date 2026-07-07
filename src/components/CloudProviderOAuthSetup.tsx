import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, PlugZap } from "lucide-react";

import {
  listOAuthApps,
  OAuthAppSummary,
  saveOAuthApp,
  testOAuthApp,
} from "../api/oauthApps";
import { getCloudProviderDoc } from "../data/cloudProviderDocs";
import { getOAuthRedirectUri } from "../utils/cloudOAuth";
import "./CloudProviderOAuthSetup.css";

type CloudProviderOAuthSetupProps = {
  providerId: string;
  displayName: string;
  onConfigured?: () => void;
  className?: string;
};

export default function CloudProviderOAuthSetup({
  providerId,
  displayName,
  onConfigured,
  className,
}: CloudProviderOAuthSetupProps) {
  const docs = getCloudProviderDoc(providerId);
  const [app, setApp] = useState<OAuthAppSummary | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listOAuthApps()
      .then((apps) => {
        if (cancelled) return;
        const match = apps.find((item) => item.providerId === providerId) ?? null;
        setApp(match);
        setClientId(match?.clientId ?? "");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load OAuth settings");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const canTest = Boolean(clientId.trim() && (clientSecret.trim() || app?.configured));
  const canSave = Boolean(clientId.trim() && (clientSecret.trim() || app?.configured));

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setTestOk(false);
    try {
      await testOAuthApp(providerId, {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      setTestOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveOAuthApp(providerId, {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        displayName,
      });
      const apps = await listOAuthApps();
      const match = apps.find((item) => item.providerId === providerId) ?? null;
      setApp(match);
      setClientSecret("");
      setTestOk(false);
      onConfigured?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`cloud-oauth-setup cloud-oauth-setup--loading ${className ?? ""}`}>
        <Loader2 className="browse-folder__spin" size={20} aria-hidden="true" />
        <span>Loading OAuth settings…</span>
      </div>
    );
  }

  return (
    <div className={`cloud-oauth-setup ${className ?? ""}`}>
      <h3 className="cloud-oauth-setup__title">Connect your {displayName} developer app</h3>
      <p className="cloud-oauth-setup__lead">
        Sylos does not ship cloud OAuth credentials. Create your own developer app, then paste the
        Client ID and Client Secret here.
      </p>

      {docs && (
        <p className="cloud-oauth-setup__docs">
          <a href={docs.setupGuideUrl} target="_blank" rel="noreferrer">
            {docs.setupGuideLabel}
          </a>
          {" · "}
          {docs.redirectUriHint}
        </p>
      )}

      <p className="cloud-oauth-setup__redirect">
        <span className="cloud-oauth-setup__redirect-label">Redirect URI</span>
        <code>{getOAuthRedirectUri()}</code>
      </p>

      <label className="cloud-oauth-setup__field">
        <span>Client ID</span>
        <input
          type="text"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setTestOk(false);
          }}
          autoComplete="off"
        />
      </label>

      <label className="cloud-oauth-setup__field">
        <span>Client secret</span>
        <input
          type="password"
          value={clientSecret}
          placeholder={app?.configured ? "Leave blank to keep existing" : ""}
          onChange={(e) => {
            setClientSecret(e.target.value);
            setTestOk(false);
          }}
          autoComplete="new-password"
        />
      </label>

      {testOk && (
        <p className="cloud-oauth-setup__success">
          <CheckCircle2 size={16} aria-hidden="true" />
          Connection test passed. Save to store these credentials in Sylos.
        </p>
      )}

      {error && <p className="cloud-oauth-setup__error">{error}</p>}

      <div className="cloud-oauth-setup__actions">
        <button
          type="button"
          className="glass-button"
          disabled={!canTest || testing || saving}
          onClick={() => void handleTest()}
        >
          {testing ? (
            <>
              <Loader2 className="browse-folder__spin" size={16} aria-hidden="true" />
              Testing…
            </>
          ) : (
            <>
              <PlugZap size={16} aria-hidden="true" />
              Test connection
            </>
          )}
        </button>
        <button
          type="button"
          className="glass-button glass-button--progress-cta"
          disabled={!canSave || saving || testing}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving…" : "Save credentials"}
        </button>
      </div>
    </div>
  );
}
