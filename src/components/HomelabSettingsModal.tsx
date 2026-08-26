import React, { useEffect, useState } from 'react';
import { Icon } from './common/Icon';
import { EndpointManager } from './EndpointManager';
import { fetchMusicConfig, saveMusicConfig } from '../api/homelabClient';
import type {
  HomelabConfig,
  ServiceEndpointConfig,
  QuickLink,
  ServiceType,
  ServiceCategory,
  SpotifyConfig,
} from '../types/homelab';
import type { IloEndpoint } from '../types/ilo';
import {
  addService,
  updateService,
  deleteService,
  testService,
  addQuickLink,
  updateQuickLink,
  deleteQuickLink,
} from '../api/homelabClient';

interface SettingsModalProps {
  config: HomelabConfig;
  endpoints: IloEndpoint[];
  onClose: () => void;
  onRefreshAll: () => void;
  onUpdateConfig: (newCfg: HomelabConfig) => void;
  onEndpointsChange: () => void;
}

const SERVICE_TYPES: { type: ServiceType; label: string; category: ServiceCategory; icon: string }[] = [
  { type: 'ilo', label: 'HPE iLO (Redfish / SOTF)', category: 'hardware', icon: 'server' },
  { type: 'peanut', label: 'PeaNUT (UPS Power)', category: 'hardware', icon: 'zap' },
  { type: 'pve', label: 'Proxmox VE (PVE)', category: 'infrastructure', icon: 'pve' },
  { type: 'pbs', label: 'Proxmox Backup Server (PBS)', category: 'infrastructure', icon: 'database' },
  { type: 'portainer', label: 'Portainer (Docker)', category: 'infrastructure', icon: 'box' },
  { type: 'unifi', label: 'UniFi Network Gateway', category: 'network', icon: 'wifi' },
  { type: 'opnsense', label: 'OPNsense Firewall', category: 'network', icon: 'shield' },
  { type: 'nginx', label: 'Nginx Proxy Manager', category: 'network', icon: 'globe' },
  { type: 'plex', label: 'Plex Media Server', category: 'media', icon: 'play' },
  { type: 'tautulli', label: 'Tautulli Monitoring', category: 'media', icon: 'activity' },
  { type: 'seer', label: 'Overseerr / Jellyseerr', category: 'media', icon: 'film' },
  { type: 'audiobookshelf', label: 'Audiobookshelf', category: 'media', icon: 'book-open' },
  { type: 'sonarr', label: 'Sonarr (TV Shows)', category: 'arrs', icon: 'tv' },
  { type: 'radarr', label: 'Radarr (Movies)', category: 'arrs', icon: 'film' },
  { type: 'lidarr', label: 'Lidarr (Music)', category: 'arrs', icon: 'music' },
  { type: 'bazarr', label: 'Bazarr (Subtitles)', category: 'arrs', icon: 'subtitles' },
  { type: 'sabnzbd', label: 'SABnzbd (Usenet)', category: 'downloads', icon: 'download' },
];

export function HomelabSettingsModal({
  config,
  endpoints,
  onClose,
  onRefreshAll,
  onUpdateConfig,
  onEndpointsChange,
}: SettingsModalProps) {
  const [tab, setTab] = useState<'services' | 'quicklinks' | 'music' | 'appearance' | 'ilo'>('services');

  // Music / Spotify form state
  const [musicConfig, setMusicConfig] = useState<SpotifyConfig | null>(null);
  const [musicClientId, setMusicClientId] = useState('');
  const [musicClientSecret, setMusicClientSecret] = useState('');
  const [musicRootFolder, setMusicRootFolder] = useState('');
  const [musicQualityProfile, setMusicQualityProfile] = useState('');
  const [musicMetadataProfile, setMusicMetadataProfile] = useState('');
  const [musicSaving, setMusicSaving] = useState(false);
  const [musicMsg, setMusicMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [musicMarket, setMusicMarket] = useState('US');

  useEffect(() => {
    if (tab !== 'music') return;
    let cancelled = false;
    fetchMusicConfig()
      .then((c) => {
        if (cancelled) return;
        setMusicConfig(c);
        setMusicClientId(c.clientId || '');
        setMusicRootFolder(c.lidarrRootFolder || '');
        setMusicQualityProfile(c.lidarrQualityProfileId != null ? String(c.lidarrQualityProfileId) : '');
        setMusicMetadataProfile(c.lidarrMetadataProfileId != null ? String(c.lidarrMetadataProfileId) : '');
        setMusicMarket(c.market || 'US');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab]);

  // Service form state
  const [editingService, setEditingService] = useState<Partial<ServiceEndpointConfig> | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [testingServiceId, setTestingServiceId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  // Quick link form state
  const [editingLink, setEditingLink] = useState<Partial<QuickLink> | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  /* ---------------- Service Handlers ---------------- */

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService?.name || !editingService.host || !editingService.type) {
      setServiceError('Name, Type, and Host URL are required.');
      return;
    }
    setServiceError(null);
    try {
      if (editingService.id) {
        const updated = await updateService(editingService.id, editingService);
        const nextServices = (config.services || []).map((s) => (s.id === updated.id ? updated : s));
        onUpdateConfig({ ...config, services: nextServices });
      } else {
        const created = await addService(editingService as any);
        onUpdateConfig({ ...config, services: [...(config.services || []), created] });
      }
      setEditingService(null);
      onRefreshAll();
    } catch (err: any) {
      setServiceError(err.message || 'Failed to save service');
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!window.confirm('Delete this homelab service integration?')) return;
    try {
      await deleteService(id);
      onUpdateConfig({
        ...config,
        services: (config.services || []).filter((s) => s.id !== id),
        dashboardLayout: {
          ...config.dashboardLayout,
          widgets: config.dashboardLayout.widgets.filter((w) => w.serviceId !== id),
        },
      });
      onRefreshAll();
    } catch (err: any) {
      alert(err.message || 'Failed to delete service');
    }
  };

  const handleTestService = async (id: string) => {
    setTestingServiceId(id);
    try {
      const res = await testService(id);
      setTestResult((prev) => ({
        ...prev,
        [id]: res.ok ? 'Connection successful!' : `Failed: ${res.error || 'Check host & auth'}`,
      }));
    } catch (err: any) {
      setTestResult((prev) => ({
        ...prev,
        [id]: `Error: ${err.message}`,
      }));
    } finally {
      setTestingServiceId(null);
    }
  };

  /* ---------------- Quick Link Handlers ---------------- */

  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLink?.title || !editingLink.url) {
      setLinkError('Title and URL are required.');
      return;
    }
    setLinkError(null);
    try {
      if (editingLink.id) {
        const updated = await updateQuickLink(editingLink.id, editingLink);
        const next = (config.quickLinks || []).map((l) => (l.id === updated.id ? updated : l));
        onUpdateConfig({ ...config, quickLinks: next });
      } else {
        const created = await addQuickLink(editingLink as any);
        onUpdateConfig({ ...config, quickLinks: [...(config.quickLinks || []), created] });
      }
      setEditingLink(null);
    } catch (err: any) {
      setLinkError(err.message || 'Failed to save quick link');
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!window.confirm('Delete this quick launch link?')) return;
    try {
      await deleteQuickLink(id);
      onUpdateConfig({
        ...config,
        quickLinks: (config.quickLinks || []).filter((l) => l.id !== id),
      });
    } catch (err: any) {
      alert(err.message || 'Failed to delete link');
    }
  };

  /* ---------------- Music / Spotify Handlers ---------------- */

  const handleSaveMusic = async (e: React.FormEvent) => {
    e.preventDefault();
    setMusicSaving(true);
    setMusicMsg(null);
    try {
      const updated = await saveMusicConfig({
        clientId: musicClientId,
        clientSecret: musicClientSecret,
        lidarrRootFolder: musicRootFolder,
        lidarrQualityProfileId: musicQualityProfile ? Number(musicQualityProfile) : null,
        lidarrMetadataProfileId: musicMetadataProfile ? Number(musicMetadataProfile) : null,
        market: musicMarket,
      });
      setMusicConfig(updated);
      setMusicClientSecret('');
      onUpdateConfig({ ...config, spotify: updated });
      setMusicMsg({ ok: true, text: 'Music settings saved.' });
    } catch (err: any) {
      setMusicMsg({ ok: false, text: err.message || 'Failed to save music settings' });
    } finally {
      setMusicSaving(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <div className="modal-title-row">
            <Icon name="settings" size={22} className="text-accent" />
            <h2>Homelab System Settings</h2>
          </div>
          <button className="icon-btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-modal-tabs">
          <button
            className={`tab-btn ${tab === 'services' ? 'active' : ''}`}
            onClick={() => setTab('services')}
          >
            <Icon name="server" size={16} /> Services & APIs ({config.services?.length || 0})
          </button>
          <button
            className={`tab-btn ${tab === 'quicklinks' ? 'active' : ''}`}
            onClick={() => setTab('quicklinks')}
          >
            <Icon name="globe" size={16} /> Quick Links ({config.quickLinks?.length || 0})
          </button>
          <button
            className={`tab-btn ${tab === 'music' ? 'active' : ''}`}
            onClick={() => setTab('music')}
          >
            <Icon name="music" size={16} /> Spotify / Music Sync
          </button>
          <button
            className={`tab-btn ${tab === 'appearance' ? 'active' : ''}`}
            onClick={() => setTab('appearance')}
          >
            <Icon name="grid" size={16} /> Dashboard Layout & Theme
          </button>
          <button
            className={`tab-btn ${tab === 'ilo' ? 'active' : ''}`}
            onClick={() => setTab('ilo')}
          >
            <Icon name="server" size={16} /> iLO Endpoints ({endpoints.length})
          </button>
        </div>

        <div className="settings-modal-body">
          {/* TAB 1: SERVICES */}
          {tab === 'services' && (
            <div className="settings-tab-pane">
              <div className="pane-header-row">
                <div>
                  <h3>Configured Homelab Services</h3>
                  <p className="subtext">
                    Click <strong>Edit</strong> on a service to expand its settings inline — no need to scroll back up.
                  </p>
                </div>
                <button
                  className="btn primary"
                  onClick={() =>
                    setEditingService({
                      type: 'sonarr',
                      category: 'arrs',
                      name: '',
                      host: '',
                    })
                  }
                >
                  <Icon name="plus" size={14} /> Add Service
                </button>
              </div>

              <div className="services-list-table">
                {config.services.map((svc) => {
                  const isEditing = editingService?.id === svc.id;
                  return (
                    <div key={svc.id} className="service-config-row">
                      <div className="svc-info-col">
                        <div className="svc-header-line">
                          <span className="svc-name font-medium">{svc.name}</span>
                          <span className="badge badge-sm">{svc.type.toUpperCase()}</span>
                          <span className="badge badge-outline">{svc.category}</span>
                        </div>
                        <span className="svc-url font-mono text-muted">{svc.host}</span>
                        {testResult[svc.id] && (
                          <span
                            className={`test-msg ${testResult[svc.id].includes('success') ? 'text-success' : 'text-danger'}`}
                          >
                            {testResult[svc.id]}
                          </span>
                        )}
                      </div>
                      <div className="svc-actions-col">
                        <button
                          className="btn sm secondary"
                          disabled={testingServiceId === svc.id}
                          onClick={() => handleTestService(svc.id)}
                        >
                          {testingServiceId === svc.id ? 'Testing…' : 'Test'}
                        </button>
                        <button
                          className={`btn sm ${isEditing ? 'primary' : 'secondary'}`}
                          onClick={() => setEditingService(isEditing ? null : svc)}
                        >
                          {isEditing ? 'Close' : 'Edit'}
                        </button>
                        <button
                          className="btn sm danger"
                          onClick={() => handleDeleteService(svc.id)}
                        >
                          Delete
                        </button>
                      </div>
                      {isEditing && (
                        <div className="inline-edit-panel">
                          <ServiceEditForm
                            editingService={editingService}
                            setEditingService={setEditingService}
                            serviceError={serviceError}
                            setServiceError={setServiceError}
                            onSubmit={handleSaveService}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {!editingService?.id && (
                <div className="inline-add-panel">
                  <ServiceEditForm
                    editingService={editingService}
                    setEditingService={setEditingService}
                    serviceError={serviceError}
                    setServiceError={setServiceError}
                    onSubmit={handleSaveService}
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: QUICK LINKS */}
          {tab === 'quicklinks' && (
            <div className="settings-tab-pane">
              <div className="pane-header-row">
                <div>
                  <h3>Quick Launchpad Links</h3>
                  <p className="subtext">Configure fast shortcuts to all your homelab web interfaces.</p>
                </div>
                <button
                  className="btn primary"
                  onClick={() =>
                    setEditingLink({
                      title: '',
                      url: 'https://',
                      icon: 'globe',
                      category: 'General',
                      openNewTab: true,
                    })
                  }
                >
                  <Icon name="plus" size={14} /> Add Quick Link
                </button>
              </div>

              <div className="services-list-table">
                {config.quickLinks.map((link) => {
                  const isEditing = editingLink?.id === link.id;
                  return (
                    <div key={link.id} className="service-config-row">
                      <div className="svc-info-col">
                        <div className="svc-header-line">
                          <Icon name={link.icon || 'globe'} size={16} />
                          <span className="svc-name font-medium">{link.title}</span>
                          <span className="badge badge-outline">{link.category || 'General'}</span>
                        </div>
                        <span className="svc-url font-mono text-muted">{link.url}</span>
                      </div>
                      <div className="svc-actions-col">
                        <button
                          className={`btn sm ${isEditing ? 'primary' : 'secondary'}`}
                          onClick={() => setEditingLink(isEditing ? null : link)}
                        >
                          {isEditing ? 'Close' : 'Edit'}
                        </button>
                        <button className="btn sm danger" onClick={() => handleDeleteLink(link.id)}>
                          Delete
                        </button>
                      </div>
                      {isEditing && (
                        <div className="inline-edit-panel">
                          <form className="settings-form inline" onSubmit={handleSaveLink}>
                            {linkError && <div className="banner error">{linkError}</div>}
                            <div className="form-grid">
                              <div className="form-group">
                                <label>Title</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Proxmox VE"
                                  value={editingLink.title || ''}
                                  onChange={(e) =>
                                    setEditingLink((prev) => ({ ...prev, title: e.target.value }))
                                  }
                                  required
                                />
                              </div>
                              <div className="form-group">
                                <label>Category</label>
                                <input
                                  type="text"
                                  placeholder="Infrastructure, Media, Networking"
                                  value={editingLink.category || 'General'}
                                  onChange={(e) =>
                                    setEditingLink((prev) => ({ ...prev, category: e.target.value }))
                                  }
                                />
                              </div>
                              <div className="form-group full-span">
                                <label>Destination URL</label>
                                <input
                                  type="url"
                                  placeholder="https://pve.local:8006"
                                  value={editingLink.url || ''}
                                  onChange={(e) =>
                                    setEditingLink((prev) => ({ ...prev, url: e.target.value }))
                                  }
                                  required
                                />
                              </div>
                              <div className="form-group">
                                <label>Icon Identifier</label>
                                <input
                                  type="text"
                                  placeholder="globe, server, wifi, shield, play, box, tv..."
                                  value={editingLink.icon || 'globe'}
                                  onChange={(e) =>
                                    setEditingLink((prev) => ({ ...prev, icon: e.target.value }))
                                  }
                                />
                              </div>
                              <div className="form-group">
                                <label>Description (optional)</label>
                                <input
                                  type="text"
                                  placeholder="Short subtitle"
                                  value={editingLink.description || ''}
                                  onChange={(e) =>
                                    setEditingLink((prev) => ({ ...prev, description: e.target.value }))
                                  }
                                />
                              </div>
                            </div>
                            <div className="form-actions">
                              <button type="submit" className="btn primary">
                                Save Link
                              </button>
                              <button
                                type="button"
                                className="btn secondary"
                                onClick={() => setEditingLink(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: MUSIC / SPOTIFY */}
          {tab === 'music' && (
            <div className="settings-tab-pane">
              <div className="pane-header-row">
                <div>
                  <h3>Spotify Playlist Sync</h3>
                  <p className="subtext">
                    Connect a Spotify Developer App and set your default Lidarr preferences for adding missing artists.
                  </p>
                </div>
              </div>
              {musicMsg && (
                <div className={`banner ${musicMsg.ok ? 'success' : 'error'}`} style={{ marginBottom: 12 }}>
                  {musicMsg.text}
                </div>
              )}
              <form className="settings-form inline" onSubmit={handleSaveMusic}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Spotify Client ID</label>
                    <input
                      type="text"
                      placeholder="Your Spotify App Client ID"
                      value={musicClientId}
                      onChange={(e) => setMusicClientId(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Spotify Client Secret</label>
                    <input
                      type="password"
                      placeholder={musicConfig?.configured ? '•••••••• (leave blank to keep)' : 'Your Spotify App Client Secret'}
                      value={musicClientSecret}
                      onChange={(e) => setMusicClientSecret(e.target.value)}
                    />
                  </div>
                  <div className="form-group full-span">
                    <label>Default Lidarr Root Folder</label>
                    <input
                      type="text"
                      placeholder="e.g. /data/music"
                      value={musicRootFolder}
                      onChange={(e) => setMusicRootFolder(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Default Lidarr Quality Profile ID</label>
                    <input
                      type="number"
                      placeholder="e.g. 1 (leave blank to auto-pick first)"
                      value={musicQualityProfile}
                      onChange={(e) => setMusicQualityProfile(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Default Lidarr Metadata Profile ID</label>
                    <input
                      type="number"
                      placeholder="e.g. 1"
                      value={musicMetadataProfile}
                      onChange={(e) => setMusicMetadataProfile(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Spotify Market (country code)</label>
                    <input
                      type="text"
                      placeholder="e.g. US, GB, AU"
                      maxLength={2}
                      value={musicMarket}
                      onChange={(e) => setMusicMarket(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn primary" disabled={musicSaving}>
                    {musicSaving ? 'Saving…' : 'Save Music Settings'}
                  </button>
                </div>
              </form>
              {!musicConfig?.configured && (
                <p className="subtext" style={{ marginTop: 14 }}>
                  To create a Spotify App: visit the Spotify Developer Dashboard, create an app, then copy its Client ID
                  and Client Secret. Public playlist reading works without any redirect URI or scopes.
                </p>
              )}
            </div>
          )}

          {/* TAB 4: APPEARANCE */}
          {tab === 'appearance' && (
            <div className="settings-tab-pane">
              <h3>Dashboard Layout & Refresh</h3>
              <div className="form-grid" style={{ marginTop: 16 }}>
                <div className="form-group">
                  <label>Auto-Refresh Interval</label>
                  <select
                    value={config.refreshInterval ?? 15}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateConfig({ ...config, refreshInterval: val });
                    }}
                  >
                    <option value="5">Every 5 seconds (Fast)</option>
                    <option value="15">Every 15 seconds (Balanced)</option>
                    <option value="30">Every 30 seconds</option>
                    <option value="60">Every 1 minute</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Dashboard Columns</label>
                  <select
                    value={config.dashboardLayout?.columns || 3}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateConfig({
                        ...config,
                        dashboardLayout: { ...config.dashboardLayout, columns: val },
                      });
                    }}
                  >
                    <option value="2">2 Columns</option>
                    <option value="3">3 Columns (Standard)</option>
                    <option value="4">4 Columns (Ultra Wide)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: iLO ENDPOINTS */}
          {tab === 'ilo' && (
            <div className="settings-tab-pane">
              <EndpointManager endpoints={endpoints} onChange={onEndpointsChange} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Inline Service Edit Form ---------------- */

function ServiceEditForm({
  editingService,
  setEditingService,
  serviceError,
  setServiceError,
  onSubmit,
}: {
  editingService: Partial<ServiceEndpointConfig> | null;
  setEditingService: (s: Partial<ServiceEndpointConfig> | null) => void;
  serviceError: string | null;
  setServiceError: (s: string | null) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  if (!editingService) return null;
  return (
    <form className="settings-form inline" onSubmit={onSubmit}>
      <h4>{editingService.id ? 'Edit Service' : 'Add New Service Endpoint'}</h4>
      {serviceError && <div className="banner error">{serviceError}</div>}

      <div className="form-grid">
        <div className="form-group">
          <label>Service Type</label>
          <select
            value={editingService.type || 'sonarr'}
            onChange={(e) => {
              const val = e.target.value as ServiceType;
              const found = SERVICE_TYPES.find((s) => s.type === val);
              setEditingService({
                ...editingService,
                type: val,
                category: found?.category || 'overview',
              });
            }}
          >
            {SERVICE_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Display Name</label>
          <input
            type="text"
            placeholder="e.g. Living Room UPS / Master Sonarr"
            value={editingService.name || ''}
            onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
            required
          />
        </div>

        <div className="form-group full-span">
          <label>Host URL or IP Address</label>
          <input
            type="text"
            placeholder="e.g. http://192.168.1.50:8989 or https://pve.local:8006"
            value={editingService.host || ''}
            onChange={(e) => setEditingService({ ...editingService, host: e.target.value })}
            required
          />
        </div>

        {['pve', 'pbs'].includes(editingService.type || '') && (
          <>
            <div className="form-group">
              <label>API Token ID</label>
              <input
                type="text"
                placeholder="e.g. root@pam!token1 or token1"
                value={editingService.apiKey || ''}
                onChange={(e) => setEditingService({ ...editingService, apiKey: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>API Token Secret (UUID)</label>
              <input
                type="password"
                placeholder="e.g. aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
                value={editingService.apiSecret || ''}
                onChange={(e) => setEditingService({ ...editingService, apiSecret: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Username (optional if included in Token ID)</label>
              <input
                type="text"
                placeholder="e.g. root@pam or user@pve"
                value={editingService.username || ''}
                onChange={(e) => setEditingService({ ...editingService, username: e.target.value })}
              />
            </div>
          </>
        )}

        {['sonarr', 'radarr', 'lidarr', 'bazarr', 'sabnzbd', 'seer', 'tautulli', 'audiobookshelf', 'opnsense', 'unifi', 'plex', 'portainer'].includes(
          editingService.type || ''
        ) && (
          <div className="form-group">
            <label>API Key / Token (optional if unauthenticated)</label>
            <input
              type="password"
              placeholder="API Key / Token ID"
              value={editingService.apiKey || ''}
              onChange={(e) => setEditingService({ ...editingService, apiKey: e.target.value })}
            />
          </div>
        )}

        {['opnsense'].includes(editingService.type || '') && (
          <div className="form-group">
            <label>API Secret (for OPNsense Key/Secret)</label>
            <input
              type="password"
              placeholder="API Secret Key"
              value={editingService.apiSecret || ''}
              onChange={(e) => setEditingService({ ...editingService, apiSecret: e.target.value })}
            />
          </div>
        )}

        {['ilo', 'peanut', 'unifi', 'nginx'].includes(editingService.type || '') && (
          <>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                placeholder="Administrator / root"
                value={editingService.username || ''}
                onChange={(e) => setEditingService({ ...editingService, username: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Password"
                value={editingService.password || ''}
                onChange={(e) => setEditingService({ ...editingService, password: e.target.value })}
              />
            </div>
          </>
        )}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn primary">
          Save Service
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            setEditingService(null);
            setServiceError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
