import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Palette, X } from "lucide-react";
import "./Settings.css";
import { useTheme } from "../contexts/ThemeContext";
import { usePreferences } from "../contexts/PreferencesContext";

type SettingsSection = "appearance";

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
        </div>
      </div>
    </section>
  );
}
