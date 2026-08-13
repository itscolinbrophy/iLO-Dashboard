import type { IloEndpoint, TelemetryMap, TelemetrySuccess } from '../types/ilo';
import { HealthBadge } from './HealthBadge';
import { groupTemperatures, type TempGroup } from '../utils/tempGroups';
import { useState } from 'react';

interface TelemetryDashboardProps {
  endpoints: IloEndpoint[];
  telemetry: TelemetryMap;
  loading: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
  tempColumns: number;
  tempRows: number;
  refreshInterval: number | null;
}

/** Live telemetry view: temps, fans, power draw and system health per endpoint. */
export function TelemetryDashboard({
  endpoints,
  telemetry,
  loading,
  lastUpdated,
  onRefresh,
  tempColumns,
  tempRows,
  refreshInterval,
}: TelemetryDashboardProps) {
  const isLive = refreshInterval === 0;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Live Telemetry</h2>
        <div className="telemetry-controls">
          {isLive ? (
            <span className="live-indicator">
              <span className="live-dot" />
              Live
            </span>
          ) : (
            lastUpdated && (
              <span className="updated-at">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )
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
                tempColumns={tempColumns}
                tempRows={tempRows}
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
  tempColumns,
  tempRows,
}: {
  endpoint: IloEndpoint;
  result?: TelemetryMap[string];
  loading: boolean;
  tempColumns: number;
  tempRows: number;
}) {
  const [consoleOpen, setConsoleOpen] = useState(false);

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
  // Max temp excludes 0°C readings (unpopulated sensors like empty PCI slots).
  const activeTemps = data.temperatures.filter((t) => t.readingC > 0);
  const maxTemp = activeTemps.reduce(
    (m, t) => Math.max(m, t.readingC),
    -Infinity,
  );
  const maxFan = data.fans.reduce(
    (m, f) => Math.max(m, f.reading ?? 0),
    0,
  );
  const groups = groupTemperatures(data.temperatures);

  return (
    <div className="system-card">
      <div className="card-header">
        <h3>{endpoint.name}</h3>
        <div className="card-header-actions">
          <button
            className="btn console-btn"
            onClick={() => setConsoleOpen(true)}
            title="Open iLO remote console"
          >
            Console
          </button>
          <HealthBadge status={sys.health} />
        </div>
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
            data.power.consumedWatts != null && data.power.consumedWatts > 0
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

      {groups.length > 0 && (
        <div className="sensor-section">
          <h4>Temperatures</h4>
          <div
            className="temp-groups"
            style={{
              gridTemplateColumns: `repeat(${tempColumns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${tempRows}, auto)`,
            }}
          >
            {groups.map((group) => (
              <TempGroupAccordion key={group.key} group={group} />
            ))}
          </div>
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

      {consoleOpen && (
        <div className="console-overlay" onClick={() => setConsoleOpen(false)}>
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-header">
              <h3>{endpoint.name} — Remote Console</h3>
              <button
                className="icon-btn"
                onClick={() => setConsoleOpen(false)}
                title="Close console"
                aria-label="Close console"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <iframe
              className="console-frame"
              src={`/api/console/${endpoint.id}/`}
              title={`${endpoint.name} console`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Expandable temperature group showing average and per-sensor details. */
function TempGroupAccordion({ group }: { group: TempGroup }) {
  const [open, setOpen] = useState(false);
  const { label, average, readings } = group;

  return (
    <div className={`temp-group ${open ? 'open' : ''}`}>
      <button className="temp-group-header" onClick={() => setOpen((o) => !o)}>
        <span className="temp-group-title">
          <span className="temp-group-label">{label}</span>
          <span className="temp-group-count">({readings.length})</span>
        </span>
        <span className="temp-group-right">
          <span className="temp-group-avg">{average}°C</span>
          <span className={`chevron ${open ? 'rotated' : ''}`}>▾</span>
        </span>
      </button>
      {open && (
        <ul className="sensor-list temp-group-detail">
          {readings.map((t, i) => (
            <li key={i} className="sensor-row">
              <span className="sensor-name">{t.name}</span>
              <span className="sensor-value">{t.readingC}°C</span>
            </li>
          ))}
        </ul>
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
