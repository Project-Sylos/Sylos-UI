import { describe, expect, it } from "vitest";

import { FilterRuleset, RULESET_SCHEMA_VERSION } from "../types/rulesets";
import { findFilterContradictions } from "./filterContradictions";

function ruleset(root_group: FilterRuleset["root_group"]): FilterRuleset {
  return {
    ruleset_id: "test",
    name: "test",
    schema_version: RULESET_SCHEMA_VERSION,
    root_group,
  };
}

describe("findFilterContradictions", () => {
  it("flags disjoint extension lists under all-of-these", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "AND",
        children: [
          {
            condition: {
              id: "v",
              field: "extension",
              operator: "in",
              value: ["mp4", "mov"],
              applies_to: "file",
            },
          },
          {
            condition: {
              id: "d",
              field: "extension",
              operator: "in",
              value: ["pdf", "docx"],
              applies_to: "file",
            },
          },
        ],
      })
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].message).toMatch(/never match/i);
  });

  it("allows overlapping extension lists under all-of-these", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "AND",
        children: [
          {
            condition: {
              id: "a",
              field: "extension",
              operator: "in",
              value: ["pdf", "docx"],
              applies_to: "file",
            },
          },
          {
            condition: {
              id: "b",
              field: "extension",
              operator: "in",
              value: ["pdf"],
              applies_to: "file",
            },
          },
        ],
      })
    );
    expect(hits).toEqual([]);
  });

  it("allows disjoint extensions under any-of-these", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "OR",
        children: [
          {
            condition: {
              id: "v",
              field: "extension",
              operator: "in",
              value: ["mp4"],
              applies_to: "file",
            },
          },
          {
            condition: {
              id: "d",
              field: "extension",
              operator: "in",
              value: ["pdf"],
              applies_to: "file",
            },
          },
        ],
      })
    );
    expect(hits).toEqual([]);
  });

  it("flags impossible size ranges", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "AND",
        children: [
          {
            condition: {
              id: "a",
              field: "size",
              operator: "gt",
              value: 100,
              applies_to: "file",
            },
          },
          {
            condition: {
              id: "b",
              field: "size",
              operator: "lt",
              value: 10,
              applies_to: "file",
            },
          },
        ],
      })
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it("flags conflicting review status values", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "AND",
        children: [
          {
            condition: {
              id: "a",
              field: "review_status",
              operator: "eq",
              value: "failed",
              applies_to: "both",
            },
          },
          {
            condition: {
              id: "b",
              field: "review_status",
              operator: "eq",
              value: "successful",
              applies_to: "both",
            },
          },
        ],
      })
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it("flags file-only and folder-only under all-of-these", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "AND",
        children: [
          {
            condition: {
              id: "a",
              field: "name",
              operator: "contains",
              value: ["x"],
              applies_to: "file",
            },
          },
          {
            condition: {
              id: "b",
              field: "name",
              operator: "contains",
              value: ["y"],
              applies_to: "folder",
            },
          },
        ],
      })
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].message).toMatch(/file/i);
  });

  it("flags any-of group when every nested all-of branch contradicts", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "OR",
        children: [
          {
            group: {
              id: "g1",
              op: "AND",
              children: [
                {
                  condition: {
                    id: "a",
                    field: "extension",
                    operator: "in",
                    value: ["mp4"],
                    applies_to: "file",
                  },
                },
                {
                  condition: {
                    id: "b",
                    field: "extension",
                    operator: "in",
                    value: ["pdf"],
                    applies_to: "file",
                  },
                },
              ],
            },
          },
          {
            group: {
              id: "g2",
              op: "AND",
              children: [
                {
                  condition: {
                    id: "c",
                    field: "size",
                    operator: "gt",
                    value: 50,
                    applies_to: "file",
                  },
                },
                {
                  condition: {
                    id: "d",
                    field: "size",
                    operator: "lt",
                    value: 10,
                    applies_to: "file",
                  },
                },
              ],
            },
          },
        ],
      })
    );
    expect(hits.some((h) => /every branch/i.test(h.message))).toBe(true);
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });

  it("does not flag name contains pairs", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "AND",
        children: [
          {
            condition: {
              id: "a",
              field: "name",
              operator: "contains",
              value: ["foo"],
              applies_to: "both",
            },
          },
          {
            condition: {
              id: "b",
              field: "name",
              operator: "contains",
              value: ["bar"],
              applies_to: "both",
            },
          },
        ],
      })
    );
    expect(hits).toEqual([]);
  });

  it("does not flag a required path segment next to a name rule", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "AND",
        children: [
          {
            condition: {
              id: "p",
              field: "path",
              operator: "segments",
              value: ["Archive"],
              applies_to: "both",
            },
          },
          {
            condition: {
              id: "n",
              field: "name",
              operator: "contains",
              value: ["report"],
              applies_to: "file",
            },
          },
        ],
      }),
      "search"
    );
    expect(hits).toEqual([]);
  });

  it("flags path parts under any of these in search", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "OR",
        children: [
          {
            condition: {
              id: "p",
              field: "path",
              operator: "segments",
              value: ["Archive"],
              applies_to: "both",
            },
          },
          {
            condition: {
              id: "n",
              field: "name",
              operator: "contains",
              value: ["report"],
              applies_to: "file",
            },
          },
        ],
      }),
      "search"
    );
    expect(hits.some((h) => h.kind === "path" && /any of these/i.test(h.message))).toBe(
      true
    );
  });

  it("does not flag path parts under any of these in exclude mode", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "OR",
        children: [
          {
            condition: {
              id: "p",
              field: "path",
              operator: "contains",
              value: ["Archive"],
              applies_to: "both",
            },
          },
          {
            condition: {
              id: "n",
              field: "name",
              operator: "contains",
              value: ["report"],
              applies_to: "file",
            },
          },
        ],
      })
    );
    expect(hits).toEqual([]);
  });

  it("flags Don't match when on a path rule in search", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "AND",
        children: [
          {
            condition: {
              id: "p",
              field: "path",
              operator: "segments",
              value: ["Archive"],
              negate: true,
              applies_to: "both",
            },
          },
        ],
      }),
      "search"
    );
    expect(hits.some((h) => h.kind === "path" && /ignored/i.test(h.message))).toBe(true);
  });

  it("does not treat a search path rule as a file-only constraint", () => {
    const hits = findFilterContradictions(
      ruleset({
        op: "AND",
        children: [
          {
            condition: {
              id: "p",
              field: "path",
              operator: "segments",
              value: ["Archive"],
              applies_to: "file",
            },
          },
          {
            condition: {
              id: "n",
              field: "name",
              operator: "contains",
              value: ["y"],
              applies_to: "folder",
            },
          },
        ],
      }),
      "search"
    );
    expect(hits).toEqual([]);
  });
});
