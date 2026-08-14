import { Icon } from '../common/Icon';
import type { ArrStatus, SabnzbdStatus, ArrCalendarItem, ServiceDataResponse } from '../../types/homelab';

export function ArrWidget({
  type,
  title,
  response,
  loading,
}: {
  type: 'sonarr' | 'radarr' | 'lidarr' | 'bazarr';
  title?: string;
  response?: ServiceDataResponse<ArrStatus>;
  loading?: boolean;
}) {
  const data = response?.data;
  const isOk = response?.ok && data;
  const queue = data?.queue || [];

  const defaultTitles = {
    sonarr: 'Sonarr (TV)',
    radarr: 'Radarr (Movies)',
    lidarr: 'Lidarr (Music)',
    bazarr: 'Bazarr (Subtitles)',
  };

  const icons = {
    sonarr: 'tv',
    radarr: 'film',
    lidarr: 'music',
    bazarr: 'subtitles',
  };

  const itemNames = {
    sonarr: 'Series',
    radarr: 'Movies',
    lidarr: 'Artists',
    bazarr: 'Tracks',
  };

  return (
    <div className={`homelab-widget arr-widget arr-${type}`}>
      <div className="widget-header">
        <div className="widget-title-group">
          <div className={`service-badge-icon arr-badge-${type}`}>
            <Icon name={icons[type]} size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title || defaultTitles[type]}</h3>
            <span className="widget-sub">
              {data?.totalItems ?? 0} {itemNames[type]} Managed
            </span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className="status-indicator online" />
          <span>{data?.monitoredCount ?? 0} Monitored</span>
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to {type}: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="arr-content">
          <div className="arr-stats-row">
            <div className="stat-tile">
              <span className="stat-k">Missing</span>
              <span className="stat-v text-warning">{data?.missingCount ?? 0}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">In Queue</span>
              <span className="stat-v text-info">{data?.queuedCount ?? queue.length}</span>
            </div>
          </div>

          {queue.length > 0 && (
            <div className="arr-queue-list">
              <span className="subheading">Active Activity</span>
              {queue.slice(0, 3).map((q) => (
                <div key={q.id} className="queue-row">
                  <span className="queue-title">{q.title}</span>
                  <span className="queue-status badge badge-sm">{q.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SabnzbdWidget({
  title = 'SABnzbd Downloader',
  response,
  loading,
}: {
  title?: string;
  response?: ServiceDataResponse<SabnzbdStatus>;
  loading?: boolean;
}) {
  const data = response?.data;
  const isOk = response?.ok && data;
  const slots = data?.slots || [];

  return (
    <div className="homelab-widget sabnzbd-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon sabnzbd-badge">
            <Icon name="download" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">Usenet Download Client</span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className={`status-indicator ${data?.status === 'Downloading' ? 'online' : 'idle'}`} />
          <span>{data?.speed || '0 B/s'}</span>
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to SABnzbd: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="sabnzbd-content">
          <div className="sab-speed-banner">
            <div className="speed-metric">
              <span className="metric-val font-mono">{data?.speed || '0 B/s'}</span>
              <span className="metric-lbl">Current Speed</span>
            </div>
            <div className="speed-metric">
              <span className="metric-val font-mono">{data?.sizeLeft || '0 MB'}</span>
              <span className="metric-lbl">Remaining ({data?.timeLeft || '0:00'})</span>
            </div>
          </div>

          <div className="sab-queue-list">
            <span className="subheading">Queue ({data?.queueCount ?? slots.length})</span>
            {slots.length === 0 ? (
              <div className="empty-sub text-muted">No downloads in queue</div>
            ) : (
              slots.slice(0, 3).map((slot) => (
                <div key={slot.nzo_id} className="sab-slot-card">
                  <div className="slot-title-row">
                    <span className="slot-filename">{slot.filename}</span>
                    <span className="slot-pct font-mono text-muted">{slot.percentage}%</span>
                  </div>
                  <div className="progress-bar-track">
                    <div
                      className="progress-bar-fill info"
                      style={{ width: `${slot.percentage}%` }}
                    />
                  </div>
                  <div className="slot-footer-row">
                    <span className="text-muted">{slot.sizeleft} left</span>
                    <span className="text-muted">{slot.timeleft}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CalendarWidget({
  title = 'Upcoming Releases Calendar',
  calendarItems = [],
  loading = false,
  fullPage = false,
}: {
  title?: string;
  calendarItems: ArrCalendarItem[];
  loading?: boolean;
  fullPage?: boolean;
}) {
  return (
    <div className={`homelab-widget calendar-widget${fullPage ? ' calendar-widget-full' : ''}`}>
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon calendar-badge">
            <Icon name="calendar" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">Sonarr & Radarr Upcoming Airings</span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className="status-indicator online" />
          <span>{calendarItems.length} Scheduled</span>
        </div>
      </div>

      {calendarItems.length === 0 ? (
        <div className="empty-widget-state">
          <span>{loading ? 'Fetching release schedule…' : 'No upcoming releases scheduled in the next 14 days.'}</span>
        </div>
      ) : (
        <div className="calendar-items-grid">
          {calendarItems.map((item) => {
            const date = new Date(item.airDateUtc);
            const dateStr = date.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const isShow = item.type === 'episode';
            const se = isShow && item.seasonNumber != null ? `S${String(item.seasonNumber).padStart(2, '0')}` : null;
            const ep = isShow && item.episodeNumber != null ? `E${String(item.episodeNumber).padStart(2, '0')}` : null;

            return (
              <div key={item.id} className="calendar-release-card">
                {item.posterUrl ? (
                  <img
                    className="cal-poster"
                    src={item.posterUrl}
                    alt={item.seriesTitle || item.title}
                    loading="lazy"
                  />
                ) : (
                  <div className="cal-poster cal-poster-fallback">
                    <Icon name="film" size={20} />
                  </div>
                )}
                <div className="cal-date-badge">
                  <span className="cal-date-text">{dateStr}</span>
                  <span className="cal-time-text">{timeStr}</span>
                </div>
                <div className="cal-details">
                  <div className="cal-title-row">
                    <span className="cal-main-title">
                      {item.seriesTitle ? (
                        <>
                          <span className="cal-show-title">{item.seriesTitle}</span>
                          {se && ep ? (
                            <span className="cal-ep-badge font-mono">{se}{ep}</span>
                          ) : (
                            <span className="cal-ep-text text-muted"> - {item.title}</span>
                          )}
                        </>
                      ) : (
                        item.title
                      )}
                    </span>
                  </div>
                  <div className="cal-meta-row">
                    <span className={`badge badge-sm badge-${item.serviceType}`}>
                      {item.serviceType.toUpperCase()}
                    </span>
                    <span className="badge badge-outline">
                      {item.hasFile ? 'Downloaded' : 'Missing / Scheduled'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
