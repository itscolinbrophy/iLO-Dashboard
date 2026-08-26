import { useCallback, useEffect, useState } from 'react';
import { listEndpoints, fetchTelemetry } from './api/client';
import {
  fetchHomelabConfig,
  fetchServicesStatus,
  fetchArrCalendar,
  saveDashboardLayout,
} from './api/homelabClient';
import { SidebarNav } from './components/SidebarNav';
import { ConfigurableDashboard } from './components/ConfigurableDashboard';
import { DedicatedCategoryView } from './components/DedicatedCategoryView';
import { HomelabSettingsModal } from './components/HomelabSettingsModal';
import { NotificationBell } from './components/NotificationBell';
import { Icon } from './components/common/Icon';
import type { IloEndpoint, TelemetryMap } from './types/ilo';
import type {
  HomelabConfig,
  ServiceDataResponse,
  ArrCalendarItem,
  DashboardLayoutConfig,
} from './types/homelab';
import './App.css';
import './Homelab.css';

const DEFAULT_HOMELAB_CONFIG: HomelabConfig = {
  services: [],
  quickLinks: [],
  dashboardLayout: {
    columns: 3,
    gap: 16,
    widgets: [],
  },
  refreshInterval: 15,
};

function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Homelab Unified State
  const [homelabConfig, setHomelabConfig] = useState<HomelabConfig>(DEFAULT_HOMELAB_CONFIG);
  const [servicesStatus, setServicesStatus] = useState<Record<string, ServiceDataResponse>>({});
  const [calendarItems, setCalendarItems] = useState<ArrCalendarItem[]>([]);

  // iLO State
  const [endpoints, setEndpoints] = useState<IloEndpoint[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryMap>({});

  // General App State
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Load initial config & endpoints */
  const loadInitialData = useCallback(async () => {
    try {
      const [cfg, eps] = await Promise.all([
        fetchHomelabConfig().catch(() => DEFAULT_HOMELAB_CONFIG),
        listEndpoints().catch(() => []),
      ]);
      setHomelabConfig(cfg);
      setEndpoints(eps);
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  }, []);

  /* Refresh all live services & telemetry */
  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [telemetryData, servicesData, calData] = await Promise.all([
        fetchTelemetry().catch(() => ({})),
        fetchServicesStatus().catch(() => ({})),
        fetchArrCalendar().catch(() => []),
      ]);
      setTelemetry(telemetryData);
      setServicesStatus(servicesData);
      setCalendarItems(calData);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to refresh telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount
  useEffect(() => {
    loadInitialData();
    refreshAll();
  }, [loadInitialData, refreshAll]);

  // Polling loop
  useEffect(() => {
    const intervalSec = homelabConfig.refreshInterval ?? 15;
    if (intervalSec <= 0) return;
    const timer = setInterval(() => {
      refreshAll();
    }, intervalSec * 1000);
    return () => clearInterval(timer);
  }, [homelabConfig.refreshInterval, refreshAll]);

  // Layout save handler
  const handleUpdateLayout = async (newLayout: DashboardLayoutConfig) => {
    const updated = { ...homelabConfig, dashboardLayout: newLayout };
    setHomelabConfig(updated);
    try {
      await saveDashboardLayout(newLayout, homelabConfig.refreshInterval, homelabConfig.theme);
    } catch (err) {
      console.error('Failed to save layout to server:', err);
    }
  };

  // Count active online services
  const onlineCount = Object.values(servicesStatus).filter((s) => s.ok).length;

  return (
    <div
      className={`homelab-app-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''} ${
        mobileMenuOpen ? 'mobile-menu-open' : ''
      }`}
    >
      {/* SIDEBAR NAVIGATION */}
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setMobileMenuOpen(false);
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* MOBILE MENU BACKDROP */}
      {mobileMenuOpen && (
        <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* MAIN VIEW AREA */}
      <div className="homelab-main-container">
        <header className="homelab-top-header">
          <div className="header-left">
            <button
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              title="Toggle Menu"
            >
              <Icon name="menu" size={20} />
            </button>
            <h1 className="header-page-title">
              {activeTab === 'dashboard'
                ? 'Homelab Command Center'
                : activeTab === 'quicklinks'
                ? 'Quick Launchpad'
                : activeTab === 'ilo'
                ? 'iLO & Hardware Telemetry'
                : activeTab === 'infrastructure'
                ? 'Hypervisors & Containers'
                : activeTab === 'network'
                ? 'Network & Security'
                : activeTab === 'media'
                ? 'Media & Streaming'
                : activeTab === 'arrs'
                ? 'Servarr Automation'
                : activeTab === 'calendar'
                ? 'Upcoming Release Calendar'
                : activeTab === 'downloads'
                ? 'Downloads & Queue'
                : 'Homelab'}
            </h1>
            <span className="header-sub">
              {onlineCount} service{onlineCount === 1 ? '' : 's'} responding • {endpoints.length} iLOs
            </span>
          </div>

          <div className="header-right">
            {lastUpdated && (
              <span className="last-polled-text">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              className="btn secondary sm"
              onClick={refreshAll}
              disabled={loading}
              title="Poll latest telemetry"
            >
              <Icon name="refresh" size={14} className={loading ? 'spin' : ''} />
              <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
            </button>
            <NotificationBell refreshKey={loading ? 1 : 0} />
            <button
              className="icon-btn-pill"
              onClick={() => setSettingsOpen(true)}
              title="Homelab System Settings"
            >
              <Icon name="settings" size={18} />
            </button>
          </div>
        </header>

        {error && <div className="banner error">{error}</div>}

        <main className="homelab-content-body">
          {activeTab === 'dashboard' ? (
            <ConfigurableDashboard
              config={homelabConfig}
              servicesStatus={servicesStatus}
              calendarItems={calendarItems}
              iloEndpoints={endpoints}
              iloTelemetry={telemetry}
              loading={loading}
              onRefresh={refreshAll}
              onUpdateLayout={handleUpdateLayout}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <DedicatedCategoryView
              category={activeTab}
              config={homelabConfig}
              servicesStatus={servicesStatus}
              calendarItems={calendarItems}
              iloEndpoints={endpoints}
              iloTelemetry={telemetry}
              loading={loading}
              onRefresh={refreshAll}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </main>
      </div>

      {/* SETTINGS MODAL */}
      {settingsOpen && (
        <HomelabSettingsModal
          config={homelabConfig}
          endpoints={endpoints}
          onClose={() => setSettingsOpen(false)}
          onRefreshAll={refreshAll}
          onUpdateConfig={(newCfg) => setHomelabConfig(newCfg)}
          onEndpointsChange={loadInitialData}
        />
      )}
    </div>
  );
}

export default App;
