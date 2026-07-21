import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteSftpSavedHost, listSftpSavedHosts } from "../api/providers";
import { SFTPSavedHostSummary } from "../types/providers";
import "./SettingsSftpHostsSection.css";

type SettingsSftpHostsSectionProps = {
  canManage: boolean;
};

function formatEndpoint(host: SFTPSavedHostSummary): string {
  return `${host.username}@${host.host}:${host.port}`;
}

export default function SettingsSftpHostsSection({ canManage }: SettingsSftpHostsSectionProps) {
  const [hosts, setHosts] = useState<SFTPSavedHostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHosts(await listSftpSavedHosts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved SFTP hosts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = async (host: SFTPSavedHostSummary) => {
    if (!canManage) {
      return;
    }
    setBusyId(host.id);
    setError(null);
    setMessage(null);
    try {
      await deleteSftpSavedHost(host.id);
      setHosts((prev) => prev.filter((item) => item.id !== host.id));
      setMessage(`Removed ${host.displayName || formatEndpoint(host)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete saved host.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="settings__subsection settings-sftp-hosts">
      <div className="settings__subsection-header">
        <div>
          <h2 className="settings__subsection-title">SFTP hosts</h2>
          <p className="settings__subsection-description">
            Remembered servers for quick reconnect when you pick SFTP as a source or destination.
            Credentials are stored encrypted on this install. Connecting again updates the saved
            entry.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="settings-sftp-hosts__loading">
          <Loader2 size={16} className="browse-folder__spin" aria-hidden="true" />
          Loading saved hosts…
        </div>
      ) : hosts.length === 0 ? (
        <p className="settings-sftp-hosts__empty">
          No saved SFTP hosts yet. Connect with “Remember this connection” checked to add one.
        </p>
      ) : (
        <ul className="settings-sftp-hosts__list">
          {hosts.map((host) => (
            <li key={host.id} className="settings-sftp-hosts__row">
              <div className="settings-sftp-hosts__main">
                <div className="settings-sftp-hosts__name">
                  {host.displayName || formatEndpoint(host)}
                </div>
                <p className="settings-sftp-hosts__meta">
                  {formatEndpoint(host)}
                  <span className="settings-sftp-hosts__sep">·</span>
                  {host.authMethod === "pem" ? "Private key" : "Password"}
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  className="glass-button settings-sftp-hosts__delete"
                  onClick={() => void handleDelete(host)}
                  disabled={busyId === host.id}
                  aria-label={`Delete ${host.displayName || formatEndpoint(host)}`}
                >
                  {busyId === host.id ? (
                    <Loader2 size={14} className="browse-folder__spin" aria-hidden="true" />
                  ) : (
                    <Trash2 size={14} aria-hidden="true" />
                  )}
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="settings__message settings__message--error">{error}</p>}
      {message && <p className="settings__message">{message}</p>}
    </div>
  );
}
