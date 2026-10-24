import { describe, expect, it } from "vitest";
import {
  getPathReviewPageBackPath,
  getPathReviewStepperState,
  showsPathReviewPendingColumn,
} from "./pathReviewPhase";
import type { MigrationStatusResponse } from "../types/migrations";

function status(phase: string): MigrationStatusResponse {
  return { status: phase } as MigrationStatusResponse;
}

describe("getPathReviewStepperState", () => {
  it("keeps Discover active through traversal review and retries", () => {
    const state = getPathReviewStepperState(status("awaiting-traversal-review"));
    expect(state.active).toBe("discover");
    expect(state.completed).toEqual([]);
    expect(state.subtitle).toMatch(/Scan only/i);
  });

  it("moves to Copy after Start Copying", () => {
    const state = getPathReviewStepperState(status("awaiting-copy-review"));
    expect(state.active).toBe("copy");
    expect(state.completed).toEqual(["discover"]);
    expect(state.subtitle).toBeNull();
  });

  it("marks Copy active on copy-plan with plan subtitle", () => {
    const state = getPathReviewStepperState(
      status("awaiting-traversal-review"),
      "copy-plan"
    );
    expect(state.active).toBe("copy");
    expect(state.completed).toEqual(["discover"]);
    expect(state.subtitle).toMatch(/Nothing has been copied yet/i);
  });

  it("marks Remove on source-cleanup and delete review", () => {
    expect(
      getPathReviewStepperState(status("awaiting-copy-review"), "source-cleanup")
        .active
    ).toBe("remove");
    expect(getPathReviewStepperState(status("awaiting-delete-review")).active).toBe(
      "remove"
    );
  });
});

describe("showsPathReviewPendingColumn", () => {
  it("hides on Discover even while awaiting-traversal-review", () => {
    expect(
      showsPathReviewPendingColumn("traversal", status("awaiting-traversal-review"))
    ).toBe(false);
  });

  it("shows on copy-plan (preview) while engine is still awaiting-traversal-review", () => {
    expect(
      showsPathReviewPendingColumn("copy-plan", status("awaiting-traversal-review"))
    ).toBe(true);
  });

  it("hides on copy post-review", () => {
    expect(
      showsPathReviewPendingColumn("copy", status("awaiting-copy-review"))
    ).toBe(false);
  });

  it("shows on source-cleanup (deletion plan preview)", () => {
    expect(
      showsPathReviewPendingColumn("source-cleanup", status("awaiting-copy-review"))
    ).toBe(true);
  });

  it("hides on delete results", () => {
    expect(
      showsPathReviewPendingColumn("delete", status("awaiting-delete-review"))
    ).toBe(false);
  });
});

describe("getPathReviewPageBackPath", () => {
  const id = "mig-1";

  it("sends copy-plan back to discovery results", () => {
    expect(
      getPathReviewPageBackPath(id, status("awaiting-traversal-review"), "copy-plan")
    ).toBe(`/path-review/${id}`);
  });

  it("sends source-cleanup prep back to copy results", () => {
    expect(
      getPathReviewPageBackPath(id, status("awaiting-copy-review"), "source-cleanup")
    ).toBe(`/path-review/${id}`);
  });

  it("sends discovery results to discovery progress", () => {
    expect(
      getPathReviewPageBackPath(id, status("awaiting-traversal-review"), "default")
    ).toBe(`/progress-monitor/${id}?mode=discovery`);
  });

  it("sends copy results to copy progress", () => {
    expect(
      getPathReviewPageBackPath(id, status("awaiting-copy-review"), "default")
    ).toBe(`/progress-monitor/${id}?mode=copy`);
  });

  it("sends delete results / cleanup results to delete progress", () => {
    expect(
      getPathReviewPageBackPath(id, status("awaiting-delete-review"), "default")
    ).toBe(`/progress-monitor/${id}?mode=delete`);
    expect(
      getPathReviewPageBackPath(
        id,
        status("awaiting-delete-review"),
        "source-cleanup"
      )
    ).toBe(`/progress-monitor/${id}?mode=delete`);
  });
});
