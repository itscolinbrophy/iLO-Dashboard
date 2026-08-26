import { QuickLinksWidget } from './widgets/QuickLinksWidget';
import { PeanutWidget } from './widgets/PeanutWidget';
import { PveWidget, PbsWidget } from './widgets/PveWidget';
import { OpnsenseWidget, UnifiWidget, NginxWidget } from './widgets/NetworkWidgets';
import { PlexWidget, SeerWidget, AudiobookshelfWidget } from './widgets/MediaWidgets';
import { ArrWidget, SabnzbdWidget, CalendarWidget } from './widgets/ArrWidgets';
import { PortainerWidget } from './widgets/PortainerWidget';
import { TelemetryDashboard } from './TelemetryDashboard';
import type { HomelabConfig, ServiceDataResponse, ArrCalendarItem } from '../types/homelab';
import type { IloEndpoint, TelemetryMap } from '../types/ilo';

interface DedicatedCategoryViewProps {
  category: string;
  config: HomelabConfig;
  servicesStatus: Record<string, ServiceDataResponse>;
  calendarItems: ArrCalendarItem[];
  iloEndpoints: IloEndpoint[];
  iloTelemetry: TelemetryMap;
  loading: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

export function DedicatedCategoryView({
  category,
  config,
  servicesStatus,
  calendarItems,
  iloEndpoints,
  iloTelemetry,
  loading,
  onRefresh,
  onOpenSettings,
}: DedicatedCategoryViewProps) {
  switch (category) {
    case 'quicklinks':
      return (
        <div className="category-view-container">
          <div className="view-header">
            <h2>Quick Launchpad</h2>
            <p className="subtext">Direct links to your homelab servers, services and web interfaces.</p>
          </div>
          <QuickLinksWidget
            links={config.quickLinks || []}
            onAddLink={onOpenSettings}
            readOnly={false}
          />
        </div>
      );

    case 'ilo':
      return (
        <div className="category-view-container">
          <div className="view-header">
            <h2>iLO & Hardware Telemetry</h2>
            <p className="subtext">
              Live telemetry and fan control. Manage iLO endpoints from the settings menu.
            </p>
          </div>
          <div className="grid-2col">
            <div className="full-width">
              <TelemetryDashboard
                endpoints={iloEndpoints}
                telemetry={iloTelemetry}
                loading={loading}
                lastUpdated={new Date()}
                onRefresh={onRefresh}
                tempColumns={2}
                tempRows={2}
                refreshInterval={config.refreshInterval}
              />
            </div>
            <div className="full-width" style={{ marginTop: 16 }}>
              {Object.values(servicesStatus)
                .filter((s) => s.type === 'peanut')
                .map((p) => (
                  <PeanutWidget key={p.serviceId} response={p} loading={loading} />
                ))}
            </div>
          </div>
        </div>
      );

    case 'infrastructure': {
      const pve = Object.values(servicesStatus).find((s) => s.type === 'pve');
      const pbs = Object.values(servicesStatus).find((s) => s.type === 'pbs');
      const portainer = Object.values(servicesStatus).find((s) => s.type === 'portainer');

      return (
        <div className="category-view-container">
          <div className="view-header">
            <h2>Virtualization & Containers</h2>
            <p className="subtext">Proxmox VE hypervisors, PBS backup datastores and Portainer Docker fleets.</p>
          </div>
          <div className="category-grid-layout">
            <div className="grid-col-2">
              <PveWidget
                title="Proxmox VE Cluster"
                response={pve}
                loading={loading}
                serviceId={pve?.serviceId}
                onRefresh={onRefresh}
              />
            </div>
            <div className="grid-col-1">
              <PbsWidget title="Proxmox Backup Server" response={pbs} loading={loading} />
            </div>
            <div className="grid-col-3">
              <PortainerWidget title="Portainer Docker Engine" response={portainer} loading={loading} />
            </div>
          </div>
        </div>
      );
    }

    case 'network': {
      const opnsense = Object.values(servicesStatus).find((s) => s.type === 'opnsense');
      const unifi = Object.values(servicesStatus).find((s) => s.type === 'unifi');
      const nginx = Object.values(servicesStatus).find((s) => s.type === 'nginx');

      return (
        <div className="category-view-container">
          <div className="view-header">
            <h2>Network, Routing & Firewalls</h2>
            <p className="subtext">OPNsense core firewall, UniFi access points and NGINX reverse proxy manager.</p>
          </div>
          <div className="category-grid-layout">
            <div className="grid-col-2">
              <OpnsenseWidget response={opnsense} loading={loading} onRefresh={onRefresh} />
            </div>
            <div className="grid-col-1">
              <UnifiWidget response={unifi} loading={loading} />
            </div>
            <div className="grid-col-3">
              <NginxWidget response={nginx} loading={loading} />
            </div>
          </div>
        </div>
      );
    }

    case 'media': {
      const plex = Object.values(servicesStatus).find((s) => s.type === 'plex');
      const tautulli = Object.values(servicesStatus).find((s) => s.type === 'tautulli');
      const seer = Object.values(servicesStatus).find((s) => s.type === 'seer');
      const abs = Object.values(servicesStatus).find((s) => s.type === 'audiobookshelf');

      return (
        <div className="category-view-container">
          <div className="view-header">
            <h2>Media & Streaming</h2>
            <p className="subtext">Plex media sessions, Tautulli analytics, Overseerr requests, and Audiobookshelf.</p>
          </div>
          <div className="category-grid-layout">
            <div className="grid-col-2">
              <PlexWidget response={plex} tautulliResponse={tautulli} loading={loading} />
            </div>
            <div className="grid-col-1">
              <SeerWidget response={seer} loading={loading} />
            </div>
            <div className="grid-col-3">
              <AudiobookshelfWidget response={abs} loading={loading} />
            </div>
          </div>
        </div>
      );
    }

    case 'arrs': {
      const sonarr = Object.values(servicesStatus).find((s) => s.type === 'sonarr');
      const radarr = Object.values(servicesStatus).find((s) => s.type === 'radarr');
      const lidarr = Object.values(servicesStatus).find((s) => s.type === 'lidarr');
      const bazarr = Object.values(servicesStatus).find((s) => s.type === 'bazarr');

      return (
        <div className="category-view-container">
          <div className="view-header">
            <h2>Servarr Automation</h2>
            <p className="subtext">Automated media acquisition across TV, Movies, Music and Subtitles.</p>
          </div>
          <div className="category-grid-layout">
            <div className="grid-col-1">
              <ArrWidget type="sonarr" response={sonarr} loading={loading} />
            </div>
            <div className="grid-col-1">
              <ArrWidget type="radarr" response={radarr} loading={loading} />
            </div>
            <div className="grid-col-1">
              <ArrWidget type="lidarr" response={lidarr} loading={loading} />
            </div>
            <div className="grid-col-1">
              <ArrWidget type="bazarr" response={bazarr} loading={loading} />
            </div>
            <div className="grid-col-3">
              <CalendarWidget calendarItems={calendarItems} loading={loading} />
            </div>
          </div>
        </div>
      );
    }

    case 'calendar':
      return (
        <div className="category-view-container">
          <div className="view-header">
            <h2>Unified Media Release Calendar</h2>
            <p className="subtext">Upcoming TV show episodes, movie premieres, and music releases from Sonarr and Radarr.</p>
          </div>
          <CalendarWidget fullPage calendarItems={calendarItems} loading={loading} />
        </div>
      );

    case 'downloads': {
      const sab = Object.values(servicesStatus).find((s) => s.type === 'sabnzbd');
      return (
        <div className="category-view-container">
          <div className="view-header">
            <h2>Downloads & Usenet Queue</h2>
            <p className="subtext">SABnzbd download progress, bandwidth speeds and active queue.</p>
          </div>
          <SabnzbdWidget response={sab} loading={loading} />
        </div>
      );
    }

    default:
      return <div>Select a menu category from the sidebar.</div>;
  }
}
