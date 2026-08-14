import { Icon } from '../common/Icon';
import type { PlexStatus, TautulliStatus, AudiobookshelfStatus, SeerStatus, ServiceDataResponse } from '../../types/homelab';

export function PlexWidget({
  title = 'Plex Media Server',
  response,
  tautulliResponse,
  loading,
}: {
  title?: string;
  response?: ServiceDataResponse<PlexStatus>;
  tautulliResponse?: ServiceDataResponse<TautulliStatus>;
  loading?: boolean;
}) {
  const data = response?.data;
  const isOk = response?.ok && data;
  const tautulliData = tautulliResponse?.data;
  const sessions = data?.sessions || [];

  return (
    <div className="homelab-widget plex-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon plex-badge">
            <Icon name="plex" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">
              {data?.serverName || 'Plex'} • {sessions.length} Stream{sessions.length === 1 ? '' : 's'} Active
            </span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className={`status-indicator ${sessions.length > 0 ? 'online' : 'idle'}`} />
          <span>
            {sessions.length > 0
              ? `${sessions.length} Playing`
              : 'Idle'}
          </span>
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to Plex: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="plex-content">
          {sessions.length === 0 ? (
            <div className="empty-stream-state">
              <Icon name="play" size={24} className="text-muted" />
              <span>No active Plex media streams right now</span>
            </div>
          ) : (
            <div className="stream-sessions-list">
              {sessions.map((s, idx) => (
                <div key={idx} className="stream-session-card">
                  <div className="session-top-row">
                    <div className="session-user-wrap">
                      <span className="stream-user-avatar">{s.user.charAt(0).toUpperCase()}</span>
                      <div className="session-user-text">
                        <span className="stream-user font-medium">{s.user}</span>
                        <span className="stream-device text-muted">{s.player}</span>
                      </div>
                    </div>
                    <span className={`stream-state badge badge-sm ${s.state === 'playing' ? 'badge-success' : 'badge-outline'}`}>
                      {s.state}
                    </span>
                  </div>
                  <div className="session-title-row">
                    <span className="stream-title">{s.title}</span>
                    <span className="stream-type text-muted">{s.type}</span>
                  </div>
                  <div className="progress-bar-track">
                    <div
                      className="progress-bar-fill warning"
                      style={{ width: `${s.progressPercent}%` }}
                    />
                  </div>
                  <div className="session-footer-row">
                    <span className="stream-pct text-muted">{s.progressPercent}% watched</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tautulliData && (
            <div className="tautulli-summary-row">
              <span className="stat-label">Tautulli Total Bandwidth:</span>
              <span className="font-mono text-accent">
                {Math.round(tautulliData.totalBandwidthKbps / 1000)} Mbps
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SeerWidget({
  title = 'Overseerr Requests',
  response,
  loading,
}: {
  title?: string;
  response?: ServiceDataResponse<SeerStatus>;
  loading?: boolean;
}) {
  const data = response?.data;
  const isOk = response?.ok && data;
  const reqs = data?.recentRequests || [];

  return (
    <div className="homelab-widget seer-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon seer-badge">
            <Icon name="film" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">Media Discovery & Requests</span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className="status-indicator online" />
          <span>{data?.pendingRequests ?? 0} Pending</span>
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to Overseerr: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="seer-content">
          <div className="seer-stats-row">
            <div className="stat-bubble">
              <span className="bubble-num font-mono">{data?.pendingRequests ?? 0}</span>
              <span className="bubble-lbl">Pending</span>
            </div>
            <div className="stat-bubble">
              <span className="bubble-num font-mono">{data?.processingRequests ?? 0}</span>
              <span className="bubble-lbl">Processing</span>
            </div>
            <div className="stat-bubble">
              <span className="bubble-num font-mono">{data?.availableRequests ?? 0}</span>
              <span className="bubble-lbl">Available</span>
            </div>
          </div>

          <div className="recent-requests-list">
            <span className="subheading">Recent Requests</span>
            {reqs.slice(0, 4).map((r) => (
              <div key={r.id} className="request-row">
                <div className="req-main">
                  <span className="req-title">{r.title}</span>
                  <span className="req-user text-muted">by {r.requestedBy}</span>
                </div>
                <div className="req-badges">
                  <span className={`badge badge-sm ${r.type === 'tv' ? 'badge-tv' : 'badge-movie'}`}>
                    {r.type === 'tv' ? 'TV' : 'Movie'}
                  </span>
                  <span className={`badge badge-sm ${r.status === 'Available' ? 'badge-success' : 'badge-outline'}`}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AudiobookshelfWidget({
  title = 'Audiobookshelf',
  response,
  loading,
}: {
  title?: string;
  response?: ServiceDataResponse<AudiobookshelfStatus>;
  loading?: boolean;
}) {
  const data = response?.data;
  const isOk = response?.ok && data;

  return (
    <div className="homelab-widget abs-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon abs-badge">
            <Icon name="book-open" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">Audiobooks & Podcasts</span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className="status-indicator online" />
          <span>{data?.totalBooks ?? 0} Audiobooks</span>
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to Audiobookshelf: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="abs-content">
          <div className="abs-stats-grid">
            <div className="stat-tile">
              <span className="stat-k">Libraries</span>
              <span className="stat-v">{data?.totalLibraries ?? 0}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">Authors</span>
              <span className="stat-v">{data?.totalAuthors ?? 0}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">Listening Time</span>
              <span className="stat-v">{data?.totalDurationHours ?? 0} hrs</span>
            </div>
          </div>

          {data?.openSessions && data.openSessions.length > 0 && (
            <div className="abs-current-listening">
              <span className="subheading">Active Listener</span>
              {data.openSessions.map((s, i) => (
                <div key={i} className="abs-session-item">
                  <div className="abs-title-row">
                    <span className="abs-book-name font-medium">{s.displayTitle}</span>
                    <span className="abs-author text-muted">{s.displayAuthor}</span>
                  </div>
                  <span className="abs-user text-muted">User: {s.user}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
