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

const PORT = Number(process.env.PORT || 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(__dirname, 'endpoints.json');
const REDFISH_TIMEOUT_MS = 15_000;

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
  return { id: ep.id, name: ep.name, host: ep.host, username: ep.username };
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
    }

    /* ---- GET /api/console/:id/* — proxy the iLO web UI with stored creds ---- */
    if (parts[0] === 'api' && parts[1] === 'console' && parts[2]) {
      const endpoint = loadEndpoints().find((e) => e.id === parts[2]);
      if (!endpoint) return sendJson(res, 404, { error: 'Endpoint not found' });

      const { hostname, port } = parseHost(endpoint.host);
      const targetPath = '/' + parts.slice(3).join('/') + (url.search || '');
      const auth = Buffer.from(`${endpoint.username}:${endpoint.password}`).toString('base64');

      const proxyReq = https.request(
        {
          hostname,
          port,
          path: targetPath,
          method: req.method,
          rejectUnauthorized: false,
          headers: {
            ...req.headers,
            host: `${hostname}:${port}`,
            authorization: `Basic ${auth}`,
          },
          timeout: REDFISH_TIMEOUT_MS,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, {
            'content-type': proxyRes.headers['content-type'] || 'text/html',
            'content-length': proxyRes.headers['content-length'],
            'cache-control': 'no-store',
          });
          proxyRes.pipe(res);
        },
      );
      proxyReq.on('timeout', () => proxyReq.destroy(new Error('Console timed out')));
      proxyReq.on('error', () => {
        if (!res.headersSent) sendJson(res, 502, { error: 'Console unreachable' });
        else res.end();
      });
      req.pipe(proxyReq);
      return;
    }

    /* ---- GET /api/telemetry — poll all endpoints in parallel ---- */
    if (req.method === 'GET' && url.pathname === '/api/telemetry') {
      const endpoints = loadEndpoints();
      const results = await Promise.all(
        endpoints.map(async (ep) => [ep.id, await collectTelemetry(ep)]),
      );
      return sendJson(res, 200, Object.fromEntries(results));
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`iLO Dashboard backend listening on http://localhost:${PORT}`);
});
