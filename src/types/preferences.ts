/** App visual theme: static glass themes only */
export type AppTheme = "obsidian" | "quartz";

/**
 * Seeded ruleset applied to new migrations out of the box. Mirrors
 * apidb.DefaultAutoApplyRulesetID; an empty defaultRulesetId turns auto-apply off.
 */
export const DEFAULT_AUTO_APPLY_RULESET_ID = "default-common-junk";

export interface UserPreferences {
  theme: AppTheme;
  sidebarCollapsed: boolean;
  /** When true, hide cloud services whose OAuth apps are not configured yet. */
  hideUnsetServices?: boolean;
  /** Ruleset id auto-applied to new migrations. Empty means no filters are applied. */
  defaultRulesetId?: string;
  tips?: {
    enabled: boolean;
    categories: {
      [categoryName: string]: boolean;
    };
  };
  developer?: {
    enabled: boolean;
    showSpectraService: boolean;
    /** When true, path review DB reads skip the default 2 minute cancel. */
    disableDbQueryTimeout?: boolean;
  };
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "obsidian",
  sidebarCollapsed: true,
  hideUnsetServices: false,
  defaultRulesetId: DEFAULT_AUTO_APPLY_RULESET_ID,
  tips: {
    enabled: true,
    categories: {},
  },
  developer: {
    enabled: false,
    showSpectraService: false,
    disableDbQueryTimeout: false,
  },
};

/** Accept supported API theme values and reject everything else. */
export function normalizeAppTheme(raw: unknown): AppTheme {
  if (raw === "obsidian" || raw === "quartz") {
    return raw;
  }
  return DEFAULT_PREFERENCES.theme;
}
