/**
 * Homelab Configuration Storage (services, quick links, dashboard widgets, settings)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, 'homelab-config.json');

const DEFAULT_CONFIG = {
  services: [
    {
      id: 'demo-peanut',
      type: 'peanut',
      name: 'APC Smart-UPS 1500 (PeaNUT)',
      category: 'hardware',
      host: 'http://demo.peanut.local:8080',
    },
    {
      id: 'demo-pve',
      type: 'pve',
      name: 'Proxmox Cluster',
      category: 'infrastructure',
      host: 'https://demo.pve.local:8006',
    },
    {
      id: 'demo-pbs',
      type: 'pbs',
      name: 'Proxmox Backup Server',
      category: 'infrastructure',
      host: 'https://demo.pbs.local:8007',
    },
    {
      id: 'demo-unifi',
      type: 'unifi',
      name: 'UniFi Dream Machine',
      category: 'network',
      host: 'https://demo.unifi.local',
    },
    {
      id: 'demo-opnsense',
      type: 'opnsense',
      name: 'OPNsense Firewall',
      category: 'network',
      host: 'https://demo.opnsense.local',
    },
    {
      id: 'demo-portainer',
      type: 'portainer',
      name: 'Primary Portainer',
      category: 'infrastructure',
      host: 'http://demo.portainer.local:9000',
    },
    {
      id: 'demo-plex',
      type: 'plex',
      name: 'Plex Media Server',
      category: 'media',
      host: 'http://demo.plex.local:32400',
    },
    {
      id: 'demo-tautulli',
      type: 'tautulli',
      name: 'Tautulli Monitoring',
      category: 'media',
      host: 'http://demo.tautulli.local:8181',
    },
    {
      id: 'demo-seer',
      type: 'seer',
      name: 'Overseerr Requests',
      category: 'media',
      host: 'http://demo.overseerr.local:5055',
    },
    {
      id: 'demo-sonarr',
      type: 'sonarr',
      name: 'Sonarr TV',
      category: 'arrs',
      host: 'http://demo.sonarr.local:8989',
    },
    {
      id: 'demo-radarr',
      type: 'radarr',
      name: 'Radarr Movies',
      category: 'arrs',
      host: 'http://demo.radarr.local:7878',
    },
    {
      id: 'demo-lidarr',
      type: 'lidarr',
      name: 'Lidarr Music',
      category: 'arrs',
      host: 'http://demo.lidarr.local:8686',
    },
    {
      id: 'demo-bazarr',
      type: 'bazarr',
      name: 'Bazarr Subtitles',
      category: 'arrs',
      host: 'http://demo.bazarr.local:6767',
    },
    {
      id: 'demo-sabnzbd',
      type: 'sabnzbd',
      name: 'SABnzbd Downloader',
      category: 'downloads',
      host: 'http://demo.sabnzbd.local:8080',
    },
    {
      id: 'demo-audiobookshelf',
      type: 'audiobookshelf',
      name: 'Audiobookshelf',
      category: 'media',
      host: 'http://demo.audiobookshelf.local:13378',
    },
    {
      id: 'demo-nginx',
      type: 'nginx',
      name: 'Nginx Proxy Manager',
      category: 'network',
      host: 'http://demo.npm.local:81',
    },
  ],
  spotify: {
    clientId: '',
    clientSecret: '',
    lidarrRootFolder: '',
    lidarrQualityProfileId: null,
    lidarrMetadataProfileId: null,
  },
  quickLinks: [
    {
      id: 'ql-1',
      title: 'Proxmox VE',
      url: 'https://pve.local:8006',
      icon: 'server',
      category: 'Infrastructure',
      description: 'VM & Container Hypervisor',
      openNewTab: true,
    },
    {
      id: 'ql-2',
      title: 'OPNsense',
      url: 'https://10.0.0.1',
      icon: 'shield',
      category: 'Networking',
      description: 'Core Firewall & Routing',
      openNewTab: true,
    },
    {
      id: 'ql-3',
      title: 'UniFi Network',
      url: 'https://unifi.local',
      icon: 'wifi',
      category: 'Networking',
      description: 'Switches, APs & Gateway',
      openNewTab: true,
    },
    {
      id: 'ql-4',
      title: 'Portainer',
      url: 'http://portainer.local:9000',
      icon: 'box',
      category: 'Infrastructure',
      description: 'Docker Container Management',
      openNewTab: true,
    },
    {
      id: 'ql-5',
      title: 'Plex Web',
      url: 'https://app.plex.tv/desktop',
      icon: 'play',
      category: 'Media',
      description: 'Stream Movies & TV Shows',
      openNewTab: true,
    },
    {
      id: 'ql-6',
      title: 'Overseerr',
      url: 'http://overseerr.local:5055',
      icon: 'film',
      category: 'Media',
      description: 'Request Movies & Shows',
      openNewTab: true,
    },
    {
      id: 'ql-7',
      title: 'Sonarr',
      url: 'http://sonarr.local:8989',
      icon: 'tv',
      category: 'Servarr',
      description: 'TV Series Automation',
      openNewTab: true,
    },
    {
      id: 'ql-8',
      title: 'Radarr',
      url: 'http://radarr.local:7878',
      icon: 'film',
      category: 'Servarr',
      description: 'Movie Collection Manager',
      openNewTab: true,
    },
    {
      id: 'ql-9',
      title: 'Audiobookshelf',
      url: 'http://audiobookshelf.local:13378',
      icon: 'book-open',
      category: 'Media',
      description: 'Audiobooks & Podcasts',
      openNewTab: true,
    },
    {
      id: 'ql-10',
      title: 'SABnzbd',
      url: 'http://sabnzbd.local:8080',
      icon: 'download',
      category: 'Downloads',
      description: 'Usenet Binary Downloader',
      openNewTab: true,
    },
  ],
  dashboardLayout: {
    columns: 3,
    gap: 16,
    widgets: [
      { id: 'w-links', type: 'quicklinks', title: 'Quick Launchpad', colSpan: 3 },
      { id: 'w-ilo', type: 'ilo', title: 'iLO Fleet Overview', colSpan: 2 },
      { id: 'w-peanut', serviceId: 'demo-peanut', type: 'peanut', title: 'PeaNUT UPS Power', colSpan: 1 },
      { id: 'w-pve', serviceId: 'demo-pve', type: 'pve', title: 'Proxmox Virtual Environment', colSpan: 2 },
      { id: 'w-unifi', serviceId: 'demo-unifi', type: 'unifi', title: 'UniFi Network Gateway', colSpan: 1 },
      { id: 'w-opnsense', serviceId: 'demo-opnsense', type: 'opnsense', title: 'OPNsense Firewall', colSpan: 2 },
      { id: 'w-portainer', serviceId: 'demo-portainer', type: 'portainer', title: 'Portainer Containers', colSpan: 1 },
      { id: 'w-calendar', type: 'calendar', title: 'Arr Upcoming Release Calendar', colSpan: 2 },
      { id: 'w-sabnzbd', serviceId: 'demo-sabnzbd', type: 'sabnzbd', title: 'SABnzbd Activity', colSpan: 1 },
      { id: 'w-plex', serviceId: 'demo-plex', type: 'plex', title: 'Plex & Tautulli Stream Monitor', colSpan: 2 },
      { id: 'w-seer', serviceId: 'demo-seer', type: 'seer', title: 'Overseerr Requests', colSpan: 1 },
      { id: 'w-audiobookshelf', serviceId: 'demo-audiobookshelf', type: 'audiobookshelf', title: 'Audiobookshelf Library', colSpan: 1 },
      { id: 'w-nginx', serviceId: 'demo-nginx', type: 'nginx', title: 'Nginx Reverse Proxy', colSpan: 2 },
      { id: 'w-pbs', serviceId: 'demo-pbs', type: 'pbs', title: 'Proxmox Backup Server', colSpan: 1 },
    ],
  },
  refreshInterval: 15,
};

export function loadHomelabConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      saveHomelabConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      ...DEFAULT_CONFIG,
      ...data,
      services: data.services || DEFAULT_CONFIG.services,
quickLinks: data.quickLinks || DEFAULT_CONFIG.quickLinks,
    dashboardLayout: data.dashboardLayout || DEFAULT_CONFIG.dashboardLayout,
    spotify: {
      ...DEFAULT_CONFIG.spotify,
      ...(data.spotify || {}),
    },
  };
  } catch (err) {
    console.error('Failed to load homelab config:', err);
    return DEFAULT_CONFIG;
  }
}

export function saveHomelabConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/** Sanitize service config before returning to client (hide secrets) */
export function sanitizeServiceConfig(svc) {
  return {
    id: svc.id,
    type: svc.type,
    name: svc.name,
    category: svc.category,
    host: svc.host,
    username: svc.username,
    hasApiKey: Boolean(svc.apiKey),
    hasApiSecret: Boolean(svc.apiSecret),
    hasPassword: Boolean(svc.password),
    sotf: svc.sotf,
    disabled: svc.disabled,
  };
}

/** Sanitize the Spotify block so secrets never leave the server. */
export function sanitizeSpotifyConfig(spotify) {
  return {
    configured: Boolean(spotify && spotify.clientId && spotify.clientSecret),
    clientId: (spotify && spotify.clientId) || '',
    lidarrRootFolder: (spotify && spotify.lidarrRootFolder) || '',
    lidarrQualityProfileId: spotify && spotify.lidarrQualityProfileId != null ? spotify.lidarrQualityProfileId : null,
    lidarrMetadataProfileId: spotify && spotify.lidarrMetadataProfileId != null ? spotify.lidarrMetadataProfileId : null,
  };
}
