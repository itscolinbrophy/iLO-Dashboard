import type { IloSystem } from '../types/ilo';
import { HealthBadge } from './HealthBadge';

interface SystemTableProps {
  systems: IloSystem[];
  onSelect: (system: IloSystem) => void;
  selectedId: string | null;
}

/** Table listing all managed iLO systems. */
export function SystemTable({ systems, onSelect, selectedId }: SystemTableProps) {
  return (
    <div className="panel">
      <h2>Managed Systems</h2>
      <table className="system-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Host</th>
            <th>Model</th>
            <th>Health</th>
            <th>Power</th>
            <th>CPU</th>
            <th>Memory</th>
            <th>Temp</th>
          </tr>
        </thead>
        <tbody>
          {systems.map((system) => (
            <tr
              key={system.id}
              className={system.id === selectedId ? 'selected' : ''}
              onClick={() => onSelect(system)}
            >
              <td className="name-cell">
                <span className={`status-dot ${system.online ? 'online' : 'offline'}`} />
                {system.name}
              </td>
              <td>{system.host}</td>
              <td>{system.model}</td>
              <td><HealthBadge status={system.health} /></td>
              <td>
                <span className={`power-${system.powerState.toLowerCase()}`}>
                  {system.powerState}
                </span>
              </td>
              <td>{system.online ? `${system.cpuUtilization}%` : '—'}</td>
              <td>{system.online ? `${system.memoryUtilization}%` : '—'}</td>
              <td>{system.online && system.temperatureC > 0 ? `${system.temperatureC}°C` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
