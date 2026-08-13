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
/* HTTP server                                                         */
/* ------------------------------------------------------------------ */

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
