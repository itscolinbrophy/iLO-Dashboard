import type {
  IloEndpoint,
  EndpointInput,
  TelemetryMap,
  TestResult,
  FanControlResult,
} from '../types/ilo';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

/** List all configured iLO endpoints (passwords are never returned). */
export function listEndpoints(): Promise<IloEndpoint[]> {
  return request('/endpoints');
}

/** Add a new iLO endpoint. */
export function addEndpoint(input: EndpointInput): Promise<IloEndpoint> {
  return request('/endpoints', { method: 'POST', body: JSON.stringify(input) });
}

/** Update an existing endpoint. Omit password to keep the current one. */
export function updateEndpoint(id: string, input: EndpointInput): Promise<IloEndpoint> {
  return request(`/endpoints/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

/** Remove an endpoint. */
export function deleteEndpoint(id: string): Promise<{ ok: boolean }> {
  return request(`/endpoints/${id}`, { method: 'DELETE' });
}

/** Test connectivity + credentials for one endpoint. */
export function testEndpoint(id: string): Promise<TestResult> {
  return request(`/endpoints/${id}/test`, { method: 'POST' });
}

/** Poll live telemetry from all endpoints. */
export function fetchTelemetry(): Promise<TelemetryMap> {
  return request('/telemetry');
}

/** Set the fan speed (0-100%) on an iLO with Silence of the Fans enabled. */
export function setFanSpeed(id: string, percent: number): Promise<FanControlResult> {
  return request(`/endpoints/${id}/fans`, {
    method: 'POST',
    body: JSON.stringify({ percent }),
  });
}

/** Reset fan control back to automatic on an iLO. */
export function resetFanControl(id: string): Promise<FanControlResult> {
  return request(`/endpoints/${id}/fans`, {
    method: 'POST',
    body: JSON.stringify({ action: 'reset' }),
  });
}
