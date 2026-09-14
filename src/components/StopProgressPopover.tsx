import type { StopProgressPayload } from "../types/migrations";
import "./StopProgressPopover.css";

interface StopProgressPopoverProps {
  progress: StopProgressPayload | null | undefined;
  busy: boolean;
  onHardStop: () => void;
  onDismiss: () => void;
}

function stepIcon(status: string): string {
  switch (status) {
    case "done":
      return "✓";
    case "active":
      return "";
    case "failed":
      return "!";
    default:
      return "";
  }
}

export default function StopProgressPopover({
  progress,
  busy,
  onHardStop,
  onDismiss,
}: StopProgressPopoverProps) {
  const steps = progress?.steps ?? [];
  const inProgress = progress?.inProgress ?? 0;
  const label = progress?.label ?? "Stopping migration…";
  const detail = progress?.detail?.trim() || "";

  return (
    <div className="stop-progress-popover" role="dialog" aria-label="Stop progress">
      <div className="stop-progress-popover__header">
        <h3 className="stop-progress-popover__title">Stopping migration</h3>
        <p className="stop-progress-popover__subtitle">{label}</p>
        {detail ? (
          <p className="stop-progress-popover__hint">{detail}</p>
        ) : inProgress > 0 ? (
          <p className="stop-progress-popover__hint">
            {inProgress.toLocaleString()} item{inProgress === 1 ? "" : "s"} still finishing
          </p>
        ) : null}
      </div>
      <ul className="stop-progress-popover__list">
        {steps.map((s) => {
          const active = s.status === "active";
          const done = s.status === "done";
          return (
            <li
              key={s.id}
              className={`stop-progress-popover__item${active ? " stop-progress-popover__item--active" : ""}${done ? " stop-progress-popover__item--done" : ""}`}
            >
              <span className="stop-progress-popover__icon" aria-hidden>
                {active ? (
                  <span className="stop-progress-popover__spinner" />
                ) : (
                  stepIcon(s.status)
                )}
              </span>
              <span className="stop-progress-popover__label">{s.label}</span>
            </li>
          );
        })}
        {steps.length === 0 ? (
          <li className="stop-progress-popover__item stop-progress-popover__item--active">
            <span className="stop-progress-popover__icon" aria-hidden>
              <span className="stop-progress-popover__spinner" />
            </span>
            <span className="stop-progress-popover__label">Working…</span>
          </li>
        ) : null}
      </ul>
      <div className="stop-progress-popover__actions">
        <button
          type="button"
          className="stop-progress-popover__btn stop-progress-popover__btn--hard"
          disabled={busy}
          onClick={onHardStop}
        >
          Hard stop
        </button>
        <button
          type="button"
          className="stop-progress-popover__btn stop-progress-popover__btn--dismiss"
          disabled={busy}
          onClick={onDismiss}
        >
          Hide
        </button>
      </div>
    </div>
  );
}
