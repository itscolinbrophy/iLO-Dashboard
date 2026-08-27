import { Icon } from '../common/Icon';
import type { NasStatus, ServiceDataResponse } from '../../types/homelab';

interface NasWidgetProps {
  title?: string;
  response?: ServiceDataResponse<NasStatus>;
  loading?: boolean;
}

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function NasWidget({ title = 'Synology NAS', response, loading }: NasWidgetProps) {
  const data = response?.data;
  const isOk = response?.ok && data;

  const status =
    data?.status === 'critical' ? 'danger' : data?.status === 'degraded' ? 'warning' : 'online';
  const statusLabel =
    data?.status === 'critical'
      ? 'Critical'
      : data?.status === 'degraded'
      ? 'Degraded'
      : data?.status || (loading ? 'Connecting…' : 'Offline');

  return (
    <div className="homelab-widget nas-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon nas-badge">
            <Icon name="database" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">
              {data?.model || 'Synology'} • {data?.hostname || 'NAS'}
            </span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className={`status-indicator ${status}`} />
          <span>{statusLabel}</span>
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to NAS: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="nas-content">
          <div className="nas-meta-row">
            <span className="nas-meta-item">
              <Icon name="activity" size={13} /> DSM {data?.version || '—'}
            </span>
            <span className="nas-meta-item">
              <Icon name="refresh" size={13} /> Up {data?.uptime || '—'}
            </span>
            {data?.tempCelsius != null && (
              <span className="nas-meta-item">
                <Icon name="activity" size={13} /> {data.tempCelsius}°C
              </span>
            )}
          </div>

          <div className="nas-gauges">
            <div className="gauge-item">
              <div className="gauge-label">CPU Usage</div>
              <div className="gauge-value-row">
                <span className="gauge-val">{data?.cpuUsagePercent ?? 0}%</span>
              </div>
              <div className="progress-bar-track">
                <div
                  className={`progress-bar-fill ${(data?.cpuUsagePercent ?? 0) < 60 ? 'info' : (data?.cpuUsagePercent ?? 0) < 85 ? 'warning' : 'danger'}`}
                  style={{ width: `${Math.min(100, Math.max(0, data?.cpuUsagePercent ?? 0))}%` }}
                />
              </div>
            </div>

            <div className="gauge-item">
              <div className="gauge-label">Memory Usage</div>
              <div className="gauge-value-row">
                <span className="gauge-val">{data?.memUsagePercent ?? 0}%</span>
                <span className="gauge-sub">
                  {formatBytes(data?.memUsedBytes ?? 0)} / {formatBytes(data?.memTotalBytes ?? 0)}
                </span>
              </div>
              <div className="progress-bar-track">
                <div
                  className={`progress-bar-fill ${(data?.memUsagePercent ?? 0) < 70 ? 'accent' : (data?.memUsagePercent ?? 0) < 85 ? 'warning' : 'danger'}`}
                  style={{ width: `${Math.min(100, Math.max(0, data?.memUsagePercent ?? 0))}%` }}
                />
              </div>
            </div>
          </div>

          {data?.volumes && data.volumes.length > 0 && (
            <div className="nas-section">
              <div className="nas-section-title">Storage Volumes</div>
              {data.volumes.map((v) => (
                <div key={v.name} className="nas-volume-row">
                  <div className="nas-volume-header">
                    <span className="nas-volume-name font-mono">{v.name}</span>
                    <span className="nas-volume-pct font-mono">{v.usagePercent}%</span>
                  </div>
                  <div className="progress-bar-track">
                    <div
                      className={`progress-bar-fill ${v.usagePercent > 85 ? 'danger' : v.usagePercent > 70 ? 'warning' : 'accent'}`}
                      style={{ width: `${Math.min(100, Math.max(0, v.usagePercent))}%` }}
                    />
                  </div>
                  <div className="nas-volume-details">
                    <span className="nas-volume-used font-mono">{formatBytes(v.usedBytes)}</span>
                    <span className="text-muted">of {formatBytes(v.totalBytes)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data?.disks && data.disks.length > 0 && (
            <div className="nas-section">
              <div className="nas-section-title">Disks</div>
              <div className="nas-disks-list">
                {data.disks.map((d) => (
                  <div key={d.name} className="nas-disk-item">
                    <span className={`nas-disk-status ${d.status === 'normal' ? 'ok' : 'warn'}`} />
                    <span className="nas-disk-name">{d.name}</span>
                    <span className="nas-disk-model text-muted">{d.model}</span>
                    <span className="nas-disk-temp font-mono">
                      {d.tempCelsius != null ? `${d.tempCelsius}°C` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}