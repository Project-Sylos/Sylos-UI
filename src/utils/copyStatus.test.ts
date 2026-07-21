import { describe, expect, it } from "vitest";
import { isCopyComplete } from "./copyStatus";

describe("isCopyComplete", () => {
  it("treats successful and already_existed as complete", () => {
    expect(isCopyComplete("successful")).toBe(true);
    expect(isCopyComplete("already_existed")).toBe(true);
  });

  it("rejects pending and empty", () => {
    expect(isCopyComplete("pending")).toBe(false);
    expect(isCopyComplete("")).toBe(false);
    expect(isCopyComplete(null)).toBe(false);
    expect(isCopyComplete(undefined)).toBe(false);
  });
});
