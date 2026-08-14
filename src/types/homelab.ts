/**
 * Homelab Unified Data Types and Definitions
 */

export type ServiceType =
  | 'ilo'
  | 'peanut'
  | 'plex'
  | 'tautulli'
  | 'audiobookshelf'
  | 'seer'
  | 'sonarr'
  | 'radarr'
  | 'lidarr'
  | 'bazarr'
  | 'sabnzbd'
  | 'nginx'
  | 'opnsense'
  | 'pve'
  | 'pbs'
  | 'unifi'
  | 'portainer'
  | 'quicklinks'
  | 'calendar'
  | 'custom_iframe';

export type ServiceCategory =
  | 'overview'
  | 'hardware'
  | 'media'
  | 'arrs'
  | 'downloads'
  | 'infrastructure'
  | 'network'
  | 'links';

export interface ServiceEndpointConfig {
  id: string;
  type: ServiceType;
  name: string;
  category: ServiceCategory;
  host: string; // Base URL, e.g. "http://192.168.1.50:8989" or "https://pve.local:8006"
  apiKey?: string; // For Sonarr, Radarr, Lidarr, Bazarr, SABnzbd, Seer, Tautulli, PVE Token, OPNsense Key
  apiSecret?: string; // For OPNsense Secret, PVE Secret, etc.
  username?: string; // For iLO, PeaNUT, Unifi, Portainer, Audiobookshelf
  password?: string; // For iLO, PeaNUT, etc.
  sotf?: boolean; // For iLO Silence of the Fans
  customHeaders?: Record<string, string>;
  disabled?: boolean;
}

export interface QuickLink {
  id: string;
  title: string;
  url: string;
  icon?: string; // Icon identifier or SVG name or emoji
  category?: string;
  description?: string;
  openNewTab?: boolean;
}

export interface WidgetLayoutItem {
  id: string; // unique widget instance id
  serviceId?: string; // Reference to configured ServiceEndpointConfig id
  type: ServiceType;
  title?: string;
  colSpan: number; // 1 to 4 columns wide
  rowSpan?: number; // optional vertical stretch
  config?: Record<string, any>; // custom per-widget preferences (e.g. compact mode, calendar days, etc.)
}

export interface DashboardLayoutConfig {
  columns: number; // default 3 or 4
  gap: number;
  widgets: WidgetLayoutItem[];
}

export interface HomelabConfig {
  services: ServiceEndpointConfig[];
  quickLinks: QuickLink[];
  dashboardLayout: DashboardLayoutConfig;
  theme?: 'dark' | 'midnight' | 'cyber';
  refreshInterval: number | null; // in seconds
}

/* ------------------- Service Payload Types ------------------- */

export interface PeanutStatus {
  batteryChargePercent: number | null;
  batteryRuntimeSeconds: number | null;
  batteryVoltage: number | null;
  inputVoltage: number | null;
  outputVoltage: number | null;
  upsLoadPercent: number | null;
  upsRealPowerWatts: number | null;
  upsStatus: string; // OL (On line), OB (On battery), LB (Low battery), etc.
  model: string | null;
  mfr: string | null;
}

export interface PlexStatus {
  serverName: string;
  version: string;
  activeSessionsCount: number;
  sessions: Array<{
    user: string;
    title: string;
    type: string; // movie, episode, track
    progressPercent: number;
    state: 'playing' | 'paused' | 'buffering';
    player: string;
    thumb?: string;
  }>;
}

export interface TautulliStatus {
  streamCount: number;
  totalBandwidthKbps: number;
  activity: Array<{
    user: string;
    title: string;
    mediaType: string;
    state: string;
    progress: number;
    quality: string;
    transcodeDecision: string;
  }>;
}

export interface AudiobookshelfStatus {
  totalLibraries: number;
  totalBooks: number;
  totalAuthors: number;
  totalDurationHours: number;
  openSessions: Array<{
    user: string;
    displayTitle: string;
    displayAuthor: string;
    currentTime: number;
    duration: number;
  }>;
}

export interface SeerStatus {
  totalRequests: number;
  pendingRequests: number;
  processingRequests: number;
  availableRequests: number;
  recentRequests: Array<{
    id: number;
    title: string;
    type: 'movie' | 'tv';
    status: string;
    requestedBy: string;
    posterPath?: string;
  }>;
}

export interface ArrQueueItem {
  id: number;
  title: string;
  size: number;
  sizeleft: number;
  status: string;
  timeleft?: string;
  estimatedCompletionTime?: string;
}

export interface ArrCalendarItem {
  id: number;
  title: string;
  seriesTitle?: string;
  airDateUtc: string;
  hasFile: boolean;
  monitored: boolean;
  type: 'movie' | 'episode' | 'album';
  serviceType: 'sonarr' | 'radarr' | 'lidarr';
  posterUrl?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface ArrStatus {
  service: 'sonarr' | 'radarr' | 'lidarr' | 'bazarr';
  version?: string;
  totalItems: number; // Series, Movies, Artists
  monitoredCount?: number;
  missingCount?: number;
  queuedCount?: number;
  queue?: ArrQueueItem[];
  upcomingCalendar?: ArrCalendarItem[];
  warnings?: string[];
}

export interface SabnzbdStatus {
  status: string; // Downloading, Idle, Paused
  speed: string; // "12.5 MB/s"
  sizeLeft: string;
  timeLeft: string;
  queueCount: number;
  paused: boolean;
  slots: Array<{
    nzo_id: string;
    filename: string;
    percentage: number;
    size: string;
    sizeleft: string;
    timeleft: string;
    status: string;
  }>;
}

export interface PveNodeStatus {
  node: string;
  status: string; // online, offline
  cpuUsagePercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  uptimeSeconds: number;
  vmsRunning: number;
  vmsTotal: number;
  lxcRunning: number;
  lxcTotal: number;
}

export interface PveStatus {
  clusterName?: string;
  nodes: PveNodeStatus[];
  totalVms: number;
  runningVms: number;
  vms: Array<{
    vmid: number;
    name: string;
    status: 'running' | 'stopped';
    type: 'qemu' | 'lxc';
    node: string;
    cpu: number;
    mem: number;
    maxmem: number;
  }>;
}

export interface PbsStatus {
  status: string;
  datastores: Array<{
    store: string;
    totalBytes: number;
    usedBytes: number;
    availBytes: number;
    usagePercent: number;
  }>;
  activeTasks: Array<{
    workerType: string;
    id: string;
    starttime: number;
    status?: string;
  }>;
}

export interface UnifiGatewayInfo {
  model: string;
  version: string;
  uptime: number;
  hostname: string;
  wanIp: string;
  lanIp: string;
  cpuUsage: number | null;
  memUsage: number | null;
  loadavg: number[] | null;
  tempCelsius: number | null;
}

export interface UnifiStatus {
  siteName: string;
  gateway?: UnifiGatewayInfo;
  wanStatus: string; // connected, disconnected
  wanIp?: string;
  latencyMs?: number;
  speedtest?: {
    downloadMbps: number;
    uploadMbps: number;
    pingMs: number;
  };
  clientsTotal: number;
  clientsWifi: number;
  clientsWired: number;
  devicesTotal: number;
  devicesAdopted: number;
  devicesPending: number;
}

export interface OpnsenseStatus {
  system: {
    hostname: string;
    version: string;
    cpuUsagePercent: number;
    memUsagePercent: number;
    uptime: string;
    tempCelsius?: number;
  };
  wan?: {
    publicIp: string | null;
    status: string;
    delayMs: number | null;
    lossPercent: number | null;
  };
  traffic?: {
    device: string;
    ingressBytes: number;
    egressBytes: number;
    ingressMbps: number;
    egressMbps: number;
    inPackets: number;
    outPackets: number;
    inErrors: number;
    outErrors: number;
  } | null;
  interfaces: Array<{
    name: string;
    device: string;
    ip: string;
    status: 'up' | 'down';
    inBytes: number;
    outBytes: number;
  }>;
  gateways: Array<{
    name: string;
    status: string; // online, offline, degraded
    delayMs: number;
    lossPercent: number;
  }>;
}

export interface PortainerStatus {
  endpointName: string;
  dockerVersion: string;
  containersTotal: number;
  containersRunning: number;
  containersStopped: number;
  imagesCount: number;
  volumesCount: number;
  stacksCount: number;
  containers: Array<{
    id: string;
    name: string;
    image: string;
    state: string; // running, exited
    status: string;
    created: number;
  }>;
}

export interface NginxStatus {
  version?: string;
  activeConnections: number;
  accepted: number;
  handled: number;
  requests: number;
  reading: number;
  writing: number;
  waiting: number;
  proxyHosts?: Array<{
    domain: string;
    forwardHost: string;
    enabled: boolean;
    ssl: boolean;
  }>;
}

export interface ServiceDataResponse<T = any> {
  ok: boolean;
  serviceId: string;
  type: ServiceType;
  fetchedAt: string;
  latencyMs?: number;
  error?: string;
  data?: T;
}
