import type { HealthStatus } from '../types/ilo';

/** Colored badge representing a health status. */
export function HealthBadge({ status }: { status: HealthStatus }) {
  const cls = `health-badge health-${status.toLowerCase()}`;
  return <span className={cls}>{status}</span>;
}
