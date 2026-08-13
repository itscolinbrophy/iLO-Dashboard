import type { IloSystem } from '../types/ilo';
import { HealthBadge } from './HealthBadge';

interface SystemDetailProps {
  system: IloSystem | null;
}

/** Detail panel for the currently selected iLO system. */
export function SystemDetail({ system }: SystemDetailProps) {
  if (!system) {
    return (
      <div className="panel detail-panel">
        <h2>System Details</h2>
        <p className="empty-hint">Select a system to view details.</p>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    ['Host', system.host],
    ['Model', system.model],
    ['Generation', system.generation],
    ['Firmware', system.firmwareVersion],
    ['Serial Number', system.serialNumber],
    ['Power State', system.powerState],
    ['Last Contact', new Date(system.lastContact).toLocaleString()],
    ['Reachable', system.online ? 'Yes' : 'No'],
  ];

  return (
    <div className="panel detail-panel">
      <h2>
        {system.name} <HealthBadge status={system.health} />
      </h2>
      <dl className="detail-list">
        {rows.map(([label, value]) => (
          <div key={label} className="detail-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <a
        className="ilo-link"
        href={`https://${system.host}`}
        target="_blank"
        rel="noreferrer"
      >
        Open iLO Console ↗
      </a>
    </div>
  );
}
