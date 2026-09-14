import { describe, expect, it } from "vitest";
import {
  isMigrationFinalizeFailed,
  isMigrationFinalizeFailedPhase,
  isMigrationFinalizing,
  isMigrationFinalizingPhase,
} from "../types/migrations";

describe("finalize phase helpers", () => {
  it("classifies finalizing phases", () => {
    expect(isMigrationFinalizingPhase("traversal-finalizing")).toBe(true);
    expect(isMigrationFinalizingPhase("copy-finalizing")).toBe(true);
    expect(isMigrationFinalizingPhase("delete-finalizing")).toBe(true);
    expect(isMigrationFinalizingPhase("traversal-in-progress")).toBe(false);
    expect(isMigrationFinalizing({ status: "Copy Finalizing" })).toBe(true);
  });

  it("classifies finalize-failed phases", () => {
    expect(isMigrationFinalizeFailedPhase("traversal-finalize-failed")).toBe(true);
    expect(isMigrationFinalizeFailedPhase("copy-finalize-failed")).toBe(true);
    expect(isMigrationFinalizeFailedPhase("delete-finalize-failed")).toBe(true);
    expect(isMigrationFinalizeFailedPhase("failed")).toBe(false);
    expect(isMigrationFinalizeFailed({ phase: "delete-finalize-failed" })).toBe(true);
  });
});
