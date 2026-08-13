/**
 * Data models for HPE iLO (Integrated Lights-Out) systems.
 */

/** Power state of the server. */
export type PowerState = 'On' | 'Off';

/** Overall health status. */
export type HealthStatus = 'OK' | 'Warning' | 'Critical' | 'Unknown';

/** iLO firmware generation. */
export type IloGeneration = 'iLO 5' | 'iLO 6';

/** A single managed iLO / server endpoint. */
export interface IloSystem {
  /** Unique identifier. */
  id: string;
  /** Display name of the server. */
  name: string;
  /** iLO hostname or IP address. */
  host: string;
  /** Server model, e.g. "ProLiant DL380 Gen10". */
  model: string;
  /** iLO firmware version. */
  firmwareVersion: string;
  /** iLO generation. */
  generation: IloGeneration;
  /** Serial number. */
  serialNumber: string;
  /** Current power state. */
  powerState: PowerState;
  /** Overall system health. */
  health: HealthStatus;
  /** CPU utilization percentage (0-100). */
  cpuUtilization: number;
  /** Memory utilization percentage (0-100). */
  memoryUtilization: number;
  /** Inlet temperature in Celsius. */
  temperatureC: number;
  /** Last time the system was polled. */
  lastContact: string;
  /** Whether the iLO is reachable. */
  online: boolean;
  /** Number of active alerts. */
  alertCount: number;
}

/** An alert raised by an iLO system. */
export interface IloAlert {
  id: string;
  systemId: string;
  severity: HealthStatus;
  message: string;
  timestamp: string;
}

/** Summary statistics across all systems. */
export interface DashboardSummary {
  totalSystems: number;
  onlineSystems: number;
  poweredOn: number;
  criticalCount: number;
  warningCount: number;
  avgTemperatureC: number;
}
