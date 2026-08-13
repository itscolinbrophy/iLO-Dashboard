import type { IloAlert, IloSystem } from '../types/ilo';

interface AlertsPanelProps {
  alerts: IloAlert[];
  systems: IloSystem[];
}

/** Panel listing active alerts across the fleet. */
export function AlertsPanel({ alerts, systems }: AlertsPanelProps) {
  const systemName = (id: string) =>
    systems.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="panel">
      <h2>Active Alerts</h2>
      {alerts.length === 0 ? (
        <p className="empty-hint">No active alerts.</p>
      ) : (
        <ul className="alert-list">
          {alerts.map((alert) => (
            <li key={alert.id} className={`alert-item sev-${alert.severity.toLowerCase()}`}>
              <div className="alert-header">
                <span className="alert-severity">{alert.severity}</span>
                <span className="alert-system">{systemName(alert.systemId)}</span>
                <span className="alert-time">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="alert-message">{alert.message}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
