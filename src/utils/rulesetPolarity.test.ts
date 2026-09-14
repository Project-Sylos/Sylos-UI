import { describe, expect, it } from "vitest";

import { FilterRuleset, RULESET_SCHEMA_VERSION } from "../types/rulesets";
import {
  isEditorKeepOnly,
  materializeRulesetPolarity,
  presentRulesetForEditor,
  prepareRulesetForSave,
} from "./rulesets";

function ruleset(root_group: FilterRuleset["root_group"]): FilterRuleset {
  return {
    ruleset_id: "test",
    name: "test",
    schema_version: RULESET_SCHEMA_VERSION,
    root_group,
  };
}

describe("filter polarity present/materialize", () => {
  it("turns keep-only engine form into Filter in when for the editor", () => {
    const stored = ruleset({
      op: "AND",
      negate: true,
      children: [
        {
          condition: {
            id: "mnt",
            field: "path",
            operator: "contains",
            value: ["mnt"],
            negate: false,
            applies_to: "both",
          },
        },
        {
          condition: {
            id: "media",
            field: "path",
            operator: "contains",
            value: ["media"],
            negate: false,
            applies_to: "both",
          },
        },
      ],
    });
    const editor = presentRulesetForEditor(stored);
    expect(editor.root_group.negate).toBe(false);
    expect(isEditorKeepOnly(editor)).toBe(true);
    expect(editor.root_group.children?.[0].condition?.negate).toBe(true);
    expect(editor.root_group.children?.[1].condition?.negate).toBe(true);

    const engine = prepareRulesetForSave(editor);
    expect(engine.root_group.negate).toBe(true);
    expect(engine.root_group.children?.[0].condition?.negate).toBe(false);
    expect(engine.root_group.children?.[1].condition?.negate).toBe(false);
  });

  it("leaves all Filter out when as exclude polarity", () => {
    const editor = ruleset({
      op: "OR",
      negate: false,
      children: [
        {
          condition: {
            id: "tmp",
            field: "name",
            operator: "glob",
            value: ["*.tmp"],
            negate: false,
            applies_to: "file",
          },
        },
      ],
    });
    const engine = materializeRulesetPolarity(editor);
    expect(engine.root_group.negate).toBe(false);
    expect(engine.root_group.children?.[0].condition?.negate).toBe(false);
  });

  it("is idempotent on already-materialized keep-only rulesets", () => {
    const stored = ruleset({
      op: "AND",
      negate: true,
      children: [
        {
          condition: {
            id: "pdf",
            field: "extension",
            operator: "in",
            value: ["pdf"],
            negate: false,
            applies_to: "file",
          },
        },
      ],
    });
    expect(materializeRulesetPolarity(stored).root_group.negate).toBe(true);
    expect(prepareRulesetForSave(stored).root_group.negate).toBe(true);
  });
});
