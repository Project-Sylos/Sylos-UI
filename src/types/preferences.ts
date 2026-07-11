/** App visual theme: obsidian/quartz (static glass) or neon video backdrops */
export type AppTheme = "obsidian" | "quartz" | "neon-dark" | "neon-light";

export function themeSupportsPreSplash(theme: AppTheme): boolean {
  return theme === "neon-dark" || theme === "neon-light";
}

export interface UserPreferences {
  theme: AppTheme;
  sidebarCollapsed: boolean;
  preSplashEnabled: boolean;
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
  preSplashEnabled: false,
  tips: {
    enabled: true,
    categories: {},
  },
  developer: {
    enabled: false,
    showSpectraService: false,
  },
};
