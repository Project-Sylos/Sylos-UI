import { useState } from "react";
import { DUCKDB_MEMORY_PRESETS } from "../api/performance";
import "./ConfirmDialog.css";
import "./FinalizeRetryDialog.css";

export const RECOMMENDED_FINALIZE_MEMORY_GB = 2;
export const RECOMMENDED_FINALIZE_THREADS = 1;
export const MAX_FINALIZE_THREADS = 4;

/** Memory presets for index-build retry (includes recommended 2GB; no Auto). */
export const FINALIZE_MEMORY_PRESETS = [
  ...new Set([RECOMMENDED_FINALIZE_MEMORY_GB, ...DUCKDB_MEMORY_PRESETS.filter((g) => g > 0)]),
].sort((a, b) => a - b);

export type FinalizeRetryOverrides = {
  memoryLimitGB: number;
  threads: number;
};

type FinalizeRetryDialogProps = {
  errorMessage?: string | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (overrides: FinalizeRetryOverrides) => void;
};

export default function FinalizeRetryDialog({
  errorMessage,
  busy = false,
  onCancel,
  onConfirm,
}: FinalizeRetryDialogProps) {
  const [memoryLimitGB, setMemoryLimitGB] = useState(RECOMMENDED_FINALIZE_MEMORY_GB);
  const [threads, setThreads] = useState(RECOMMENDED_FINALIZE_THREADS);

  return (
    <div className="confirm-dialog__overlay" onClick={busy ? undefined : onCancel}>
      <div
        className="confirm-dialog__content finalize-retry-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="finalize-retry-title"
      >
        <h2 id="finalize-retry-title" className="confirm-dialog__title">
          Retry database finalize?
        </h2>
        <p className="confirm-dialog__message">
          Queues finished, but saving indexes or checkpointing failed. This retries only
          that step (not discovery, copy, or delete workers). Recommended for large trees:
          memory {RECOMMENDED_FINALIZE_MEMORY_GB} GB, threads {RECOMMENDED_FINALIZE_THREADS}.
          Raising threads above 1 can use much more RAM.
        </p>
        {errorMessage ? (
          <p className="finalize-retry-dialog__error" role="status">
            {errorMessage}
          </p>
        ) : null}
        <div className="finalize-retry-dialog__fields">
          <label className="finalize-retry-dialog__label">
            DuckDB memory for index build
            <select
              value={memoryLimitGB}
              disabled={busy}
              onChange={(e) => setMemoryLimitGB(Number(e.target.value))}
            >
              {FINALIZE_MEMORY_PRESETS.map((gb) => (
                <option key={gb} value={gb}>
                  {gb} GB
                  {gb === RECOMMENDED_FINALIZE_MEMORY_GB ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="finalize-retry-dialog__label">
            Threads for index build
            <select
              value={threads}
              disabled={busy}
              onChange={(e) => setThreads(Number(e.target.value))}
            >
              {Array.from({ length: MAX_FINALIZE_THREADS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === RECOMMENDED_FINALIZE_THREADS ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--cancel"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--confirm"
            disabled={busy}
            onClick={() => onConfirm({ memoryLimitGB, threads })}
          >
            {busy ? "Starting…" : "Retry finalize"}
          </button>
        </div>
      </div>
    </div>
  );
}
