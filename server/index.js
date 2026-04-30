'use strict';

const http             = require('http');
const fs               = require('fs');
const path             = require('path');
const { WebSocketServer } = require('ws');
const { Game }         = require('./game');
const { randomUUID }   = require('crypto');

const PORT       = process.env.PORT || 3005;
const CLIENT_DIR = path.resolve(__dirname, '..', 'client');
const MIME       = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
};

const httpServer = http.createServer((req, res) => {
  const urlPath  = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.resolve(CLIENT_DIR, '.' + urlPath);
  if (!filePath.startsWith(CLIENT_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
});

const wss      = new WebSocketServer({ server: httpServer });
const sessions     = new Map();   // sessionId -> ws
const savedUpgrades = new Map();  // sessionId -> { upgradePoints, upgradeTiers }
const shipFlags    = new Map();   // shipId -> base64 data URL
const shipArrrs    = new Map();   // shipId -> base64 audio data URL

const game = new Game(msg => {
  for (const ws of sessions.values()) {
    if (ws.readyState === 1) ws.send(msg);
  }
});
game.start();

wss.on('connection', ws => {
  let sessionId = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.t === 'join') {
      sessionId = msg.sessionId || randomUUID();
      sessions.set(sessionId, ws);
      const ship = game.addPlayer(sessionId, (msg.name || 'Pirat').slice(0, 16));
      if (!ship) { ws.send(JSON.stringify({ t: 'error', e: 'full' })); return; }
      const saved = savedUpgrades.get(sessionId);
      if (saved) ship.restoreUpgrades(saved.upgradePoints, saved.upgradeTiers);
      ws.send(JSON.stringify({ t: 'joined', sessionId, shipId: ship.id }));
      // Send all existing flags and arrrs to the new player
      for (const [sid, data] of shipFlags) {
        ws.send(JSON.stringify({ t: 'flag', shipId: sid, data }));
      }
      for (const [sid, data] of shipArrrs) {
        ws.send(JSON.stringify({ t: 'arrr', shipId: sid, data }));
      }
      return;
    }
    if (msg.t === 'flag' && sessionId) {
      const ship = game.getShip(sessionId);
      if (!ship) return;
      // Validate it looks like a data URL, cap size at ~400KB base64
      if (typeof msg.data !== 'string' || !msg.data.startsWith('data:image/') || msg.data.length > 400000) return;
      shipFlags.set(ship.id, msg.data);
      const flagMsg = JSON.stringify({ t: 'flag', shipId: ship.id, data: msg.data });
      for (const ws2 of sessions.values()) { if (ws2.readyState === 1) ws2.send(flagMsg); }
      return;
    }
    if (msg.t === 'arrr' && sessionId) {
      const ship = game.getShip(sessionId);
      if (!ship) return;
      if (typeof msg.data !== 'string' || !msg.data.startsWith('data:audio/') || msg.data.length > 600000) return;
      shipArrrs.set(ship.id, msg.data);
      const arrrMsg = JSON.stringify({ t: 'arrr', shipId: ship.id, data: msg.data });
      for (const ws2 of sessions.values()) { if (ws2.readyState === 1) ws2.send(arrrMsg); }
      return;
    }
    if (msg.t === 'input'     && sessionId) { game.setInput(sessionId, msg); return; }
    if (msg.t === 'upgrade'   && sessionId) { game.applyUpgrade(sessionId, msg.kind); return; }
    if (msg.t === 'buyWeapon' && sessionId) { game.buyWeapon(sessionId, msg.kind); return; }
    if (msg.t === 'buyMines'  && sessionId) { game.buyMines(sessionId); return; }
    if (msg.t === 'respawn' && sessionId) {
      game.removePlayer(sessionId);
      const ship = game.addPlayer(sessionId, (msg.name || 'Pirat').slice(0, 16));
      if (ship) ws.send(JSON.stringify({ t: 'joined', sessionId, shipId: ship.id }));
    }
  });

  ws.on('close', () => {
    if (sessionId) {
      const ship = game.getShip(sessionId);
      if (ship) {
        savedUpgrades.set(sessionId, { upgradePoints: ship.upgradePoints, upgradeTiers: { ...ship.upgradeTiers } });
        shipFlags.delete(ship.id);
        shipArrrs.delete(ship.id);
      }
      sessions.delete(sessionId);
      game.removePlayer(sessionId);
    }
  });
});

httpServer.listen(PORT, () => console.log(`Pirata running on :${PORT}`));
