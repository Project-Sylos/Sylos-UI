import { useNavigate } from "react-router-dom";
import "./Sidebar.css";
import logo from "../assets/logos/main-app-logo-transparent.png";
import { usePreferences } from "../contexts/PreferencesContext";

export default function Sidebar() {
  const { preferences, updatePreferences } = usePreferences();
  const isCollapsed = preferences.sidebarCollapsed;
  const navigate = useNavigate();

  const handleMigrationsClick = () => {
    navigate("/choose");
  };

  const handleHelpClick = () => {
    // No-op for now - will link to documentation later
  };

  const handleContributeClick = () => {
    window.open("https://github.com/project-sylos", "_blank", "noopener,noreferrer");
  };

  const handleSettingsClick = () => {
    navigate("/settings");
  };

  return (
    <div className={`sidebar ${isCollapsed ? "sidebar--collapsed" : ""}`}>
      <div className="sidebar__header">
        <button
          className="sidebar__toggle"
          onClick={() => updatePreferences({ sidebarCollapsed: !isCollapsed })}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <img src={logo} alt="Sylos" className="sidebar__logo" />
      </div>

      <div className="sidebar__content">
        <div className="sidebar__section sidebar__section--top">
          <button
            className="sidebar__button sidebar__button--primary"
            onClick={handleMigrationsClick}
            aria-label="Migrations"
          >
            <span className="sidebar__button-emoji">📦</span>
            {!isCollapsed && <span className="sidebar__button-text">Migrations</span>}
          </button>
        </div>

        <div className="sidebar__section sidebar__section--main">
          <button
            className="sidebar__button"
            onClick={handleHelpClick}
            aria-label="Help"
          >
            <span className="sidebar__button-emoji">❓</span>
            {!isCollapsed && <span className="sidebar__button-text">Help</span>}
          </button>
          <button
            className="sidebar__button"
            onClick={handleContributeClick}
            aria-label="Want to contribute?"
          >
            <span className="sidebar__button-emoji">🤝</span>
            {!isCollapsed && <span className="sidebar__button-text">Want to contribute?</span>}
          </button>
        </div>

        <div className="sidebar__section sidebar__section--bottom">
          <button
            className="sidebar__button"
            onClick={handleSettingsClick}
            aria-label="Settings"
          >
            <span className="sidebar__button-emoji">⚙️</span>
            {!isCollapsed && <span className="sidebar__button-text">Settings</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
