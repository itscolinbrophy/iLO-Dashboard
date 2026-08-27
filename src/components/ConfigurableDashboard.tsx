import { useRef, useState } from 'react';
import { Icon } from './common/Icon';
import { QuickLinksWidget } from './widgets/QuickLinksWidget';
import { PeanutWidget } from './widgets/PeanutWidget';
import { PveWidget, PbsWidget } from './widgets/PveWidget';
import { OpnsenseWidget, UnifiWidget, NginxWidget } from './widgets/NetworkWidgets';
import { PlexWidget, SeerWidget, AudiobookshelfWidget } from './widgets/MediaWidgets';
import { ArrWidget, SabnzbdWidget, CalendarWidget } from './widgets/ArrWidgets';
import { PortainerWidget } from './widgets/PortainerWidget';
import { TelemetryDashboard } from './TelemetryDashboard';
import type {
  HomelabConfig,
  DashboardLayoutConfig,
  WidgetLayoutItem,
  ServiceDataResponse,
  ArrCalendarItem,
  ServiceType,
} from '../types/homelab';
import type { IloEndpoint, TelemetryMap } from '../types/ilo';

interface ConfigurableDashboardProps {
  config: HomelabConfig;
  servicesStatus: Record<string, ServiceDataResponse>;
  calendarItems: ArrCalendarItem[];
  iloEndpoints: IloEndpoint[];
  iloTelemetry: TelemetryMap;
  loading: boolean;
  onRefresh: () => void;
  onUpdateLayout: (layout: DashboardLayoutConfig) => void;
  onOpenSettings: () => void;
}

const AVAILABLE_WIDGETS: { type: ServiceType; title: string; defaultColSpan: number }[] = [
  { type: 'quicklinks', title: 'Quick Launchpad', defaultColSpan: 3 },
  { type: 'ilo', title: 'iLO Hardware Telemetry', defaultColSpan: 2 },
  { type: 'peanut', title: 'PeaNUT UPS Power', defaultColSpan: 1 },
  { type: 'pve', title: 'Proxmox Virtual Environment', defaultColSpan: 2 },
  { type: 'pbs', title: 'Proxmox Backup Server', defaultColSpan: 1 },
  { type: 'unifi', title: 'UniFi Network Gateway', defaultColSpan: 1 },
  { type: 'opnsense', title: 'OPNsense Firewall', defaultColSpan: 2 },
  { type: 'portainer', title: 'Portainer Docker Host', defaultColSpan: 1 },
  { type: 'plex', title: 'Plex & Tautulli Stream Monitor', defaultColSpan: 2 },
  { type: 'seer', title: 'Overseerr Requests', defaultColSpan: 1 },
  { type: 'audiobookshelf', title: 'Audiobookshelf Library', defaultColSpan: 1 },
  { type: 'calendar', title: 'Arr Upcoming Release Calendar', defaultColSpan: 2 },
  { type: 'sonarr', title: 'Sonarr TV', defaultColSpan: 1 },
  { type: 'radarr', title: 'Radarr Movies', defaultColSpan: 1 },
  { type: 'lidarr', title: 'Lidarr Music', defaultColSpan: 1 },
  { type: 'bazarr', title: 'Bazarr Subtitles', defaultColSpan: 1 },
  { type: 'sabnzbd', title: 'SABnzbd Downloader', defaultColSpan: 1 },
  { type: 'nginx', title: 'Nginx Reverse Proxy', defaultColSpan: 2 },
];

export function ConfigurableDashboard({
  config,
  servicesStatus,
  calendarItems,
  iloEndpoints,
  iloTelemetry,
  loading,
  onRefresh,
  onUpdateLayout,
  onOpenSettings,
}: ConfigurableDashboardProps) {
  const [editMode, setEditMode] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Resize state
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<number | null>(null);
  const resizeStartRef = useRef<{ x: number; startSpan: number } | null>(null);

  const widgets = config.dashboardLayout.widgets || [];
  const columns = config.dashboardLayout.columns || 3;

  /* Helper to resize widget */
  const handleResize = (widgetId: string, delta: number) => {
    const updated = widgets.map((w) => {
      if (w.id === widgetId) {
        const nextSpan = Math.max(1, Math.min(columns, (w.colSpan || 1) + delta));
        return { ...w, colSpan: nextSpan };
      }
      return w;
    });
    onUpdateLayout({ ...config.dashboardLayout, widgets: updated });
  };

  /* Helper to move widget up/down */
  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= widgets.length) return;
    const updated = [...widgets];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    onUpdateLayout({ ...config.dashboardLayout, widgets: updated });
  };

  /* Helper to remove widget */
  const handleRemove = (widgetId: string) => {
    const updated = widgets.filter((w) => w.id !== widgetId);
    onUpdateLayout({ ...config.dashboardLayout, widgets: updated });
  };

  /* Helper to add widget */
  const handleAddWidget = (type: ServiceType, title: string, defaultColSpan: number) => {
    const matchingService = (config.services || []).find((s) => s.type === type);
    const newWidget: WidgetLayoutItem = {
      id: `w-${type}-${Date.now().toString(36)}`,
      type,
      serviceId: matchingService?.id,
      title,
      colSpan: Math.min(columns, defaultColSpan),
    };
    onUpdateLayout({ ...config.dashboardLayout, widgets: [...widgets, newWidget] });
    setShowAddMenu(false);
  };

  /* ---------------- Drag & Drop ---------------- */

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    if (!editMode) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    // Delay the drag image so the ghost doesn't look broken.
    requestAnimationFrame(() => {
      e.dataTransfer.setDragImage(new Image(), 0, 0);
    });
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    if (!editMode || dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== dragOverIndex) setDragOverIndex(index);
  };

  const handleDrop = (targetIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const updated = [...widgets];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(targetIndex, 0, moved);
    onUpdateLayout({ ...config.dashboardLayout, widgets: updated });
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  /* ---------------- Resize (pull-tag) ---------------- */

  const startResize = (widgetId: string, startSpan: number) => (e: React.MouseEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = { x: e.clientX, startSpan };
    setResizingId(widgetId);
    setResizePreview(startSpan);

    const onMove = (ev: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const dx = ev.clientX - resizeStartRef.current.x;
      // Each column is roughly 1/columns of the container width. Approximate
      // the column width from the grid element.
      const gridEl = document.querySelector('.dashboard-grid-container') as HTMLElement | null;
      if (!gridEl) return;
      const colWidth = gridEl.clientWidth / columns;
      const delta = Math.round(dx / colWidth);
      const next = Math.max(1, Math.min(columns, resizeStartRef.current.startSpan + delta));
      setResizePreview(next);
    };
    const onUp = () => {
      if (resizeStartRef.current && resizePreview !== null) {
        handleResize(widgetId, resizePreview - resizeStartRef.current.startSpan);
      }
      resizeStartRef.current = null;
      setResizingId(null);
      setResizePreview(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /* Render specific widget content */
  const renderWidgetContent = (item: WidgetLayoutItem) => {
    const svcResponse = item.serviceId
      ? servicesStatus[item.serviceId]
      : Object.values(servicesStatus).find((s) => s.type === item.type);

    switch (item.type) {
      case 'quicklinks':
        return <QuickLinksWidget links={config.quickLinks || []} onAddLink={onOpenSettings} />;
      case 'ilo':
        return (
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
        );
      case 'peanut':
        return <PeanutWidget title={item.title} response={svcResponse} loading={loading} />;
      case 'pve':
        return (
          <PveWidget
            title={item.title}
            response={svcResponse}
            loading={loading}
            serviceId={item.serviceId}
            onRefresh={onRefresh}
          />
        );
      case 'pbs':
        return <PbsWidget title={item.title} response={svcResponse} loading={loading} />;
      case 'opnsense':
        return <OpnsenseWidget title={item.title} response={svcResponse} loading={loading} onRefresh={onRefresh} />;
      case 'unifi':
        return <UnifiWidget title={item.title} response={svcResponse} loading={loading} />;
      case 'nginx':
        return <NginxWidget title={item.title} response={svcResponse} loading={loading} />;
      case 'portainer':
        return <PortainerWidget title={item.title} response={svcResponse} loading={loading} />;
      case 'plex': {
        const tautulliResp = Object.values(servicesStatus).find((s) => s.type === 'tautulli');
        return (
          <PlexWidget
            title={item.title}
            response={svcResponse}
            tautulliResponse={tautulliResp}
            loading={loading}
          />
        );
      }
      case 'seer':
        return <SeerWidget title={item.title} response={svcResponse} loading={loading} />;
      case 'audiobookshelf':
        return <AudiobookshelfWidget title={item.title} response={svcResponse} loading={loading} />;
      case 'sonarr':
      case 'radarr':
      case 'lidarr':
      case 'bazarr':
        return (
          <ArrWidget
            type={item.type as any}
            title={item.title}
            response={svcResponse}
            loading={loading}
          />
        );
      case 'sabnzbd':
        return <SabnzbdWidget title={item.title} response={svcResponse} loading={loading} />;
      case 'calendar':
        return (
          <CalendarWidget
            title={item.title}
            calendarItems={calendarItems}
            loading={loading}
          />
        );
      default:
        return (
          <div className="homelab-widget">
            <div className="widget-header">
              <h3 className="widget-title">{item.title || item.type}</h3>
            </div>
            <p className="empty-hint">Widget of type {item.type}</p>
          </div>
        );
    }
  };

  return (
    <div className="configurable-dashboard-wrapper">
      <div className="dashboard-action-toolbar">
        <div className="toolbar-left">
          <span className="live-indicator">
            <span className="live-dot" /> Live Aggregator
          </span>
          <span className="text-muted text-sm">
            {widgets.length} Widgets Active • {columns} Columns
          </span>
        </div>

        <div className="toolbar-right">
          <button
            className={`btn ${editMode ? 'primary' : 'secondary'} sm`}
            onClick={() => setEditMode(!editMode)}
          >
            <Icon name={editMode ? 'check' : 'edit'} size={14} />
            {editMode ? 'Done Customizing' : 'Customize Dashboard'}
          </button>

          {editMode && (
            <div className="add-widget-dropdown-container">
              <button
                className="btn secondary sm"
                onClick={() => setShowAddMenu(!showAddMenu)}
              >
                <Icon name="plus" size={14} /> Add Widget
              </button>

              {showAddMenu && (
                <div className="widget-picker-menu">
                  <div className="picker-header">Add Widget to Dashboard</div>
                  <div className="picker-list">
                    {AVAILABLE_WIDGETS.map((aw) => (
                      <button
                        key={aw.type}
                        className="picker-item-btn"
                        onClick={() => handleAddWidget(aw.type, aw.title, aw.defaultColSpan)}
                      >
                        <Icon name={aw.type} size={16} />
                        <span>{aw.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button className="btn secondary sm" onClick={onRefresh} disabled={loading}>
            <Icon name="refresh" size={14} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div
        className={`dashboard-grid-container cols-${columns} ${editMode ? 'edit-mode-active' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: '16px',
        }}
      >
        {widgets.map((widget, idx) => {
          const colSpan = Math.min(columns, widget.colSpan || 1);
          const isDragging = dragIndex === idx;
          const isDragOver = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx;
          const isResizing = resizingId === widget.id;

          return (
            <div
              key={widget.id}
              className={`dashboard-widget-wrapper col-span-${colSpan} ${
                isDragging ? 'dragging' : ''
              } ${isDragOver ? 'drag-over' : ''}`}
              style={{
                gridColumn: `span ${colSpan} / span ${colSpan}`,
              }}
              draggable={editMode}
              onDragStart={handleDragStart(idx)}
              onDragOver={handleDragOver(idx)}
              onDrop={handleDrop(idx)}
              onDragEnd={handleDragEnd}
            >
              {editMode && (
                <div className="widget-edit-controls-bar">
                  <span className="widget-handle font-mono text-xs">
                    {widget.title || widget.type} ({colSpan} / {columns} cols)
                  </span>
                  <div className="edit-btn-group">
                    <button
                      className="mini-edit-btn"
                      title="Decrease Width"
                      disabled={colSpan <= 1}
                      onClick={() => handleResize(widget.id, -1)}
                    >
                      <Icon name="minimize" size={12} />
                    </button>
                    <button
                      className="mini-edit-btn"
                      title="Increase Width"
                      disabled={colSpan >= columns}
                      onClick={() => handleResize(widget.id, 1)}
                    >
                      <Icon name="maximize" size={12} />
                    </button>
                    <button
                      className="mini-edit-btn"
                      title="Move Left/Up"
                      disabled={idx === 0}
                      onClick={() => handleMove(idx, 'up')}
                    >
                      <Icon name="arrow-up" size={12} />
                    </button>
                    <button
                      className="mini-edit-btn"
                      title="Move Right/Down"
                      disabled={idx === widgets.length - 1}
                      onClick={() => handleMove(idx, 'down')}
                    >
                      <Icon name="arrow-down" size={12} />
                    </button>
                    <button
                      className="mini-edit-btn danger"
                      title="Remove Widget"
                      onClick={() => handleRemove(widget.id)}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* Resize preview shadow (snap target) */}
              {isResizing && resizePreview !== null && resizePreview !== colSpan && (
                <div
                  className="resize-preview-shadow"
                  style={{ gridColumn: `span ${resizePreview} / span ${resizePreview}` }}
                />
              )}

              {renderWidgetContent(widget)}

              {/* Pull-tag resize handle (semicircle) */}
              {editMode && (
                <div
                  className="widget-resize-tag"
                  title="Drag to resize"
                  onMouseDown={startResize(widget.id, colSpan)}
                >
                  <Icon name="maximize" size={12} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
