import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOLDER_SELECT_BOUNCE_MS,
  clearFolderSelectBounce,
  runWithFolderSelectBounce,
} from "./useBrowseSelection";

describe("runWithFolderSelectBounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays plain folder select and cancels on second click", () => {
    const timer = { current: null as number | null };
    const runSelect = vi.fn();
    runWithFolderSelectBounce(
      timer,
      "folder",
      { detail: 1, shiftKey: false, ctrlKey: false, metaKey: false },
      runSelect
    );
    expect(runSelect).not.toHaveBeenCalled();
    expect(timer.current).not.toBeNull();

    runWithFolderSelectBounce(
      timer,
      "folder",
      { detail: 2, shiftKey: false, ctrlKey: false, metaKey: false },
      runSelect
    );
    expect(timer.current).toBeNull();
    vi.advanceTimersByTime(FOLDER_SELECT_BOUNCE_MS);
    expect(runSelect).not.toHaveBeenCalled();
  });

  it("runs file select immediately", () => {
    const timer = { current: null as number | null };
    const runSelect = vi.fn();
    runWithFolderSelectBounce(
      timer,
      "file",
      { detail: 1, shiftKey: false, ctrlKey: false, metaKey: false },
      runSelect
    );
    expect(runSelect).toHaveBeenCalledTimes(1);
  });

  it("clearFolderSelectBounce drops a pending timer", () => {
    const timer = { current: null as number | null };
    const runSelect = vi.fn();
    runWithFolderSelectBounce(
      timer,
      "folder",
      { detail: 1, shiftKey: false, ctrlKey: false, metaKey: false },
      runSelect
    );
    clearFolderSelectBounce(timer);
    vi.advanceTimersByTime(FOLDER_SELECT_BOUNCE_MS);
    expect(runSelect).not.toHaveBeenCalled();
  });
});
