'use strict';

const http             = require('http');
const fs               = require('fs');
const path             = require('path');
const { WebSocketServer } = require('ws');
const { Game }         = require('./game');
const { randomUUID }   = require('crypto');

const PORT       = process.env.PORT || 3000;
const CLIENT_DIR = path.resolve(__dirname, '..', 'client');
const MIME       = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.webp': 'image/webp',
};

const httpServer = http.createServer((req, res) => {
  const urlPath  = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.resolve(CLIENT_DIR, '.' + urlPath);
  if (!filePath.startsWith(CLIENT_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss      = new WebSocketServer({ server: httpServer });
const sessions = new Map();   // sessionId -> ws

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
      const ship = game.addPlayer(sessionId, (msg.name || 'Pirat').slice(0, 16), msg.shipType || 'sloop');
      if (!ship) { ws.send(JSON.stringify({ t: 'error', e: 'full' })); return; }
      ws.send(JSON.stringify({ t: 'joined', sessionId, shipId: ship.id }));
      return;
    }
    if (msg.t === 'input' && sessionId)   { game.setInput(sessionId, msg); return; }
    if (msg.t === 'respawn' && sessionId) {
      game.removePlayer(sessionId);
      const ship = game.addPlayer(sessionId, (msg.name || 'Pirat').slice(0, 16), msg.shipType || 'sloop');
      if (ship) ws.send(JSON.stringify({ t: 'joined', sessionId, shipId: ship.id }));
    }
  });

  ws.on('close', () => {
    if (sessionId) { sessions.delete(sessionId); game.removePlayer(sessionId); }
  });
});

httpServer.listen(PORT, () => console.log(`Pirata running on :${PORT}`));
