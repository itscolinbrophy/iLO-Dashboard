import { Icon } from '../common/Icon';
import type { QuickLink } from '../../types/homelab';

interface QuickLinksWidgetProps {
  links: QuickLink[];
  onAddLink?: () => void;
  onEditLink?: (link: QuickLink) => void;
  onDeleteLink?: (id: string) => void;
  readOnly?: boolean;
}

export function QuickLinksWidget({
  links,
  onAddLink,
  onEditLink,
  onDeleteLink,
  readOnly = false,
}: QuickLinksWidgetProps) {
  // Group by category if present
  const categories = Array.from(new Set(links.map((l) => l.category || 'General')));

  return (
    <div className="homelab-widget quicklinks-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <Icon name="globe" size={18} className="widget-icon text-accent" />
          <div>
            <h3 className="widget-title">Quick Launchpad</h3>
            <span className="widget-sub">Homelab Web Portals & Dashboards</span>
          </div>
        </div>
        {!readOnly && onAddLink && (
          <button className="btn sm secondary" onClick={onAddLink}>
            <Icon name="plus" size={14} /> Add Link
          </button>
        )}
      </div>

      {links.length === 0 ? (
        <div className="empty-widget-state">
          <p>No quick links configured yet.</p>
          {!readOnly && onAddLink && (
            <button className="btn sm primary" onClick={onAddLink}>
              Add your first link
            </button>
          )}
        </div>
      ) : (
        <div className="quicklinks-container">
          {categories.map((cat) => {
            const catLinks = links.filter((l) => (l.category || 'General') === cat);
            return (
              <div key={cat} className="quicklink-category-group">
                <div className="quicklink-cat-header">{cat}</div>
                <div className="quicklink-grid">
                  {catLinks.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target={link.openNewTab !== false ? '_blank' : '_self'}
                      rel="noopener noreferrer"
                      className="quicklink-card"
                    >
                      <div className="quicklink-icon-box">
                        <Icon name={link.icon || 'globe'} size={20} />
                      </div>
                      <div className="quicklink-info">
                        <div className="quicklink-title-row">
                          <span className="quicklink-title">{link.title}</span>
                          <Icon name="external-link" size={12} className="external-indicator" />
                        </div>
                        {link.description && (
                          <span className="quicklink-desc">{link.description}</span>
                        )}
                      </div>
                      {!readOnly && (onEditLink || onDeleteLink) && (
                        <div className="quicklink-actions" onClick={(e) => e.preventDefault()}>
                          {onEditLink && (
                            <button
                              className="link-action-btn"
                              title="Edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditLink(link);
                              }}
                            >
                              <Icon name="edit" size={13} />
                            </button>
                          )}
                          {onDeleteLink && (
                            <button
                              className="link-action-btn danger"
                              title="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteLink(link.id);
                              }}
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
