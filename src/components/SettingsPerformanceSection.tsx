import { useCallback, useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  DUCKDB_MEMORY_PRESETS,
  fetchDuckDBMemorySettings,
  saveDuckDBMemorySettings,
  type DuckDBMemorySettings,
} from "../api/performance";

const DUCKDB_MEMORY_TIP =
  "Caps how much RAM each migration DuckDB may use for queries, seals, and index builds. Auto picks between 4 and 12 GB from free system memory. Raise this on large trees if DuckDB spills heavily or index rebuilds are slow; keep headroom for the OS and Sylos workers. Applies to open migrations immediately; new opens use the same limit.";

type SettingsPerformanceSectionProps = {
  canManage: boolean;
};

export default function SettingsPerformanceSection({
  canManage,
}: SettingsPerformanceSectionProps) {
  const [settings, setSettings] = useState<DuckDBMemorySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setSettings(await fetchDuckDBMemorySettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load performance settings");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onChange = async (value: number) => {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await saveDuckDBMemorySettings(value);
      setSettings(next);
      setMessage(
        next.auto
          ? `Using auto (~${next.effectiveGB} GB from free memory).`
          : `DuckDB memory limit set to ${next.effectiveGB} GB.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const selectValue = settings?.auto ? 0 : settings?.memoryLimitGB ?? 0;

  return (
    <div className="settings__subsection">
      <div className="settings__subsection-header">
        <div>
          <h2 className="settings__subsection-title settings__subsection-title--with-help">
            DuckDB memory limit
            <span
              className="settings__help-icon"
              title={DUCKDB_MEMORY_TIP}
              aria-label={DUCKDB_MEMORY_TIP}
            >
              <HelpCircle size={16} aria-hidden />
            </span>
          </h2>
          <p className="settings__subsection-description">
            How much RAM migration databases may use. Auto uses free memory (minimum 4 GB, up to
            12 GB). You can raise the cap to 64 GB on large hosts.
            {settings && (
              <>
                {" "}
                Currently effective: <strong>{settings.effectiveGB} GB</strong>
                {settings.auto ? ` (auto suggests ${settings.autoSuggestedGB} GB)` : null}.
              </>
            )}
          </p>
        </div>
      </div>
      <label>
        Memory limit
        <select
          value={selectValue}
          disabled={!canManage || busy || !settings}
          onChange={(e) => void onChange(Number(e.target.value))}
        >
          {DUCKDB_MEMORY_PRESETS.map((gb) => (
            <option key={gb} value={gb}>
              {gb === 0
                ? `Auto (about ${settings?.autoSuggestedGB ?? 4}–12 GB from free RAM)`
                : `${gb} GB`}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="settings__message settings__message--error">{error}</p>}
      {message && <p className="settings__message">{message}</p>}
    </div>
  );
}
