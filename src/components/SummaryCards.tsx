import type { DashboardSummary } from '../types/ilo';

interface SummaryCardsProps {
  summary: DashboardSummary;
}

/** Top-level KPI cards shown at the top of the dashboard. */
export function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = [
    { label: 'Systems', value: summary.totalSystems, tone: 'neutral' },
    { label: 'Online', value: summary.onlineSystems, tone: 'ok' },
    { label: 'Powered On', value: summary.poweredOn, tone: 'neutral' },
    { label: 'Warnings', value: summary.warningCount, tone: 'warning' },
    { label: 'Critical', value: summary.criticalCount, tone: 'critical' },
    { label: 'Avg Temp', value: `${summary.avgTemperatureC}°C`, tone: 'neutral' },
  ];

  return (
    <div className="summary-grid">
      {cards.map((card) => (
        <div key={card.label} className={`summary-card tone-${card.tone}`}>
          <div className="summary-value">{card.value}</div>
          <div className="summary-label">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
