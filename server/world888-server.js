/**
 * World 888 — Standalone Multiplayer Server
 *
 * Serves the player_viewer.html to ALL clients (Obsidian iframe, popup, LAN browsers)
 * and provides real-time player sync via Server-Sent Events (SSE) + HTTP POST.
 *
 * No external dependencies — uses Node.js built-ins only.
 *
 * Start standalone:  node server/world888-server.js
 * Start from Obsidian: require('./world888-server.js').start(assetsFolder)
 *
 * Endpoints:
 *   GET  /                → player_viewer.html
 *   GET  /assets/*        → static files from assets/ folder
 *   GET  /glb/*           → GLB files (served from assets/glb/)
 *   POST /sync            → player sends position { id, name, position, rotation }
 *   POST /leave           → player disconnects { id }
 *   GET  /events?id=xxx   → SSE stream — pushes other players' state in real-time
 *   GET  /players         → JSON snapshot of all active players
 *   GET  /status          → server info (port, player count, LAN URL)
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PORT = 8885;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.wasm': 'application/wasm',
};

// ─── State ────────────────────────────────────────────────────────────────────

/** @type {Map<string, {position, rotation, name, lastSeen: number}>} */
const players = new Map();

/** @type {Map<string, import('http').ServerResponse>} SSE subscriber responses */
const subscribers = new Map();

/** @type {Set<import('net').Socket>} active client connections */
const activeSockets = new Set();

let pruneInterval = null;
let serverInstance = null;

// Generate a dynamic passcode on startup: e.g. 888-A4B3
const serverPasscode = '888-' + Math.random().toString(36).substring(2, 6).toUpperCase();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Passcode, x-passcode');
}

function isLoopback(req) {
  const ip = req.socket.remoteAddress;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function verifyPasscode(req, url) {
  const provided = req.headers['x-passcode'] || url.searchParams.get('passcode');
  return provided === serverPasscode;
}

/**
 * Broadcast an SSE event to all connected clients except the sender.
 * @param {string} excludeId - sender's player ID (don't echo back)
 * @param {object} data
 */
function broadcast(excludeId, data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const [id, res] of subscribers) {
    if (id === excludeId) continue;
    try { res.write(msg); } catch (_) { subscribers.delete(id); }
  }
}

/** Read and JSON-parse the request body */
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => raw += chunk.toString());
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch (_) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

/** Get the local LAN IP for the status page */
function getLanIP() {
  const nets = os.networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// ─── Request Handler ──────────────────────────────────────────────────────────

function createHandler(assetsFolder) {
  return function handleRequest(req, res) {
    cors(res);

    // Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url      = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // ── POST /sync ─────────────────────────────────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/sync') {
      if (!isLoopback(req) && !verifyPasscode(req, url)) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
        return;
      }
      readBody(req).then(body => {
        const { id, name, position, rotation, orientation, isCrouching, isSprinting, isSliding, state } = body;
        if (!id) { res.writeHead(400); res.end('missing id'); return; }

        // Store the full state so new SSE subscribers get complete data on join
        players.set(id, {
          name:        name || `Player_${id.slice(-4)}`,
          position:    position   || { x: 0, y: 0, z: 0 },
          rotation:    rotation   ?? 0,
          orientation: orientation || { x: 0, y: 0, z: 0, w: 1 },
          isCrouching: isCrouching ?? false,
          isSprinting: isSprinting ?? false,
          isSliding:   isSliding   ?? false,
          state:       state || 'ON_GROUND',
          lastSeen:    Date.now()
        });

        // Rebroadcast the FULL payload so all clients can update ghost orientation
        broadcast(id, {
          type:     'UPDATE_STATE',
          senderId: id,
          payload:  { name: name || id, position, rotation, orientation, isCrouching, isSprinting, isSliding, state }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // ── POST /leave ───────────────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/leave') {
      if (!isLoopback(req) && !verifyPasscode(req, url)) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
        return;
      }
      readBody(req).then(body => {
        const { id } = body;
        if (id) {
          players.delete(id);
          subscribers.delete(id);
          broadcast(id, { type: 'PLAYER_LEFT', senderId: id });
        }
        res.writeHead(200);
        res.end('ok');
      });
      return;
    }

    // ── GET /players ──────────────────────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/players') {
      const list = [];
      for (const [id, p] of players) list.push({ id, ...p });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(list));
      return;
    }

    // ── GET /status ───────────────────────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/status') {
      const lanIP = getLanIP();
      const local = isLoopback(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        port: PORT,
        players: players.size,
        lanURL: `http://${lanIP}:${PORT}`,
        localURL: `http://localhost:${PORT}`,
        passcode: local ? serverPasscode : undefined
      }));
      return;
    }

    // ── POST /kill ────────────────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/kill') {
      if (!isLoopback(req)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden - Admin commands restricted to localhost');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('shutting down');
      console.log('[World888] Received /kill signal, shutting down process.');
      
      if (pruneInterval) clearInterval(pruneInterval);
      for (const [id, subRes] of subscribers) {
        try { subRes.end(); } catch(_) {}
      }
      subscribers.clear();
      for (const socket of activeSockets) {
        try { socket.destroy(); } catch(_) {}
      }
      activeSockets.clear();
      
      if (serverInstance) {
        try {
          serverInstance.close(() => {
            process.exit(0);
          });
        } catch(_) {
          process.exit(0);
        }
      }
      
      setTimeout(() => {
        process.exit(0);
      }, 500);
      return;
    }

    // ── GET /events (SSE) ─────────────────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/events') {
      if (!isLoopback(req) && !verifyPasscode(req, url)) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
        return;
      }
      const playerId = url.searchParams.get('id');
      if (!playerId) { res.writeHead(400); res.end('missing id'); return; }

      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',  // Disable nginx buffering
      });

      // Flush immediately (keeps connection alive in some proxies)
      res.write(': connected\n\n');

      // Send all currently active players to the new subscriber
      for (const [id, p] of players) {
        if (id === playerId) continue;
        const msg = JSON.stringify({
          type:     'UPDATE_STATE',
          senderId: id,
          payload:  {
            name:        p.name,
            position:    p.position,
            rotation:    p.rotation,
            orientation: p.orientation || { x: 0, y: 0, z: 0, w: 1 },
            isCrouching: p.isCrouching ?? false,
            isSprinting: p.isSprinting ?? false,
            isSliding:   p.isSliding   ?? false,
          }
        });
        res.write(`data: ${msg}\n\n`);
      }

      subscribers.set(playerId, res);

      // Keep-alive ping every 25s to prevent idle timeouts
      const keepAlive = setInterval(() => {
        try { res.write(': ping\n\n'); }
        catch (_) { clearInterval(keepAlive); subscribers.delete(playerId); }
      }, 25000);

      req.on('close', () => {
        clearInterval(keepAlive);
        subscribers.delete(playerId);
        players.delete(playerId);
        broadcast(playerId, { type: 'PLAYER_LEFT', senderId: playerId });
      });

      return;
    }

    // ── Static Files ──────────────────────────────────────────────────────────
    let filePath;
    if (pathname === '/' || pathname === '/index.html') {
      filePath = path.join(assetsFolder, 'player_viewer.html');
    } else {
      // /glb/scene888.glb  →  assets/glb/scene888.glb
      // /player_viewer.html → assets/player_viewer.html
      filePath = path.join(assetsFolder, pathname);
    }

    // Security: prevent path traversal
    const rel = path.relative(assetsFolder, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404); res.end('Not Found'); return;
      }

      const ext     = path.extname(filePath).toLowerCase();
      const mime    = MIME[ext] || 'application/octet-stream';
      const headers = { 'Content-Type': mime };

      // No-cache for HTML so updates are reflected immediately
      if (ext === '.html') {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma']  = 'no-cache';
        headers['Expires'] = '0';
      }

      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    });
  };
}

// ─── Server Lifecycle ─────────────────────────────────────────────────────────

/**
 * Start (or reuse) the World 888 server.
 * @param {string} assetsFolder - absolute path to the assets/ directory
 * @param {number} [port=8885]
 * @returns {import('http').Server}
 */
function start(assetsFolder, port = PORT) {
  const server = http.createServer(createHandler(assetsFolder));
  serverInstance = server;

  // Track sockets
  server.on('connection', (socket) => {
    activeSockets.add(socket);
    socket.on('close', () => activeSockets.delete(socket));
  });

  // Prune players that haven't synced in 15 seconds
  pruneInterval = setInterval(() => {
    const cutoff = Date.now() - 15000;
    for (const [id, p] of players) {
      if (p.lastSeen < cutoff) {
        players.delete(id);
        subscribers.delete(id);
        broadcast(id, { type: 'PLAYER_LEFT', senderId: id });
        console.log(`[World888] Pruned stale player ${id.slice(-6)}`);
      }
    }
  }, 10000);

  // Don't let the interval keep the process alive when used as a module
  if (pruneInterval.unref) pruneInterval.unref();

  let listeningAddress = '0.0.0.0';

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[World888] Port ${port} already in use — server likely already running.`);
    } else if ((err.code === 'EPERM' || err.code === 'EACCES') && listeningAddress === '0.0.0.0') {
      console.warn(`[World888] Permission denied binding to 0.0.0.0. Retrying on 127.0.0.1...`);
      listeningAddress = '127.0.0.1';
      server.listen(port, '127.0.0.1');
    } else {
      console.error('[World888] Server error:', err);
    }
  });

  server.listen(port, listeningAddress, () => {
    const lanIP = getLanIP();
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║      WORLD 888 — Multiplayer Server          ║`);
    console.log(`╠══════════════════════════════════════════════╣`);
    console.log(`║  Local:    http://localhost:${port}             ║`);
    if (listeningAddress === '0.0.0.0') {
      console.log(`║  LAN:      http://${lanIP.padEnd(15)}:${port}   ║`);
    } else {
      console.log(`║  LAN:      [Disabled due to local binding]   ║`);
    }
    console.log(`║  Passcode: ${serverPasscode.padEnd(31)} ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);
  });

  return server;
}

// ─── Entry Point (standalone) ─────────────────────────────────────────────────

if (require.main === module) {
  // Run standalone: node server/world888-server.js
  // Assets folder is one level up from this file
  const assetsFolder = path.join(__dirname, '..', 'assets');
  start(assetsFolder);
}

module.exports = { start, players, subscribers };
