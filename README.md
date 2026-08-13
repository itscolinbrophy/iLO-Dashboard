# iLO Dashboard

A web-based dashboard for monitoring multiple HPE iLO (Integrated Lights-Out) systems. Built with React, TypeScript, and Vite, with a small Node.js backend that proxies the iLO Redfish API.

## Features

- **Endpoint management** — add, edit, test, and remove iLO endpoints (host, username, password) from the UI
- **Live telemetry** — per-system view of temperatures, fan speeds, power draw, power supply status, and overall health
- **Connection testing** — verify credentials and reachability for each endpoint before relying on it
- **Console access** — each card has a Console button that opens the iLO web UI (with the native HTML5 remote console) in a new tab
- **Secure-by-design** — browsers can't talk to iLO directly (self-signed TLS + CORS), so the backend proxies Redfish calls; passwords are never sent back to the browser

## Architecture

```
Browser (React)  ──/api──▶  Node backend (server/index.mjs)  ──HTTPS──▶  iLO Redfish API
```

- The **frontend** calls `/api/*` on the Vite dev server, which proxies to the backend.
- The **backend** stores endpoints (with credentials) in `server/endpoints.json` (gitignored) and fetches telemetry from each iLO's Redfish endpoints (`/redfish/v1/Systems/1`, `/Chassis/1/Thermal`, `/Chassis/1/Power`).
- iLO self-signed certificates are accepted (`rejectUnauthorized: false`).

> ⚠️ **Security note:** credentials are stored in plaintext in `server/endpoints.json`. Only run this on a trusted local network. Do not commit this file.

## Getting Started

Run the backend and the dev server in two terminals:

```bash
# Terminal 1 — backend proxy
npm run server

# Terminal 2 — frontend
npm run dev
```

Open http://localhost:5173, add your iLO endpoints, and click **Refresh** to pull live telemetry.

## Build

```bash
npm run build
```

## Project Structure

```
server/
  index.mjs        # Node backend: endpoint CRUD + Redfish telemetry proxy
  endpoints.json   # Local endpoint store (gitignored)
src/
  api/client.ts    # Frontend API client
  components/      # EndpointManager, TelemetryDashboard, HealthBadge
  types/ilo.ts     # TypeScript data models
```

## Roadmap

- [ ] Power control actions (power on/off, reset)
- [ ] Historical metrics and charts
- [x] Auto-refresh / polling interval (with Live mode)
- [ ] Multi-user authentication
