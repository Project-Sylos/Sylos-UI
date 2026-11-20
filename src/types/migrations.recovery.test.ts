import { describe, expect, it } from "vitest";
import {
  formatMigrationPhaseLabel,
  hasUncleanInterrupt,
  isMigrationAborted,
  isMigrationHardStoppedResumable,
  isMigrationSuspended,
  migrationPhaseTone,
} from "./migrations";

describe("hard-stop / unclean recovery helpers", () => {
  it("treats aborted as Resume-eligible hard-stop", () => {
    expect(isMigrationAborted({ status: "aborted" })).toBe(true);
    expect(isMigrationHardStoppedResumable({ status: "aborted" })).toBe(true);
    expect(formatMigrationPhaseLabel("aborted")).toBe("Hard-stopped");
    expect(migrationPhaseTone("aborted")).toBe("suspended");
  });

  it("treats unclean suspended as recovery Resume-eligible", () => {
    const suspended = {
      status: "copy-suspended",
      uncleanInterrupt: true,
    };
    expect(isMigrationSuspended(suspended)).toBe(true);
    expect(hasUncleanInterrupt(suspended)).toBe(true);
    expect(isMigrationHardStoppedResumable(suspended)).toBe(true);
    expect(isMigrationHardStoppedResumable({ status: "copy-suspended" })).toBe(
      false
    );
  });
});
