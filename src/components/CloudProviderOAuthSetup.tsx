import { FormEvent, useCallback, useEffect, useState } from "react";
import { Activity, Loader2, Pencil } from "lucide-react";

import {
  deleteOAuthApp,
  formatOAuthHealthStatus,
  formatOAuthLastChecked,
  listOAuthApps,
  OAuthAppSummary,
  OAuthHealthStatus,
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
  variant?: "compact" | "expanded";
  canEdit?: boolean;
};

function statusClassName(status: OAuthHealthStatus): string {
  switch (status) {
    case "healthy":
      return "cloud-oauth-row__status--healthy";
    case "unhealthy":
      return "cloud-oauth-row__status--unhealthy";
    case "skipped":
      return "cloud-oauth-row__status--skipped";
    case "not_configured":
      return "cloud-oauth-row__status--not-configured";
    default:
      return "cloud-oauth-row__status--unknown";
  }
}

export default function CloudProviderOAuthSetup({
  providerId,
  displayName,
  onConfigured,
  className,
  variant = "compact",
  canEdit = true,
}: CloudProviderOAuthSetupProps) {
  const docs = getCloudProviderDoc(providerId);
  const [app, setApp] = useState<OAuthAppSummary | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  // Labels per provider
  const clientIdLabel =
    providerId === "dropbox" ? "App Key" : "Client ID";
  const clientSecretLabel =
    providerId === "dropbox" ? "App Secret" : "Client secret";
  const providerCredentialText =
    providerId === "dropbox"
      ? "App Key and App Secret"
      : "Client ID and Client Secret";

  const refreshApp = useCallback(async () => {
    const apps = await listOAuthApps();
    const match = apps.find((item) => item.providerId === providerId) ?? null;
    setApp(match);
    setClientId(match?.clientId ?? "");
    return match;
  }, [providerId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refreshApp()
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
  }, [refreshApp]);

  useEffect(() => {
    if (!canEdit || variant !== "expanded" || loading || app?.configured) {
      return;
    }
    setEditOpen(true);
  }, [app?.configured, canEdit, loading, variant]);

  const openEdit = () => {
    setClientId(app?.clientId ?? "");
    setClientSecret("");
    setError(null);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setClientSecret("");
    setError(null);
  };

  const canSave = Boolean(clientId.trim() && (clientSecret.trim() || app?.configured));

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setTestMessage(null);
    try {
      await testOAuthApp(providerId, {
        clientId: clientId.trim() || app?.clientId,
        clientSecret: clientSecret.trim() || undefined,
      });
      setTestMessage("Connection test passed.");
      await refreshApp();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed";
      setError(message);
      setTestMessage(null);
      await refreshApp();
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    if (!app?.configured) return;
    setRemoving(true);
    setError(null);
    setTestMessage(null);
    try {
      await deleteOAuthApp(providerId);
      await refreshApp();
      setEditOpen(false);
      setClientSecret("");
      onConfigured?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove credentials");
    } finally {
      setRemoving(false);
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError(null);
    try {
      await saveOAuthApp(providerId, {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        displayName,
      });
      await refreshApp();
      setClientSecret("");
      setEditOpen(false);
      onConfigured?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`cloud-oauth-row cloud-oauth-row--loading ${className ?? ""}`}>
        <Loader2 className="browse-folder__spin" size={18} aria-hidden="true" />
        <span>Loading OAuth settings…</span>
      </div>
    );
  }

  const healthStatus = app?.healthStatus ?? "not_configured";
  const statusLabel = formatOAuthHealthStatus(healthStatus);
  const lastChecked = formatOAuthLastChecked(app?.lastCheckedAt);

  return (
    <>
      <div className={`cloud-oauth-row ${className ?? ""}`}>
        <div className="cloud-oauth-row__main">
          <div className="cloud-oauth-row__title-line">
            <span className="cloud-oauth-row__name">{displayName}</span>
            {canEdit && !app?.configured && (
              <span className="cloud-oauth-row__badge">Setup required</span>
            )}
          </div>
          <p className="cloud-oauth-row__meta">
            Last checked: {lastChecked}
            <span className="cloud-oauth-row__meta-sep">·</span>
            Status:{" "}
            <span
              className={`cloud-oauth-row__status ${statusClassName(healthStatus)}`}
              title={app?.healthError || undefined}
            >
              {statusLabel}
            </span>
          </p>
          {testMessage && <p className="cloud-oauth-row__test-ok">{testMessage}</p>}
          {error && !editOpen && <p className="cloud-oauth-row__error">{error}</p>}
        </div>

        <div className="cloud-oauth-row__actions">
          {canEdit && (
            <button
              type="button"
              className="cloud-oauth-row__icon-button"
              onClick={openEdit}
              aria-label={`Edit ${displayName} credentials`}
              title="Edit credentials"
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="cloud-oauth-row__icon-button"
            onClick={() => void handleTest()}
            disabled={!app?.configured || testing || saving || removing}
            aria-label={`Test ${displayName} connection`}
            title={
              app?.configured
                ? "Test connection"
                : canEdit
                  ? "Configure credentials first"
                  : "Not configured"
            }
          >
            {testing ? (
              <Loader2 className="browse-folder__spin" size={16} aria-hidden="true" />
            ) : (
              <Activity size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {variant === "expanded" && (
        <p className="cloud-oauth-setup__lead cloud-oauth-setup__lead--expanded">
          Sylos does not ship cloud OAuth credentials. Create your own developer app, then store the {providerCredentialText} here.
        </p>
      )}

      {canEdit && editOpen && (
        <div className="confirm-dialog__overlay" onClick={closeEdit}>
          <div
            className="confirm-dialog__content cloud-oauth-edit"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="confirm-dialog__title">Edit {displayName} credentials</h2>

            {variant === "expanded" && docs && (
              <p className="cloud-oauth-setup__docs">
                <a
                  href={docs.setupGuideUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    window.open(docs.setupGuideUrl, "_blank", "noopener,noreferrer");
                  }}
                >
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

            <form className="cloud-oauth-edit__form" onSubmit={(e) => void handleSave(e)}>
              <label className="cloud-oauth-setup__field">
                <span>{clientIdLabel}</span>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </label>

              <label className="cloud-oauth-setup__field">
                <span>{clientSecretLabel}</span>
                <input
                  type="password"
                  value={clientSecret}
                  placeholder={app?.configured ? "Leave blank to keep existing" : ""}
                  onChange={(e) => setClientSecret(e.target.value)}
                  autoComplete="new-password"
                />
              </label>

              {error && <p className="cloud-oauth-setup__error">{error}</p>}

              <div className="confirm-dialog__actions">
                {app?.configured && (
                  <button
                    type="button"
                    className="confirm-dialog__button confirm-dialog__button--cancel cloud-oauth-edit__remove"
                    onClick={() => void handleRemove()}
                    disabled={saving || removing}
                  >
                    {removing ? "Removing…" : `Remove credentials`}
                  </button>
                )}
                <button
                  type="button"
                  className="confirm-dialog__button confirm-dialog__button--cancel"
                  onClick={closeEdit}
                  disabled={saving || removing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="confirm-dialog__button confirm-dialog__button--confirm"
                  disabled={!canSave || saving || removing}
                >
                  {saving ? "Saving…" : "Save credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
