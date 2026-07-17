/** App visual theme: static glass themes only */
export type AppTheme = "obsidian" | "quartz";

export interface UserPreferences {
  theme: AppTheme;
  sidebarCollapsed: boolean;
  /** When true, hide cloud services whose OAuth apps are not configured yet. */
  hideUnsetServices?: boolean;
  tips?: {
    enabled: boolean;
    categories: {
      [categoryName: string]: boolean;
    };
  };
  developer?: {
    enabled: boolean;
    showSpectraService: boolean;
  };
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "obsidian",
  sidebarCollapsed: true,
  hideUnsetServices: false,
  tips: {
    enabled: true,
    categories: {},
  },
  developer: {
    enabled: false,
    showSpectraService: false,
  },
};

/** Accept supported API theme values and reject everything else. */
export function normalizeAppTheme(raw: unknown): AppTheme {
  if (raw === "obsidian" || raw === "quartz") {
    return raw;
  }
  return DEFAULT_PREFERENCES.theme;
}
