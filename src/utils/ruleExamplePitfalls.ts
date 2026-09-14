import { FilterRuleset, RULESET_SCHEMA_VERSION } from "../types/rulesets";

/**
 * Teaching rulesets for the examples gallery. These are not library starters:
 * each one looks plausible and then does something people do not usually want.
 * Wording matches Advanced filters (Match when / Don't match when).
 */
export type RuleExamplePitfall = {
  id: string;
  name: string;
  description: string;
  /** What someone usually meant to build. */
  intent: string;
  /** Why the ruleset does something else. */
  lesson: string;
  ruleset: FilterRuleset;
};

function pitfall(
  id: string,
  name: string,
  description: string,
  intent: string,
  lesson: string,
  root_group: FilterRuleset["root_group"]
): RuleExamplePitfall {
  return {
    id,
    name,
    description,
    intent,
    lesson,
    ruleset: {
      ruleset_id: id,
      name,
      description,
      schema_version: RULESET_SCHEMA_VERSION,
      root_group,
    },
  };
}

export function ruleExamplePitfalls(): RuleExamplePitfall[] {
  return [
    pitfall(
      "pitfall-impossible-and",
      "Video and document under all of these",
      "Two extension lists that cannot both be true. The editor flags this as impossible.",
      "Match files that are somehow both video and document types.",
      "Under all of these, a file cannot have both a video extension and a document extension at once. The contradiction warning appears above the hint. Switch the group to any of these, or drop one of the lists.",
      {
        op: "AND",
        negate: false,
        children: [
          {
            condition: {
              id: "video",
              field: "extension",
              operator: "in",
              value: ["mp4", "mov", "avi", "mkv", "webm", "wmv", "m4v"],
              applies_to: "file",
            },
          },
          {
            condition: {
              id: "docs",
              field: "extension",
              operator: "in",
              value: ["doc", "docx", "odt", "rtf", "txt", "md", "pages"],
              applies_to: "file",
            },
          },
        ],
      }
    ),
    pitfall(
      "pitfall-canceling-pair",
      "Match X or Don't match X",
      "Two opposite checks on the same name cancel out and match everything.",
      "Match items under Reports, leave everything else alone.",
      "Match when name contains Reports is true for those names. Don't match when name contains Reports is true for every other name. With any of these, one of the two always matches, so every sample item is matched. Drop the Don't match when rule, or make every rule Don't match when if you meant keep-only / invert the set.",
      {
        op: "OR",
        negate: false,
        children: [
          {
            condition: {
              id: "out-reports",
              field: "name",
              operator: "contains",
              value: ["Reports"],
              negate: false,
              applies_to: "both",
            },
          },
          {
            condition: {
              id: "in-reports",
              field: "name",
              operator: "contains",
              value: ["Reports"],
              negate: true,
              applies_to: "both",
            },
          },
        ],
      }
    ),
    pitfall(
      "pitfall-broad-path-swallows-file",
      "Broad path match also hits nested files",
      "Matching Archive also matches Archive/readme.txt, even if that file was the reason you opened the folder.",
      "Match junk under Archive, but leave /Archive/readme.txt alone.",
      "In path Archive also matches items nested under that folder, including readme.txt. Path parts cannot carve an exception for one nested file. Target junk by name or extension instead.",
      {
        op: "AND",
        negate: false,
        children: [
          {
            condition: {
              id: "path-archive",
              field: "path",
              operator: "segments",
              value: ["Archive"],
              negate: false,
              applies_to: "both",
            },
          },
        ],
      }
    ),
    pitfall(
      "pitfall-path-or-not-optional",
      "Path parts under any of these are still required",
      "A path segment next to another rule under any of these looks optional. Search still requires those path parts.",
      "Match items under Archive, or any file whose name contains report.",
      "Path parts are pulled out and required in order, even under any of these. This set matches items under Archive whose name contains report, not Archive items or report-named files. Use all of these when the path part is required, and use name or extension for the or.",
      {
        op: "OR",
        negate: false,
        children: [
          {
            condition: {
              id: "path-archive",
              field: "path",
              operator: "segments",
              value: ["Archive"],
              negate: false,
              applies_to: "both",
            },
          },
          {
            condition: {
              id: "name-report",
              field: "name",
              operator: "contains",
              value: ["report"],
              negate: false,
              applies_to: "file",
            },
          },
        ],
      }
    ),
    pitfall(
      "pitfall-path-dont-match-ignored",
      "Don't match when does not apply to path parts",
      "Path search has no exclude polarity. Don't match when on a path rule is dropped.",
      "Hide everything under Archive.",
      "Don't match when is ignored for path parts. This rule does not hide Archive. Path parts only add required folders; they cannot leave a folder out.",
      {
        op: "AND",
        negate: false,
        children: [
          {
            condition: {
              id: "hide-archive",
              field: "path",
              operator: "segments",
              value: ["Archive"],
              negate: true,
              applies_to: "both",
            },
          },
        ],
      }
    ),
  ];
}
