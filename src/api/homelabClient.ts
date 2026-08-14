import type {
  HomelabConfig,
  ServiceEndpointConfig,
  QuickLink,
  DashboardLayoutConfig,
  ServiceDataResponse,
  ArrCalendarItem,
} from '../types/homelab';

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

/* ---------------- Config & Layout ---------------- */

export function fetchHomelabConfig(): Promise<HomelabConfig> {
  return request('/config');
}

export function saveDashboardLayout(
  dashboardLayout: DashboardLayoutConfig,
  refreshInterval?: number | null,
  theme?: string
): Promise<{ ok: boolean; layout: DashboardLayoutConfig }> {
  return request('/config/layout', {
    method: 'PUT',
    body: JSON.stringify({ dashboardLayout, refreshInterval, theme }),
  });
}

/* ---------------- Quick Links ---------------- */

export function fetchQuickLinks(): Promise<QuickLink[]> {
  return request('/quicklinks');
}

export function addQuickLink(link: Omit<QuickLink, 'id'>): Promise<QuickLink> {
  return request('/quicklinks', { method: 'POST', body: JSON.stringify(link) });
}

export function updateQuickLink(id: string, link: Partial<QuickLink>): Promise<QuickLink> {
  return request(`/quicklinks/${id}`, { method: 'PUT', body: JSON.stringify(link) });
}

export function deleteQuickLink(id: string): Promise<{ ok: boolean }> {
  return request(`/quicklinks/${id}`, { method: 'DELETE' });
}

/* ---------------- Services & Endpoints ---------------- */

export function fetchServices(): Promise<ServiceEndpointConfig[]> {
  return request('/services');
}

export function addService(service: Omit<ServiceEndpointConfig, 'id'>): Promise<ServiceEndpointConfig> {
  return request('/services', { method: 'POST', body: JSON.stringify(service) });
}

export function updateService(id: string, service: Partial<ServiceEndpointConfig>): Promise<ServiceEndpointConfig> {
  return request(`/services/${id}`, { method: 'PUT', body: JSON.stringify(service) });
}

export function deleteService(id: string): Promise<{ ok: boolean }> {
  return request(`/services/${id}`, { method: 'DELETE' });
}

export function testService(id: string): Promise<ServiceDataResponse> {
  return request(`/services/${id}/test`, { method: 'POST' });
}

/** Send a power action to a Proxmox VE VM/LXC. */
export function sendPvePowerAction(
  id: string,
  vmid: number,
  action: 'start' | 'stop' | 'shutdown' | 'reboot' | 'reset'
): Promise<{ ok: boolean; vmid?: number; action?: string; error?: string }> {
  return request(`/services/${id}/power`, {
    method: 'POST',
    body: JSON.stringify({ vmid, action }),
  });
}

/* ---------------- Live Telemetry & Calendar ---------------- */

export function fetchServicesStatus(): Promise<Record<string, ServiceDataResponse>> {
  return request('/services/status');
}

export function fetchArrCalendar(): Promise<ArrCalendarItem[]> {
  return request('/arr/calendar');
}
