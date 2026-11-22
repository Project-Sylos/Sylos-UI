import { beforeEach, describe, expect, it, vi } from "vitest";
import { isMigrationActivelyRunning } from "../types/migrations";
import {
  postLoginPathForLiveMigrations,
  softStopMigrationsById,
} from "./liveMigrations";

vi.mock("../api/services", () => ({
  listMigrations: vi.fn(),
  stopMigration: vi.fn(async () => ({})),
}));

import { stopMigration } from "../api/services";

describe("isMigrationActivelyRunning", () => {
  it("treats live flag as running", () => {
    expect(isMigrationActivelyRunning({ live: true })).toBe(true);
    expect(isMigrationActivelyRunning({ Live: true })).toBe(true);
  });

  it("treats in-progress and finalizing phases as running", () => {
    expect(
      isMigrationActivelyRunning({ status: "copy-in-progress" })
    ).toBe(true);
    expect(
      isMigrationActivelyRunning({ phase: "traversal-finalizing" })
    ).toBe(true);
    expect(
      isMigrationActivelyRunning({ status: "delete-in-progress" })
    ).toBe(true);
  });

  it("does not treat suspended or review as actively running", () => {
    expect(
      isMigrationActivelyRunning({ status: "copy-suspended", live: false })
    ).toBe(false);
    expect(
      isMigrationActivelyRunning({ phase: "awaiting-copy-review" })
    ).toBe(false);
  });
});

describe("postLoginPathForLiveMigrations", () => {
  it("sends home when none are live", () => {
    expect(postLoginPathForLiveMigrations([])).toBe("/");
  });

  it("opens Progress Monitor for a single live migration", () => {
    expect(postLoginPathForLiveMigrations([{ id: "mig-1" }])).toBe(
      "/progress-monitor/mig-1"
    );
  });

  it("encodes migration ids in the Progress Monitor path", () => {
    expect(postLoginPathForLiveMigrations([{ id: "a/b" }])).toBe(
      "/progress-monitor/a%2Fb"
    );
  });

  it("opens Resume list when several are live", () => {
    expect(
      postLoginPathForLiveMigrations([{ id: "a" }, { id: "b" }])
    ).toBe("/resume");
  });
});

describe("softStopMigrationsById", () => {
  beforeEach(() => {
    vi.mocked(stopMigration).mockClear();
  });

  it("soft-stops each unique id and skips blanks", async () => {
    await softStopMigrationsById(["a", "a", "", " b ", "c"]);
    expect(stopMigration).toHaveBeenCalledTimes(3);
    expect(stopMigration).toHaveBeenCalledWith("a");
    expect(stopMigration).toHaveBeenCalledWith("b");
    expect(stopMigration).toHaveBeenCalledWith("c");
  });

  it("no-ops on empty input", async () => {
    await softStopMigrationsById([]);
    expect(stopMigration).not.toHaveBeenCalled();
  });
});
