export interface UserPreferences {
  theme: "dark" | "light";
  sidebarCollapsed: boolean;
  preSplashEnabled: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  sidebarCollapsed: true,
  preSplashEnabled: true,
};
