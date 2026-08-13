/**
 * Data models for HPE iLO (Integrated Lights-Out) systems and live telemetry.
 */

/** Power state of the server. */
export type PowerState = 'On' | 'Off' | 'Unknown';

/** Overall health status. */
export type HealthStatus = 'OK' | 'Warning' | 'Critical' | 'Unknown';

/** A user-managed iLO endpoint (as returned by the backend, no password). */
export interface IloEndpoint {
  id: string;
  name: string;
  host: string;
  username: string;
}

/** Form payload for creating/updating an endpoint. */
export interface EndpointInput {
  name?: string;
  host: string;
  username: string;
  password?: string;
}

/** A single temperature sensor reading. */
export interface TemperatureReading {
  name: string;
  readingC: number;
  upperCaution: number | null;
  upperCritical: number | null;
  status: string;
}

/** A single fan reading. */
export interface FanReading {
  name: string;
  reading: number | null;
  units: 'RPM' | '%';
  status: string;
}

/** Power supply info. */
export interface PowerSupplyInfo {
  name: string;
  outputWatts: number | null;
  capacityWatts: number | null;
  status: string;
}

/** System-level info from Redfish Systems/1. */
export interface SystemInfo {
  hostname: string | null;
  model: string | null;
  serialNumber: string | null;
  biosVersion: string | null;
  powerState: string;
  health: string;
  memoryTotalGb: number | null;
  memoryHealth: string | null;
  cpuCount: number | null;
  cpuModel: string | null;
  cpuHealth: string | null;
}

/** Successful telemetry poll result for one endpoint. */
export interface TelemetrySuccess {
  ok: true;
  fetchedAt: string;
  latencyMs: number;
  system: SystemInfo;
  temperatures: TemperatureReading[];
  fans: FanReading[];
  power: {
    consumedWatts: number | null;
    capacityWatts: number | null;
    supplies: PowerSupplyInfo[];
  };
}

/** Failed telemetry poll result. */
export interface TelemetryFailure {
  ok: false;
  error: string;
  fetchedAt: string;
}

export type TelemetryResult = TelemetrySuccess | TelemetryFailure;

/** Map of endpointId -> telemetry result. */
export type TelemetryMap = Record<string, TelemetryResult>;

/** Result of a connection test. */
export interface TestResult {
  ok: boolean;
  message: string;
}
