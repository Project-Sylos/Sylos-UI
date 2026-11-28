import { describe, expect, it } from "vitest";
import type { AutoscalerWaitBudget } from "../types/autoscaler";
import {
  waitBudgetDominant,
  waitBudgetInstantDelta,
  workingOnActivityChip,
} from "./waitBudgetActivity";

function budget(
  partial: Partial<AutoscalerWaitBudget>
): AutoscalerWaitBudget {
  return {
    fsTotalMs: 0,
    fsEmaMsPerSec: 0,
    backpressureTotalMs: 0,
    backpressureEmaMsPerSec: 0,
    dbWorkTotalMs: 0,
    dbWorkEmaMsPerSec: 0,
    dbTotalMs: 0,
    dbEmaMsPerSec: 0,
    ...partial,
  };
}

describe("waitBudgetDominant", () => {
  it("still uses EMA for the autoscaler badge", () => {
    expect(
      waitBudgetDominant(
        budget({ fsEmaMsPerSec: 1, backpressureEmaMsPerSec: 9, dbWorkEmaMsPerSec: 2 })
      )
    ).toBe("backpressure");
  });
});

describe("waitBudgetInstantDelta", () => {
  it("returns null without a previous sample", () => {
    expect(waitBudgetInstantDelta(null, budget({ fsTotalMs: 10 }))).toBeNull();
  });

  it("diffs cumulative totals into the current interval", () => {
    const prev = budget({
      fsTotalMs: 100,
      dbPullMs: 20,
      dbOrganicFlushMs: 30,
      dbForcedFlushMs: 5,
      dbHardCapWaitMs: 2,
    });
    const next = budget({
      fsTotalMs: 250,
      dbPullMs: 40,
      dbOrganicFlushMs: 80,
      dbForcedFlushMs: 15,
      dbHardCapWaitMs: 12,
    });
    expect(waitBudgetInstantDelta(prev, next)).toEqual({
      fsMs: 150,
      pullMs: 20,
      saveMs: 70,
    });
  });
});

describe("workingOnActivityChip", () => {
  it("uses FS wording when the latest interval is FS-heavy", () => {
    const chip = workingOnActivityChip({
      instant: { fsMs: 800, saveMs: 50, pullMs: 20 },
      phase: "discovery",
      activeTasks: [{ taskType: "src-traversal", itemKind: "folder" }],
    });
    expect(chip?.tone).toBe("fs");
    expect(chip?.label).toBe("Discovering folders");
  });

  it("maps pull-heavy intervals to pulling language", () => {
    const chip = workingOnActivityChip({
      instant: { fsMs: 10, saveMs: 40, pullMs: 500 },
      phase: "copy",
    });
    expect(chip?.tone).toBe("db");
    expect(chip?.label).toBe("Pulling the next batch of tasks");
  });

  it("maps save/backpressure intervals to saving language", () => {
    const chip = workingOnActivityChip({
      instant: { fsMs: 10, saveMs: 500, pullMs: 40 },
      phase: "delete",
    });
    expect(chip?.tone).toBe("db");
    expect(chip?.label).toBe("Saving to the local database");
  });

  it("prefers FS on ties", () => {
    const chip = workingOnActivityChip({
      instant: { fsMs: 100, saveMs: 100, pullMs: 100 },
      phase: "copy",
      activeTasks: [{ taskType: "copy-file" }],
    });
    expect(chip?.label).toBe("Copying files");
  });

  it("falls back to FS activity when the interval is quiet but tasks are leased", () => {
    const chip = workingOnActivityChip({
      instant: { fsMs: 0, saveMs: 0, pullMs: 0 },
      phase: "copy",
      activeTasks: [{ taskType: "copy-folder" }, { taskType: "copy-folder" }],
    });
    expect(chip?.label).toBe("Copying folders");
  });
});
