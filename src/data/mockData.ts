import type { IloSystem, IloAlert, DashboardSummary } from '../types/ilo';

/** Mock iLO systems used until a real Redfish backend is connected. */
export const mockSystems: IloSystem[] = [
  {
    id: 'ilo-001',
    name: 'PROD-WEB-01',
    host: '10.0.1.101',
    model: 'ProLiant DL380 Gen10',
    firmwareVersion: '2.98',
    generation: 'iLO 5',
    serialNumber: 'CZJ93402HK',
    powerState: 'On',
    health: 'OK',
    cpuUtilization: 42,
    memoryUtilization: 61,
    temperatureC: 24,
    lastContact: '2026-08-13T09:42:00Z',
    online: true,
    alertCount: 0,
  },
  {
    id: 'ilo-002',
    name: 'PROD-DB-01',
    host: '10.0.1.102',
    model: 'ProLiant DL380 Gen11',
    firmwareVersion: '1.55',
    generation: 'iLO 6',
    serialNumber: 'CZJ11204LP',
    powerState: 'On',
    health: 'Warning',
    cpuUtilization: 78,
    memoryUtilization: 84,
    temperatureC: 31,
    lastContact: '2026-08-13T09:41:30Z',
    online: true,
    alertCount: 2,
  },
  {
    id: 'ilo-003',
    name: 'PROD-APP-02',
    host: '10.0.1.103',
    model: 'ProLiant DL360 Gen10',
    firmwareVersion: '2.98',
    generation: 'iLO 5',
    serialNumber: 'CZJ93403MN',
    powerState: 'On',
    health: 'Critical',
    cpuUtilization: 91,
    memoryUtilization: 72,
    temperatureC: 38,
    lastContact: '2026-08-13T09:40:10Z',
    online: true,
    alertCount: 3,
  },
  {
    id: 'ilo-004',
    name: 'STAGING-01',
    host: '10.0.2.51',
    model: 'ProLiant DL320 Gen11',
    firmwareVersion: '1.50',
    generation: 'iLO 6',
    serialNumber: 'CZJ12011QR',
    powerState: 'Off',
    health: 'OK',
    cpuUtilization: 0,
    memoryUtilization: 0,
    temperatureC: 19,
    lastContact: '2026-08-13T08:15:00Z',
    online: true,
    alertCount: 0,
  },
  {
    id: 'ilo-005',
    name: 'BACKUP-NODE',
    host: '10.0.3.20',
    model: 'ProLiant DL380 Gen10 Plus',
    firmwareVersion: '2.90',
    generation: 'iLO 5',
    serialNumber: 'CZJ94107ST',
    powerState: 'On',
    health: 'Unknown',
    cpuUtilization: 0,
    memoryUtilization: 0,
    temperatureC: 0,
    lastContact: '2026-08-12T22:03:00Z',
    online: false,
    alertCount: 1,
  },
];

/** Mock alerts across the fleet. */
export const mockAlerts: IloAlert[] = [
  {
    id: 'alert-1',
    systemId: 'ilo-002',
    severity: 'Warning',
    message: 'Memory utilization above 80% for more than 15 minutes.',
    timestamp: '2026-08-13T09:30:00Z',
  },
  {
    id: 'alert-2',
    systemId: 'ilo-002',
    severity: 'Warning',
    message: 'Fan 3 running at elevated speed.',
    timestamp: '2026-08-13T09:12:00Z',
  },
  {
    id: 'alert-3',
    systemId: 'ilo-003',
    severity: 'Critical',
    message: 'CPU 1 temperature exceeds caution threshold.',
    timestamp: '2026-08-13T09:38:00Z',
  },
  {
    id: 'alert-4',
    systemId: 'ilo-003',
    severity: 'Critical',
    message: 'Power supply 2 has failed.',
    timestamp: '2026-08-13T09:20:00Z',
  },
  {
    id: 'alert-5',
    systemId: 'ilo-005',
    severity: 'Warning',
    message: 'iLO has been unreachable for more than 11 hours.',
    timestamp: '2026-08-13T09:00:00Z',
  },
];

/** Compute summary statistics from a list of systems. */
export function computeSummary(systems: IloSystem[]): DashboardSummary {
  const online = systems.filter((s) => s.online);
  const temps = online.filter((s) => s.temperatureC > 0);
  return {
    totalSystems: systems.length,
    onlineSystems: online.length,
    poweredOn: systems.filter((s) => s.powerState === 'On').length,
    criticalCount: systems.filter((s) => s.health === 'Critical').length,
    warningCount: systems.filter((s) => s.health === 'Warning').length,
    avgTemperatureC: temps.length
      ? Math.round((temps.reduce((sum, s) => sum + s.temperatureC, 0) / temps.length) * 10) / 10
      : 0,
  };
}
