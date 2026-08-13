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

  useEffect(() => {
    loadEndpoints();
  }, [loadEndpoints]);

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
        <div className="header-status">
          <span className="pulse-dot" />
          {endpoints.length} endpoint{endpoints.length === 1 ? '' : 's'} configured
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <EndpointManager
        endpoints={endpoints}
        onChange={() => {
          loadEndpoints();
          refresh();
        }}
      />

      <TelemetryDashboard
        endpoints={endpoints}
        telemetry={telemetry}
        loading={loading}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
      />
    </div>
  );
}

export default App;
