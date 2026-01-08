import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Palette, X, HelpCircle, Code } from "lucide-react";
import "./Settings.css";
import { useTheme } from "../contexts/ThemeContext";
import { usePreferences } from "../contexts/PreferencesContext";

type SettingsSection = "appearance" | "tips" | "developer";

// Known tip categories - can be expanded as needed
const TIP_CATEGORIES = [
  {
    id: "discovery-rate-source",
    name: "Discovery - Source Rate",
    description: "Tip about the discovery rate metric for the source traversal",
  },
  {
    id: "discovery-rate-destination",
    name: "Discovery - Destination Rate",
    description: "Tip about the discovery rate metric for the destination traversal",
  },
  {
    id: "discovery-destination-total",
    name: "Discovery - Destination Total",
    description: "Tip about the total discovered metric for the destination traversal",
  },
  {
    id: "path-review-pending",
    name: "Path Review - Pending",
    description: "Tip about pending item icons in the path review legend",
  },
  {
    id: "path-review-excluded",
    name: "Path Review - Excluded",
    description: "Tip about excluded item icons in the path review legend",
  },
  {
    id: "path-review-destination-only",
    name: "Path Review - Destination Only",
    description: "Tip about destination-only item icons in the path review legend",
  },
  {
    id: "path-review-failed",
    name: "Path Review - Failed",
    description: "Tip about failed item icons in the path review legend",
  },
  {
    id: "path-review-retry",
    name: "Path Review - Retry",
    description: "Tip about retry item icons in the path review legend",
  },
  {
    id: "path-review-dst-size",
    name: "Path Review - Destination Size",
    description: "Tip about the destination size statistic in the path review footer",
  },
  // Add more categories here as needed
] as const;

export default function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { preferences, updatePreferences } = usePreferences();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");

  const handleClose = () => {
    navigate(-1);
  };

  return (
    <section className="settings">
      <div className="settings__container">
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
              <h3 className="settings__nav-group-title">App Settings</h3>
              <button
                className={`settings__nav-item ${activeSection === "appearance" ? "settings__nav-item--active" : ""}`}
                onClick={() => setActiveSection("appearance")}
              >
                <Palette size={20} />
                <span>Appearance</span>
              </button>
              <button
                className={`settings__nav-item ${activeSection === "tips" ? "settings__nav-item--active" : ""}`}
                onClick={() => setActiveSection("tips")}
              >
                <HelpCircle size={20} />
                <span>Tips</span>
              </button>
            </div>
            <div className="settings__nav-group">
              <h3 className="settings__nav-group-title">Advanced</h3>
              <button
                className={`settings__nav-item ${activeSection === "developer" ? "settings__nav-item--active" : ""}`}
                onClick={() => setActiveSection("developer")}
              >
                <Code size={20} />
                <span>Developer</span>
              </button>
            </div>
          </nav>
        </aside>

        <div className="settings__content">
          {activeSection === "appearance" && (
            <div className="settings__section">
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
                    className={`settings__theme-option ${theme === "dark" ? "settings__theme-option--active" : ""}`}
                    onClick={() => setTheme("dark")}
                    aria-label="Dark theme"
                  >
                    <div className="settings__theme-preview settings__theme-preview--dark">
                      <div className="settings__theme-preview-header"></div>
                      <div className="settings__theme-preview-content">
                        <div className="settings__theme-preview-line"></div>
                        <div className="settings__theme-preview-line"></div>
                        <div className="settings__theme-preview-line"></div>
                      </div>
                    </div>
                    <span className="settings__theme-label">Dark</span>
                    {theme === "dark" && (
                      <div className="settings__theme-check">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </div>
                    )}
                  </button>

                  <button
                    className={`settings__theme-option ${theme === "light" ? "settings__theme-option--active" : ""}`}
                    onClick={() => setTheme("light")}
                    aria-label="Light theme"
                  >
                    <div className="settings__theme-preview settings__theme-preview--light">
                      <div className="settings__theme-preview-header"></div>
                      <div className="settings__theme-preview-content">
                        <div className="settings__theme-preview-line"></div>
                        <div className="settings__theme-preview-line"></div>
                        <div className="settings__theme-preview-line"></div>
                      </div>
                    </div>
                    <span className="settings__theme-label">Light</span>
                    {theme === "light" && (
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
                    <h2 className="settings__subsection-title">Pre-splash Screen</h2>
                    <p className="settings__subsection-description">
                      Show an animated loading screen when the app starts
                    </p>
                  </div>
                  <label className="settings__toggle">
                    <input
                      type="checkbox"
                      checked={preferences.preSplashEnabled}
                      onChange={(e) => updatePreferences({ preSplashEnabled: e.target.checked })}
                      className="settings__toggle-input"
                    />
                    <span className="settings__toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === "tips" && (
            <div className="settings__section">
              <h1 className="settings__section-title">Tips</h1>
              
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
                        
                        // When enabling/disabling tips, update all categories
                        const updatedCategories: { [key: string]: boolean } = {};
                        TIP_CATEGORIES.forEach((category) => {
                          updatedCategories[category.id] = e.target.checked;
                        });
                        
                        // Merge with existing categories to preserve any that aren't in TIP_CATEGORIES
                        const allCategories = { ...currentCategories, ...updatedCategories };
                        
                        updatePreferences({
                          tips: {
                            ...currentTips,
                            enabled: e.target.checked,
                            categories: allCategories,
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
                      Control which categories of tips are shown. Dismissing a tip in the UI will also disable its category here.
                    </p>
                  </div>
                </div>
                
                <div className="settings__tip-categories">
                  {TIP_CATEGORIES.map((category) => {
                    const categoryEnabled = preferences.tips?.categories?.[category.id] !== false;
                    return (
                      <div key={category.id} className="settings__tip-category">
                        <div className="settings__tip-category-info">
                          <h3 className="settings__tip-category-name">{category.name}</h3>
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
              </div>
            </div>
          )}

          {activeSection === "developer" && (
            <div className="settings__section">
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
                      checked={preferences.developer?.enabled === true}
                      onChange={(e) => {
                        const currentDeveloper = preferences.developer || { enabled: false, showSpectraService: false };
                        updatePreferences({
                          developer: {
                            ...currentDeveloper,
                            enabled: e.target.checked,
                            // When disabling developer mode, also disable all sub-options
                            showSpectraService: e.target.checked ? currentDeveloper.showSpectraService : false,
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
                    <h2 className="settings__subsection-title">Show Spectra Test Service</h2>
                    <p className="settings__subsection-description">
                      Show the Spectra simulator service in the service selection pages
                    </p>
                  </div>
                  <label className="settings__toggle">
                    <input
                      type="checkbox"
                      checked={preferences.developer?.showSpectraService === true}
                      disabled={preferences.developer?.enabled !== true}
                      onChange={(e) => {
                        const currentDeveloper = preferences.developer || { enabled: false, showSpectraService: false };
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
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
