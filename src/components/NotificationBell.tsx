import { useEffect, useRef, useState } from 'react';
import {
  fetchAlerts,
  acknowledgeAlerts,
  type DashboardAlert,
} from '../api/homelabClient';

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

/**
 * Top-right notification bell. Polls /api/alerts (server caches evaluation for
 * 30s) and shows unacknowledged PVE/PBS/service alerts in a dropdown panel.
 */
export function NotificationBell({ refreshKey }: { refreshKey?: number }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAlerts();
      setAlerts(res.alerts || []);
    } catch {
      /* keep previous alerts on failure */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [refreshKey]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unack = alerts.filter((a) => !a.acknowledged);
  const criticalCount = unack.filter((a) => a.severity === 'critical').length;
  const sorted = [...alerts].sort(
    (a, b) =>
      Number(a.acknowledged) - Number(b.acknowledged) ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.ts - a.ts
  );

  const ack = async (id?: string) => {
    await acknowledgeAlerts(id ? { id } : { all: true }).catch(() => undefined);
    setAlerts((prev) =>
      prev.map((a) => (!id || a.id === id ? { ...a, acknowledged: true } : a))
    );
  };

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button
        className={`icon-btn-pill notif-bell${unack.length > 0 ? ' has-alerts' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Alerts & Notifications"
        aria-label="Notifications"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unack.length > 0 && (
          <span className={`notif-badge${criticalCount > 0 ? ' critical' : ''}`}>
            {unack.length > 99 ? '99+' : unack.length}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Alerts</span>
            <div className="notif-panel-actions">
              {unack.length > 0 && (
                <button className="notif-ack-all" onClick={() => ack()}>
                  Acknowledge all
                </button>
              )}
              <button className="notif-refresh" onClick={load} disabled={loading}>
                {loading ? '…' : '↻'}
              </button>
            </div>
          </div>

          <div className="notif-list">
            {sorted.length === 0 ? (
              <div className="notif-empty">All systems nominal — no active alerts.</div>
            ) : (
              sorted.map((a) => (
                <div key={a.id} className={`notif-item sev-${a.severity}${a.acknowledged ? ' acked' : ''}`}>
                  <span className={`notif-dot ${a.severity}`} />
                  <div className="notif-body">
                    <span className="notif-msg">{a.message}</span>
                    <span className="notif-src">{a.source}</span>
                  </div>
                  {!a.acknowledged && (
                    <button className="notif-ack" onClick={() => ack(a.id)} title="Acknowledge">
                      ✓
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
