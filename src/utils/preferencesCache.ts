import {
  DEFAULT_PREFERENCES,
  normalizeAppTheme,
  type AppTheme,
  type UserPreferences,
} from "../types/preferences";

const CACHE_KEY = "sylos.preferences.cache";

type PreferencesCache = {
  userId: string;
  prefs: UserPreferences;
};

function parseCache(raw: string | null): PreferencesCache | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<PreferencesCache>;
    if (!data || typeof data.userId !== "string" || !data.prefs || typeof data.prefs !== "object") {
      return null;
    }
    return {
      userId: data.userId,
      prefs: {
        ...DEFAULT_PREFERENCES,
        ...data.prefs,
        theme: normalizeAppTheme(data.prefs.theme),
        tips: {
          ...DEFAULT_PREFERENCES.tips!,
          ...(data.prefs.tips || {}),
          categories: {
            ...(DEFAULT_PREFERENCES.tips?.categories || {}),
            ...(data.prefs.tips?.categories || {}),
          },
        },
        developer: {
          ...DEFAULT_PREFERENCES.developer!,
          ...(data.prefs.developer || {}),
        },
      },
    };
  } catch {
    return null;
  }
}

/** Last-known prefs for a user (or any user when userId is omitted). */
export function readPreferencesCache(userId?: string | null): UserPreferences | null {
  if (typeof localStorage === "undefined") return null;
  const cached = parseCache(localStorage.getItem(CACHE_KEY));
  if (!cached) return null;
  if (userId && cached.userId !== userId) return null;
  return cached.prefs;
}

export function writePreferencesCache(userId: string, prefs: UserPreferences): void {
  if (typeof localStorage === "undefined" || !userId) return;
  try {
    const payload: PreferencesCache = {
      userId,
      prefs: {
        ...prefs,
        theme: normalizeAppTheme(prefs.theme),
      },
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode: ignore.
  }
}

export function clearPreferencesCache(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

export function readCachedTheme(): AppTheme | null {
  const prefs = readPreferencesCache();
  return prefs ? normalizeAppTheme(prefs.theme) : null;
}

/** Apply cached theme before React mounts to avoid a flash of defaults. */
export function applyCachedThemeToDocument(): void {
  if (typeof document === "undefined") return;
  const theme = readCachedTheme();
  if (theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }
}
