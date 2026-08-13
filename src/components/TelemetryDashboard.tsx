import type { IloEndpoint, TelemetryMap, TelemetrySuccess } from '../types/ilo';
import { HealthBadge } from './HealthBadge';

interface TelemetryDashboardProps {
  endpoints: IloEndpoint[];
  telemetry: TelemetryMap;
  loading: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
}

/** Live telemetry view: temps, fans, power draw and system health per endpoint. */
export function TelemetryDashboard({
  endpoints,
  telemetry,
  loading,
  lastUpdated,
  onRefresh,
}: TelemetryDashboardProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Live Telemetry</h2>
        <div className="telemetry-controls">
          {lastUpdated && (
            <span className="updated-at">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button className="btn primary" onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {endpoints.length === 0 ? (
        <p className="empty-hint">
          Add an endpoint to start collecting telemetry.
        </p>
      ) : (
        <div className="telemetry-grid">
          {endpoints.map((ep) => {
            const result = telemetry[ep.id];
            return (
              <SystemCard
                key={ep.id}
                endpoint={ep}
                result={result}
                loading={loading && !result}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SystemCard({
  endpoint,
  result,
  loading,
}: {
  endpoint: IloEndpoint;
  result?: TelemetryMap[string];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="system-card">
        <h3>{endpoint.name}</h3>
        <p className="empty-hint">Polling…</p>
      </div>
    );
  }

  if (!result || !result.ok) {
    return (
      <div className="system-card error">
        <h3>{endpoint.name}</h3>
        <p className="card-error">
          {result && 'error' in result ? result.error : 'No data'}
        </p>
      </div>
    );
  }

  const data = result as TelemetrySuccess;
  const sys = data.system;
  const maxTemp = data.temperatures.reduce(
    (m, t) => Math.max(m, t.readingC),
    -Infinity,
  );
  const maxFan = data.fans.reduce(
    (m, f) => Math.max(m, f.reading ?? 0),
    0,
  );

  return (
    <div className="system-card">
      <div className="card-header">
        <h3>{endpoint.name}</h3>
        <HealthBadge status={sys.health} />
      </div>
      <div className="card-sub">
        {sys.model ?? endpoint.host}
        {sys.powerState && <span className="power-state">{sys.powerState}</span>}
      </div>

      <div className="kpi-row">
        <Kpi label="Max Temp" value={isFinite(maxTemp) ? `${maxTemp}°C` : '—'} />
        <Kpi
          label="Power Draw"
          value={
            data.power.consumedWatts != null
              ? `${data.power.consumedWatts} W`
              : '—'
          }
        />
        <Kpi label="Max Fan" value={maxFan > 0 ? `${maxFan}` : '—'} />
        <Kpi
          label="Latency"
          value={data.latencyMs != null ? `${data.latencyMs} ms` : '—'}
        />
      </div>

      {data.temperatures.length > 0 && (
        <div className="sensor-section">
          <h4>Temperatures</h4>
          <ul className="sensor-list">
            {data.temperatures.map((t, i) => (
              <li key={i} className="sensor-row">
                <span className="sensor-name">{t.name}</span>
                <span className="sensor-value">{t.readingC}°C</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.fans.length > 0 && (
        <div className="sensor-section">
          <h4>Fans</h4>
          <ul className="sensor-list">
            {data.fans.map((f, i) => (
              <li key={i} className="sensor-row">
                <span className="sensor-name">{f.name}</span>
                <span className="sensor-value">
                  {f.reading != null ? `${f.reading} ${f.units}` : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.power.supplies.length > 0 && (
        <div className="sensor-section">
          <h4>Power Supplies</h4>
          <ul className="sensor-list">
            {data.power.supplies.map((p, i) => (
              <li key={i} className="sensor-row">
                <span className="sensor-name">{p.name}</span>
                <span className="sensor-value">
                  {p.outputWatts != null ? `${p.outputWatts} W` : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}
