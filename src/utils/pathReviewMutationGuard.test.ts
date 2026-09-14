import { describe, expect, it } from "vitest";
import {
  EXCLUSION_OP_TITLE,
  canStartMutation,
  inFlightOpTitle,
  itemMutationIds,
  withInFlightIds,
  withInFlightOp,
} from "./pathReviewMutationGuard";

describe("pathReviewMutationGuard", () => {
  it("blocks a second toggle while the node is in flight", () => {
    const inFlight = new Set(["a"]);
    expect(canStartMutation(inFlight, "a")).toBe(false);
    expect(canStartMutation(inFlight, "b")).toBe(true);
    expect(canStartMutation(inFlight, null)).toBe(false);
  });

  it("adds and removes in-flight ids", () => {
    let s = new Set<string>();
    s = withInFlightIds(s, ["a", "b", null], true);
    expect([...s].sort()).toEqual(["a", "b"]);
    s = withInFlightIds(s, ["a"], false);
    expect([...s]).toEqual(["b"]);
  });

  it("tracks an op title and clears it", () => {
    let ops = new Map<string, string>();
    ops = withInFlightOp(ops, ["src-1", "item-1"], EXCLUSION_OP_TITLE);
    expect(canStartMutation(ops, "src-1")).toBe(false);
    expect(
      inFlightOpTitle(ops, itemMutationIds({ id: "item-1", src: { id: "src-1" } }))
    ).toBe(EXCLUSION_OP_TITLE);
    ops = withInFlightOp(ops, ["src-1", "item-1"], null);
    expect(ops.size).toBe(0);
  });
});
