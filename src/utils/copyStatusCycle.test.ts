import { describe, expect, it } from "vitest";
import type { DiffItem } from "../api/services";
import { copyCycleStep } from "./copyStatusCycle";

function item(partial: Partial<DiffItem>): DiffItem {
  return {
    id: "1",
    name: "item",
    type: "file",
    ...partial,
  } as DiffItem;
}

function srcItem(copyStatus: string, flags?: Partial<NonNullable<DiffItem["src"]>>): DiffItem {
  return item({
    copyStatus,
    src: { copyStatus, ...flags } as DiffItem["src"],
  });
}

describe("copyCycleStep", () => {
  it("cycles a failed item through retry and excluded back to failed", () => {
    expect(copyCycleStep(srcItem("failed"))).toBe("mark");
    expect(copyCycleStep(srcItem("pending", { copyRetryMarked: true }))).toBe("exclude");
    expect(copyCycleStep(srcItem("excluded", { copyExcludedFromFailed: true }))).toBe(
      "restore-failed"
    );
  });

  it("cycles a born-pending item between pending and excluded", () => {
    expect(copyCycleStep(srcItem("pending"))).toBe("exclude");
    expect(copyCycleStep(srcItem("exclusion_explicit"))).toBe("include");
  });

  it("does not cycle completed or destination-only items", () => {
    expect(copyCycleStep(srcItem("successful"))).toBeNull();
    expect(copyCycleStep(srcItem("already_existed"))).toBeNull();
    expect(copyCycleStep(item({}))).toBeNull();
  });
});
