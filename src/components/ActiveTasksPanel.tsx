import { useState, type CSSProperties } from "react";
import "./ActiveTasksPanel.css";

export type ActiveTaskKind = "path-rename" | "path-bulk";

export interface ActiveTask {
  id: string;
  kind: ActiveTaskKind;
  title: string;
  detail?: string;
  done?: number;
  total?: number;
  phase?: string;
  canSoftStop?: boolean;
  canHardStop?: boolean;
  /** Open the owning UI (e.g. Fix name dialog). */
  onOpen?: () => void;
  onSoftStop?: () => void | Promise<void>;
  onHardStop?: () => void | Promise<void>;
}

export function taskProgressPercent(task: ActiveTask): number | null {
  const done = task.done ?? 0;
  const total = task.total ?? 0;
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

export function formatTaskCounts(task: ActiveTask): string {
  const done = task.done ?? 0;
  const total = task.total ?? 0;
  if (task.phase === "starting") {
    return "Starting…";
  }
  if (task.phase === "refresh") {
    return "Working…";
  }
  if (total > 0) {
    return `${done.toLocaleString()} / ${total.toLocaleString()}`;
  }
  if (done > 0) {
    return `${done.toLocaleString()} checked`;
  }
  return "Starting…";
}

/** Circular progress with optional percent label in the hole. */
export function TaskProgressRing({
  percent,
  size = 36,
}: {
  percent: number | null;
  size?: number;
}) {
  const indeterminate = percent == null;
  return (
    <span
      className={
        indeterminate
          ? "active-task-ring active-task-ring--indeterminate"
          : "active-task-ring"
      }
      style={
        {
          width: size,
          height: size,
          ["--active-task-pct" as string]: indeterminate ? 25 : percent,
        } as CSSProperties
      }
      aria-hidden
    >
      <span className="active-task-ring__hole" />
      <span className="active-task-ring__label">
        {indeterminate ? "…" : `${percent}%`}
      </span>
    </span>
  );
}

interface ActiveTasksSidebarSectionProps {
  tasks: ActiveTask[];
  collapsed: boolean;
  onSelectTask: (task: ActiveTask) => void;
}

/** Sidebar slot: expanded list, or rail of progress rings when the bar is collapsed. */
export function ActiveTasksSidebarSection({
  tasks,
  collapsed,
  onSelectTask,
}: ActiveTasksSidebarSectionProps) {
  if (tasks.length === 0) return null;

  if (collapsed) {
    return (
      <div
        className="sidebar__active-tasks sidebar__active-tasks--rail"
        role="region"
        aria-label="Active tasks"
      >
        {tasks.map((task) => {
          const pct = taskProgressPercent(task);
          return (
            <button
              key={task.id}
              type="button"
              className="sidebar__active-tasks-rail-btn"
              title={`${task.title} — ${formatTaskCounts(task)}`}
              aria-label={`${task.title}, ${formatTaskCounts(task)}`}
              onClick={() => onSelectTask(task)}
            >
              <TaskProgressRing percent={pct} size={34} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="sidebar__active-tasks"
      role="region"
      aria-label="Active tasks"
    >
      <div className="sidebar__active-tasks-heading">Active tasks</div>
      <ul className="sidebar__active-tasks-list">
        {tasks.map((task) => {
          const pct = taskProgressPercent(task);
          return (
            <li key={task.id}>
              <button
                type="button"
                className="sidebar__active-tasks-item"
                onClick={() => onSelectTask(task)}
              >
                <TaskProgressRing percent={pct} size={28} />
                <span className="sidebar__active-tasks-item-text">
                  <span className="sidebar__active-tasks-item-title">
                    {task.title}
                  </span>
                  <span className="sidebar__active-tasks-item-meta">
                    {formatTaskCounts(task)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface ActiveTaskDetailProps {
  task: ActiveTask;
  onClose: () => void;
}

export function ActiveTaskDetail({ task, onClose }: ActiveTaskDetailProps) {
  const [stopBusy, setStopBusy] = useState(false);
  const pct = taskProgressPercent(task);

  const runStop = async (fn?: () => void | Promise<void>) => {
    if (!fn) return;
    setStopBusy(true);
    try {
      await fn();
    } finally {
      setStopBusy(false);
    }
  };

  return (
    <div className="active-task-detail__overlay" onClick={onClose}>
      <div
        className="active-task-detail"
        role="dialog"
        aria-labelledby="active-task-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="active-task-detail-title" className="active-task-detail__title">
          {task.title}
        </h2>
        {task.detail ? (
          <p className="active-task-detail__detail">{task.detail}</p>
        ) : null}
        <div className="active-task-detail__counts-row">
          <TaskProgressRing percent={pct} size={48} />
          <div className="active-task-detail__counts">
            {formatTaskCounts(task)}
          </div>
        </div>
        {pct != null ? (
          <div
            className="active-task-detail__bar"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="active-task-detail__bar-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : (
          <div className="active-task-detail__bar active-task-detail__bar--indeterminate">
            <div className="active-task-detail__bar-fill" />
          </div>
        )}
        <div className="active-task-detail__actions">
          {task.onOpen ? (
            <button
              type="button"
              className="active-task-detail__btn"
              onClick={() => {
                task.onOpen?.();
                onClose();
              }}
            >
              Open
            </button>
          ) : null}
          {task.canSoftStop && task.onSoftStop ? (
            <button
              type="button"
              className="active-task-detail__btn"
              disabled={stopBusy}
              onClick={() => void runStop(task.onSoftStop)}
            >
              Stop & revert
            </button>
          ) : null}
          {task.canHardStop && task.onHardStop ? (
            <button
              type="button"
              className="active-task-detail__btn active-task-detail__btn--danger"
              disabled={stopBusy}
              onClick={() => void runStop(task.onHardStop)}
            >
              Hard stop
            </button>
          ) : null}
          <button
            type="button"
            className="active-task-detail__btn active-task-detail__btn--ghost"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
