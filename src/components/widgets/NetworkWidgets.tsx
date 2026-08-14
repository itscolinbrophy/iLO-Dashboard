import { Icon } from '../common/Icon';
import type { OpnsenseStatus, UnifiStatus, NginxStatus, ServiceDataResponse } from '../../types/homelab';

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function OpnsenseWidget({
  title = 'OPNsense Firewall',
  response,
  loading,
  onRefresh,
}: {
  title?: string;
  response?: ServiceDataResponse<OpnsenseStatus>;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const data = response?.data;
  const isOk = response?.ok && data;
  const sys = data?.system;
  const wan = data?.wan;
  const traffic = data?.traffic;

  return (
    <div className="homelab-widget opnsense-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon opnsense-badge">
            <Icon name="shield" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">
              {sys?.hostname || 'OPNsense'} • v{sys?.version || '24.7'}
            </span>
          </div>
        </div>
        <div className="widget-header-actions">
          <div className="widget-status-pill">
            <span className={`status-indicator ${wan?.status === 'online' ? 'online' : 'warning'}`} />
            <span>Up: {sys?.uptime || 'Active'}</span>
          </div>
          {onRefresh && (
            <button className="btn sm secondary" onClick={onRefresh} disabled={loading} title="Refresh OPNsense stats">
              <Icon name="refresh" size={13} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to OPNsense: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="opnsense-content">
          {/* Public IP + connectivity */}
          {wan && (
            <div className="opnsense-wan-box">
              <div className="wan-ip-row">
                <span className="wan-ip-label text-muted">Public IP</span>
                <span className="wan-ip font-mono">{wan.publicIp || 'Unknown'}</span>
              </div>
              <div className="wan-metrics">
                <div className="wan-metric">
                  <span className="wan-metric-lbl">Latency</span>
                  <span className="wan-metric-val font-mono">{wan.delayMs ?? '—'} ms</span>
                </div>
                <div className="wan-metric">
                  <span className="wan-metric-lbl">Packet Loss</span>
                  <span className="wan-metric-val font-mono">{wan.lossPercent ?? '—'}%</span>
                </div>
                <div className="wan-metric">
                  <span className="wan-metric-lbl">Status</span>
                  <span className={`wan-metric-val ${wan.status === 'online' ? 'text-success' : 'text-warning'}`}>
                    {wan.status}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Traffic throughput */}
          {traffic && (
            <div className="opnsense-traffic-box">
              <div className="traffic-header-row">
                <span className="subheading">WAN Traffic</span>
                <span className="traffic-timespan text-muted">(since last reboot)</span>
              </div>
              <div className="traffic-speeds">
                <div className="speed-col opnsense-speed">
                  <span className="speed-lbl">↓ Ingress</span>
                  <span className="speed-num font-mono">{formatBytes(traffic.ingressBytes)}</span>
                  <span className="speed-sub text-muted">{Math.round(traffic.ingressMbps)} Mbps</span>
                </div>
                <div className="speed-col opnsense-speed">
                  <span className="speed-lbl">↑ Egress</span>
                  <span className="speed-num font-mono">{formatBytes(traffic.egressBytes)}</span>
                  <span className="speed-sub text-muted">{Math.round(traffic.egressMbps)} Mbps</span>
                </div>
              </div>
              {(traffic.inErrors > 0 || traffic.outErrors > 0) && (
                <div className="traffic-errors text-warning">
                  ⚠ {traffic.inErrors} in / {traffic.outErrors} out errors
                </div>
              )}
            </div>
          )}

          <div className="gauge-dual-row">
            <div className="mini-gauge">
              <div className="gauge-header">
                <span>CPU Load</span>
                <span className="font-mono">{sys?.cpuUsagePercent ?? 0}%</span>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill info"
                  style={{ width: `${sys?.cpuUsagePercent ?? 0}%` }}
                />
              </div>
            </div>
            <div className="mini-gauge">
              <div className="gauge-header">
                <span>RAM Usage</span>
                <span className="font-mono">{sys?.memUsagePercent ?? 0}%</span>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill accent"
                  style={{ width: `${sys?.memUsagePercent ?? 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="interfaces-summary">
            <span className="subheading">Network Interfaces</span>
            <div className="if-table">
              <div className="if-table-header">
                <span className="if-col-name">Interface</span>
                <span className="if-col-ip">IP / MAC</span>
                <span className="if-col-in">↓ In</span>
                <span className="if-col-out">↑ Out</span>
              </div>
              {(data?.interfaces || []).slice(0, 3).map((iface) => (
                <div key={iface.name} className="if-row">
                  <span className="if-col-name font-mono" title={iface.name}>{iface.name}</span>
                  <span className="if-col-ip font-mono text-muted" title={iface.ip}>{iface.ip}</span>
                  <span className="if-col-in font-mono">↓ {formatBytes(iface.inBytes)}</span>
                  <span className="if-col-out font-mono">↑ {formatBytes(iface.outBytes)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function UnifiWidget({
  title = 'UniFi Network',
  response,
  loading,
}: {
  title?: string;
  response?: ServiceDataResponse<UnifiStatus>;
  loading?: boolean;
}) {
  const data = response?.data;
  const isOk = response?.ok && data;

  return (
    <div className="homelab-widget unifi-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon unifi-badge">
            <Icon name="wifi" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">{data?.siteName || 'UniFi Site'}</span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className={`status-indicator ${data?.wanStatus === 'connected' ? 'online' : 'danger'}`} />
          <span>{data?.wanStatus === 'connected' ? 'WAN Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to UniFi Gateway: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="unifi-content">
          {/* Gateway system info */}
          {data?.gateway && (
            <div className="unifi-gateway-box">
              <div className="gw-model-row">
                <span className="gw-model font-medium">{data.gateway.model}</span>
                <span className="badge badge-sm">v{data.gateway.version}</span>
              </div>
              <div className="gw-meta-row">
                <span className="gw-host font-mono text-muted">{data.gateway.hostname}</span>
                <span className="gw-uptime text-muted">
                  Up {Math.floor((data.gateway.uptime || 0) / 86400)}d {Math.floor(((data.gateway.uptime || 0) % 86400) / 3600)}h
                </span>
              </div>
              <div className="gw-ips-row">
                <span className="gw-ip font-mono">WAN: {data.gateway.wanIp}</span>
                <span className="gw-ip font-mono">LAN: {data.gateway.lanIp}</span>
              </div>

              {(data.gateway.cpuUsage != null || data.gateway.memUsage != null) && (
                <div className="gauge-dual-row">
                  {data.gateway.cpuUsage != null && (
                    <div className="mini-gauge">
                      <div className="gauge-header">
                        <span>CPU</span>
                        <span className="font-mono">{Math.round(data.gateway.cpuUsage * 100)}%</span>
                      </div>
                      <div className="progress-bar-track">
                        <div
                          className="progress-bar-fill info"
                          style={{ width: `${Math.min(100, Math.round(data.gateway.cpuUsage * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {data.gateway.memUsage != null && (
                    <div className="mini-gauge">
                      <div className="gauge-header">
                        <span>Memory</span>
                        <span className="font-mono">{Math.round(data.gateway.memUsage * 100)}%</span>
                      </div>
                      <div className="progress-bar-track">
                        <div
                          className="progress-bar-fill accent"
                          style={{ width: `${Math.min(100, Math.round(data.gateway.memUsage * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="unifi-stats-cards">
            <div className="unifi-stat-card">
              <span className="unifi-stat-v">{data?.clientsTotal ?? 0}</span>
              <span className="unifi-stat-k">Active Clients</span>
              <span className="unifi-stat-sub">
                {data?.clientsWifi ?? 0} WiFi / {data?.clientsWired ?? 0} Wired
              </span>
            </div>

            <div className="unifi-stat-card">
              <span className="unifi-stat-v">{data?.devicesAdopted ?? 0}</span>
              <span className="unifi-stat-k">UniFi Devices</span>
              <span className="unifi-stat-sub">All adopted & healthy</span>
            </div>
          </div>

          {data?.speedtest && (
            <div className="unifi-speedtest-box">
              <div className="speedtest-header">
                <span>ISP Speed & Latency</span>
                <span className="speedtest-ping font-mono">{data.speedtest.pingMs} ms</span>
              </div>
              <div className="speedtest-speeds">
                <div className="speed-col">
                  <span className="speed-lbl">Download</span>
                  <span className="speed-num font-mono">{data.speedtest.downloadMbps} Mbps</span>
                </div>
                <div className="speed-col">
                  <span className="speed-lbl">Upload</span>
                  <span className="speed-num font-mono">{data.speedtest.uploadMbps} Mbps</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NginxWidget({
  title = 'Nginx Reverse Proxy',
  response,
  loading,
}: {
  title?: string;
  response?: ServiceDataResponse<NginxStatus>;
  loading?: boolean;
}) {
  const data = response?.data;
  const isOk = response?.ok && data;

  return (
    <div className="homelab-widget nginx-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon nginx-badge">
            <Icon name="globe" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">{data?.version || 'Nginx Proxy'}</span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className="status-indicator online" />
          <span>{data?.activeConnections ?? 0} Active Conns</span>
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to Nginx: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="nginx-content">
          {data?.proxyHosts && data.proxyHosts.length > 0 ? (
            <div className="proxy-hosts-wrap">
              <span className="subheading">Forwarded Proxy Hosts</span>
              <div className="proxy-hosts-scroll">
                {data.proxyHosts.map((h, i) => (
                  <div key={i} className="proxy-host-row">
                    <span className="host-domain font-mono">{h.domain}</span>
                    <span className="host-arrow">→</span>
                    <span className="host-dest font-mono text-muted">{h.forwardHost}</span>
                    <span className="host-ssl badge badge-sm">{h.ssl ? 'SSL' : 'HTTP'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="nginx-stats-grid">
              <div className="stat-tile">
                <span className="stat-k">Total Requests</span>
                <span className="stat-v">{data?.requests?.toLocaleString() ?? 0}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-k">Writing</span>
                <span className="stat-v">{data?.writing ?? 0}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-k">Waiting</span>
                <span className="stat-v">{data?.waiting ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
