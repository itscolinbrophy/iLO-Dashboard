import { useCallback, useEffect, useState } from 'react';
import { listEndpoints, fetchTelemetry } from './api/client';
import { EndpointManager } from './components/EndpointManager';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import type { IloEndpoint, TelemetryMap } from './types/ilo';
import './App.css';

function App() {
  const [endpoints, setEndpoints] = useState<IloEndpoint[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryMap>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempColumns, setTempColumns] = useState(2);
  const [tempRows, setTempRows] = useState(2);
  // Auto-refresh interval in seconds. 0 = live (poll as fast as safe), null = off.
  const [refreshInterval, setRefreshInterval] = useState<number | null>(30);

  const loadEndpoints = useCallback(async () => {
    try {
      setEndpoints(await listEndpoints());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load endpoints');
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTelemetry();
      setTelemetry(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll once on page load.
  useEffect(() => {
    loadEndpoints();
    refresh();
  }, [loadEndpoints, refresh]);

  // Auto-refresh at the configured interval.
  useEffect(() => {
    if (refreshInterval == null) return;
    const ms = refreshInterval === 0 ? 5000 : refreshInterval * 1000;
    const id = setInterval(refresh, ms);
    return () => clearInterval(id);
  }, [refreshInterval, refresh]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">iL</div>
          <div className="brand-text">
            <h1>iLO Dashboard</h1>
            <span className="subtitle">HPE Integrated Lights-Out fleet overview</span>
          </div>
        </div>
        <div className="header-actions">
          <div className="header-status">
            <span className="pulse-dot" />
            {endpoints.length} endpoint{endpoints.length === 1 ? '' : 's'} configured
          </div>
          <button
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      {settingsOpen && (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>Settings</h2>
              <button
                className="icon-btn"
                onClick={() => setSettingsOpen(false)}
                title="Close"
                aria-label="Close settings"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="settings-section">
              <h3>Auto-Refresh</h3>
              <p className="settings-hint">
                How often to poll the iLOs for fresh telemetry. "Live" polls as
                fast as is safe for the iLO.
              </p>
              <div className="layout-controls">
                <div className="layout-control">
                  <span className="layout-label">Interval</span>
                  <div className="layout-buttons">
                    <button
                      className={`layout-btn ${refreshInterval === 0 ? 'active' : ''}`}
                      onClick={() => setRefreshInterval(0)}
                      title="Poll as fast as safe"
                    >
                      Live
                    </button>
                    {[15, 30, 60, 300].map((n) => (
                      <button
                        key={n}
                        className={`layout-btn ${refreshInterval === n ? 'active' : ''}`}
                        onClick={() => setRefreshInterval(n)}
                      >
                        {n}s
                      </button>
                    ))}
                    <button
                      className={`layout-btn ${refreshInterval === null ? 'active' : ''}`}
                      onClick={() => setRefreshInterval(null)}
                      title="Disable auto-refresh"
                    >
                      Off
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3>Temperature Layout</h3>
              <p className="settings-hint">
                Adjust how the temperature groups are arranged inside each iLO card.
              </p>
              <div className="layout-controls">
                <div className="layout-control">
                  <span className="layout-label">Columns</span>
                  <div className="layout-buttons">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        className={`layout-btn ${tempColumns === n ? 'active' : ''}`}
                        onClick={() => setTempColumns(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="layout-control">
                  <span className="layout-label">Rows</span>
                  <div className="layout-buttons">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        className={`layout-btn ${tempRows === n ? 'active' : ''}`}
                        onClick={() => setTempRows(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <EndpointManager
              endpoints={endpoints}
              onChange={() => {
                loadEndpoints();
                refresh();
              }}
            />
          </div>
        </div>
      )}

      <TelemetryDashboard
        endpoints={endpoints}
        telemetry={telemetry}
        loading={loading}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
        tempColumns={tempColumns}
        tempRows={tempRows}
      />
    </div>
  );
}

export default App;
