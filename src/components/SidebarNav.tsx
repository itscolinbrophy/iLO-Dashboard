import { Icon } from './common/Icon';
import type { ServiceCategory } from '../types/homelab';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  category?: ServiceCategory;
  badge?: number | string;
}

interface SidebarNavProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Main Dashboard', icon: 'grid' },
  { id: 'quicklinks', label: 'Quick Launchpad', icon: 'globe' },
  { id: 'ilo', label: 'iLO & Hardware', icon: 'ilo' },
  { id: 'infrastructure', label: 'Proxmox & Docker', icon: 'server' },
  { id: 'network', label: 'Network & Firewall', icon: 'shield' },
  { id: 'media', label: 'Media & Streaming', icon: 'play' },
  { id: 'arrs', label: 'Servarr Automation', icon: 'tv' },
  { id: 'calendar', label: 'Release Calendar', icon: 'calendar' },
  { id: 'downloads', label: 'Downloads & Queue', icon: 'download' },
];

export function SidebarNav({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
}: SidebarNavProps) {
  return (
    <aside className={`sidebar-nav ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-logo">HL</div>
        {!collapsed && (
          <div className="brand-titles">
            <span className="brand-title">HOMELAB</span>
            <span className="brand-sub">Unified Command Center</span>
          </div>
        )}
      </div>

      <div className="sidebar-menu">
        <div className="menu-group-label">{!collapsed && 'NAVIGATION'}</div>
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <div className="nav-item-icon">
                <Icon name={item.icon} size={18} />
              </div>
              {!collapsed && <span className="nav-item-label">{item.label}</span>}
              {!collapsed && item.badge !== undefined && (
                <span className="nav-badge">{item.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <button
          className="collapse-toggle-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={18} />
          {!collapsed && <span>Collapse Menu</span>}
        </button>
      </div>
    </aside>
  );
}
