import type { AutoscalerWaitBudget } from "../types/autoscaler";

export type WaitBudgetDominant = "fs" | "backpressure" | "dbWork";

export type WorkingOnPhase = "discovery" | "copy" | "delete";

export type WorkingOnActivityTone = "fs" | "db";

export type WorkingOnActivityChip = {
  tone: WorkingOnActivityTone;
  label: string;
  /** Longer hint for title/tooltip. */
  detail: string;
};

/** Instant wait spent since the previous autoscaler poll (wall-clock ms). */
export type WaitBudgetInstant = {
  fsMs: number;
  /** Organic flush + forced flush + hard-cap wait (user-facing "saving"). */
  saveMs: number;
  /** Frontier pull + pull-gate wait. */
  pullMs: number;
};

/** Same dominant pick as the Autoscaler "Bottleneck wait" badge (EMA averages). */
export function waitBudgetDominant(
  budget: AutoscalerWaitBudget
): WaitBudgetDominant {
  const fs = budget.fsEmaMsPerSec || 0;
  const bp = budget.backpressureEmaMsPerSec || 0;
  const work = budget.dbWorkEmaMsPerSec || 0;
  if (bp >= fs && bp >= work) return "backpressure";
  if (work >= fs && work >= bp) return "dbWork";
  return "fs";
}

function deltaMs(
  prev: number | undefined,
  next: number | undefined
): number {
  return Math.max(0, (next || 0) - (prev || 0));
}

/**
 * Current-interval wait from cumulative totals. Returns null on the first sample
 * (no previous snapshot to diff against).
 */
export function waitBudgetInstantDelta(
  prev: AutoscalerWaitBudget | null | undefined,
  next: AutoscalerWaitBudget | null | undefined
): WaitBudgetInstant | null {
  if (!prev || !next) return null;

  const fsMs = deltaMs(prev.fsTotalMs, next.fsTotalMs);
  const pullMs =
    deltaMs(prev.dbPullMs, next.dbPullMs) +
    deltaMs(prev.dbPullGateWaitMs, next.dbPullGateWaitMs);
  const saveFromParts =
    deltaMs(prev.dbOrganicFlushMs, next.dbOrganicFlushMs) +
    deltaMs(prev.dbForcedFlushMs, next.dbForcedFlushMs) +
    deltaMs(prev.dbHardCapWaitMs, next.dbHardCapWaitMs);

  // Prefer breakdown fields; if a build omits them, fall back to category totals.
  const saveMs =
    saveFromParts > 0
      ? saveFromParts
      : deltaMs(prev.backpressureTotalMs, next.backpressureTotalMs) +
        Math.max(
          0,
          deltaMs(prev.dbWorkTotalMs, next.dbWorkTotalMs) - pullMs
        );

  return { fsMs, saveMs, pullMs };
}

function majorityKind(
  tasks: Array<{ itemKind?: string; taskType?: string }> | undefined
): "folder" | "file" | null {
  if (!tasks?.length) return null;
  let folders = 0;
  let files = 0;
  for (const task of tasks) {
    if (
      task.itemKind === "folder" ||
      task.taskType === "copy-folder" ||
      task.taskType === "delete-folder"
    ) {
      folders += 1;
    } else if (
      task.itemKind === "file" ||
      task.taskType === "copy-file" ||
      task.taskType === "delete-file"
    ) {
      files += 1;
    }
  }
  if (folders === 0 && files === 0) return null;
  if (folders > files) return "folder";
  if (files > folders) return "file";
  return null;
}

function fsActivityLabel(
  phase: WorkingOnPhase,
  kind: "folder" | "file" | null
): string {
  switch (phase) {
    case "discovery":
      return kind === "folder" ? "Discovering folders" : "Discovering files";
    case "copy":
      if (kind === "folder") return "Copying folders";
      if (kind === "file") return "Copying files";
      return "Copying items";
    case "delete":
      if (kind === "folder") return "Deleting folders";
      if (kind === "file") return "Deleting files";
      return "Deleting items";
  }
}

/**
 * User-facing activity chip for the Progress Monitor "Working on" row.
 * Uses the latest poll interval's wait deltas (not EMA averages).
 * Only three user labels: FS activity, saving, or pulling.
 */
export function workingOnActivityChip(params: {
  instant: WaitBudgetInstant | null | undefined;
  phase: WorkingOnPhase;
  activeTasks?: Array<{ itemKind?: string; taskType?: string }>;
}): WorkingOnActivityChip | null {
  const { instant, phase, activeTasks } = params;
  const kind = majorityKind(activeTasks);

  if (!instant) {
    if (activeTasks?.length) {
      return {
        tone: "fs",
        label: fsActivityLabel(phase, kind),
        detail: "Active filesystem work for this phase.",
      };
    }
    return null;
  }

  const { fsMs, saveMs, pullMs } = instant;
  const total = fsMs + saveMs + pullMs;

  // Quiet interval: keep showing live FS activity when workers still have leases.
  if (total <= 0) {
    if (activeTasks?.length) {
      return {
        tone: "fs",
        label: fsActivityLabel(phase, kind),
        detail: "Active filesystem work for this phase.",
      };
    }
    return null;
  }

  // Prefer FS on ties so provider work is not hidden behind lingering DB totals.
  if (fsMs >= saveMs && fsMs >= pullMs) {
    return {
      tone: "fs",
      label: fsActivityLabel(phase, kind),
      detail: "Filesystem / provider work dominated the last second.",
    };
  }
  if (pullMs >= saveMs) {
    return {
      tone: "db",
      label: "Pulling the next batch of tasks",
      detail: "Loading the next leased work batch from the ops database.",
    };
  }
  return {
    tone: "db",
    label: "Saving to the local database",
    detail: "Writing results into the local ops database (flush or buffer wait).",
  };
}
