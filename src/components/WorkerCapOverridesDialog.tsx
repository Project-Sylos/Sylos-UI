import { useMemo, useState } from "react";
import {
  ABSOLUTE_MAX_WORKERS,
  WORKER_CAP_MODES,
  WORKER_CAP_MODE_LABELS,
  type ModeWorkerCaps,
  type WorkerCapMode,
} from "../types/scaling";
import "./WorkerCapOverridesDialog.css";

export type WorkerCapOverridesDialogProps = {
  title: string;
  /** Shipped defaults keyed by mode (from provider defaults). */
  defaults: Partial<Record<WorkerCapMode, ModeWorkerCaps>>;
  /** Current override values (empty = use shipped). */
  initialModes: Partial<Record<WorkerCapMode, number>>;
  highlightMode?: WorkerCapMode;
  busy?: boolean;
  error?: string | null;
  showPersist?: boolean;
  onClose: () => void;
  onApply: (modes: Partial<Record<WorkerCapMode, number>>) => void | Promise<void>;
  onPersist?: (modes: Partial<Record<WorkerCapMode, number>>) => void | Promise<void>;
  onResetAll: () => void | Promise<void>;
};

function shippedMax(defaults: Partial<Record<WorkerCapMode, ModeWorkerCaps>>, mode: WorkerCapMode): number {
  return defaults[mode]?.max_workers ?? 32;
}

function shippedMin(defaults: Partial<Record<WorkerCapMode, ModeWorkerCaps>>, mode: WorkerCapMode): number {
  return Math.max(1, defaults[mode]?.min_workers ?? 1);
}

export default function WorkerCapOverridesDialog({
  title,
  defaults,
  initialModes,
  highlightMode,
  busy = false,
  error = null,
  showPersist = false,
  onClose,
  onApply,
  onPersist,
  onResetAll,
}: WorkerCapOverridesDialogProps) {
  const [modes, setModes] = useState<Partial<Record<WorkerCapMode, number>>>(() => ({
    ...initialModes,
  }));

  const orderedModes = useMemo(() => {
    if (!highlightMode) return [...WORKER_CAP_MODES];
    return [
      highlightMode,
      ...WORKER_CAP_MODES.filter((m) => m !== highlightMode),
    ];
  }, [highlightMode]);

  const setMode = (mode: WorkerCapMode, value: number) => {
    setModes((prev) => ({ ...prev, [mode]: value }));
  };

  const resetMode = (mode: WorkerCapMode) => {
    setModes((prev) => {
      const next = { ...prev };
      delete next[mode];
      return next;
    });
  };

  const effective = (mode: WorkerCapMode) =>
    modes[mode] ?? shippedMax(defaults, mode);

  return (
    <div className="worker-cap-dialog__overlay" onClick={onClose}>
      <div
        className="worker-cap-dialog__content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="worker-cap-dialog-title"
      >
        <h2 id="worker-cap-dialog-title" className="worker-cap-dialog__title">
          {title}
        </h2>

        <div className="worker-cap-dialog__warning" role="alert">
          <strong>NOT RECOMMENDED.</strong> Raising these hard caps can trigger
          provider rate limits, stalls, or account restrictions. Soft-cap AIMD
          still runs inside the limit you set. Only change this if you know what
          you are doing.
        </div>

        <div className="worker-cap-dialog__modes">
          {orderedModes.map((mode) => {
            const minW = shippedMin(defaults, mode);
            const shipMax = shippedMax(defaults, mode);
            const value = effective(mode);
            const overridden = modes[mode] != null;
            return (
              <div
                key={mode}
                className={`worker-cap-dialog__mode${
                  highlightMode === mode ? " worker-cap-dialog__mode--current" : ""
                }`}
              >
                <div className="worker-cap-dialog__mode-header">
                  <span className="worker-cap-dialog__mode-label">
                    {WORKER_CAP_MODE_LABELS[mode]}
                    {highlightMode === mode ? " (current phase)" : ""}
                  </span>
                  <span className="worker-cap-dialog__mode-meta">
                    {overridden ? "Override" : "Shipped"} · default {shipMax} ·{" "}
                    {value}
                  </span>
                </div>
                <input
                  type="range"
                  className="worker-cap-dialog__slider"
                  min={minW}
                  max={ABSOLUTE_MAX_WORKERS}
                  value={value}
                  disabled={busy}
                  onChange={(e) => setMode(mode, Number(e.target.value))}
                />
                <div className="worker-cap-dialog__mode-actions">
                  <span className="worker-cap-dialog__ends">
                    <span>{minW}</span>
                    <span>{ABSOLUTE_MAX_WORKERS}</span>
                  </span>
                  <button
                    type="button"
                    className="worker-cap-dialog__link"
                    disabled={busy || !overridden}
                    onClick={() => resetMode(mode)}
                  >
                    Reset to default
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {error ? <p className="worker-cap-dialog__error">{error}</p> : null}

        <div className="worker-cap-dialog__actions">
          <button
            type="button"
            className="worker-cap-dialog__button worker-cap-dialog__button--ghost"
            disabled={busy}
            onClick={() => void onResetAll()}
          >
            Reset all to defaults
          </button>
          <div className="worker-cap-dialog__actions-right">
            <button
              type="button"
              className="worker-cap-dialog__button worker-cap-dialog__button--cancel"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            {showPersist && onPersist ? (
              <button
                type="button"
                className="worker-cap-dialog__button worker-cap-dialog__button--secondary"
                disabled={busy}
                onClick={() => void onPersist(modes)}
              >
                Save as default
              </button>
            ) : null}
            <button
              type="button"
              className="worker-cap-dialog__button worker-cap-dialog__button--confirm"
              disabled={busy}
              onClick={() => void onApply(modes)}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
