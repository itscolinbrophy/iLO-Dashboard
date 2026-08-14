import { Icon } from '../common/Icon';
import type { PortainerStatus, ServiceDataResponse } from '../../types/homelab';

export function PortainerWidget({
  title = 'Portainer Containers',
  response,
  loading,
}: {
  title?: string;
  response?: ServiceDataResponse<PortainerStatus>;
  loading?: boolean;
}) {
  const data = response?.data;
  const isOk = response?.ok && data;
  const containers = data?.containers || [];

  return (
    <div className="homelab-widget portainer-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon portainer-badge">
            <Icon name="box" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">
              {data?.endpointName || 'Docker Host'} • Docker v{data?.dockerVersion || '27.x'}
            </span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className="status-indicator online" />
          <span>{data?.containersRunning ?? 0} Running</span>
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to Portainer: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="portainer-content">
          <div className="portainer-stats-grid">
            <div className="stat-tile">
              <span className="stat-k">Running</span>
              <span className="stat-v text-success">{data?.containersRunning ?? 0}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">Stopped</span>
              <span className="stat-v text-muted">{data?.containersStopped ?? 0}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">Stacks</span>
              <span className="stat-v text-accent">{data?.stacksCount ?? 0}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">Images</span>
              <span className="stat-v">{data?.imagesCount ?? 0}</span>
            </div>
          </div>

          <div className="containers-list">
            <span className="subheading">Containers</span>
            <div className="container-table">
              {containers.slice(0, 6).map((c) => (
                <div key={c.id} className="container-row">
                  <span className={`container-dot ${c.state === 'running' ? 'on' : 'off'}`} />
                  <span className="container-name font-medium">{c.name}</span>
                  <span className="container-image font-mono text-muted">{c.image}</span>
                  <span className="container-status text-muted">{c.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
