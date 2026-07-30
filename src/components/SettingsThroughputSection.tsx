import { useCallback, useEffect, useState } from "react";

import { listSftpSavedHosts } from "../api/providers";
import {
  deleteProviderScalingOverrides,
  deleteSftpScalingOverrides,
  fetchScalingDefaults,
  fetchScalingOverrides,
  saveProviderScalingOverrides,
  saveSftpScalingOverrides,
} from "../api/scaling";
import WorkerCapOverridesDialog from "./WorkerCapOverridesDialog";
import type {
  ModeWorkerCaps,
  ProviderWorkerCaps,
  ScalingOverrideEntry,
  WorkerCapMode,
} from "../types/scaling";
import "./SettingsThroughputSection.css";

const PROVIDER_ROWS: { id: string; label: string }[] = [
  { id: "google_drive", label: "Google Drive" },
  { id: "dropbox", label: "Dropbox" },
  { id: "onedrive", label: "OneDrive" },
  { id: "sharepoint", label: "SharePoint" },
  { id: "box", label: "Box" },
  { id: "local", label: "Local disk" },
  { id: "sftp", label: "SFTP (provider default)" },
  { id: "generic", label: "Generic / other" },
];

type EditTarget =
  | { kind: "provider"; id: string; label: string }
  | { kind: "sftp_host"; id: string; label: string };

type SettingsThroughputSectionProps = {
  canManage: boolean;
};

function modesFromEntry(
  entries: ScalingOverrideEntry[],
  scope: "provider" | "sftp_host",
  key: string
): Partial<Record<WorkerCapMode, number>> {
  const hit = entries.find((e) => e.scope === scope && e.scopeKey === key);
  return hit?.modes || {};
}

export default function SettingsThroughputSection({
  canManage,
}: SettingsThroughputSectionProps) {
  const [defaults, setDefaults] = useState<Record<string, ProviderWorkerCaps>>({});
  const [overrides, setOverrides] = useState<ScalingOverrideEntry[]>([]);
  const [sftpHosts, setSftpHosts] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [enabled, setEnabled] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [d, o, hosts] = await Promise.all([
        fetchScalingDefaults(),
        fetchScalingOverrides(),
        listSftpSavedHosts().catch(() => []),
      ]);
      setDefaults(d);
      setOverrides(o);
      setSftpHosts(
        hosts.map((h) => ({
          id: h.id,
          label: h.displayName || `${h.username}@${h.host}:${h.port}`,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load throughput limits");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openEdit = (target: EditTarget) => {
    if (!canManage) return;
    setEnabled(true);
    setEdit(target);
    setMessage(null);
    setError(null);
  };

  const providerDefaults = (
    providerId: string
  ): Partial<Record<WorkerCapMode, ModeWorkerCaps>> => {
    return (
      defaults[providerId]?.modes ||
      defaults.generic?.modes ||
      defaults.local?.modes ||
      {}
    );
  };

  const currentModes = (): Partial<Record<WorkerCapMode, number>> => {
    if (!edit) return {};
    if (edit.kind === "provider") {
      return modesFromEntry(overrides, "provider", edit.id);
    }
    return modesFromEntry(overrides, "sftp_host", edit.id);
  };

  const closeDialog = () => {
    setEdit(null);
  };

  const saveModes = async (modes: Partial<Record<WorkerCapMode, number>>) => {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      if (edit.kind === "provider") {
        if (Object.keys(modes).length === 0) {
          await deleteProviderScalingOverrides(edit.id);
        } else {
          await saveProviderScalingOverrides(edit.id, modes);
        }
      } else if (Object.keys(modes).length === 0) {
        await deleteSftpScalingOverrides(edit.id);
      } else {
        await saveSftpScalingOverrides(edit.id, modes);
      }
      await refresh();
      setMessage(`Saved throughput limits for ${edit.label}.`);
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const resetAll = async () => {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      if (edit.kind === "provider") {
        await deleteProviderScalingOverrides(edit.id);
      } else {
        await deleteSftpScalingOverrides(edit.id);
      }
      await refresh();
      setMessage(`Reset ${edit.label} to shipped defaults.`);
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const hasOverride = (scope: "provider" | "sftp_host", key: string) =>
    overrides.some((e) => e.scope === scope && e.scopeKey === key);

  return (
    <div className="settings__subsection settings-throughput">
      <div className="settings__subsection-header">
        <div>
          <h2 className="settings__subsection-title">Throughput limits (advanced)</h2>
          <p className="settings__subsection-description">
            Optional MaxWorkers hard caps for the autoscaler. Soft-cap AIMD still owns actual
            worker count. Raising these is not recommended unless you understand provider rate
            limits.
          </p>
        </div>
      </div>

      <label className="settings-throughput__enable">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canManage}
          onChange={(e) => {
            const checked = e.target.checked;
            setEnabled(checked);
            if (!checked) {
              setEdit(null);
            }
          }}
        />
        Override worker hard caps (not recommended)
      </label>

      {enabled ? (
        <div className="settings-throughput__warning" role="alert">
          <strong>NOT RECOMMENDED.</strong> Only change these if you know what you are doing.
          Incorrect limits can cause rate limiting, stalls, or provider restrictions.
        </div>
      ) : null}

      {enabled ? (
        <>
          <ul className="settings-throughput__list">
            {PROVIDER_ROWS.map((row) => (
              <li key={row.id} className="settings-throughput__row">
                <div>
                  <div className="settings-throughput__name">{row.label}</div>
                  <div className="settings-throughput__meta">
                    {hasOverride("provider", row.id)
                      ? "Custom override saved"
                      : "Using shipped defaults"}
                  </div>
                </div>
                <button
                  type="button"
                  className="settings-throughput__btn"
                  disabled={!canManage || busy}
                  onClick={() => openEdit({ kind: "provider", id: row.id, label: row.label })}
                >
                  Edit limits
                </button>
              </li>
            ))}
          </ul>

          {sftpHosts.length > 0 ? (
            <>
              <h3 className="settings-throughput__subhead">Per SFTP connection</h3>
              <ul className="settings-throughput__list">
                {sftpHosts.map((host) => (
                  <li key={host.id} className="settings-throughput__row">
                    <div>
                      <div className="settings-throughput__name">{host.label}</div>
                      <div className="settings-throughput__meta">
                        {hasOverride("sftp_host", host.id)
                          ? "Host override (wins over SFTP provider default)"
                          : "No host override"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="settings-throughput__btn"
                      disabled={!canManage || busy}
                      onClick={() =>
                        openEdit({ kind: "sftp_host", id: host.id, label: host.label })
                      }
                    >
                      Edit limits
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}

      {message ? <p className="settings-throughput__message">{message}</p> : null}
      {error && !edit ? <p className="settings-throughput__error">{error}</p> : null}

      {edit ? (
        <WorkerCapOverridesDialog
          title={`Worker limits · ${edit.label}`}
          defaults={
            edit.kind === "provider" ? providerDefaults(edit.id) : providerDefaults("sftp")
          }
          initialModes={currentModes()}
          busy={busy}
          error={error}
          onClose={closeDialog}
          onApply={saveModes}
          onResetAll={resetAll}
        />
      ) : null}
    </div>
  );
}
