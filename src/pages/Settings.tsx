import { useCallback, useEffect, useRef, useState, startTransition, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router";
import { Palette, X, Code, Cloud, Users, AlertTriangle, ChevronDown, Filter } from "lucide-react";
import "./Settings.css";
import { PageShell } from "../components/PageShell";
import { useTheme } from "../contexts/ThemeContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useAuth } from "../contexts/AuthContext";
import CloudProviderOAuthSetup from "../components/CloudProviderOAuthSetup";
import SettingsSftpHostsSection from "../components/SettingsSftpHostsSection";
import SettingsThroughputSection from "../components/SettingsThroughputSection";
import "../components/CloudProviderOAuthSetup.css";
import "../components/SettingsThroughputSection.css";
import { clearAllMigrations, wipeInstall } from "../api/admin";
import {
  fetchOAuthHealthSettings,
  fetchOAuthHealthSummary,
  OAUTH_HEALTH_SCAN_OPTIONS,
  saveOAuthHealthSettings,
} from "../api/oauthApps";
import { clearAuthToken } from "../api/client";
import { useRecoveryCode } from "../contexts/RecoveryCodeContext";
import DestructiveConfirmDialog from "../components/CleanSlateDialog";
import SettingsUsersSection from "../components/SettingsUsersSection";
import "../components/SettingsUsersSection.css";
import "../components/CleanSlateDialog.css";
import { ALL_TIP_CATEGORY_IDS, TIP_GROUPS, type TipGroup } from "./settingsTips";
import { listPrepackagedRulesets, listRulesets } from "../api/services";
import type { RulesetSummary } from "../types/rulesets";

type SettingsSection =
  | "appearance"
  | "filters"
  | "developer"
  | "users"
  | "cloud"
  | "danger";

const SECTION_IDS: Record<SettingsSection, string> = {
  appearance: "settings-appearance",
  filters: "settings-filters",
  users: "settings-users",
  cloud: "settings-cloud",
  danger: "settings-danger",
  developer: "settings-developer",
};

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);
  const { user, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const { preferences, updatePreferences } = usePreferences();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [expandedTipGroups, setExpandedTipGroups] = useState<Record<string, boolean>>({});
  const [dangerDialog, setDangerDialog] = useState<"clear-migrations" | "wipe-install" | null>(null);
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerMessage, setDangerMessage] = useState<string | null>(null);
  const [oauthHealthIssues, setOauthHealthIssues] = useState(false);
  const [oauthScanMinutes, setOauthScanMinutes] = useState(0);
  const [oauthScanSaving, setOauthScanSaving] = useState(false);
  const [oauthScanError, setOauthScanError] = useState<string | null>(null);
  const [rulesetOptions, setRulesetOptions] = useState<RulesetSummary[]>([]);
  const [rulesetsLoading, setRulesetsLoading] = useState(false);
  const { needsAttention: recoveryNeedsAttention } = useRecoveryCode();

  const cloudProviders = [
    { providerId: "google_drive", displayName: "Google Drive" },
    { providerId: "dropbox", displayName: "Dropbox" },
    { providerId: "onedrive", displayName: "OneDrive" },
    { providerId: "sharepoint", displayName: "SharePoint" },
    { providerId: "box", displayName: "Box" },
  ] as const;

  const handleClose = () => {
    navigate(-1);
  };

  const scrollToSection = useCallback((section: SettingsSection) => {
    setActiveSection(section);
    document
      .getElementById(SECTION_IDS[section])
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const toggleTipGroup = (groupId: string) => {
    setExpandedTipGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleClearMigrations = async () => {
    setDangerBusy(true);
    setDangerMessage(null);
    try {
      const result = await clearAllMigrations();
      setDangerMessage(result.message);
      setDangerDialog(null);
    } catch (err) {
      setDangerMessage(err instanceof Error ? err.message : "Failed to remove migration data.");
    } finally {
      setDangerBusy(false);
    }
  };

  const handleWipeInstall = async () => {
    setDangerBusy(true);
    setDangerMessage(null);
    try {
      const result = await wipeInstall();
      setDangerMessage(result.message);
      setDangerDialog(null);
      clearAuthToken();
      await refresh();
    } catch (err) {
      setDangerMessage(err instanceof Error ? err.message : "Failed to wipe install data.");
    } finally {
      setDangerBusy(false);
    }
  };

  const canCleanSlate = user?.capabilities?.cleanSlate === true;
  const isAdmin = user?.role === "admin";
  const developerEnabled = preferences.developer?.enabled === true;

  useEffect(() => {
    if (location.pathname.endsWith("/users")) {
      navigate("/settings", { replace: true });
      requestAnimationFrame(() => scrollToSection("users"));
      return;
    }

    const hashSection = location.hash.replace("#", "") as SettingsSection;
    if (hashSection && SECTION_IDS[hashSection]) {
      requestAnimationFrame(() => scrollToSection(hashSection));
    }
  }, [location.pathname, location.hash, navigate, scrollToSection]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetchOAuthHealthSummary()
      .then((summary) => {
        if (!cancelled) setOauthHealthIssues(summary.hasIssues);
      })
      .catch(() => {
        if (!cancelled) setOauthHealthIssues(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void fetchOAuthHealthSettings()
      .then((settings) => {
        if (!cancelled) setOauthScanMinutes(settings.scanIntervalMinutes);
      })
      .catch((err) => {
        if (!cancelled) {
          setOauthScanError(
            err instanceof Error ? err.message : "Failed to load OAuth health settings"
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    setRulesetsLoading(true);
    void Promise.all([listRulesets(), listPrepackagedRulesets()])
      .then(([library, prepackaged]) => {
        if (cancelled) return;
        const byId = new Map<string, RulesetSummary>();
        for (const item of [...prepackaged, ...library]) {
          byId.set(item.id, item);
        }
        setRulesetOptions(Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {
        if (!cancelled) setRulesetOptions([]);
      })
      .finally(() => {
        if (!cancelled) setRulesetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const visibleSections: SettingsSection[] = ["appearance", "filters"];
    if (user) visibleSections.push("users", "cloud");
    if (canCleanSlate) visibleSections.push("danger");
    visibleSections.push("developer");

    const sections = visibleSections
      .map((section) => {
        const el = document.getElementById(SECTION_IDS[section]);
        return el ? { section, el } : null;
      })
      .filter((s): s is { section: SettingsSection; el: HTMLElement } => s !== null);

    const syncActive = () => {
      // At/near the top (including overscroll bounce), always pin Appearance.
      if (root.scrollTop <= 8) {
        startTransition(() => {
          setActiveSection((current) =>
            current === visibleSections[0] ? current : visibleSections[0]
          );
        });
        return;
      }

      // Reading line ~20% down the pane: last section whose top is above it.
      const marker = root.getBoundingClientRect().top + root.clientHeight * 0.2;
      let next = sections[0]?.section ?? "appearance";
      for (const { section, el } of sections) {
        if (el.getBoundingClientRect().top <= marker) {
          next = section;
        }
      }
      startTransition(() => {
        setActiveSection((current) => (current === next ? current : next));
      });
    };

    root.addEventListener("scroll", syncActive, { passive: true });
    syncActive();
    return () => root.removeEventListener("scroll", syncActive);
  }, [user, canCleanSlate]);

  const handleOAuthScanChange = async (minutes: number) => {
    setOauthScanMinutes(minutes);
    setOauthScanSaving(true);
    setOauthScanError(null);
    try {
      await saveOAuthHealthSettings({ scanIntervalMinutes: minutes });
    } catch (err) {
      setOauthScanError(
        err instanceof Error ? err.message : "Failed to save OAuth health settings"
      );
    } finally {
      setOauthScanSaving(false);
    }
  };

  const renderTipGroup = (group: TipGroup) => {
    const expanded = expandedTipGroups[group.id] === true;
    const enabledCount = group.categories.filter(
      (category) => preferences.tips?.categories?.[category.id] !== false
    ).length;

    return (
      <div key={group.id} className="settings__tip-group">
        <button
          type="button"
          className="settings__tip-group-header"
          onClick={() => toggleTipGroup(group.id)}
          aria-expanded={expanded}
        >
          <span className="settings__tip-group-header-main">
            <ChevronDown
              size={18}
              className={`settings__tip-group-chevron ${expanded ? "settings__tip-group-chevron--expanded" : ""}`}
              aria-hidden
            />
            <span>
              <span className="settings__tip-group-name">{group.name}</span>
              <span className="settings__tip-group-meta">
                {enabledCount} of {group.categories.length} enabled
              </span>
            </span>
          </span>
          <span className="settings__tip-group-description">{group.description}</span>
        </button>

        {expanded && (
          <div className="settings__tip-categories settings__tip-categories--nested">
            {group.categories.map((category) => {
              const categoryEnabled = preferences.tips?.categories?.[category.id] !== false;
              return (
                <div key={category.id} className="settings__tip-category">
                  <div className="settings__tip-category-info">
                    <h3 className="settings__tip-category-name">{category.name}</h3>
                    <p className="settings__tip-category-description">{category.description}</p>
                  </div>
                  <label className="settings__toggle">
                    <input
                      type="checkbox"
                      checked={categoryEnabled}
                      onChange={(e) => {
                        const currentTips = preferences.tips || { enabled: true, categories: {} };
                        const currentCategories = currentTips.categories || {};
                        updatePreferences({
                          tips: {
                            ...currentTips,
                            categories: {
                              ...currentCategories,
                              [category.id]: e.target.checked,
                            },
                          },
                        });
                      }}
                      className="settings__toggle-input"
                    />
                    <span className="settings__toggle-slider"></span>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const navButton = (section: SettingsSection, icon: ReactNode, label: string, badge?: ReactNode) => (
    <button
      type="button"
      className={`settings__nav-item ${activeSection === section ? "settings__nav-item--active" : ""}`}
      onClick={() => scrollToSection(section)}
    >
      {icon}
      <span>{label}</span>
      {badge}
    </button>
  );

  return (
    <section className="settings">
      <PageShell className="settings__container">
        <button
          className="settings__close"
          onClick={handleClose}
          aria-label="Close settings"
        >
          <X size={20} />
        </button>
        <aside className="settings__sidebar">
          <div className="settings__sidebar-header">
            <h2 className="settings__sidebar-title">Settings</h2>
          </div>
          <nav className="settings__nav">
            <div className="settings__nav-group">
              {navButton("appearance", <Palette size={20} />, "Appearance")}
              {navButton("filters", <Filter size={20} />, "Filter rules")}
              {user &&
                navButton(
                  "users",
                  <Users size={20} />,
                  "Users",
                  recoveryNeedsAttention ? (
                    <span
                      className="settings__nav-badge"
                      aria-label="Recovery code needs attention"
                      title="Generate and store your recovery code"
                    />
                  ) : undefined
                )}
              {user &&
                navButton(
                  "cloud",
                  <Cloud size={20} />,
                  "Cloud providers",
                  oauthHealthIssues ? (
                    <span
                      className="settings__nav-badge"
                      aria-label="OAuth connection issues"
                      title="One or more cloud OAuth connections need attention"
                    />
                  ) : undefined
                )}
              {canCleanSlate &&
                navButton("danger", <AlertTriangle size={20} />, "Danger zone")}
            </div>
            <div className="settings__nav-group settings__nav-group--divider">
              {navButton("developer", <Code size={20} />, "Developer")}
            </div>
          </nav>
        </aside>

        <div className="settings__content" ref={contentRef}>
          <div className="settings__section settings__page-section" id={SECTION_IDS.appearance}>
            <h1 className="settings__section-title">Appearance</h1>

            <div className="settings__subsection">
              <div className="settings__subsection-header">
                <div>
                  <h2 className="settings__subsection-title">Theme</h2>
                  <p className="settings__subsection-description">
                    Choose your preferred color theme
                  </p>
                </div>
              </div>

              <div className="settings__theme-options">
                <button
                  type="button"
                  className={`settings__theme-option ${theme === "obsidian" ? "settings__theme-option--active" : ""}`}
                  onClick={() => setTheme("obsidian")}
                  aria-label="Obsidian theme"
                >
                  <div
                    className="settings__theme-preview settings__theme-preview--obsidian"
                    aria-hidden
                  />
                  <span className="settings__theme-label">Obsidian</span>
                  {theme === "obsidian" && (
                    <div className="settings__theme-check">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  className={`settings__theme-option ${theme === "quartz" ? "settings__theme-option--active" : ""}`}
                  onClick={() => setTheme("quartz")}
                  aria-label="Quartz theme"
                >
                  <div
                    className="settings__theme-preview settings__theme-preview--quartz"
                    aria-hidden
                  />
                  <span className="settings__theme-label">Quartz</span>
                  {theme === "quartz" && (
                    <div className="settings__theme-check">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                  )}
                </button>
              </div>
            </div>

            <div className="settings__subsection">
              <div className="settings__subsection-header">
                <div>
                  <h2 className="settings__subsection-title">Enable Tips</h2>
                  <p className="settings__subsection-description">
                    Show contextual help tooltips throughout the application
                  </p>
                </div>
                <label className="settings__toggle">
                  <input
                    type="checkbox"
                    checked={preferences.tips?.enabled !== false}
                    onChange={(e) => {
                      const currentTips = preferences.tips || { enabled: true, categories: {} };
                      const currentCategories = currentTips.categories || {};

                      const updatedCategories: { [key: string]: boolean } = {};
                      ALL_TIP_CATEGORY_IDS.forEach((categoryId) => {
                        updatedCategories[categoryId] = e.target.checked;
                      });

                      updatePreferences({
                        tips: {
                          ...currentTips,
                          enabled: e.target.checked,
                          categories: { ...currentCategories, ...updatedCategories },
                        },
                      });
                    }}
                    className="settings__toggle-input"
                  />
                  <span className="settings__toggle-slider"></span>
                </label>
              </div>
            </div>

            <div className="settings__subsection">
              <div className="settings__subsection-header">
                <div>
                  <h2 className="settings__subsection-title">Tip Categories</h2>
                  <p className="settings__subsection-description">
                    Control which categories of tips are shown. Dismissing a tip will also disable its category here.
                  </p>
                </div>
              </div>

              <div className="settings__tip-groups">
                {TIP_GROUPS.map((group) => renderTipGroup(group))}
              </div>
            </div>
          </div>

          <div className="settings__section settings__page-section" id={SECTION_IDS.filters}>
            <h1 className="settings__section-title">Filter rules</h1>
            <p className="settings__subsection-description">
              Saved rulesets live in the Sylos library (API database). Each migration gets its own
              copy, so editing a migration's rules never changes the saved original.
            </p>

            <div className="settings__subsection">
              <div className="settings__subsection-header">
                <div>
                  <h2 className="settings__subsection-title">Applied to new migrations</h2>
                  <p className="settings__subsection-description">
                    Optional starter ruleset copied onto new migrations. Edit and
                    apply filters during path review after discovery, pick a
                    different library ruleset here, or choose None.
                  </p>
                </div>
              </div>
              <label>
                Applied ruleset
                <select
                  value={preferences.defaultRulesetId || ""}
                  disabled={rulesetsLoading}
                  onChange={(e) => {
                    void updatePreferences({ defaultRulesetId: e.target.value });
                  }}
                >
                  <option value="">None (migrate everything you select)</option>
                  {rulesetOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.createdBy === "prepackaged" ? " (prepackaged)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {user && (
            <SettingsUsersSection
              sectionId={SECTION_IDS.users}
              currentUser={user}
              isAdmin={user.role === "admin"}
            />
          )}

          {user && (
            <div className="settings__section settings__page-section" id={SECTION_IDS.cloud}>
              <h1 className="settings__section-title">Cloud providers</h1>
              <p className="settings__subsection-description">
                {isAdmin
                  ? "Configure OAuth app credentials for cloud storage and manage remembered SFTP hosts. Sylos checks OAuth connection health on startup and can re-check on a schedule you choose."
                  : "View cloud OAuth connection status and remembered SFTP hosts. You can run an OAuth connection test; only admins can add or change OAuth credentials."}
              </p>

              <div className="settings__subsection">
                <div className="settings__subsection-header">
                  <div>
                    <h2 className="settings__subsection-title">Hide unset services</h2>
                    <p className="settings__subsection-description">
                      Hide cloud services from source/destination pickers until their OAuth app
                      credentials are configured. Local and credential-based services stay visible.
                    </p>
                  </div>
                  <label className="settings__toggle">
                    <input
                      type="checkbox"
                      checked={preferences.hideUnsetServices === true}
                      onChange={(e) => {
                        updatePreferences({ hideUnsetServices: e.target.checked });
                      }}
                      className="settings__toggle-input"
                    />
                    <span className="settings__toggle-slider"></span>
                  </label>
                </div>
              </div>

              {isAdmin && (
                <div className="settings__subsection settings__cloud-health-scan">
                  <div className="settings__subsection-header">
                    <div>
                      <h2 className="settings__subsection-title">Automatic health checks</h2>
                      <p className="settings__subsection-description">
                        Periodically test stored OAuth app credentials in the background. Providers
                        in use by a live migration are skipped until that migration finishes.
                      </p>
                    </div>
                  </div>
                  <label>
                    Scan interval
                    <select
                      value={oauthScanMinutes}
                      disabled={oauthScanSaving}
                      onChange={(e) => void handleOAuthScanChange(Number(e.target.value))}
                    >
                      {OAUTH_HEALTH_SCAN_OPTIONS.map((option) => (
                        <option key={option.minutes} value={option.minutes}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {oauthScanError && (
                    <p className="settings__message settings__message--error">{oauthScanError}</p>
                  )}
                </div>
              )}

              <div className="settings__cloud-oauth-list">
                {cloudProviders.map((provider) => (
                  <CloudProviderOAuthSetup
                    key={provider.providerId}
                    providerId={provider.providerId}
                    displayName={provider.displayName}
                    variant="compact"
                    canEdit={isAdmin}
                  />
                ))}
              </div>

              <SettingsSftpHostsSection canManage={Boolean(user)} />
              <SettingsThroughputSection canManage={Boolean(user)} />
            </div>
          )}

          {canCleanSlate && (
            <div className="settings__section settings__page-section" id={SECTION_IDS.danger}>
              <h1 className="settings__section-title">Danger zone</h1>
              {dangerMessage && (
                <p className="settings__subsection-description">{dangerMessage}</p>
              )}

              <div className="settings__subsection">
                <h2 className="settings__subsection-title">Clear migration data</h2>
                <p className="settings__subsection-description">
                  Remove every migration folder, migration database, and registry entry. User
                  accounts and cloud provider app settings are kept. Running migrations are stopped
                  first.
                </p>
                <button
                  type="button"
                  className="settings__danger-button"
                  onClick={() => setDangerDialog("clear-migrations")}
                  disabled={dangerBusy}
                >
                  Clear all migration data
                </button>
              </div>

              <div className="settings__subsection">
                <h2 className="settings__subsection-title">Wipe install</h2>
                <p className="settings__subsection-description">
                  Remove all migration data plus every user account, cloud provider OAuth app, and
                  saved install settings. You will need to complete initial setup again. The install
                  encryption key is preserved so the database file can be reused.
                </p>
                <button
                  type="button"
                  className="settings__danger-button settings__danger-button--severe"
                  onClick={() => setDangerDialog("wipe-install")}
                  disabled={dangerBusy}
                >
                  Wipe all user data
                </button>
              </div>
            </div>
          )}

          <div className="settings__section settings__page-section" id={SECTION_IDS.developer}>
            <h1 className="settings__section-title">Developer</h1>

            <div className="settings__subsection">
              <div className="settings__subsection-header">
                <div>
                  <h2 className="settings__subsection-title">Enable Developer Mode</h2>
                  <p className="settings__subsection-description">
                    Enable developer features and experimental options
                  </p>
                </div>
                <label className="settings__toggle">
                  <input
                    type="checkbox"
                    checked={developerEnabled}
                    onChange={(e) => {
                      const currentDeveloper = preferences.developer || { enabled: false, showSpectraService: false, disableDbQueryTimeout: false };
                      updatePreferences({
                        developer: {
                          ...currentDeveloper,
                          enabled: e.target.checked,
                          showSpectraService: e.target.checked ? currentDeveloper.showSpectraService : false,
                          disableDbQueryTimeout: e.target.checked ? currentDeveloper.disableDbQueryTimeout : false,
                        },
                      });
                    }}
                    className="settings__toggle-input"
                  />
                  <span className="settings__toggle-slider"></span>
                </label>
              </div>
            </div>

            <div
              className={`settings__subsection${developerEnabled ? "" : " settings__subsection--disabled"}`}
            >
              <div className="settings__subsection-header">
                <div>
                  <h2 className="settings__subsection-title">Show Spectra Test Service</h2>
                  <p className="settings__subsection-description">
                    Show the Spectra simulator service in the service selection pages
                  </p>
                </div>
                <label className="settings__toggle">
                  <input
                    type="checkbox"
                    checked={developerEnabled && preferences.developer?.showSpectraService === true}
                    disabled={!developerEnabled}
                    onChange={(e) => {
                      const currentDeveloper = preferences.developer || { enabled: false, showSpectraService: false, disableDbQueryTimeout: false };
                      updatePreferences({
                        developer: {
                          ...currentDeveloper,
                          showSpectraService: e.target.checked,
                        },
                      });
                    }}
                    className="settings__toggle-input"
                  />
                  <span className="settings__toggle-slider"></span>
                </label>
              </div>
            </div>

            <div
              className={`settings__subsection${developerEnabled ? "" : " settings__subsection--disabled"}`}
            >
              <div className="settings__subsection-header">
                <div>
                  <h2 className="settings__subsection-title">Disable DB query timeout</h2>
                  <p className="settings__subsection-description">
                    Path review search and diffs cancel after 2 minutes by default. Enable this to let long queries run without that deadline.
                  </p>
                </div>
                <label className="settings__toggle">
                  <input
                    type="checkbox"
                    checked={developerEnabled && preferences.developer?.disableDbQueryTimeout === true}
                    disabled={!developerEnabled}
                    onChange={(e) => {
                      const currentDeveloper = preferences.developer || { enabled: false, showSpectraService: false, disableDbQueryTimeout: false };
                      updatePreferences({
                        developer: {
                          ...currentDeveloper,
                          disableDbQueryTimeout: e.target.checked,
                        },
                      });
                    }}
                    className="settings__toggle-input"
                  />
                  <span className="settings__toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </PageShell>

      {dangerDialog === "clear-migrations" && (
        <DestructiveConfirmDialog
          title="Clear all migration data?"
          body="This permanently deletes every migration folder, migration database file, and migration registry entry on this Sylos install. User accounts, cloud provider app settings, and your login are kept. Running migrations are stopped first. This cannot be undone."
          confirmLabel="Clear all migration data"
          busy={dangerBusy}
          onCancel={() => setDangerDialog(null)}
          onConfirm={() => void handleClearMigrations()}
        />
      )}

      {dangerDialog === "wipe-install" && (
        <DestructiveConfirmDialog
          title="Wipe all user data?"
          body="This permanently deletes all migration data, every user account, cloud provider OAuth apps, and saved install settings. You will be signed out and must complete initial setup again. The install encryption key is preserved. This cannot be undone."
          confirmLabel="Wipe all user data"
          busy={dangerBusy}
          onCancel={() => setDangerDialog(null)}
          onConfirm={() => void handleWipeInstall()}
        />
      )}
    </section>
  );
}
