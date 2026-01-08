export interface UserPreferences {
  theme: "dark" | "light";
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
  theme: "dark",
  sidebarCollapsed: true,
  preSplashEnabled: true,
  tips: {
    enabled: true,
    categories: {},
  },
  developer: {
    enabled: false,
    showSpectraService: false,
  },
};
