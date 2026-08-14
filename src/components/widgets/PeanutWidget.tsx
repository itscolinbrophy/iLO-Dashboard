import { Icon } from '../common/Icon';
import type { PeanutStatus, ServiceDataResponse } from '../../types/homelab';

interface PeanutWidgetProps {
  title?: string;
  response?: ServiceDataResponse<PeanutStatus>;
  loading?: boolean;
}

export function PeanutWidget({ title = 'PeaNUT UPS Power', response, loading }: PeanutWidgetProps) {
  const data = response?.data;
  const isOk = response?.ok && data;

  const charge = data?.batteryChargePercent ?? 100;
  const load = data?.upsLoadPercent ?? 0;
  const runtimeMins = data?.batteryRuntimeSeconds ? Math.round(data.batteryRuntimeSeconds / 60) : 0;
  const isOnline = data?.upsStatus?.includes('OL');

  return (
    <div className="homelab-widget peanut-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon peanut-badge">
            <Icon name="zap" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">
              {data?.mfr} {data?.model || 'Network UPS'}
            </span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className={`status-indicator ${isOnline ? 'online' : 'warning'}`} />
          <span>{data?.upsStatus || (loading ? 'Connecting…' : 'Offline')}</span>
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to PeaNUT daemon: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="peanut-content">
          <div className="peanut-gauges">
            <div className="gauge-item">
              <div className="gauge-label">Battery Level</div>
              <div className="gauge-value-row">
                <span className="gauge-val">{charge}%</span>
                <span className="gauge-sub">{runtimeMins} min runtime</span>
              </div>
              <div className="progress-bar-track">
                <div
                  className={`progress-bar-fill ${charge > 50 ? 'success' : charge > 20 ? 'warning' : 'danger'}`}
                  style={{ width: `${Math.min(100, Math.max(0, charge))}%` }}
                />
              </div>
            </div>

            <div className="gauge-item">
              <div className="gauge-label">UPS Load</div>
              <div className="gauge-value-row">
                <span className="gauge-val">{load}%</span>
                <span className="gauge-sub">{data?.upsRealPowerWatts ?? 0} Watts</span>
              </div>
              <div className="progress-bar-track">
                <div
                  className={`progress-bar-fill ${load < 60 ? 'info' : load < 85 ? 'warning' : 'danger'}`}
                  style={{ width: `${Math.min(100, Math.max(0, load))}%` }}
                />
              </div>
            </div>
          </div>

          <div className="peanut-stats-grid">
            <div className="stat-tile">
              <span className="stat-k">Input Voltage</span>
              <span className="stat-v">{data?.inputVoltage ?? 120} V</span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">Output Voltage</span>
              <span className="stat-v">{data?.outputVoltage ?? 120} V</span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">Battery Voltage</span>
              <span className="stat-v">{data?.batteryVoltage ?? 27.2} V</span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">Real Power</span>
              <span className="stat-v">{data?.upsRealPowerWatts ?? 0} W</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
