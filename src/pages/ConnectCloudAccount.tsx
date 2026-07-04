import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, LogIn, LogOut, Unplug } from "lucide-react";

import "../App.css";
import googleDriveLogo from "../assets/external/Google_Drive_Logo.svg";
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
import { serviceIdToProviderId } from "../utils/cloudProviders";
import {
  buildGoogleAuthUrl,
  createOAuthState,
  getGoogleClientId,
  getOAuthRedirectUri,
  isGoogleOAuthConfigured,
  saveOAuthPendingSession,
} from "../utils/googleOAuth";
import "./BrowseFolder.css";
import "../components/CloudConnectionIssues.css";

const DEFAULT_GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive"];

export default function ConnectCloudAccount() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { migration, updateMigration } = useSelection();

  const serviceId = searchParams.get("serviceId") ?? "";
  const providerId =
    searchParams.get("providerId") ?? serviceIdToProviderId(serviceId);
  const role = (searchParams.get("role") as "source" | "destination") || "source";
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
  const oauthConfigured = isGoogleOAuthConfigured();

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
        await disconnectCloudConnection(providerId, existingConnectionId);
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
    if (providerId === "google_drive") return "Google Drive";
    return providerId.replace(/_/g, " ");
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
      setError(
        "Set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET in the app environment to enable Google sign-in."
      );
      return;
    }

    if (!providerId || !serviceId) {
      setError("Missing cloud service information.");
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
      const scopes =
        provider?.scopes?.length ? provider.scopes : DEFAULT_GOOGLE_SCOPES;

      saveOAuthPendingSession({
        providerId,
        serviceId,
        connectionId: connection.connectionId,
        role,
        migrationId: migration.migrationId,
        state,
        scopes,
        returnPath,
      });

      const authUrl = buildGoogleAuthUrl({
        clientId: getGoogleClientId(),
        redirectUri: getOAuthRedirectUri(),
        scopes,
        state,
      });

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
              <img
                src={googleDriveLogo}
                alt=""
                className="service-external-logo service-external-logo--connect"
              />
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
        ) : (
          <div className="browse-cloud-connect">
            <div className="browse-cloud-connect__icon" aria-hidden="true">
              <img
                src={googleDriveLogo}
                alt=""
                className="service-external-logo service-external-logo--connect"
              />
            </div>
            <h2 className="browse-cloud-connect__provider">{providerLabel}</h2>
            <p className="browse-cloud-connect__summary">
              {showInvalidPanel
                ? "This cloud connection is no longer valid. Sign in again to browse folders and choose a migration root."
                : "Sign in to browse folders and choose a root folder for your migration."}
            </p>

            {showInvalidPanel && (
              <span className="cloud-connection-status__badge cloud-connection-status__badge--invalid">
                <LogOut size={16} aria-hidden="true" />
                Connection expired
              </span>
            )}

            {!oauthConfigured && (
              <p className="browse-folder__error browse-cloud-connect__notice">
                Google OAuth credentials are not configured for this build.
              </p>
            )}

            {error && <p className="browse-folder__error">{error}</p>}

            <button
              type="button"
              className="glass-button glass-button--progress-cta browse-cloud-connect__button"
              onClick={() => void handleSignIn()}
              disabled={connecting || !provider || !oauthConfigured}
            >
              {connecting ? (
                <>
                  <Loader2 className="browse-folder__spin" size={18} aria-hidden="true" />
                  Connecting…
                </>
              ) : (
                <>
                  <LogIn size={18} aria-hidden="true" />
                  {showInvalidPanel ? "Reconnect with Google" : "Sign in with Google"}
                </>
              )}
            </button>
          </div>
        )}
      </GlassSurfacePanel>
    </section>
  );
}
