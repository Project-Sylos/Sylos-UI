import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";

import { createConnection, postProviderCredentials, probeSftpHostKey } from "../api/providers";
import { ConnectionTokenResponse } from "../types/providers";
import { SFTPCredentialsPayload } from "../types/providers";

type AuthMethod = "password" | "pem";
type FormStep = "credentials" | "trust-host";

type SftpCredentialsFormProps = {
  providerId: string;
  serviceId: string;
  role: "source" | "destination";
  migrationId?: string;
  onConnected: (connectionId: string, status?: ConnectionTokenResponse) => void;
  onCancel: () => void;
};

function pemNeedsPassphrase(privateKey: string): boolean {
  const trimmed = privateKey.trim();
  if (!trimmed) {
    return false;
  }
  return (
    /ENCRYPTED PRIVATE KEY/i.test(trimmed) ||
    /Proc-Type:\s*4,ENCRYPTED/i.test(trimmed)
  );
}

export default function SftpCredentialsForm({
  providerId,
  serviceId,
  role,
  migrationId,
  onConnected,
  onCancel,
}: SftpCredentialsFormProps) {
  const [step, setStep] = useState<FormStep>("credentials");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [keyPassphrase, setKeyPassphrase] = useState("");
  const [trustedHostKey, setTrustedHostKey] = useState("");
  const [trustedFingerprint, setTrustedFingerprint] = useState("");
  const [pendingHostKey, setPendingHostKey] = useState("");
  const [pendingFingerprint, setPendingFingerprint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearTrustedHost = () => {
    setTrustedHostKey("");
    setTrustedFingerprint("");
    setPendingHostKey("");
    setPendingFingerprint("");
  };

  const handleHostChange = (value: string) => {
    setHost(value);
    clearTrustedHost();
    setStep("credentials");
    setError(null);
  };

  const handlePortChange = (value: string) => {
    setPort(value);
    clearTrustedHost();
    setStep("credentials");
    setError(null);
  };

  const handleAuthMethodChange = (method: AuthMethod) => {
    setAuthMethod(method);
    setError(null);
    if (method === "password") {
      setPrivateKey("");
      setKeyPassphrase("");
    } else {
      setPassword("");
    }
  };

  const buildPayload = (hostKey: string): SFTPCredentialsPayload => ({
    host: host.trim(),
    port: Number(port) || 22,
    username: username.trim(),
    password: authMethod === "password" ? password : undefined,
    privateKey: authMethod === "pem" ? privateKey.trim() : undefined,
    keyPassphrase:
      authMethod === "pem" && keyPassphrase ? keyPassphrase : undefined,
    hostKey,
  });

  const validateCredentials = (): string | null => {
    if (authMethod === "password" && !password) {
      return "Password is required when using username and password.";
    }
    if (authMethod === "pem" && !privateKey.trim()) {
      return "Private key (PEM) is required when using key authentication.";
    }
    if (authMethod === "pem" && pemNeedsPassphrase(privateKey) && !keyPassphrase) {
      return "This private key is encrypted. Enter the key passphrase.";
    }
    return null;
  };

  const connectWithHostKey = async (hostKey: string) => {
    setBusy(true);
    setError(null);
    try {
      const connection = await createConnection(providerId, { migrationId });
      const status = await postProviderCredentials(
        providerId,
        connection.connectionId,
        buildPayload(hostKey)
      );
      onConnected(connection.connectionId, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect SFTP server.");
      setStep("credentials");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const validationError = validateCredentials();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (trustedHostKey) {
      await connectWithHostKey(trustedHostKey);
      return;
    }

    setBusy(true);
    try {
      const probe = await probeSftpHostKey(providerId, {
        host: host.trim(),
        port: Number(port) || 22,
      });
      setPendingHostKey(probe.hostKey);
      setPendingFingerprint(probe.fingerprint);
      setStep("trust-host");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify server host key.");
    } finally {
      setBusy(false);
    }
  };

  const handleTrustHost = async () => {
    if (!pendingHostKey) {
      setError("Missing server host key. Try connecting again.");
      setStep("credentials");
      return;
    }
    setTrustedHostKey(pendingHostKey);
    setTrustedFingerprint(pendingFingerprint);
    await connectWithHostKey(pendingHostKey);
  };

  if (step === "trust-host") {
    return (
      <div className="sftp-credentials-form sftp-credentials-form--trust">
        <h3 className="sftp-credentials-form__trust-title">Verify server identity</h3>
        <p className="sftp-credentials-form__trust-copy">
          Sylos has not connected to this server before. Confirm the fingerprint matches what
          your administrator expects before trusting it.
        </p>
        <p className="sftp-credentials-form__trust-host">
          <span className="sftp-credentials-form__trust-label">Server</span>
          <span>
            {host.trim()}:{Number(port) || 22}
          </span>
        </p>
        <div className="sftp-credentials-form__fingerprint">
          <span className="sftp-credentials-form__trust-label">Fingerprint</span>
          <code>{pendingFingerprint}</code>
        </div>
        <p className="sftp-credentials-form__trust-hint">
          Future connections to this host will be rejected if the fingerprint changes, which may
          indicate a man-in-the-middle attack.
        </p>
        {error && <p className="browse-folder__error">{error}</p>}
        <div className="sftp-credentials-form__actions">
          <button
            type="button"
            className="glass-button"
            onClick={() => {
              setStep("credentials");
              setError(null);
            }}
            disabled={busy}
          >
            Back
          </button>
          <button
            type="button"
            className="glass-button glass-button--progress-cta"
            onClick={() => void handleTrustHost()}
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 size={16} className="browse-folder__spin" aria-hidden="true" /> Connecting…
              </>
            ) : (
              "Trust and connect"
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="sftp-credentials-form" onSubmit={(e) => void handleSubmit(e)}>
      <div className="sftp-credentials-form__grid">
        <label className="sftp-credentials-form__field">
          Host
          <input
            value={host}
            onChange={(e) => handleHostChange(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="sftp-credentials-form__field">
          Port
          <input
            value={port}
            onChange={(e) => handlePortChange(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="sftp-credentials-form__field sftp-credentials-form__field--span-2">
          Auth
          <select
            value={authMethod}
            onChange={(e) => handleAuthMethodChange(e.target.value as AuthMethod)}
          >
            <option value="password">Password</option>
            <option value="pem">Private key</option>
          </select>
        </label>
        <label className="sftp-credentials-form__field">
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        {authMethod === "password" ? (
          <label className="sftp-credentials-form__field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
        ) : (
          <label className="sftp-credentials-form__field">
            Key passphrase
            <input
              type="password"
              value={keyPassphrase}
              onChange={(e) => setKeyPassphrase(e.target.value)}
              autoComplete="new-password"
              placeholder="If encrypted"
              required={pemNeedsPassphrase(privateKey)}
            />
          </label>
        )}
      </div>
      {authMethod === "pem" && (
        <label className="sftp-credentials-form__field sftp-credentials-form__field--full">
          Private key
          <textarea
            value={privateKey}
            onChange={(e) => {
              setPrivateKey(e.target.value);
              if (!e.target.value.trim()) {
                setKeyPassphrase("");
              }
            }}
            rows={3}
            placeholder="Paste PEM-encoded key"
            required
          />
        </label>
      )}
      {trustedFingerprint && (
        <p className="sftp-credentials-form__pinned">
          Trusted fingerprint: <code>{trustedFingerprint}</code>
        </p>
      )}
      {error && <p className="browse-folder__error">{error}</p>}
      <div className="sftp-credentials-form__actions">
        <button type="button" className="glass-button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="glass-button glass-button--progress-cta" disabled={busy}>
          {busy ? (
            <>
              <Loader2 size={16} className="browse-folder__spin" aria-hidden="true" /> Connecting…
            </>
          ) : (
            "Connect and browse"
          )}
        </button>
      </div>
    </form>
  );
}
