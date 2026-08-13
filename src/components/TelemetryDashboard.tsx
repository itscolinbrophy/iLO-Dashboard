import type {
  IloEndpoint,
  TelemetryMap,
  TelemetrySuccess,
  EventLogEntry,
  HistorySample,
} from '../types/ilo';
import { HealthBadge } from './HealthBadge';
import { groupTemperatures, type TempGroup } from '../utils/tempGroups';
import {
  setFanSpeed,
  resetFanControl,
  sendPowerAction,
  fetchEventLog,
  fetchHistory,
} from '../api/client';
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
          {!isLive && (
            <button className="btn primary" onClick={onRefresh} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
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
  if (loading) {
    return (
      <div className="system-card skeleton">
        <div className="card-header">
          <h3>{endpoint.name}</h3>
        </div>
        <p className="empty-hint">Polling…</p>
      </div>
    );
  }

  if (!result || !result.ok) {
    return (
      <div className="system-card error">
        <div className="card-header">
          <h3>{endpoint.name}</h3>
          <a
            className="btn console-btn"
            href={`https://${endpoint.host}/`}
            target="_blank"
            rel="noreferrer"
            title="Open the iLO web console (HTML5 remote console)"
          >
            Console
          </a>
        </div>
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

  // Fan speed control (Silence of the Fans).
  const [fanPercent, setFanPercent] = useState(30);
  const [fanBusy, setFanBusy] = useState(false);
  const [fanMsg, setFanMsg] = useState<string | null>(null);

  const handleSetFan = async () => {
    setFanBusy(true);
    setFanMsg(null);
    try {
      const res = await setFanSpeed(endpoint.id, fanPercent);
      setFanMsg(res.ok ? `Fan speed set to ${res.percent}%` : res.error ?? 'Failed');
    } catch (err) {
      setFanMsg(err instanceof Error ? err.message : 'Failed to set fan speed');
    } finally {
      setFanBusy(false);
    }
  };

  const handleResetFan = async () => {
    setFanBusy(true);
    setFanMsg(null);
    try {
      const res = await resetFanControl(endpoint.id);
      setFanMsg(res.ok ? 'Fan control reset to automatic' : res.error ?? 'Failed');
    } catch (err) {
      setFanMsg(err instanceof Error ? err.message : 'Failed to reset fan control');
    } finally {
      setFanBusy(false);
    }
  };

  // Power control.
  const [powerBusy, setPowerBusy] = useState(false);
  const [powerMsg, setPowerMsg] = useState<string | null>(null);

  const handlePower = async (action: string) => {
    const labels: Record<string, string> = {
      On: 'Power On',
      ForceOff: 'Force Off',
      GracefulShutdown: 'Shutdown',
      GracefulRestart: 'Restart',
      ForceRestart: 'Force Restart',
    };
    if (!window.confirm(`${labels[action] ?? action} ${endpoint.name}?`)) return;
    setPowerBusy(true);
    setPowerMsg(null);
    try {
      const res = await sendPowerAction(endpoint.id, action);
      setPowerMsg(res.ok ? `${labels[action] ?? action} sent` : res.error ?? 'Failed');
    } catch (err) {
      setPowerMsg(err instanceof Error ? err.message : 'Failed to send power action');
    } finally {
      setPowerBusy(false);
    }
  };

  // Event log.
  const [events, setEvents] = useState<EventLogEntry[] | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [eventsBusy, setEventsBusy] = useState(false);
  const [eventsMsg, setEventsMsg] = useState<string | null>(null);

  const handleToggleEvents = async () => {
    if (eventsOpen) {
      setEventsOpen(false);
      return;
    }
    setEventsOpen(true);
    setEventsBusy(true);
    setEventsMsg(null);
    try {
      const res = await fetchEventLog(endpoint.id);
      if (res.ok) setEvents(res.entries);
      else setEventsMsg(res.error ?? 'Failed to load event log');
    } catch (err) {
      setEventsMsg(err instanceof Error ? err.message : 'Failed to load event log');
    } finally {
      setEventsBusy(false);
    }
  };

  // History.
  const [history, setHistory] = useState<HistorySample[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);

  const handleToggleHistory = async () => {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    setHistoryBusy(true);
    try {
      const res = await fetchHistory(endpoint.id);
      if (res.ok) setHistory(res.samples);
    } catch {
      setHistory([]);
    } finally {
      setHistoryBusy(false);
    }
  };

  return (
    <div className="system-card">
      <div className="card-header">
        <h3>{endpoint.name}</h3>
        <div className="card-header-actions">
          <a
            className="btn console-btn"
            href={`https://${endpoint.host}/`}
            target="_blank"
            rel="noreferrer"
            title="Open the iLO web console (HTML5 remote console)"
          >
            Console
          </a>
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

      <div className="card-toolbar">
        <div className="power-control">
          <button
            className="btn"
            onClick={() => handlePower('On')}
            disabled={powerBusy}
            title="Power on"
          >
            ⏻ On
          </button>
          <button
            className="btn"
            onClick={() => handlePower('GracefulRestart')}
            disabled={powerBusy}
            title="Graceful restart"
          >
            ↻ Restart
          </button>
          <button
            className="btn danger"
            onClick={() => handlePower('ForceOff')}
            disabled={powerBusy}
            title="Force off"
          >
            ⏻ Off
          </button>
          <button
            className="btn"
            onClick={handleToggleEvents}
            disabled={eventsBusy}
            title="View iLO event log"
          >
            {eventsOpen ? 'Hide Events' : 'Events'}
          </button>
          <button
            className="btn"
            onClick={handleToggleHistory}
            disabled={historyBusy}
            title="View history chart"
          >
            {historyOpen ? 'Hide History' : 'History'}
          </button>
        </div>
        {powerMsg && <div className="card-msg">{powerMsg}</div>}
      </div>

      {eventsOpen && (
        <div className="sensor-section">
          <h4>Event Log</h4>
          {eventsBusy ? (
            <p className="empty-hint">Loading…</p>
          ) : eventsMsg ? (
            <p className="card-error">{eventsMsg}</p>
          ) : events && events.length > 0 ? (
            <ul className="event-list">
              {events.slice(0, 20).map((ev, i) => (
                <li key={i} className={`event-item sev-${ev.severity.toLowerCase()}`}>
                  <span className="event-severity">{ev.severity}</span>
                  <span className="event-message">{ev.message}</span>
                  {ev.timestamp && (
                    <span className="event-time">
                      {new Date(ev.timestamp).toLocaleString()}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-hint">No events found.</p>
          )}
        </div>
      )}

      {historyOpen && (
        <div className="sensor-section">
          <h4>History</h4>
          {historyBusy ? (
            <p className="empty-hint">Loading…</p>
          ) : history && history.length > 1 ? (
            <HistoryChart samples={history} />
          ) : (
            <p className="empty-hint">
              Not enough history yet. Keep the dashboard polling to collect samples.
            </p>
          )}
        </div>
      )}

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

          {endpoint.sotf && (
            <div className="fan-control">
              <div className="fan-control-header">
                <span className="fan-control-title">Fan Speed Control</span>
                <span className="fan-control-value">{fanPercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={fanPercent}
                onChange={(e) => setFanPercent(Number(e.target.value))}
                className="fan-slider"
              />
              <div className="fan-control-actions">
                <button
                  className="btn primary"
                  onClick={handleSetFan}
                  disabled={fanBusy}
                >
                  {fanBusy ? 'Applying…' : 'Apply'}
                </button>
                <button
                  className="btn"
                  onClick={handleResetFan}
                  disabled={fanBusy}
                >
                  Auto
                </button>
              </div>
              {fanMsg && <div className="fan-msg">{fanMsg}</div>}
            </div>
          )}
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

/** Simple SVG line chart for historical telemetry. */
function HistoryChart({ samples }: { samples: HistorySample[] }) {
  const width = 320;
  const height = 90;
  const pad = 4;

  const maxTemp = Math.max(...samples.map((s) => s.maxTemp), 1);
  const maxPower = Math.max(...samples.map((s) => s.powerWatts), 1);

  const points = (key: 'maxTemp' | 'powerWatts', max: number) =>
    samples
      .map((s, i) => {
        const x = pad + (i / Math.max(samples.length - 1, 1)) * (width - pad * 2);
        const y = height - pad - (s[key] / max) * (height - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="history-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="history-svg">
        <polyline
          points={points('maxTemp', maxTemp)}
          fill="none"
          stroke="var(--crit)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polyline
          points={points('powerWatts', maxPower)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div className="history-legend">
        <span className="legend-item">
          <span className="legend-dot temp" /> Max Temp
        </span>
        <span className="legend-item">
          <span className="legend-dot power" /> Power (W)
        </span>
      </div>
    </div>
  );
}
