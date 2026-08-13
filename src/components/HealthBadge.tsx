import type { HealthStatus } from '../types/ilo';

const KNOWN: HealthStatus[] = ['OK', 'Warning', 'Critical', 'Unknown'];

/** Colored badge representing a health status. */
export function HealthBadge({ status }: { status: string }) {
  const normalized = KNOWN.includes(status as HealthStatus)
    ? (status as HealthStatus)
    : 'Unknown';
  return <span className={`health-badge health-${normalized.toLowerCase()}`}>{status}</span>;
}
