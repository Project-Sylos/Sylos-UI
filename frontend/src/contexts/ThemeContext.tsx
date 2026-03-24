import { createContext, useContext, useEffect, ReactNode } from "react";
import { usePreferences } from "./PreferencesContext";
import type { AppTheme } from "../types/preferences";

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { preferences, updatePreferences } = usePreferences();
  const theme = preferences.theme;

  // Set theme attribute on document when theme changes
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  const setTheme = (newTheme: AppTheme) => {
    /* Neon: cinematic pre-splash on. Obsidian / Quartz: off (static glass themes). */
    const preSplashEnabled =
      newTheme === "neon-dark" || newTheme === "neon-light";
    updatePreferences({ theme: newTheme, preSplashEnabled });
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
