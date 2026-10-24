import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import "./Sidebar.css";
import SylosLogo from "./SylosLogo";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useSelection } from "../context/SelectionContext";
import { fetchOAuthHealthSummary } from "../api/oauthApps";
import {
  getMigrationQueueMetrics,
  getMigrationStatus,
  listMigrations,
} from "../api/services";
import type {
  ListMigrationsResponse,
  MigrationQueueMetricsResponse,
  MigrationStatusResponse,
  QueueMetrics,
  RootInfo,
} from "../types/migrations";
import { getMigrationPhase, isMigrationLive } from "../types/migrations";
import { formatEtaSeconds } from "../utils/formatBytes";
import {
  getPathReviewStepperState,
  type PathReviewLifecycleStep,
} from "../utils/pathReviewPhase";
import { useRecoveryCode } from "../contexts/RecoveryCodeContext";
import googleDriveLogo from "../assets/external/Google_Drive_Logo.svg";
import dropboxLogo from "../assets/external/dropbox-1-logo-png-transparent.png";
import oneDriveLogo from "../assets/external/onedrive.webp";
import sharePointLogo from "../assets/external/sharepoint.svg";
import boxLogo from "../assets/external/BOX.svg";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  CircleDot,
  HeartHandshake,
  HelpCircle,
  Loader2,
  LogOut,
  Menu,
  Package,
  Settings,
} from "lucide-react";
import {
  defaultHelpModalBody,
  useHelpModal,
} from "../contexts/HelpModalContext";
import { useSettingsModal } from "../contexts/SettingsModalContext";
import DerivedServiceIcon, {
  derivedServiceKind,
} from "./DerivedServiceIcon";
import {
  readSidebarExpandedIds,
  writeSidebarExpandedIds,
} from "../utils/sidebarExpandedCache";

type MigrationListEntry = ListMigrationsResponse["migrations"][number];

type SectionVisual = "completed" | "running" | "awaiting" | "failed" | "upcoming";

const SERVICE_LOGOS: Record<string, string> = {
  "google-drive": googleDriveLogo,
  dropbox: dropboxLogo,
  onedrive: oneDriveLogo,
  sharepoint: sharePointLogo,
  box: boxLogo,
};

function SidebarServiceGlyph({
  root,
  size = 14,
}: {
  root?: RootInfo | null;
  size?: number;
}) {
  const id = (root?.serviceId || "").trim().toLowerCase();
  const type = (root?.serviceType || "").trim().toLowerCase();
  const key = id || type;
  const logo = key ? SERVICE_LOGOS[key] : undefined;

  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        className="sidebar__service-glyph"
        draggable={false}
      />
    );
  }
  return (
    <DerivedServiceIcon
      kind={derivedServiceKind(id, type)}
      size={size}
      localIcon="drive"
      className="sidebar__service-glyph"
    />
  );
}

function MigrationRouteGlyphs({
  migration,
  size = 14,
}: {
  migration: MigrationListEntry;
  size?: number;
}) {
  return (
    <span className="sidebar__migrations-route" aria-hidden="true">
      <SidebarServiceGlyph root={migration.sourceRoot} size={size} />
      <ArrowRight size={Math.max(10, size - 4)} className="sidebar__migrations-route-arrow" />
      <SidebarServiceGlyph root={migration.destinationRoot} size={size} />
    </span>
  );
}

/** Settings and root-selection flows; login refresh is handled separately via user. */
function isOAuthHealthRefreshPath(pathname: string): boolean {
  return (
    pathname === "/connect" ||
    pathname === "/destination" ||
    pathname === "/browse" ||
    pathname === "/browse-cloud" ||
    pathname === "/cloud/connect"
  );
}

function refreshOAuthHealthBadge(
  setIssues: (hasIssues: boolean) => void
): () => void {
  let cancelled = false;
  void fetchOAuthHealthSummary()
    .then((summary) => {
      if (!cancelled) setIssues(summary.hasIssues);
    })
    .catch(() => {
      if (!cancelled) setIssues(false);
    });
  return () => {
    cancelled = true;
  };
}

const MIGRATION_SECTIONS: Array<{ step: PathReviewLifecycleStep; label: string }> = [
  { step: "discover", label: "Discover" },
  { step: "copy", label: "Copy" },
  { step: "remove", label: "Remove" },
];

/** ETA is only shown when the engine reports one (same rule as ProgressMonitor). */
function queueEtaSeconds(queue: QueueMetrics | null | undefined): number | null {
  if (!queue) return null;
  const secs = queue.eta_seconds;
  if (secs == null || !Number.isFinite(secs) || secs <= 0 || !queue.eta_basis) {
    return null;
  }
  return secs;
}

/** Displayed ETA for a live migration; traversal shows the longer side. */
function liveEtaSeconds(
  migration: MigrationListEntry,
  metrics: MigrationQueueMetricsResponse | undefined
): number | null {
  if (!metrics) return null;
  const phase = getMigrationPhase(migration);
  if (phase.startsWith("traversal")) {
    const src = queueEtaSeconds(metrics.srcTraversal);
    const dst = queueEtaSeconds(metrics.dstTraversal);
    if (src == null) return dst;
    if (dst == null) return src;
    return Math.max(src, dst);
  }
  if (phase.startsWith("copy")) return queueEtaSeconds(metrics.copy);
  if (phase.startsWith("delete")) return queueEtaSeconds(metrics.delete);
  return null;
}

function migrationDisplayName(migration: MigrationListEntry): string {
  if (migration.name && migration.name !== migration.id) return migration.name;
  const src = migration.sourceRoot?.name;
  const dst = migration.destinationRoot?.name;
  if (src && dst) return `${src} → ${dst}`;
  return src || dst || migration.id;
}

function sectionVisualState(
  migration: MigrationListEntry,
  step: PathReviewLifecycleStep,
  stepper: ReturnType<typeof getPathReviewStepperState>
): SectionVisual {
  if (stepper.completed.includes(step)) return "completed";
  if (stepper.active !== step) return "upcoming";
  const phase = getMigrationPhase(migration);
  if (
    phase === "failed" ||
    phase === "aborted" ||
    phase.endsWith("-finalize-failed") ||
    (phase === "" && migration.error)
  ) {
    return "failed";
  }
  return isMigrationLive(migration) ? "running" : "awaiting";
}

function sectionIcon(visual: SectionVisual) {
  switch (visual) {
    case "completed":
      return <Check size={13} strokeWidth={2.4} aria-hidden="true" />;
    case "running":
      return (
        <Loader2 size={13} strokeWidth={2.2} className="sidebar__migrations-spin" aria-hidden="true" />
      );
    case "failed":
      return (
        <span className="sidebar__migrations-failed-mark" aria-hidden="true">
          !
        </span>
      );
    case "awaiting":
      return <CircleDot size={13} strokeWidth={2} aria-hidden="true" />;
    default:
      return <Circle size={13} strokeWidth={2} aria-hidden="true" />;
  }
}

/** Page for a clicked section, following the Resume open pattern per section. */
function sectionTargetPath(
  statusData: MigrationStatusResponse,
  step: PathReviewLifecycleStep
): string {
  const id = statusData.id;
  const phase = getMigrationPhase(statusData);
  switch (step) {
    case "discover":
      return `/path-review/${id}`;
    case "copy":
      if (phase === "awaiting-traversal-review") return `/path-review/${id}/copy-plan`;
      if (phase.startsWith("copy-")) return `/progress-monitor/${id}?mode=copy`;
      return `/path-review/${id}`;
    case "remove":
      if (phase.startsWith("delete-")) return `/progress-monitor/${id}?mode=delete`;
      return `/path-review/${id}/source-cleanup`;
  }
}

/** Migration id + section from the current route, for highlighting. */
function routeMigration(location: { pathname: string; search: string }): {
  id: string | null;
  section: PathReviewLifecycleStep | null;
} {
  const review = location.pathname.match(/^\/path-review\/([^/]+)(\/copy-plan|\/source-cleanup)?/);
  if (review) {
    const section =
      review[2] === "/copy-plan" ? "copy" : review[2] === "/source-cleanup" ? "remove" : null;
    return { id: decodeURIComponent(review[1]), section };
  }
  const monitor = location.pathname.match(/^\/progress-monitor\/([^/]+)/);
  if (monitor) {
    const mode = new URLSearchParams(location.search).get("mode");
    const section =
      mode === "copy" ? "copy" : mode === "delete" ? "remove" : mode === "discovery" ? "discover" : null;
    return { id: decodeURIComponent(monitor[1]), section };
  }
  return { id: null, section: null };
}

export default function Sidebar() {
  const { preferences, updatePreferences } = usePreferences();
  const { user, logout } = useAuth();
  const isCollapsed = preferences.sidebarCollapsed;
  const navigate = useNavigate();
  const location = useLocation();
  const { openHelp } = useHelpModal();
  const { openSettings, isOpen: settingsOpen } = useSettingsModal();
  const [oauthHealthIssues, setOauthHealthIssues] = useState(false);
  const { needsAttention: recoveryNeedsAttention } = useRecoveryCode();

  useEffect(() => {
    if (!user) {
      setOauthHealthIssues(false);
      return;
    }
    return refreshOAuthHealthBadge(setOauthHealthIssues);
  }, [user]);

  useEffect(() => {
    if (!user || !isOAuthHealthRefreshPath(location.pathname)) return;
    return refreshOAuthHealthBadge(setOauthHealthIssues);
  }, [user, location.pathname]);

  useEffect(() => {
    if (!user || !settingsOpen) return;
    return refreshOAuthHealthBadge(setOauthHealthIssues);
  }, [user, settingsOpen]);

  // Migration manager tree: keep the list warm even when the rail is collapsed.
  const { updateMigration, applyServerRoots } = useSelection();
  const [migrations, setMigrations] = useState<MigrationListEntry[]>([]);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() =>
    readSidebarExpandedIds(user?.id)
  );
  const [metricsById, setMetricsById] = useState<
    Record<string, MigrationQueueMetricsResponse>
  >({});
  const [openingId, setOpeningId] = useState<string | null>(null);

  const active = routeMigration(location);
  const activeMigrationId = active.id;

  useEffect(() => {
    setExpandedIds(readSidebarExpandedIds(user?.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    writeSidebarExpandedIds(user.id, expandedIds);
  }, [user?.id, expandedIds]);

  useEffect(() => {
    if (!activeMigrationId) return;
    setExpandedIds((prev) => {
      if (prev.has(activeMigrationId)) return prev;
      const next = new Set(prev);
      next.add(activeMigrationId);
      return next;
    });
  }, [activeMigrationId]);

  useEffect(() => {
    if (!user) {
      setMigrations([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      void listMigrations()
        .then((res) => {
          if (cancelled) return;
          setMigrations(
            [...res.migrations].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          );
        })
        .catch(() => {
          // Silent: keep the last good list, matching the badge behavior.
        });
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  const liveIds = useMemo(
    () =>
      migrations
        .filter((migration) => isMigrationLive(migration))
        .map((migration) => migration.id)
        .sort(),
    [migrations]
  );
  const liveIdsKey = liveIds.join(",");

  useEffect(() => {
    if (!user || isCollapsed || liveIds.length === 0) return;
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      for (const id of liveIds) {
        void getMigrationQueueMetrics(id)
          .then((metrics) => {
            if (!cancelled) {
              setMetricsById((prev) => ({ ...prev, [id]: metrics }));
            }
          })
          .catch(() => {
            // ETA is best-effort; a failed poll just keeps the last value.
          });
      }
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // liveIdsKey is the stable identity of liveIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isCollapsed, liveIdsKey]);

  if (location.pathname === "/login" || location.pathname === "/setup") {
    return null;
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSectionClick = async (
    migration: MigrationListEntry,
    step: PathReviewLifecycleStep
  ) => {
    if (openingId) return;
    setOpeningId(migration.id);
    try {
      const statusData = await getMigrationStatus(migration.id);
      updateMigration({
        migrationId: statusData.id,
        sourceConnectionId: statusData.sourceRoot?.connectionId,
        destinationConnectionId: statusData.destinationRoot?.connectionId,
        ready:
          statusData.result?.rootSummary !== undefined ||
          Boolean(statusData.sourceRoot),
      });
      applyServerRoots(statusData.sourceRoot, statusData.destinationRoot, true);
      navigate(sectionTargetPath(statusData, step));
    } catch (err) {
      console.error("Failed to open migration from sidebar", err);
    } finally {
      setOpeningId(null);
    }
  };

  const handleMigrationsClick = () => {
    navigate("/");
  };

  const handleHelpClick = () => {
    openHelp({ title: "Help", body: defaultHelpModalBody() });
  };

  const handleContributeClick = () => {
    window.open("https://github.com/Project-Sylos", "_blank", "noopener,noreferrer");
  };

  const handleSettingsClick = () => {
    openSettings();
  };

  return (
    <div className={`sidebar ${isCollapsed ? "sidebar--collapsed" : ""}`}>
      <div className="sidebar__header">
        <button
          className="sidebar__toggle"
          onClick={() => updatePreferences({ sidebarCollapsed: !isCollapsed })}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Menu size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <SylosLogo className="sidebar__logo" />
      </div>

      <div className="sidebar__content">
        <div className="sidebar__section sidebar__section--top">
          <button
            className="sidebar__button sidebar__button--primary"
            onClick={handleMigrationsClick}
            aria-label="Migrations"
          >
            <span className="sidebar__button-icon"><Package size={20} strokeWidth={1.8} aria-hidden="true" /></span>
            {!isCollapsed && <span className="sidebar__button-text">Migrations</span>}
          </button>
          {user && (
            <div
              className={`sidebar__migrations${isCollapsed ? " sidebar__migrations--rail" : ""}`}
              aria-label="Migration manager"
            >
              {migrations.length === 0 ? (
                !isCollapsed ? (
                  <p className="sidebar__migrations-empty">No migrations yet</p>
                ) : null
              ) : isCollapsed ? (
                migrations.map((migration) => {
                  const isActiveMigration = migration.id === activeMigrationId;
                  const stepper = getPathReviewStepperState(migration);
                  const name = migrationDisplayName(migration);
                  return (
                    <button
                      key={migration.id}
                      type="button"
                      className={`sidebar__icon-button sidebar__migrations-rail-btn${
                        isActiveMigration ? " sidebar__migrations-rail-btn--active" : ""
                      }`}
                      onClick={() => void handleSectionClick(migration, stepper.active)}
                      disabled={openingId != null}
                      title={name}
                      aria-label={`Open ${name}`}
                      aria-current={isActiveMigration ? "page" : undefined}
                    >
                      <MigrationRouteGlyphs migration={migration} size={12} />
                    </button>
                  );
                })
              ) : (
                migrations.map((migration) => {
                  const expanded = expandedIds.has(migration.id);
                  const isActiveMigration = migration.id === activeMigrationId;
                  const stepper = getPathReviewStepperState(migration);
                  const eta = liveEtaSeconds(migration, metricsById[migration.id]);
                  const name = migrationDisplayName(migration);
                  return (
                    <div key={migration.id} className="sidebar__migrations-item">
                      <button
                        type="button"
                        className={`sidebar__migrations-folder${isActiveMigration ? " sidebar__migrations-folder--active" : ""}`}
                        onClick={() => toggleExpanded(migration.id)}
                        aria-expanded={expanded}
                        title={name}
                      >
                        <ChevronRight
                          size={14}
                          strokeWidth={2}
                          aria-hidden="true"
                          className={`sidebar__migrations-chevron${expanded ? " sidebar__migrations-chevron--open" : ""}`}
                        />
                        <MigrationRouteGlyphs migration={migration} size={14} />
                        <span className="sidebar__migrations-name">{name}</span>
                      </button>
                      {eta != null && (
                        <div className="sidebar__migrations-eta">
                          ETA {formatEtaSeconds(eta)}
                        </div>
                      )}
                      {expanded && (
                        <div className="sidebar__migrations-sections">
                          {MIGRATION_SECTIONS.map(({ step, label }) => {
                            const visual = sectionVisualState(migration, step, stepper);
                            const highlighted =
                              isActiveMigration &&
                              (active.section ?? stepper.active) === step;
                            return (
                              <button
                                key={step}
                                type="button"
                                className={`sidebar__migrations-section sidebar__migrations-section--${visual}${highlighted ? " sidebar__migrations-section--current" : ""}`}
                                onClick={() => void handleSectionClick(migration, step)}
                                disabled={openingId != null}
                                aria-current={highlighted ? "page" : undefined}
                              >
                                <span className="sidebar__migrations-section-icon">
                                  {sectionIcon(visual)}
                                </span>
                                <span className="sidebar__migrations-section-label">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="sidebar__section sidebar__section--footer">
          {user && !isCollapsed && (
            <div className="sidebar__user">
              Signed in as <strong>{user.username}</strong>
            </div>
          )}
          <div className="sidebar__footer-icons" role="toolbar" aria-label="Sidebar actions">
            <button
              type="button"
              className="sidebar__icon-button"
              onClick={handleHelpClick}
              aria-label="Help"
              title="Help"
            >
              <HelpCircle size={20} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="sidebar__icon-button"
              onClick={handleContributeClick}
              aria-label="Want to contribute?"
              title="Want to contribute?"
            >
              <HeartHandshake size={20} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="sidebar__icon-button"
              onClick={handleSettingsClick}
              aria-label={
                oauthHealthIssues || recoveryNeedsAttention
                  ? "Settings - needs attention"
                  : "Settings"
              }
              title={
                oauthHealthIssues || recoveryNeedsAttention
                  ? "Settings - needs attention"
                  : "Settings"
              }
            >
              <Settings size={20} strokeWidth={1.8} aria-hidden="true" />
              {(recoveryNeedsAttention || oauthHealthIssues) && (
                <span
                  className="sidebar__settings-badge"
                  aria-hidden="true"
                  title={
                    recoveryNeedsAttention
                      ? "Recovery code needs attention"
                      : "Cloud OAuth connections need attention"
                  }
                />
              )}
            </button>
            {user && (
              <button
                type="button"
                className="sidebar__icon-button"
                onClick={() => void logout()}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
