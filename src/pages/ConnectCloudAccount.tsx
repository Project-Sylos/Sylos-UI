import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Cloud, Loader2, LogIn, LogOut, Unplug, User, Users } from "lucide-react";

import "../App.css";
import googleDriveLogo from "../assets/external/Google_Drive_Logo.svg";
import dropboxLogo from "../assets/external/dropbox-1-logo-png-transparent.png";
import { createConnection, fetchProviders } from "../api/providers";
import { GlassSurfacePanel } from "../components/GlassSurfacePanel";
import PageBackButton from "../components/PageBackButton";
import { useSelection } from "../context/SelectionContext";
import { useCloudConnectionGuard } from "../hooks/useCloudConnectionGuard";
import { ProviderDescriptor } from "../types/providers";
import {
  buildCloudBrowsePath,
  disconnectCloudConnection,
} from "../utils/cloudConnections";
import {
  createOAuthState,
  getOAuthRedirectUri,
  saveOAuthPendingSession,
} from "../utils/cloudOAuth";
import CloudProviderOAuthSetup from "../components/CloudProviderOAuthSetup";
import { useAuth } from "../contexts/AuthContext";
import { serviceIdToProviderId } from "../utils/cloudProviders";
import {
  buildCloudProviderAuthUrl,
  getCloudProviderDisplayName,
  getCloudProviderOAuthEnvHint,
  getCloudProviderSignInBrand,
  isCloudProviderOAuthConfigured,
  resolveCloudProviderScopes,
} from "../utils/cloudProviderOAuth";
import {
  DropboxAccountType,
  getDropboxAccountTypeLabel,
  getDropboxAccountTypeSummary,
  parseDropboxAccountType,
} from "../utils/dropboxOAuth";
import "./BrowseFolder.css";
import "../components/CloudConnectionIssues.css";

function ProviderConnectIcon({ providerId }: { providerId: string }) {
  if (providerId === "google_drive") {
    return (
      <img
        src={googleDriveLogo}
        alt=""
        className="service-external-logo service-external-logo--connect"
      />
    );
  }

  if (providerId === "dropbox") {
    return (
      <img
        src={dropboxLogo}
        alt=""
        className="service-external-logo service-external-logo--connect"
      />
    );
  }

  return <Cloud size={48} className="browse-cloud-connect__generic-cloud-icon" />;
}

export default function ConnectCloudAccount() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { migration, updateMigration, persistSelections } = useSelection();

  const serviceId = searchParams.get("serviceId") ?? "";
  const providerId =
    searchParams.get("providerId") ?? serviceIdToProviderId(serviceId);
  const role = (searchParams.get("role") as "source" | "destination") || "source";
  const dropboxAccountType = parseDropboxAccountType(searchParams.get("accountType"));
  const shouldReconnect = searchParams.get("reconnect") === "1";
  const queryConnectionId = searchParams.get("connectionId") ?? undefined;
  const migrationConnectionId =
    role === "source"
      ? migration.sourceConnectionId
      : migration.destinationConnectionId;
  const existingConnectionId = queryConnectionId ?? migrationConnectionId;

  const [provider, setProvider] = useState<ProviderDescriptor | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectHandledRef = useRef(false);

  const returnPath = role === "destination" ? "/destination" : "/connect";
  const oauthConfigured = isCloudProviderOAuthConfigured(provider?.oauthClientId);
  const signInBrand = getCloudProviderSignInBrand(providerId);
  const isAdmin = user?.role === "admin";

  const reloadProvider = async () => {
    const providers = await fetchProviders();
    const match =
      providers.find((item) => item.id === providerId) ??
      providers.find((item) => item.serviceId === serviceId) ??
      null;
    setProvider(match);
  };

  const {
    checking: checkingConnection,
    valid: connectionValid,
    status: connectionStatus,
    recheck: recheckConnection,
  } = useCloudConnectionGuard({
    providerId,
    connectionId: existingConnectionId ?? "",
    enabled: Boolean(existingConnectionId) && !shouldReconnect,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProvider() {
      if (!serviceId || !providerId) {
        setError("Missing cloud service information.");
        setLoading(false);
        return;
      }

      try {
        const providers = await fetchProviders();
        if (cancelled) return;
        const match =
          providers.find((item) => item.id === providerId) ??
          providers.find((item) => item.serviceId === serviceId) ??
          null;
        setProvider(match);
        if (!match) {
          setError(`Cloud provider "${providerId}" is not available on the API.`);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load providers.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProvider();
    return () => {
      cancelled = true;
    };
  }, [providerId, serviceId]);

  useEffect(() => {
    if (!shouldReconnect || !existingConnectionId || reconnectHandledRef.current) {
      return;
    }

    reconnectHandledRef.current = true;

    async function revokeExisting() {
      setDisconnecting(true);
      setError(null);
      try {
        await disconnectCloudConnection(providerId, existingConnectionId ?? "");
        updateMigration(
          role === "source"
            ? { sourceConnectionId: undefined }
            : { destinationConnectionId: undefined }
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to disconnect the previous cloud session."
        );
      } finally {
        setDisconnecting(false);
      }
    }

    void revokeExisting();
  }, [
    existingConnectionId,
    providerId,
    role,
    shouldReconnect,
    updateMigration,
  ]);

  const providerLabel = useMemo(() => {
    if (provider?.displayName) return provider.displayName;
    return getCloudProviderDisplayName(providerId);
  }, [provider, providerId]);

  const clearConnectionState = () => {
    updateMigration(
      role === "source"
        ? { sourceConnectionId: undefined }
        : { destinationConnectionId: undefined }
    );
  };

  const handleDisconnect = async () => {
    if (!existingConnectionId) return;

    setDisconnecting(true);
    setError(null);
    try {
      await disconnectCloudConnection(providerId, existingConnectionId);
      clearConnectionState();
      await recheckConnection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleContinueToBrowse = () => {
    if (!existingConnectionId) return;
    navigate(
      buildCloudBrowsePath({
        role,
        serviceId,
        connectionId: existingConnectionId,
        providerId,
      })
    );
  };

  const handleSignIn = async () => {
    if (!oauthConfigured) {
      setError(getCloudProviderOAuthEnvHint(providerId));
      return;
    }

    if (!providerId || !serviceId) {
      setError("Missing cloud service information.");
      return;
    }

    if (providerId === "dropbox" && !dropboxAccountType) {
      setError("Choose a Dropbox account type before signing in.");
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const connection = await createConnection(providerId, {
        migrationId: migration.migrationId,
      });

      updateMigration(
        role === "source"
          ? { sourceConnectionId: connection.connectionId }
          : { destinationConnectionId: connection.connectionId }
      );

      const state = createOAuthState();
      const scopes = resolveCloudProviderScopes(providerId, provider?.scopes, {
        dropboxAccountType: dropboxAccountType ?? undefined,
      });

      saveOAuthPendingSession({
        providerId,
        serviceId,
        connectionId: connection.connectionId,
        role,
        migrationId: migration.migrationId,
        state,
        scopes,
        returnPath,
        dropboxAccountType: dropboxAccountType ?? undefined,
      });

      const credsClientId = provider?.oauthClientId;
      if (!credsClientId) {
        setError(getCloudProviderOAuthEnvHint(providerId));
        setConnecting(false);
        return;
      }

      const authUrl = buildCloudProviderAuthUrl(providerId, {
        clientId: credsClientId,
        redirectUri: getOAuthRedirectUri(),
        scopes,
        state,
      });

      persistSelections(
        role === "source"
          ? { sourceConnectionId: connection.connectionId }
          : { destinationConnectionId: connection.connectionId }
      );
      window.location.href = authUrl;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start cloud connection.";
      setError(message);
      setConnecting(false);
    }
  };

  const showConnectedPanel =
    Boolean(existingConnectionId) &&
    !shouldReconnect &&
    !checkingConnection &&
    connectionValid === true;

  const showInvalidPanel =
    Boolean(existingConnectionId) &&
    !shouldReconnect &&
    !checkingConnection &&
    connectionValid === false;

  const needsDropboxAccountPicker =
    providerId === "dropbox" &&
    !showConnectedPanel &&
    !dropboxAccountType &&
    !loading &&
    !checkingConnection &&
    !disconnecting;

  const selectDropboxAccountType = (accountType: DropboxAccountType) => {
    const next = new URLSearchParams(searchParams);
    next.set("accountType", accountType);
    setSearchParams(next);
  };

  const clearDropboxAccountType = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("accountType");
    setSearchParams(next);
  };

  return (
    <section className="browse-folder">
      <GlassSurfacePanel className="browse-folder__content">
        <PageBackButton
          onClick={() => navigate(returnPath)}
          title={
            role === "destination"
              ? "Back to destination service selection"
              : "Back to source service selection"
          }
          className="browse-folder__page-back"
        />

        <header className="browse-folder__header">
          <h1 className="browse-folder__title">
            {role === "source" ? (
              <>
                Connect your{" "}
                <span className="browse-folder__highlight--magenta">source</span>{" "}
                account
              </>
            ) : (
              <>
                Connect your{" "}
                <span className="browse-folder__highlight--cyan">destination</span>{" "}
                account
              </>
            )}
          </h1>
        </header>

        {loading || checkingConnection || disconnecting ? (
          <div className="browse-folder__loading">
            <Loader2 className="browse-folder__spin" size={28} aria-hidden="true" />
            <span>
              {disconnecting
                ? "Disconnecting…"
                : checkingConnection
                  ? "Checking connection…"
                  : "Loading provider…"}
            </span>
          </div>
        ) : showConnectedPanel ? (
          <div className="browse-cloud-connect">
            <div className="browse-cloud-connect__icon" aria-hidden="true">
              <ProviderConnectIcon providerId={providerId} />
            </div>
            <h2 className="browse-cloud-connect__provider">{providerLabel}</h2>
            <div className="cloud-connection-status">
              <span className="cloud-connection-status__badge cloud-connection-status__badge--valid">
                <CheckCircle2 size={16} aria-hidden="true" />
                Connected
              </span>
              {connectionStatus?.expiresAt && (
                <p className="cloud-connection-status__hint">
                  Access token expires {new Date(connectionStatus.expiresAt).toLocaleString()}.
                  The API refreshes tokens automatically when needed.
                </p>
              )}
              <div className="cloud-connection-status__actions">
                <button
                  type="button"
                  className="glass-button glass-button--progress-cta"
                  onClick={handleContinueToBrowse}
                >
                  Continue to folder selection
                </button>
                <button
                  type="button"
                  className="glass-button"
                  onClick={() => void handleDisconnect()}
                >
                  <Unplug size={16} aria-hidden="true" />
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        ) : needsDropboxAccountPicker ? (
          <div className="browse-cloud-connect">
            <div className="browse-cloud-connect__icon" aria-hidden="true">
              <ProviderConnectIcon providerId={providerId} />
            </div>
            <h2 className="browse-cloud-connect__provider">{providerLabel}</h2>
            <p className="browse-cloud-connect__summary">
              Which type of Dropbox account are you connecting?
            </p>

            <div className="browse-cloud-connect__account-types">
              <button
                type="button"
                className="browse-cloud-connect__account-type"
                onClick={() => selectDropboxAccountType("personal")}
              >
                <User size={28} aria-hidden="true" />
                <span className="browse-cloud-connect__account-type-title">
                  Personal
                </span>
                <span className="browse-cloud-connect__account-type-desc">
                  Individual My Dropbox account
                </span>
              </button>
              <button
                type="button"
                className="browse-cloud-connect__account-type"
                onClick={() => selectDropboxAccountType("work")}
              >
                <Users size={28} aria-hidden="true" />
                <span className="browse-cloud-connect__account-type-title">
                  Work / Team
                </span>
                <span className="browse-cloud-connect__account-type-desc">
                  Dropbox Business - team space, team folders, shared folders
                </span>
              </button>
            </div>

            {error && <p className="browse-folder__error">{error}</p>}
          </div>
        ) : (
          <div className="browse-cloud-connect">
            <div className="browse-cloud-connect__icon" aria-hidden="true">
              <ProviderConnectIcon providerId={providerId} />
            </div>
            <h2 className="browse-cloud-connect__provider">{providerLabel}</h2>
            {providerId === "dropbox" && dropboxAccountType && (
              <p className="browse-cloud-connect__account-badge">
                {getDropboxAccountTypeLabel(dropboxAccountType)} account
              </p>
            )}
            <p className="browse-cloud-connect__summary">
              {showInvalidPanel
                ? "This cloud connection is no longer valid. Sign in again to browse folders and choose a migration root."
                : providerId === "dropbox" && dropboxAccountType
                  ? getDropboxAccountTypeSummary(dropboxAccountType)
                  : "Sign in to browse folders and choose a root folder for your migration."}
            </p>

            {providerId === "dropbox" && dropboxAccountType && (
              <button
                type="button"
                className="browse-cloud-connect__change-account-type"
                onClick={clearDropboxAccountType}
              >
                Change account type
              </button>
            )}

            {showInvalidPanel && (
              <span className="cloud-connection-status__badge cloud-connection-status__badge--invalid">
                <LogOut size={16} aria-hidden="true" />
                Connection expired
              </span>
            )}

            {!oauthConfigured && !isAdmin && (
              <p className="browse-folder__error browse-cloud-connect__notice">
                {getCloudProviderOAuthEnvHint(providerId)}
              </p>
            )}

            {!oauthConfigured && isAdmin && (
              <CloudProviderOAuthSetup
                providerId={providerId}
                displayName={providerLabel}
                onConfigured={() => void reloadProvider()}
              />
            )}

            {error && <p className="browse-folder__error">{error}</p>}

            {oauthConfigured && (
              <button
                type="button"
                className="glass-button glass-button--progress-cta browse-cloud-connect__button"
                onClick={() => void handleSignIn()}
                disabled={
                  connecting ||
                  !provider ||
                  (providerId === "dropbox" && !dropboxAccountType)
                }
              >
                {connecting ? (
                  <>
                    <Loader2 className="browse-folder__spin" size={18} aria-hidden="true" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <LogIn size={18} aria-hidden="true" />
                    {showInvalidPanel
                      ? `Reconnect with ${signInBrand}`
                      : providerId === "dropbox" && dropboxAccountType
                        ? `Sign in to ${getDropboxAccountTypeLabel(dropboxAccountType).toLowerCase()} ${signInBrand}`
                        : `Sign in with ${signInBrand}`}
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </GlassSurfacePanel>
    </section>
  );
}
