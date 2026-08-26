/**
 * iLO Dashboard backend proxy.
 *
 * Browsers cannot talk to iLO directly (self-signed TLS certs + CORS), so this
 * small server acts as a proxy to the iLO Redfish API. It stores user-defined
 * endpoints (with credentials) in a local JSON file and aggregates telemetry
 * (temps, fans, power draw, health) from each iLO.
 *
 * NOTE: credentials are stored in plaintext in server/endpoints.json, which is
 * gitignored. Only run this server on a trusted local network.
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from 'ssh2';
import { WebSocketServer } from 'ws';
import {
  loadHomelabConfig,
  saveHomelabConfig,
  sanitizeServiceConfig,
  sanitizeSpotifyConfig,
} from './configManager.mjs';
import {
  hasSpotifyCredentials,
  searchSpotifyPlaylists,
  fetchSpotifyPlaylist,
} from './spotify.mjs';
import {
  pickLidarrService,
  buildLidarrIndex,
  matchTracks,
  lookupLidarrArtist,
  addArtistToLidarr,
} from './musicMatch.mjs';
import {
  pollPeaNUT,
  pollPlex,
  pollTautulli,
  pollAudiobookshelf,
  pollSeer,
  pollArr,
  pollSABnzbd,
  pollPve,
  pollPbs,
  pollPortainer,
  pollUnifi,
  pollOpnsense,
  pollNginx,
  pvePowerAction,
  pveCreateGuest,
  pveListStorageContent,
} from './servicePollers.mjs';

const PORT = Number(process.env.PORT || 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(__dirname, 'endpoints.json');
const REDFISH_TIMEOUT_MS = 15_000;
const SSH_TIMEOUT_MS = 15_000;
// Built frontend output (from `npm run build`). Served by this server in
// production so a single process runs the whole site.
const DIST_DIR = path.join(__dirname, '..', 'dist');

/* ------------------------------------------------------------------ */
/* Static file serving (production)                                    */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** Serve a static file from dist/, falling back to index.html for SPA routes. */
function serveStatic(req, res, urlPath) {
  let filePath = path.join(DIST_DIR, urlPath);
  // Prevent path traversal.
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(filePath).pipe(res);
}

/* ------------------------------------------------------------------ */
/* Endpoint store                                                      */
/* ------------------------------------------------------------------ */

function loadEndpoints() {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch {
    return [];
  }
}

function saveEndpoints(endpoints) {
  fs.writeFileSync(STORE, JSON.stringify(endpoints, null, 2));
}

/** Strip password before sending an endpoint to the client. */
function publicEndpoint(ep) {
  return {
    id: ep.id,
    name: ep.name,
    host: ep.host,
    username: ep.username,
    sotf: !!ep.sotf,
  };
}

/* ------------------------------------------------------------------ */
/* SSH client (Silence of the Fans)                                    */
/* ------------------------------------------------------------------ */

/** Run a command over SSH and resolve with the combined output. */
function sshExec(host, username, password, command) {
  const { hostname, port } = parseHost(host);
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let settled = false;

    const done = (err, result) => {
      if (settled) return;
      settled = true;
      conn.end();
      if (err) reject(err);
      else resolve(result);
    };

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) return done(err);
        stream
          .on('close', () => done(null, output.trim()))
          .on('data', (data) => (output += data.toString()))
          .stderr.on('data', (data) => (output += data.toString()));
      });
    });
    conn.on('error', (err) => done(err));
    conn.on('timeout', () => done(new Error('SSH connection timed out')));

    conn.connect({
      host: hostname,
      port: port === 443 ? 22 : port,
      username,
      password,
      readyTimeout: SSH_TIMEOUT_MS,
      timeout: SSH_TIMEOUT_MS,
      // Older iLO firmware (e.g. Gen9) only supports legacy SSH algorithms.
      // Enable them so the handshake succeeds.
      algorithms: {
        kex: [
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group1-sha1',
          'diffie-hellman-group-exchange-sha1',
          'diffie-hellman-group-exchange-sha256',
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
        ],
        cipher: [
          'aes128-cbc',
          'aes192-cbc',
          'aes256-cbc',
          'aes128-ctr',
          'aes192-ctr',
          'aes256-ctr',
          '3des-cbc',
        ],
        serverHostKey: [
          'ssh-rsa',
          'ssh-dss',
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521',
        ],
        hmac: [
          'hmac-sha1',
          'hmac-sha1-96',
          'hmac-md5',
          'hmac-md5-96',
          'hmac-sha2-256',
          'hmac-sha2-512',
        ],
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/* Alert engine — evaluates PVE / PBS / service health into alerts     */
/* ------------------------------------------------------------------ */

// In-memory alert state: { id, severity, source, message, ts, acknowledged }
let alertState = [];
let lastAlertEval = 0;

/** Evaluate the latest poll results into a flat alert list. */
async function evaluateAlerts() {
  const cfg = loadHomelabConfig();
  const alerts = [];
  const now = Date.now();

  const pveServices = (cfg.services || []).filter((s) => s.type === 'pve' && !s.disabled);
  const pbsServices = (cfg.services || []).filter((s) => s.type === 'pbs' && !s.disabled);

  await Promise.all([
    ...pveServices.map(async (svc) => {
      try {
        const data = await pollPve(svc);
        // Node offline / degraded
        for (const n of data.nodes || []) {
          if (n.status !== 'online') {
            alerts.push({
              id: `pve-node-${svc.id}-${n.node}`,
              severity: 'critical',
              source: `PVE · ${svc.name}`,
              message: `Node ${n.node} is ${n.status || 'offline'}`,
              ts: now,
            });
          } else {
            const memPct = Math.round(((n.memUsedBytes || 0) / (n.memTotalBytes || 1)) * 100);
            if (memPct >= 90) {
              alerts.push({
                id: `pve-mem-${svc.id}-${n.node}`,
                severity: 'warning',
                source: `PVE · ${svc.name}`,
                message: `Node ${n.node} memory at ${memPct}%`,
                ts: now,
              });
            }
          }
        }
        // Guests unexpectedly stopped (crashed) — only flag qemu/lxc that are
        // stopped AND were running recently is unknowable, so flag stopped
        // guests whose onboot config would normally keep them running. We keep
        // this informational to avoid noise.
        const stopped = (data.vms || []).filter((v) => v.status === 'stopped');
        if (stopped.length > 0) {
          alerts.push({
            id: `pve-stopped-${svc.id}`,
            severity: 'info',
            source: `PVE · ${svc.name}`,
            message: `${stopped.length} guest${stopped.length > 1 ? 's' : ''} stopped: ${stopped.slice(0, 4).map((v) => v.name).join(', ')}${stopped.length > 4 ? '…' : ''}`,
            ts: now,
          });
        }
      } catch (err) {
        alerts.push({
          id: `pve-conn-${svc.id}`,
          severity: 'critical',
          source: `PVE · ${svc.name}`,
          message: `Connection failed: ${err.message || 'unreachable'}`,
          ts: now,
        });
      }
    }),
    ...pbsServices.map(async (svc) => {
      try {
        const data = await pollPbs(svc);
        // Datastore capacity warnings
        for (const ds of data.datastores || []) {
          if (ds.usagePercent >= 90) {
            alerts.push({
              id: `pbs-ds-${svc.id}-${ds.store}`,
              severity: ds.usagePercent >= 95 ? 'critical' : 'warning',
              source: `PBS · ${svc.name}`,
              message: `Datastore ${ds.store} at ${ds.usagePercent}% capacity`,
              ts: now,
            });
          }
        }
        // Failed backup tasks
        for (const t of (data.failedTasks || []).slice(0, 5)) {
          alerts.push({
            id: `pbs-task-${svc.id}-${t.upid || t.id}-${t.starttime}`,
            severity: 'critical',
            source: `PBS · ${svc.name}`,
            message: `Backup failed: ${t.workerType} ${t.id} (${t.status})`,
            ts: now,
          });
        }
      } catch (err) {
        alerts.push({
          id: `pbs-conn-${svc.id}`,
          severity: 'critical',
          source: `PBS · ${svc.name}`,
          message: `Connection failed: ${err.message || 'unreachable'}`,
          ts: now,
        });
      }
    }),
  ]);

  // Service-down alerts for every other configured service (iLO endpoints are
  // managed through the legacy endpoints system, so skip them here)
  const otherServices = (cfg.services || []).filter(
    (s) => !s.disabled && !['pve', 'pbs', 'custom_iframe', 'ilo'].includes(s.type)
  );
  const results = await Promise.all(
    otherServices.map(async (svc) => {
      try {
        const r = await pollSingleService(svc);
        if (!r.ok) {
          return {
            id: `svc-down-${svc.id}`,
            severity: 'warning',
            source: svc.name,
            message: `Service unreachable: ${r.error || 'poll failed'}`,
            ts: now,
          };
        }
      } catch {
        return {
          id: `svc-down-${svc.id}`,
          severity: 'warning',
          source: svc.name,
          message: 'Service unreachable',
          ts: now,
        };
      }
      return null;
    })
  );
  alerts.push(...results.filter(Boolean));

  // Preserve acknowledged state across evaluations
  const prevAck = new Map(alertState.map((a) => [a.id, a]));
  alertState = alerts.map((a) => ({
    ...a,
    acknowledged: prevAck.get(a.id)?.acknowledged || false,
  }));
  lastAlertEval = now;
  return alertState;
}

/* ------------------------------------------------------------------ */
/* Interactive SSH shell over WebSocket (remote container/host shell)  */
/* ------------------------------------------------------------------ */

const SSH_ALGOS = {
  kex: [
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha256',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
  ],
  cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-cbc', 'aes256-cbc'],
  serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ssh-dss'],
  hmac: ['hmac-sha2-256', 'hmac-sha1', 'hmac-sha2-512'],
};

/**
 * Bridge a browser WebSocket to an interactive SSH shell on a target host.
 * For LXC containers we SSH to the PVE host and run `pct enter <vmid>`;
 * for QEMU VMs we open a shell on the PVE host (user can then `qm terminal`).
 */
function bridgeSshShell(ws, { host, port = 22, username, password, command }) {
  const conn = new Client();
  let stream = null;

  const cleanup = () => {
    try { stream?.end(); } catch { /* noop */ }
    try { conn.end(); } catch { /* noop */ }
    try { ws.close(); } catch { /* noop */ }
  };

  ws.on('message', (raw) => {
    const msg = raw.toString();
    if (msg === '\u0000close') return cleanup();
    try { stream?.write(msg); } catch { /* noop */ }
  });
  ws.on('close', cleanup);
  ws.on('error', cleanup);

  conn.on('ready', () => {
    conn.shell({ term: 'xterm-256color', cols: 100, rows: 30 }, (err, s) => {
      if (err) {
        ws.send(`\r\n\x1b[31mShell error: ${err.message}\x1b[0m\r\n`);
        return cleanup();
      }
      stream = s;
      ws.send('\u0000ready');
      s.on('data', (d) => { try { ws.send(d.toString()); } catch { /* noop */ } });
      s.stderr.on('data', (d) => { try { ws.send(d.toString()); } catch { /* noop */ } });
      s.on('close', () => {
        try { ws.send('\r\n\x1b[33m[session closed]\x1b[0m\r\n'); } catch { /* noop */ }
        cleanup();
      });
      // Auto-enter a container when requested (pct enter <vmid>)
      if (command) s.write(`${command}\n`);
    });
  });
  conn.on('error', (err) => {
    try { ws.send(`\r\n\x1b[31mSSH error: ${err.message}\x1b[0m\r\n`); } catch { /* noop */ }
    cleanup();
  });

  conn.connect({
    host,
    port: Number(port) || 22,
    username,
    password,
    readyTimeout: 15000,
    algorithms: SSH_ALGOS,
  });
}

/**
 * Set the fan speed on an iLO that supports "Silence of the Fans" (SOTF).
 * Uses the standard iLO fan-control commands over SSH.
 */
async function setFanSpeed(endpoint, percent) {
  const clamped = Math.max(0, Math.min(100, Number(percent)));
  const commands = [
    'set /map1/fan_zone0 desiredfanlevel ' + clamped,
    'set /map1/fan_zone1 desiredfanlevel ' + clamped,
    'set /map1/fan_zone2 desiredfanlevel ' + clamped,
    'set /map1/fan_zone3 desiredfanlevel ' + clamped,
  ];
  const results = [];
  for (const cmd of commands) {
    const out = await sshExec(endpoint.host, endpoint.username, endpoint.password, cmd);
    results.push(out);
  }
  const combined = results.join('\n');
  // iLO 4 and some models don't expose fan_zone targets — report clearly.
  if (/invalid target|invalid option/i.test(combined)) {
    return {
      ok: false,
      error:
        'This iLO does not support Silence of the Fans fan control ' +
        '(requires iLO 5/6 with fan_zone targets).',
      output: combined,
    };
  }
  return { ok: true, percent: clamped, output: combined };
}

/** Reset fan control back to automatic (managed by the system). */
async function resetFanControl(endpoint) {
  const commands = [
    'set /map1/fan_zone0 desiredfanlevel 0',
    'set /map1/fan_zone1 desiredfanlevel 0',
    'set /map1/fan_zone2 desiredfanlevel 0',
    'set /map1/fan_zone3 desiredfanlevel 0',
  ];
  const results = [];
  for (const cmd of commands) {
    const out = await sshExec(endpoint.host, endpoint.username, endpoint.password, cmd);
    results.push(out);
  }
  const combined = results.join('\n');
  if (/invalid target|invalid option/i.test(combined)) {
    return {
      ok: false,
      error:
        'This iLO does not support Silence of the Fans fan control ' +
        '(requires iLO 5/6 with fan_zone targets).',
      output: combined,
    };
  }
  return { ok: true, output: combined };
}

/* ------------------------------------------------------------------ */
/* Redfish client                                                      */
/* ------------------------------------------------------------------ */

/** Normalize a user-supplied host into { hostname, port }. */
function parseHost(raw) {
  let host = String(raw || '').trim();
  host = host.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const [hostname, port] = host.split(':');
  return { hostname, port: port ? Number(port) : 443 };
}

/** GET a JSON document from the iLO Redfish API using HTTP Basic auth. */
function redfishGet(host, redfishPath, username, password) {
  const { hostname, port } = parseHost(host);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        port,
        path: redfishPath,
        method: 'GET',
        // iLO ships with a self-signed certificate by default.
        rejectUnauthorized: false,
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
          Accept: 'application/json',
        },
        timeout: REDFISH_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error('iLO returned invalid JSON'));
            }
          } else if (res.statusCode === 401) {
            reject(new Error('Authentication failed (check username/password)'));
          } else {
            reject(new Error(`iLO returned HTTP ${res.statusCode}`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Connection timed out')));
    req.on('error', (err) => reject(new Error(err.message || 'Connection failed')));
    req.end();
  });
}

/** POST a JSON body to the iLO Redfish API using HTTP Basic auth. */
function redfishPost(host, redfishPath, username, password, body) {
  const { hostname, port } = parseHost(host);
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        port,
        path: redfishPath,
        method: 'POST',
        rejectUnauthorized: false,
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Accept: 'application/json',
        },
        timeout: REDFISH_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch {
              resolve({});
            }
          } else if (res.statusCode === 401) {
            reject(new Error('Authentication failed (check username/password)'));
          } else {
            reject(new Error(`iLO returned HTTP ${res.statusCode}`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Connection timed out')));
    req.on('error', (err) => reject(new Error(err.message || 'Connection failed')));
    req.write(payload);
    req.end();
  });
}

/* ------------------------------------------------------------------ */
/* Power control                                                       */
/* ------------------------------------------------------------------ */

/** Send a power action to the iLO (On, ForceOff, GracefulRestart, etc.). */
async function powerAction(endpoint, action) {
  await redfishPost(
    endpoint.host,
    '/redfish/v1/Systems/1/Actions/ComputerSystem.Reset/',
    endpoint.username,
    endpoint.password,
    { ResetType: action },
  );
  return { ok: true, action };
}

/* ------------------------------------------------------------------ */
/* Event log                                                           */
/* ------------------------------------------------------------------ */

/** Fetch the iLO event/IML log entries. */
async function fetchEventLog(endpoint) {
  const log = await redfishGet(
    endpoint.host,
    '/redfish/v1/Systems/1/LogServices/IML/Entries/',
    endpoint.username,
    endpoint.password,
  );
  // The Members list contains references; fetch each entry's details.
  const refs = (log.Members ?? []).slice(0, 30);
  const entries = [];
  for (const ref of refs) {
    try {
      const detail = await redfishGet(
        endpoint.host,
        ref['@odata.id'],
        endpoint.username,
        endpoint.password,
      );
      entries.push({
        id: detail.Id ?? null,
        severity: detail.Severity ?? 'OK',
        message: detail.Message ?? detail.MessageId ?? '',
        timestamp: detail.Created ?? detail.Modified ?? null,
      });
    } catch {
      // Skip entries that fail to load.
    }
  }
  return { ok: true, entries };
}

/* ------------------------------------------------------------------ */
/* History storage                                                     */
/* ------------------------------------------------------------------ */

const HISTORY_DIR = path.join(__dirname, 'history');
const HISTORY_MAX = 500; // max samples kept per endpoint

function historyFile(id) {
  return path.join(HISTORY_DIR, `${id}.json`);
}

function loadHistory(id) {
  try {
    return JSON.parse(fs.readFileSync(historyFile(id), 'utf8'));
  } catch {
    return [];
  }
}

function saveHistory(id, samples) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  fs.writeFileSync(historyFile(id), JSON.stringify(samples));
}

/** Append a telemetry sample to the endpoint's history file. */
function recordHistory(endpoint, telemetry) {
  if (!telemetry || !telemetry.ok) return;
  const samples = loadHistory(endpoint.id);
  samples.push({
    t: new Date().toISOString(),
    maxTemp: telemetry.temperatures.reduce((m, x) => Math.max(m, x.readingC), 0),
    powerWatts: telemetry.power.consumedWatts ?? 0,
    maxFan: telemetry.fans.reduce((m, f) => Math.max(m, f.reading ?? 0), 0),
  });
  // Keep only the most recent samples.
  if (samples.length > HISTORY_MAX) samples.splice(0, samples.length - HISTORY_MAX);
  saveHistory(endpoint.id, samples);
}

/* ------------------------------------------------------------------ */
/* Telemetry collection                                                */
/* ------------------------------------------------------------------ */

const healthOf = (obj) => obj?.Status?.Health ?? 'OK';

/** Collect telemetry from one iLO endpoint. Never throws. */
async function collectTelemetry(endpoint) {
  const started = Date.now();
  try {
    const [sysRes, thermalRes, powerRes] = await Promise.allSettled([
      redfishGet(endpoint.host, '/redfish/v1/Systems/1/', endpoint.username, endpoint.password),
      redfishGet(endpoint.host, '/redfish/v1/Chassis/1/Thermal/', endpoint.username, endpoint.password),
      redfishGet(endpoint.host, '/redfish/v1/Chassis/1/Power/', endpoint.username, endpoint.password),
    ]);

    if (sysRes.status === 'rejected') {
      return { ok: false, error: sysRes.reason.message, fetchedAt: new Date().toISOString() };
    }

    const sys = sysRes.value;
    const thermal = thermalRes.status === 'fulfilled' ? thermalRes.value : {};
    const power = powerRes.status === 'fulfilled' ? powerRes.value : {};

    const temperatures = (thermal.Temperatures ?? [])
      // Omit sensors reading 0°C — these are unpopulated/not physically present.
      .filter((t) => t.ReadingCelsius != null && t.ReadingCelsius > 0)
      .map((t) => ({
        name: t.Name ?? 'Sensor',
        readingC: t.ReadingCelsius,
        upperCaution: t.UpperThresholdCaution ?? null,
        upperCritical: t.UpperThresholdCritical ?? null,
        status: healthOf(t),
      }));

    const fans = (thermal.Fans ?? [])
      // Omit fans reading 0 — a fan at 0 isn't physically present.
      .filter((f) => (f.Reading ?? f.CurrentReading ?? 0) > 0)
      .map((f) => ({
        name: f.Name ?? f.FanName ?? 'Fan',
        // iLO uses CurrentReading/Units (older Redfish) or Reading/ReadingUnits.
        reading: f.Reading ?? f.CurrentReading ?? null,
        units: f.ReadingUnits ?? f.Units ?? '%',
        status: healthOf(f),
      }));

    const control = power.PowerControl?.[0] ?? {};
    const powerInfo = {
      consumedWatts: control.PowerConsumedWatts ?? null,
      capacityWatts: control.PowerCapacityWatts ?? null,
      supplies: (power.PowerSupplies ?? []).map((p) => ({
        name: p.Name ?? 'PSU',
        outputWatts: p.PowerOutputWatts ?? null,
        capacityWatts: p.PowerCapacityWatts ?? null,
        status: healthOf(p),
      })),
    };

    return {
      ok: true,
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      system: {
        hostname: sys.HostName ?? null,
        model: sys.Model ?? null,
        serialNumber: sys.SerialNumber ?? null,
        biosVersion: sys.BiosVersion ?? null,
        powerState: sys.PowerState ?? 'Unknown',
        health: healthOf(sys),
        memoryTotalGb: sys.MemorySummary?.TotalSystemMemoryGiB ?? null,
        memoryHealth: sys.MemorySummary?.Status?.Health ?? null,
        cpuCount: sys.ProcessorSummary?.Count ?? null,
        cpuModel: sys.ProcessorSummary?.Model ?? null,
        cpuHealth: sys.ProcessorSummary?.Status?.Health ?? null,
      },
      temperatures,
      fans,
      power: powerInfo,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'Unknown error',
      fetchedAt: new Date().toISOString(),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Generic Service Polling Dispatcher                                 */
/* ------------------------------------------------------------------ */

async function pollSingleService(service) {
  const started = Date.now();
  try {
    let data = null;
    switch (service.type) {
      case 'peanut':
        data = await pollPeaNUT(service);
        break;
      case 'plex':
        data = await pollPlex(service);
        break;
      case 'tautulli':
        data = await pollTautulli(service);
        break;
      case 'audiobookshelf':
        data = await pollAudiobookshelf(service);
        break;
      case 'seer':
        data = await pollSeer(service);
        break;
      case 'sonarr':
      case 'radarr':
      case 'lidarr':
      case 'bazarr':
        data = await pollArr(service, service.type);
        break;
      case 'sabnzbd':
        data = await pollSABnzbd(service);
        break;
      case 'pve':
        data = await pollPve(service);
        break;
      case 'pbs':
        data = await pollPbs(service);
        break;
      case 'unifi':
        data = await pollUnifi(service);
        break;
      case 'opnsense':
        data = await pollOpnsense(service);
        break;
      case 'portainer':
        data = await pollPortainer(service);
        break;
      case 'nginx':
        data = await pollNginx(service);
        break;
      default:
        throw new Error(`Unsupported service type: ${service.type}`);
    }

    return {
      ok: true,
      serviceId: service.id,
      type: service.type,
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      data,
    };
  } catch (err) {
    return {
      ok: false,
      serviceId: service.id,
      type: service.type,
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      error: err.message || 'Failed to poll service',
    };
  }
}

/* ------------------------------------------------------------------ */
/* HTTP server                                                         */
/* ------------------------------------------------------------------ */

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api','endpoints',':id','test']

  try {
    if (req.method === 'OPTIONS') return sendJson(res, 204, {});

    /* ============================================================== */
    /* Homelab Unified Config Routes                                  */
    /* ============================================================== */

    // GET /api/config
    if (req.method === 'GET' && url.pathname === '/api/config') {
      const cfg = loadHomelabConfig();
      return sendJson(res, 200, {
        ...cfg,
        spotify: sanitizeSpotifyConfig(cfg.spotify),
        services: (cfg.services || []).map(sanitizeServiceConfig),
      });
    }

    // PUT /api/config/layout
    if (req.method === 'PUT' && url.pathname === '/api/config/layout') {
      const body = await readBody(req);
      const cfg = loadHomelabConfig();
      if (body.dashboardLayout) cfg.dashboardLayout = body.dashboardLayout;
      if (body.refreshInterval !== undefined) cfg.refreshInterval = body.refreshInterval;
      if (body.theme) cfg.theme = body.theme;
      saveHomelabConfig(cfg);
      return sendJson(res, 200, { ok: true, layout: cfg.dashboardLayout });
    }

    // GET /api/quicklinks
    if (req.method === 'GET' && url.pathname === '/api/quicklinks') {
      const cfg = loadHomelabConfig();
      return sendJson(res, 200, cfg.quickLinks || []);
    }

    // POST /api/quicklinks
    if (req.method === 'POST' && url.pathname === '/api/quicklinks') {
      const body = await readBody(req);
      if (!body.title || !body.url) {
        return sendJson(res, 400, { error: 'title and url are required' });
      }
      const cfg = loadHomelabConfig();
      const newLink = {
        id: body.id || `ql-${crypto.randomUUID().slice(0, 8)}`,
        title: body.title.trim(),
        url: body.url.trim(),
        icon: body.icon?.trim() || 'globe',
        category: body.category?.trim() || 'General',
        description: body.description?.trim() || '',
        openNewTab: body.openNewTab ?? true,
      };
      cfg.quickLinks = [...(cfg.quickLinks || []), newLink];
      saveHomelabConfig(cfg);
      return sendJson(res, 201, newLink);
    }

    // PUT /api/quicklinks/:id
    if (req.method === 'PUT' && parts[0] === 'api' && parts[1] === 'quicklinks' && parts[2]) {
      const body = await readBody(req);
      const cfg = loadHomelabConfig();
      const idx = (cfg.quickLinks || []).findIndex((l) => l.id === parts[2]);
      if (idx === -1) return sendJson(res, 404, { error: 'Quick link not found' });
      cfg.quickLinks[idx] = {
        ...cfg.quickLinks[idx],
        ...body,
        id: parts[2],
      };
      saveHomelabConfig(cfg);
      return sendJson(res, 200, cfg.quickLinks[idx]);
    }

    // DELETE /api/quicklinks/:id
    if (req.method === 'DELETE' && parts[0] === 'api' && parts[1] === 'quicklinks' && parts[2]) {
      const cfg = loadHomelabConfig();
      cfg.quickLinks = (cfg.quickLinks || []).filter((l) => l.id !== parts[2]);
      saveHomelabConfig(cfg);
      return sendJson(res, 200, { ok: true });
    }

    // GET /api/services
    if (req.method === 'GET' && url.pathname === '/api/services') {
      const cfg = loadHomelabConfig();
      return sendJson(res, 200, (cfg.services || []).map(sanitizeServiceConfig));
    }

    // POST /api/services
    if (req.method === 'POST' && url.pathname === '/api/services') {
      const body = await readBody(req);
      if (!body.type || !body.name || !body.host) {
        return sendJson(res, 400, { error: 'type, name and host are required' });
      }
      const cfg = loadHomelabConfig();
      const newService = {
        id: body.id || `svc-${crypto.randomUUID().slice(0, 8)}`,
        type: body.type,
        name: body.name.trim(),
        category: body.category || 'overview',
        host: body.host.trim(),
        apiKey: body.apiKey?.trim() || undefined,
        apiSecret: body.apiSecret?.trim() || undefined,
        username: body.username?.trim() || undefined,
        password: body.password || undefined,
        sotf: Boolean(body.sotf),
        disabled: Boolean(body.disabled),
      };
      cfg.services = [...(cfg.services || []), newService];
      saveHomelabConfig(cfg);
      return sendJson(res, 201, sanitizeServiceConfig(newService));
    }

    // PUT /api/services/:id
    if (req.method === 'PUT' && parts[0] === 'api' && parts[1] === 'services' && parts[2]) {
      const body = await readBody(req);
      const cfg = loadHomelabConfig();
      const idx = (cfg.services || []).findIndex((s) => s.id === parts[2]);
      if (idx === -1) return sendJson(res, 404, { error: 'Service not found' });
      const current = cfg.services[idx];
      cfg.services[idx] = {
        ...current,
        name: body.name !== undefined ? body.name.trim() : current.name,
        category: body.category !== undefined ? body.category : current.category,
        host: body.host !== undefined ? body.host.trim() : current.host,
        apiKey: body.apiKey !== undefined && body.apiKey !== '' ? body.apiKey.trim() : current.apiKey,
        apiSecret: body.apiSecret !== undefined && body.apiSecret !== '' ? body.apiSecret.trim() : current.apiSecret,
        username: body.username !== undefined ? body.username.trim() : current.username,
        password: body.password !== undefined && body.password !== '' ? body.password : current.password,
        sotf: body.sotf !== undefined ? Boolean(body.sotf) : current.sotf,
        disabled: body.disabled !== undefined ? Boolean(body.disabled) : current.disabled,
      };
      saveHomelabConfig(cfg);
      return sendJson(res, 200, sanitizeServiceConfig(cfg.services[idx]));
    }

    // DELETE /api/services/:id
    if (req.method === 'DELETE' && parts[0] === 'api' && parts[1] === 'services' && parts[2]) {
      const cfg = loadHomelabConfig();
      cfg.services = (cfg.services || []).filter((s) => s.id !== parts[2]);
      cfg.dashboardLayout.widgets = (cfg.dashboardLayout.widgets || []).filter((w) => w.serviceId !== parts[2]);
      saveHomelabConfig(cfg);
      return sendJson(res, 200, { ok: true });
    }

    // GET /api/services/status — poll all configured homelab services in parallel
    if (req.method === 'GET' && url.pathname === '/api/services/status') {
      const cfg = loadHomelabConfig();
      const activeServices = (cfg.services || []).filter((s) => !s.disabled);
      const results = await Promise.all(
        activeServices.map((svc) => pollSingleService(svc))
      );
      const map = {};
      results.forEach((r) => {
        map[r.serviceId] = r;
      });
      return sendJson(res, 200, map);
    }

    // POST /api/services/:id/test
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'services' && parts[2] && parts[3] === 'test') {
      const cfg = loadHomelabConfig();
      const service = (cfg.services || []).find((s) => s.id === parts[2]);
      if (!service) return sendJson(res, 404, { error: 'Service not found' });
      const testRes = await pollSingleService(service);
      return sendJson(res, 200, testRes);
    }

    // POST /api/services/:id/power — send a power action to a PVE VM/LXC
    // Body: { vmid: number, action: 'start'|'stop'|'shutdown'|'reboot'|'reset' }
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'services' && parts[2] && parts[3] === 'power') {
      const cfg = loadHomelabConfig();
      const service = (cfg.services || []).find((s) => s.id === parts[2]);
      if (!service) return sendJson(res, 404, { error: 'Service not found' });
      if (service.type !== 'pve') {
        return sendJson(res, 400, { error: 'Power control is only supported for Proxmox VE (pve) services' });
      }
      const body = await readBody(req);
      if (body.vmid == null || !body.action) {
        return sendJson(res, 400, { error: 'vmid and action are required' });
      }
      try {
        const result = await pvePowerAction(service, body.vmid, body.action);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: err.message || 'Failed to send power action' });
      }
    }

    // POST /api/services/:id/guests — create a new LXC container or QEMU VM
    // Body: { type: 'lxc'|'qemu', hostname, node?, vmid?, cores, memoryMb, diskGb,
    //         storage?, template? (lxc), iso? (qemu), bridge?, password?, sshKeys?, start? }
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'services' && parts[2] && parts[3] === 'guests') {
      const cfg = loadHomelabConfig();
      const service = (cfg.services || []).find((s) => s.id === parts[2]);
      if (!service) return sendJson(res, 404, { error: 'Service not found' });
      if (service.type !== 'pve') {
        return sendJson(res, 400, { error: 'Guest creation is only supported for Proxmox VE (pve) services' });
      }
      const body = await readBody(req);
      if (!body.hostname || !body.type) {
        return sendJson(res, 400, { error: 'hostname and type (lxc|qemu) are required' });
      }
      try {
        const result = await pveCreateGuest(service, body);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: err.message || 'Failed to create guest' });
      }
    }

    // GET /api/services/:id/storage-content?content=vztmpl|iso — list templates/ISOs
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'services' && parts[2] && parts[3] === 'storage-content') {
      const cfg = loadHomelabConfig();
      const service = (cfg.services || []).find((s) => s.id === parts[2]);
      if (!service) return sendJson(res, 404, { error: 'Service not found' });
      if (service.type !== 'pve') {
        return sendJson(res, 400, { error: 'Only supported for Proxmox VE (pve) services' });
      }
      const content = url.searchParams.get('content') || 'vztmpl';
      try {
        const items = await pveListStorageContent(service, url.searchParams.get('node'), content);
        return sendJson(res, 200, { ok: true, items });
      } catch (err) {
        return sendJson(res, 200, { ok: false, items: [], error: err.message || 'Failed to list storage' });
      }
    }

    // GET /api/alerts — evaluate + return current PVE/PBS/service alerts
    if (req.method === 'GET' && url.pathname === '/api/alerts') {
      try {
        // Re-evaluate at most every 30 seconds; otherwise serve cached state.
        if (Date.now() - lastAlertEval > 30_000) await evaluateAlerts();
        return sendJson(res, 200, {
          alerts: alertState,
          unacknowledged: alertState.filter((a) => !a.acknowledged).length,
          evaluatedAt: lastAlertEval,
        });
      } catch (err) {
        return sendJson(res, 500, { error: err.message || 'Failed to evaluate alerts' });
      }
    }

    // POST /api/alerts/ack — acknowledge one alert ({ id }) or all ({ all: true })
    if (req.method === 'POST' && url.pathname === '/api/alerts/ack') {
      const body = await readBody(req);
      if (body.all) {
        alertState = alertState.map((a) => ({ ...a, acknowledged: true }));
      } else if (body.id) {
        alertState = alertState.map((a) => (a.id === body.id ? { ...a, acknowledged: true } : a));
      }
      return sendJson(res, 200, { ok: true, alerts: alertState });
    }

    // GET /api/arr/calendar — aggregate calendar entries from all configured Sonarr/Radarr/Lidarr services
    if (req.method === 'GET' && url.pathname === '/api/arr/calendar') {
      const cfg = loadHomelabConfig();
      const arrServices = (cfg.services || []).filter(
        (s) => !s.disabled && ['sonarr', 'radarr', 'lidarr'].includes(s.type)
      );
      const results = await Promise.all(
        arrServices.map(async (svc) => {
          try {
            const data = await pollArr(svc, svc.type);
            return (data.upcomingCalendar || []).map((item) => ({
              ...item,
              serviceName: svc.name,
              serviceId: svc.id,
            }));
          } catch {
            return [];
          }
        })
      );
      const combined = results.flat().sort((a, b) => new Date(a.airDateUtc).getTime() - new Date(b.airDateUtc).getTime());
      return sendJson(res, 200, combined);
    }

    /* ---- GET /api/music/config ---- */
    if (req.method === 'GET' && url.pathname === '/api/music/config') {
      const cfg = loadHomelabConfig();
      return sendJson(res, 200, sanitizeSpotifyConfig(cfg.spotify));
    }

    // PUT /api/music/config
    if (req.method === 'PUT' && url.pathname === '/api/music/config') {
      const body = await readBody(req);
      const cfg = loadHomelabConfig();
      const current = cfg.spotify || {};
      cfg.spotify = {
        clientId: body.clientId !== undefined ? String(body.clientId).trim() : current.clientId,
        clientSecret: body.clientSecret !== undefined && body.clientSecret !== '' ? String(body.clientSecret).trim() : current.clientSecret,
        lidarrRootFolder: body.lidarrRootFolder !== undefined ? String(body.lidarrRootFolder).trim() : current.lidarrRootFolder,
        lidarrQualityProfileId: body.lidarrQualityProfileId !== undefined ? body.lidarrQualityProfileId : current.lidarrQualityProfileId,
        lidarrMetadataProfileId: body.lidarrMetadataProfileId !== undefined ? body.lidarrMetadataProfileId : current.lidarrMetadataProfileId,
        market: body.market !== undefined && body.market !== '' ? String(body.market).trim().toUpperCase() : (current.market || 'US'),
      };
      saveHomelabConfig(cfg);
      return sendJson(res, 200, sanitizeSpotifyConfig(cfg.spotify));
    }

    // GET /api/music/search?q=... — search public Spotify playlists
    if (req.method === 'GET' && url.pathname === '/api/music/search') {
      const cfg = loadHomelabConfig();
      const spotify = cfg.spotify || {};
      const q = url.searchParams.get('q') || '';
      if (!hasSpotifyCredentials(spotify)) {
        return sendJson(res, 400, { error: 'Spotify credentials not configured. Set them in Settings → Music.' });
      }
      try {
        const playlists = await searchSpotifyPlaylists(spotify, q);
        return sendJson(res, 200, { ok: true, playlists });
      } catch (err) {
        return sendJson(res, 200, { ok: false, playlists: [], error: err.message || 'Spotify search failed' });
      }
    }

    // GET /api/music/compare?playlist=<url|id> — fetch + compare a Spotify playlist against Lidarr
    if (req.method === 'GET' && url.pathname === '/api/music/compare') {
      const cfg = loadHomelabConfig();
      const spotify = cfg.spotify || {};
      const input = url.searchParams.get('playlist') || '';
      if (!hasSpotifyCredentials(spotify)) {
        return sendJson(res, 400, { error: 'Spotify credentials not configured. Set them in Settings → Music.' });
      }
      if (!input) return sendJson(res, 400, { error: 'playlist is required' });

      try {
        const lidarrService = pickLidarrService(cfg);
        if (!lidarrService) {
          return sendJson(res, 400, {
            error: 'No enabled Lidarr service is configured. Add one in Settings → Services.',
          });
        }

        const [playlist, index] = await Promise.all([
          fetchSpotifyPlaylist(spotify, input),
          buildLidarrIndex(lidarrService),
        ]);
        const tracks = matchTracks(playlist.tracks, index);

        const counts = tracks.reduce(
          (acc, t) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
          },
          { exists: 0, missing: 0, missingAlbum: 0 }
        );

        return sendJson(res, 200, {
          ok: true,
          playlist: { id: playlist.id, name: playlist.name, url: playlist.url, imageUrl: playlist.imageUrl, owner: playlist.owner, trackCount: playlist.trackCount },
          tracks,
          counts,
        });
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: err.message || 'Comparison failed' });
      }
    }

    // GET /api/music/lookup?term=... — Lidarr artist lookup (debugging / pre-flight)
    if (req.method === 'GET' && url.pathname === '/api/music/lookup') {
      const cfg = loadHomelabConfig();
      const lidarrService = pickLidarrService(cfg);
      const term = url.searchParams.get('term') || '';
      if (!lidarrService) return sendJson(res, 400, { error: 'No enabled Lidarr service configured' });
      try {
        const results = await lookupLidarrArtist(lidarrService, term);
        return sendJson(res, 200, { ok: true, results: results.slice(0, 8) });
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: err.message || 'Lookup failed' });
      }
    }

    // POST /api/music/artist — add a missing artist to Lidarr.  Body: { name, qualityProfileId?, metadataProfileId?, rootFolderPath?, monitor?, searchForNewAlbum? }
    if (req.method === 'POST' && url.pathname === '/api/music/artist') {
      const body = await readBody(req);
      const cfg = loadHomelabConfig();
      const lidarrService = pickLidarrService(cfg);
      if (!lidarrService) {
        return sendJson(res, 400, { error: 'No enabled Lidarr service configured' });
      }
      if (!body.name || !String(body.name).trim()) {
        return sendJson(res, 400, { error: 'name is required' });
      }
      const spotify = cfg.spotify || {};
      const defaults = {
        rootFolderPath: body.rootFolderPath ?? spotify.lidarrRootFolder,
        qualityProfileId: body.qualityProfileId ?? spotify.lidarrQualityProfileId,
        metadataProfileId: body.metadataProfileId ?? spotify.lidarrMetadataProfileId,
        monitor: body.monitor !== false,
        searchForNewAlbum: body.searchForNewAlbum !== false,
      };
      try {
        const artist = await addArtistToLidarr(lidarrService, String(body.name).trim(), defaults);
        return sendJson(res, 200, { ok: true, artistId: artist.id || null, name: artist.artistName || body.name });
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: err.message || 'Failed to add artist to Lidarr' });
      }
    }

    /* ---- GET /api/endpoints ---- */
    if (req.method === 'GET' && url.pathname === '/api/endpoints') {
      return sendJson(res, 200, loadEndpoints().map(publicEndpoint));
    }

    /* ---- POST /api/endpoints ---- */
    if (req.method === 'POST' && url.pathname === '/api/endpoints') {
      const body = await readBody(req);
      if (!body.host || !body.username || !body.password) {
        return sendJson(res, 400, { error: 'host, username and password are required' });
      }
      const endpoints = loadEndpoints();
      const endpoint = {
        id: crypto.randomUUID(),
        name: body.name?.trim() || body.host,
        host: body.host.trim(),
        username: body.username.trim(),
        password: body.password,
        sotf: !!body.sotf,
      };
      endpoints.push(endpoint);
      saveEndpoints(endpoints);
      return sendJson(res, 201, publicEndpoint(endpoint));
    }

    /* ---- Routes with :id ---- */
    if (parts[0] === 'api' && parts[1] === 'endpoints' && parts[2]) {
      const endpoints = loadEndpoints();
      const endpoint = endpoints.find((e) => e.id === parts[2]);
      if (!endpoint && parts[3] !== undefined) {
        return sendJson(res, 404, { error: 'Endpoint not found' });
      }

      /* ---- PUT /api/endpoints/:id ---- */
      if (req.method === 'PUT' && parts.length === 3) {
        const body = await readBody(req);
        if (body.name !== undefined) endpoint.name = String(body.name).trim() || endpoint.name;
        if (body.host !== undefined) endpoint.host = String(body.host).trim();
        if (body.username !== undefined) endpoint.username = String(body.username).trim();
        if (body.password) endpoint.password = body.password; // empty = keep existing
        if (body.sotf !== undefined) endpoint.sotf = !!body.sotf;
        saveEndpoints(endpoints);
        return sendJson(res, 200, publicEndpoint(endpoint));
      }

      /* ---- DELETE /api/endpoints/:id ---- */
      if (req.method === 'DELETE' && parts.length === 3) {
        saveEndpoints(endpoints.filter((e) => e.id !== endpoint.id));
        return sendJson(res, 200, { ok: true });
      }

      /* ---- POST /api/endpoints/:id/test ---- */
      if (req.method === 'POST' && parts[3] === 'test') {
        try {
          const root = await redfishGet(
            endpoint.host,
            '/redfish/v1/Systems/1/',
            endpoint.username,
            endpoint.password,
          );
          return sendJson(res, 200, {
            ok: true,
            message: `Connected. Found ${root.Model ?? 'system'} (${root.SerialNumber ?? 'no serial'}).`,
          });
        } catch (err) {
          return sendJson(res, 200, { ok: false, message: err.message });
        }
      }

      /* ---- POST /api/endpoints/:id/fans ---- */
      if (req.method === 'POST' && parts[3] === 'fans') {
        if (!endpoint.sotf) {
          return sendJson(res, 400, {
            error: 'Silence of the Fans is not enabled for this endpoint.',
          });
        }
        const body = await readBody(req);
        try {
          if (body.action === 'reset') {
            const result = await resetFanControl(endpoint);
            return sendJson(res, 200, result);
          }
          if (body.percent == null) {
            return sendJson(res, 400, { error: 'percent is required' });
          }
          const result = await setFanSpeed(endpoint, body.percent);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendJson(res, 200, {
            ok: false,
            error: err.message || 'Failed to set fan speed',
          });
        }
      }
    }

    /* ---- GET /api/telemetry — poll all endpoints in parallel ---- */
    if (req.method === 'GET' && url.pathname === '/api/telemetry') {
      const endpoints = loadEndpoints();
      const results = await Promise.all(
        endpoints.map(async (ep) => {
          const telemetry = await collectTelemetry(ep);
          recordHistory(ep, telemetry);
          return [ep.id, telemetry];
        }),
      );
      return sendJson(res, 200, Object.fromEntries(results));
    }

    /* ---- POST /api/endpoints/:id/power ---- */
    if (parts[0] === 'api' && parts[1] === 'endpoints' && parts[2] && parts[3] === 'power') {
      const endpoint = loadEndpoints().find((e) => e.id === parts[2]);
      if (!endpoint) return sendJson(res, 404, { error: 'Endpoint not found' });
      const body = await readBody(req);
      const action = body.action;
      const valid = ['On', 'ForceOff', 'GracefulShutdown', 'GracefulRestart', 'ForceRestart', 'Nmi'];
      if (!valid.includes(action)) {
        return sendJson(res, 400, { error: `Invalid power action. Valid: ${valid.join(', ')}` });
      }
      try {
        const result = await powerAction(endpoint, action);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: err.message });
      }
    }

    /* ---- GET /api/endpoints/:id/events ---- */
    if (parts[0] === 'api' && parts[1] === 'endpoints' && parts[2] && parts[3] === 'events') {
      const endpoint = loadEndpoints().find((e) => e.id === parts[2]);
      if (!endpoint) return sendJson(res, 404, { error: 'Endpoint not found' });
      try {
        const result = await fetchEventLog(endpoint);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: err.message });
      }
    }

    /* ---- GET /api/endpoints/:id/history ---- */
    if (parts[0] === 'api' && parts[1] === 'endpoints' && parts[2] && parts[3] === 'history') {
      const endpoint = loadEndpoints().find((e) => e.id === parts[2]);
      if (!endpoint) return sendJson(res, 404, { error: 'Endpoint not found' });
      return sendJson(res, 200, { ok: true, samples: loadHistory(endpoint.id) });
    }

    /* ---- Serve the built frontend (production) ---- */
    if (req.method === 'GET' && fs.existsSync(DIST_DIR)) {
      return serveStatic(req, res, url.pathname);
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`iLO Dashboard backend listening on http://localhost:${PORT}`);
});

/* ------------------------------------------------------------------ */
/* WebSocket endpoint: /ws/shell — interactive SSH terminal bridge     */
/* ------------------------------------------------------------------ */
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/ws/shell') {
    socket.destroy();
    return;
  }

  // Auth + target come from the query string; the browser never talks to the
  // SSH host directly, this server brokers the whole session.
  const cfg = loadHomelabConfig();
  const serviceId = url.searchParams.get('serviceId');
  const vmid = url.searchParams.get('vmid');
  const service = (cfg.services || []).find((s) => s.id === serviceId);

  if (!service || service.type !== 'pve') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  // Resolve the PVE host SSH target. The service host is the web API
  // (https://host:8006); SSH lives on the same hostname at port 22.
  let sshHost;
  try {
    sshHost = new URL(service.host).hostname;
  } catch {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  const username = url.searchParams.get('username') || service.username || 'root';
  const password = url.searchParams.get('password') || service.password || '';

  wss.handleUpgrade(req, socket, head, (ws) => {
    // If neither the request nor the stored service config carries an SSH
    // password, ask the browser for credentials instead of failing blindly.
    if (!password) {
      ws.once('message', (raw) => {
        try {
          const creds = JSON.parse(raw.toString());
          const node = url.searchParams.get('node');
          const command = vmid && url.searchParams.get('type') === 'lxc'
            ? `pct enter ${vmid}`
            : node
              ? `ssh -o StrictHostKeyChecking=no root@${node}`
              : undefined;
          bridgeSshShell(ws, {
            host: sshHost,
            port: 22,
            username: creds.username || username,
            password: creds.password || '',
            command,
          });
        } catch {
          ws.close();
        }
      });
      ws.send('\u0000needauth');
      return;
    }

    // For LXC containers, enter the container via pct; for the host or a VM,
    // drop straight into a root shell on the PVE node.
    const node = url.searchParams.get('node');
    const command = vmid && url.searchParams.get('type') === 'lxc'
      ? `pct enter ${vmid}`
      : node
        ? `ssh -o StrictHostKeyChecking=no root@${node}`
        : undefined;
    bridgeSshShell(ws, { host: sshHost, port: 22, username, password, command });
  });
});
