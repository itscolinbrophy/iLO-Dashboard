# iLO Dashboard

A web-based dashboard for monitoring and managing multiple HPE iLO (Integrated Lights-Out) systems. Built with React, TypeScript, and Vite.

## Features

- **Fleet overview** — summary cards showing total systems, online count, power state, warnings, critical alerts, and average temperature
- **System table** — sortable list of managed iLO endpoints with health, power, CPU, memory, and temperature
- **System detail panel** — full details for a selected system, including firmware, serial number, and a link to the iLO web console
- **Alerts panel** — active alerts across the fleet, grouped by severity

## Getting Started

```bash
npm install
npm run dev
```

The dev server starts at http://localhost:5173.

## Build

```bash
npm run build
```

## Project Structure

```
src/
  components/    # UI components (SummaryCards, SystemTable, SystemDetail, AlertsPanel, HealthBadge)
  data/          # Mock data and summary computation
  types/         # TypeScript data models (IloSystem, IloAlert, DashboardSummary)
```

## Roadmap

- [ ] Connect to real iLO endpoints via the Redfish API
- [ ] Authentication and multi-user support
- [ ] Power control actions (power on/off, reset)
- [ ] Historical metrics and charts
