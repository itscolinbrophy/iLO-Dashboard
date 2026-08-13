import { useMemo, useState } from 'react';
import { mockSystems, mockAlerts, computeSummary } from './data/mockData';
import { SummaryCards } from './components/SummaryCards';
import { SystemTable } from './components/SystemTable';
import { SystemDetail } from './components/SystemDetail';
import { AlertsPanel } from './components/AlertsPanel';
import type { IloSystem } from './types/ilo';
import './App.css';

function App() {
  const [selected, setSelected] = useState<IloSystem | null>(null);
  const summary = useMemo(() => computeSummary(mockSystems), []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>iLO Dashboard</h1>
        <span className="subtitle">HPE Integrated Lights-Out fleet overview</span>
      </header>

      <SummaryCards summary={summary} />

      <main className="main-grid">
        <section className="left-column">
          <SystemTable
            systems={mockSystems}
            onSelect={setSelected}
            selectedId={selected?.id ?? null}
          />
          <AlertsPanel alerts={mockAlerts} systems={mockSystems} />
        </section>
        <aside className="right-column">
          <SystemDetail system={selected} />
        </aside>
      </main>
    </div>
  );
}

export default App;
