# Pirata — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multiplayer pirate ship battle game — Node.js authoritative server, vanilla JS canvas client, WebSocket transport.

**Architecture:** Authoritative server runs physics at 60 Hz, broadcasts game state to all clients. Client renders interpolated states. Pure-function physics module enables unit testing without a running server.

**Tech Stack:** Node.js 18+, `ws` npm package, Vanilla JS ES modules, HTML5 Canvas, `node:test` + `node:assert` for tests.

---

## File Map

```
pirata/
  package.json
  server/
    index.js        — HTTP static server + WebSocket server, session routing
    game.js         — Game loop, state management, event handling
    ship.js         — Ship entity, cannon scaling math
    physics.js      — Movement, projectile update, collision detection
  client/
    index.html      — HTML shell, splash screen, death screen
    game.js         — Canvas render loop, PirataGame class
    input.js        — Keyboard handler, edge-trigger for one-shot actions
    net.js          — WebSocket client, session persistence
    interpolation.js — State lerp between server ticks
  tests/
    ship.test.js
    physics.test.js
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`

- [ ] **Step 1: Init package.json**

```json
{
  "name": "pirata",
  "version": "1.0.0",
  "type": "commonjs",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test tests/*.test.js"
  },
  "dependencies": {
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd /root/caddy/pirata && npm install
```
Expected: `node_modules/ws` created, no errors.

- [ ] **Step 3: Create directory structure**

```bash
mkdir -p server client tests
```

- [ ] **Step 4: Commit**

```bash
git init && git add package.json package-lock.json
git commit -m "chore: init pirata project"
```

---

## Task 2: Ship Entity (`server/ship.js`)

**Files:**
- Create: `server/ship.js`
- Create: `tests/ship.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/ship.test.js
'use strict';
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { Ship } = require('../server/ship');

test('sloop starts with correct dimensions', () => {
  const s = new Ship(1, 'Pirat', 'sloop');
  assert.equal(s.portCannons, 2);
  assert.equal(s.starboardCannons, 2);
  assert.equal(s.totalCannons, 4);
  assert.equal(s.width,  40);
  assert.equal(s.height, 15);
  assert.equal(s.hp,     40);
  assert.equal(s.maxHP,  40);
  assert.equal(s.range,  200 + 4 * 12);  // 248
});

test('galleon starts at base size', () => {
  const s = new Ship(2, 'Cap', 'galleon');
  assert.equal(s.totalCannons, 16);
  assert.equal(s.width,  90);
  assert.equal(s.hp,     160);
});

test('addCannons scales size and range', () => {
  const s = new Ship(3, 'X', 'sloop');  // 4 cannons total, width=40
  s.addCannons(12);  // now 16 total = same as galleon starting ratio? no: sqrt(16/4)=2, width=80
  assert.equal(s.totalCannons, 16);
  assert.equal(s.width, Math.round(40 * Math.sqrt(16 / 4)));  // 80
  assert.equal(s.range, 200 + 16 * 12);  // 392
});

test('HP scales proportionally when cannons added', () => {
  const s = new Ship(4, 'X', 'sloop');
  s.hp = 20;  // half health
  s.addCannons(12);
  // maxHP was 40, new maxHP = round(40 * sqrt(16/4)) = round(80) = 80
  // new hp = round((20/40) * 80) = 40
  assert.equal(s.maxHP, 80);
  assert.equal(s.hp,    40);
});

test('takeDamage returns true when ship dies', () => {
  const s = new Ship(5, 'X', 'sloop');
  assert.equal(s.takeDamage(30), false);
  assert.equal(s.takeDamage(10), true);
  assert.equal(s.hp, 0);
});

test('unknown ship type throws', () => {
  assert.throws(() => new Ship(6, 'X', 'submarine'), /Unknown ship type/);
});
```

- [ ] **Step 2: Run tests to confirm FAIL**

```bash
node --test tests/ship.test.js
```
Expected: `ERR_MODULE_NOT_FOUND` — ship.js doesn't exist yet.

- [ ] **Step 3: Implement `server/ship.js`**

```javascript
'use strict';

const SHIP_TYPES = {
  sloop:      { cannonsPerSide: 2,  baseHP: 40,  maxSpeed: 220, turnRate: 90,  accel: 80,  baseWidth: 40,  baseHeight: 15 },
  brigantine: { cannonsPerSide: 4,  baseHP: 80,  maxSpeed: 180, turnRate: 70,  accel: 65,  baseWidth: 60,  baseHeight: 22 },
  galleon:    { cannonsPerSide: 8,  baseHP: 160, maxSpeed: 130, turnRate: 50,  accel: 45,  baseWidth: 90,  baseHeight: 33 },
  manOWar:    { cannonsPerSide: 12, baseHP: 240, maxSpeed: 100, turnRate: 35,  accel: 35,  baseWidth: 120, baseHeight: 44 },
};

const BASE_RANGE        = 200;
const RANGE_PER_CANNON  = 12;

class Ship {
  constructor(id, name, type) {
    const def = SHIP_TYPES[type];
    if (!def) throw new Error(`Unknown ship type: ${type}`);
    this.id                  = id;
    this.name                = name;
    this.type                = type;
    this.x                   = 0;
    this.y                   = 0;
    this.angle               = 0;   // radians, 0 = east, clockwise
    this.vx                  = 0;
    this.vy                  = 0;
    this.portCannons         = def.cannonsPerSide;
    this.starboardCannons    = def.cannonsPerSide;
    this.startTotalCannons   = def.cannonsPerSide * 2;
    this.baseWidth           = def.baseWidth;
    this.baseHeight          = def.baseHeight;
    this.baseHP              = def.baseHP;
    this.maxSpeed            = def.maxSpeed;
    this.turnRate            = def.turnRate * Math.PI / 180;  // rad/s
    this.accel               = def.accel;
    this.portCooldown        = 0;
    this.starboardCooldown   = 0;
    this.kills               = 0;
    this.alive               = true;
    // Set by _recalculate:
    this.width = 0; this.height = 0; this.hp = 0; this.maxHP = 0; this.range = 0;
    this._recalculate(true);
  }

  get totalCannons() { return this.portCannons + this.starboardCannons; }

  _recalculate(init = false) {
    const factor   = Math.sqrt(this.totalCannons / this.startTotalCannons);
    this.width     = Math.round(this.baseWidth  * factor);
    this.height    = Math.round(this.baseHeight * factor);
    const newMaxHP = Math.round(this.baseHP * factor);
    this.hp        = init ? newMaxHP : Math.round((this.hp / this.maxHP) * newMaxHP);
    this.maxHP     = newMaxHP;
    this.range     = BASE_RANGE + this.totalCannons * RANGE_PER_CANNON;
  }

  addCannons(count) {
    const half             = Math.floor(count / 2);
    this.portCannons      += half;
    this.starboardCannons += count - half;
    this._recalculate();
  }

  takeDamage(dmg) {
    this.hp = Math.max(0, this.hp - dmg);
    return this.hp === 0;
  }

  toState() {
    return {
      id: this.id, name: this.name,
      x: this.x, y: this.y, angle: this.angle, vx: this.vx, vy: this.vy,
      hp: this.hp, maxHp: this.maxHP, kills: this.kills,
      portCannons: this.portCannons, starboardCannons: this.starboardCannons,
      width: this.width, height: this.height,
    };
  }
}

module.exports = { Ship, SHIP_TYPES };
```

- [ ] **Step 4: Run tests — confirm PASS**

```bash
node --test tests/ship.test.js
```
Expected: 6 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add server/ship.js tests/ship.test.js
git commit -m "feat: ship entity with cannon scaling"
```

---

## Task 3: Physics — Movement & Projectiles (`server/physics.js`)

**Files:**
- Create: `server/physics.js`
- Create: `tests/physics.test.js`

- [ ] **Step 1: Write failing tests (movement + broadside)**

```javascript
// tests/physics.test.js
'use strict';
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { Ship } = require('../server/ship');
const {
  updateShip, spawnBroadside, spawnBarrel,
  updateBalls, circleVsRotatedRect, circleVsCircle,
} = require('../server/physics');

function makeShip(type = 'sloop') {
  const s = new Ship(1, 'T', type);
  s.x = 1000; s.y = 1000;
  return s;
}

test('ship does not turn from standstill', () => {
  const s = makeShip();
  updateShip(s, { left: true }, 0.1);
  assert.equal(s.angle, 0);
});

test('ship turns when moving', () => {
  const s = makeShip();
  // give it speed first
  updateShip(s, { up: true }, 1.0);
  const angleBefore = s.angle;
  updateShip(s, { left: true }, 0.1);
  assert.ok(s.angle < angleBefore, 'should have turned left (negative angle delta)');
});

test('ship accelerates forward', () => {
  const s = makeShip();
  s.angle = 0;  // pointing east
  updateShip(s, { up: true }, 0.1);
  assert.ok(s.vx > 0, 'should have positive vx when facing east');
  assert.ok(Math.abs(s.vy) < 0.01, 'vy should be near 0');
});

test('ship wraps around world edge', () => {
  const s = makeShip();
  s.x = 3999; s.vx = 100; s.angle = 0;
  updateShip(s, {}, 0.1);
  assert.ok(s.x < 100, 'should wrap to other side');
});

test('spawnBroadside returns correct cannon count', () => {
  const s = makeShip();  // sloop: 2 port, 2 starboard
  let id = 0;
  const balls = spawnBroadside(s, 'port', () => ++id);
  assert.equal(balls.length, 2);
});

test('broadside sets cooldown', () => {
  const s = makeShip();
  let id = 0;
  spawnBroadside(s, 'starboard', () => ++id);
  assert.ok(s.starboardCooldown > 0);
  // second fire immediately: blocked
  const balls2 = spawnBroadside(s, 'starboard', () => ++id);
  assert.equal(balls2.length, 0);
});

test('broadside ball inherits forward speed component', () => {
  const s = makeShip();
  s.angle = 0;      // pointing east
  s.vx    = 100;    // moving east at 100px/s
  let id  = 0;
  const balls = spawnBroadside(s, 'port', () => ++id);
  // Port side fires north (angle - π/2), forward component added: vx > 0 on each ball? No:
  // sideAngle = 0 - π/2 => points north (vy negative in canvas coords).
  // forwardFwdSpeed = vx * cos(0) + vy * sin(0) = 100
  // ball.vx = cos(-π/2) * SHOT_SPEED + cos(0) * 100 * 0.4 = 0 + 40 = 40
  // ball.vy = sin(-π/2) * SHOT_SPEED + sin(0) * ... = -350
  assert.ok(balls[0].vx > 0, 'forward component should add to x velocity');
  assert.ok(balls[0].vy < 0, 'port side fires north (negative y)');
});

test('updateBalls removes expired balls', () => {
  const balls = new Map();
  balls.set(1, { id: 1, x: 100, y: 100, vx: 0, vy: 0, distTravelled: 290, range: 300 });
  const expired = updateBalls(balls, 0.1);  // dist += 0, but wait: hypot(0,0)*dt = 0, still < range
  // Need actual velocity to expire:
  balls.set(2, { id: 2, x: 100, y: 100, vx: 1000, vy: 0, distTravelled: 290, range: 300 });
  const expired2 = updateBalls(balls, 0.1);  // dist += 100 -> 390 > 300: expired
  assert.ok(expired2.includes(2));
});

test('circleVsRotatedRect hits centered circle', () => {
  // Circle at rect center should always hit
  assert.ok(circleVsRotatedRect(100, 100, 5, 100, 100, 80, 30, 0));
});

test('circleVsRotatedRect misses distant circle', () => {
  assert.ok(!circleVsRotatedRect(200, 200, 5, 100, 100, 80, 30, 0));
});

test('circleVsCircle', () => {
  assert.ok( circleVsCircle(0, 0, 10, 5,  0, 10));
  assert.ok(!circleVsCircle(0, 0, 10, 21, 0, 10));
});
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
node --test tests/physics.test.js
```
Expected: `ERR_MODULE_NOT_FOUND` — physics.js doesn't exist.

- [ ] **Step 3: Implement `server/physics.js`**

```javascript
'use strict';

const WORLD_SIZE        = 4000;
const DRAG              = 1.2;
const SHOT_SPEED        = 350;    // px/s
const BROADSIDE_CD      = 1.5;    // s
const BALL_RADIUS       = 4;
const BALL_DAMAGE       = 10;
const BARREL_RADIUS     = 10;
const BARREL_TIMEOUT    = 60;     // s
const BARREL_BLAST_R    = 80;
const BARREL_DAMAGE     = 60;

function updateShip(ship, input, dt) {
  const speed = Math.hypot(ship.vx, ship.vy);

  // Turn — proportional to speed
  const turnFactor = Math.min(speed / ship.maxSpeed, 1);
  if (input.left)  ship.angle -= ship.turnRate * turnFactor * dt;
  if (input.right) ship.angle += ship.turnRate * turnFactor * dt;

  // Accelerate (use post-turn angle)
  if (input.up) {
    ship.vx += Math.cos(ship.angle) * ship.accel * dt;
    ship.vy += Math.sin(ship.angle) * ship.accel * dt;
  }

  // Brake
  if (input.down) {
    const bf = Math.max(0, 1 - 3 * DRAG * dt);
    ship.vx *= bf;
    ship.vy *= bf;
  }

  // Normal drag
  const df = 1 - DRAG * dt;
  ship.vx *= df;
  ship.vy *= df;

  // Speed cap
  const ns = Math.hypot(ship.vx, ship.vy);
  if (ns > ship.maxSpeed) {
    ship.vx = ship.vx / ns * ship.maxSpeed;
    ship.vy = ship.vy / ns * ship.maxSpeed;
  }

  // Torus movement
  ship.x = ((ship.x + ship.vx * dt) % WORLD_SIZE + WORLD_SIZE) % WORLD_SIZE;
  ship.y = ((ship.y + ship.vy * dt) % WORLD_SIZE + WORLD_SIZE) % WORLD_SIZE;

  if (ship.portCooldown > 0)      ship.portCooldown      = Math.max(0, ship.portCooldown - dt);
  if (ship.starboardCooldown > 0) ship.starboardCooldown = Math.max(0, ship.starboardCooldown - dt);
}

function spawnBroadside(ship, side, idGen) {
  const cdKey  = side === 'port' ? 'portCooldown' : 'starboardCooldown';
  if (ship[cdKey] > 0) return [];

  const cannons   = side === 'port' ? ship.portCannons : ship.starboardCannons;
  const sideAngle = ship.angle + (side === 'port' ? -Math.PI / 2 : Math.PI / 2);
  const sdx       = Math.cos(sideAngle);
  const sdy       = Math.sin(sideAngle);
  const fwdX      = Math.cos(ship.angle);
  const fwdY      = Math.sin(ship.angle);
  const fwdSpeed  = ship.vx * fwdX + ship.vy * fwdY;  // forward component of velocity

  const balls = [];
  for (let i = 0; i < cannons; i++) {
    const t = cannons > 1 ? i / (cannons - 1) - 0.5 : 0;
    balls.push({
      id:            idGen(),
      x:             ship.x + fwdX * t * ship.width + sdx * ship.height / 2,
      y:             ship.y + fwdY * t * ship.width + sdy * ship.height / 2,
      vx:            sdx * SHOT_SPEED + fwdX * fwdSpeed * 0.4,
      vy:            sdy * SHOT_SPEED + fwdY * fwdSpeed * 0.4,
      distTravelled: 0,
      range:         ship.range,
      ownerId:       ship.id,
      radius:        BALL_RADIUS,
    });
  }
  ship[cdKey] = BROADSIDE_CD;
  return balls;
}

function spawnBarrel(ship, idGen) {
  return { id: idGen(), x: ship.x, y: ship.y, radius: BARREL_RADIUS, ownerId: ship.id, age: 0 };
}

function updateBalls(balls, dt) {
  const expired = [];
  for (const ball of balls.values()) {
    const dist = Math.hypot(ball.vx, ball.vy) * dt;
    ball.x = ((ball.x + ball.vx * dt) % WORLD_SIZE + WORLD_SIZE) % WORLD_SIZE;
    ball.y = ((ball.y + ball.vy * dt) % WORLD_SIZE + WORLD_SIZE) % WORLD_SIZE;
    ball.distTravelled += dist;
    if (ball.distTravelled >= ball.range) expired.push(ball.id);
  }
  return expired;
}

function updateBarrels(barrels, dt) {
  const expired = [];
  for (const b of barrels.values()) {
    b.age += dt;
    if (b.age >= BARREL_TIMEOUT) expired.push(b.id);
  }
  return expired;
}

// Collision: circle vs rotated rectangle (rect centered at rx,ry)
function circleVsRotatedRect(cx, cy, cr, rx, ry, rw, rh, rAngle) {
  const cosA  = Math.cos(-rAngle);
  const sinA  = Math.sin(-rAngle);
  const lx    = cosA * (cx - rx) - sinA * (cy - ry);
  const ly    = sinA * (cx - rx) + cosA * (cy - ry);
  const nearX = Math.max(-rw / 2, Math.min(rw / 2, lx));
  const nearY = Math.max(-rh / 2, Math.min(rh / 2, ly));
  const dx    = lx - nearX;
  const dy    = ly - nearY;
  return dx * dx + dy * dy <= cr * cr;
}

function circleVsCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by;
  const r  = ar + br;
  return dx * dx + dy * dy <= r * r;
}

module.exports = {
  updateShip, spawnBroadside, spawnBarrel, updateBalls, updateBarrels,
  circleVsRotatedRect, circleVsCircle,
  BALL_DAMAGE, BARREL_DAMAGE, BARREL_BLAST_R, WORLD_SIZE,
};
```

- [ ] **Step 4: Run tests — confirm PASS**

```bash
node --test tests/physics.test.js
```
Expected: 11 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add server/physics.js tests/physics.test.js
git commit -m "feat: physics engine — movement, broadside, collision"
```

---

## Task 4: Game Loop (`server/game.js`)

**Files:**
- Create: `server/game.js`

No unit tests here — integration covered by smoke test in Task 8.

- [ ] **Step 1: Implement `server/game.js`**

```javascript
'use strict';

const { Ship }   = require('./ship');
const {
  updateShip, spawnBroadside, spawnBarrel, updateBalls, updateBarrels,
  circleVsRotatedRect, circleVsCircle,
  BALL_DAMAGE, BARREL_DAMAGE, BARREL_BLAST_R,
} = require('./physics');

const TICK_MS    = 1000 / 60;
const MAX_PLAYERS = 20;

class Game {
  constructor(broadcast) {
    this.broadcast  = broadcast;   // fn(jsonString) — sends to all connected clients
    this.ships      = new Map();   // sessionId -> Ship
    this.balls      = new Map();   // id -> ball object
    this.barrels    = new Map();   // id -> barrel object
    this.inputs     = new Map();   // sessionId -> latest input
    this.events     = [];          // flushed each tick
    this._nextId    = 1;
    this._tick      = 0;
    this._interval  = null;
  }

  idGen() { return this._nextId++; }

  start() {
    let last = Date.now();
    this._interval = setInterval(() => {
      const now = Date.now();
      this._update(Math.min((now - last) / 1000, 0.1));
      last = now;
    }, TICK_MS);
  }

  stop() { clearInterval(this._interval); }

  addPlayer(sessionId, name, type) {
    if (this.ships.size >= MAX_PLAYERS) return null;
    const ship  = new Ship(this.idGen(), name, type);
    ship.x      = 200 + Math.random() * 3600;
    ship.y      = 200 + Math.random() * 3600;
    ship.angle  = Math.random() * Math.PI * 2;
    this.ships.set(sessionId, ship);
    this.inputs.set(sessionId, {});
    return ship;
  }

  removePlayer(sessionId) {
    this.ships.delete(sessionId);
    this.inputs.delete(sessionId);
  }

  setInput(sessionId, input) {
    if (this.inputs.has(sessionId)) this.inputs.set(sessionId, input);
  }

  _update(dt) {
    this._tick++;
    const ig = () => this.idGen();

    for (const [sid, ship] of this.ships) {
      if (!ship.alive) continue;
      const input = this.inputs.get(sid) || {};
      updateShip(ship, input, dt);

      if (input.firePort) {
        for (const b of spawnBroadside(ship, 'port', ig)) this.balls.set(b.id, b);
      }
      if (input.fireStarboard) {
        for (const b of spawnBroadside(ship, 'starboard', ig)) this.balls.set(b.id, b);
      }
      if (input.dropBarrel) {
        const barrel = spawnBarrel(ship, ig);
        this.barrels.set(barrel.id, barrel);
      }
    }

    for (const id of updateBalls(this.balls, dt))   this.balls.delete(id);
    for (const id of updateBarrels(this.barrels, dt)) this.barrels.delete(id);

    // Ball vs ship
    for (const [bid, ball] of this.balls) {
      for (const [sid, ship] of this.ships) {
        if (!ship.alive || ball.ownerId === ship.id) continue;
        if (circleVsRotatedRect(ball.x, ball.y, ball.radius, ship.x, ship.y, ship.width, ship.height, ship.angle)) {
          const dead = ship.takeDamage(BALL_DAMAGE);
          this.events.push({ t: 'event', e: 'hit', shipId: ship.id, hp: ship.hp, maxHp: ship.maxHP });
          this.balls.delete(bid);
          if (dead) this._sinkShip(sid, ball.ownerId);
          break;
        }
      }
    }

    // Barrel vs ship
    for (const [barid, barrel] of this.barrels) {
      for (const ship of this.ships.values()) {
        if (!ship.alive) continue;
        if (circleVsRotatedRect(barrel.x, barrel.y, barrel.radius, ship.x, ship.y, ship.width, ship.height, ship.angle)) {
          this._explodeBarrel(barid, barrel);
          break;
        }
      }
    }

    this._flush();
  }

  _sinkShip(victimSid, victorShipId) {
    const victim = this.ships.get(victimSid);
    if (!victim) return;
    victim.alive = false;
    let killerSid = null;
    for (const [sid, ship] of this.ships) {
      if (ship.id === victorShipId) {
        ship.kills++;
        ship.addCannons(victim.totalCannons);
        killerSid = sid;
        break;
      }
    }
    this.events.push({ t: 'event', e: 'sink', shipId: victim.id, name: victim.name, killerShipId: victorShipId });
  }

  _explodeBarrel(barid, barrel) {
    this.barrels.delete(barid);
    this.events.push({ t: 'event', e: 'explosion', x: barrel.x, y: barrel.y, radius: BARREL_BLAST_R });
    for (const [sid, ship] of this.ships) {
      if (!ship.alive) continue;
      const r = Math.max(ship.width, ship.height) / 2;
      if (circleVsCircle(barrel.x, barrel.y, BARREL_BLAST_R, ship.x, ship.y, r)) {
        if (ship.takeDamage(BARREL_DAMAGE)) this._sinkShip(sid, barrel.ownerId);
      }
    }
  }

  _flush() {
    const state = JSON.stringify({
      t: 'state', tick: this._tick,
      ships:   [...this.ships.values()].filter(s => s.alive).map(s => s.toState()),
      balls:   [...this.balls.values()].map(b  => ({ id: b.id, x: b.x, y: b.y })),
      barrels: [...this.barrels.values()].map(b => ({ id: b.id, x: b.x, y: b.y })),
    });
    this.broadcast(state);
    for (const ev of this.events) this.broadcast(JSON.stringify(ev));
    this.events = [];
  }
}

module.exports = { Game };
```

- [ ] **Step 2: Commit**

```bash
git add server/game.js
git commit -m "feat: authoritative game loop with collision and sinking"
```

---

## Task 5: WebSocket Server (`server/index.js`)

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: Implement `server/index.js`**

```javascript
'use strict';

const http          = require('http');
const fs            = require('fs');
const path          = require('path');
const { WebSocketServer } = require('ws');
const { Game }      = require('./game');
const { randomUUID } = require('crypto');

const PORT       = process.env.PORT || 3000;
const CLIENT_DIR = path.resolve(__dirname, '..', 'client');
const MIME       = { '.html': 'text/html', '.js': 'application/javascript',
                     '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' };

const server = http.createServer((req, res) => {
  const urlPath  = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.resolve(CLIENT_DIR, '.' + urlPath);
  if (!filePath.startsWith(CLIENT_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss      = new WebSocketServer({ server });
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
    if (msg.t === 'input' && sessionId)  { game.setInput(sessionId, msg); return; }
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

server.listen(PORT, () => console.log(`Pirata running on :${PORT}`));
```

- [ ] **Step 2: Smoke-start the server**

```bash
node server/index.js &
sleep 1 && curl -s http://localhost:3000/ | head -5
kill %1
```
Expected: HTML output (404 is fine — client files don't exist yet).

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: HTTP static server + WebSocket game server"
```

---

## Task 6: Client — Network & Input (`client/net.js`, `client/input.js`)

**Files:**
- Create: `client/net.js`
- Create: `client/input.js`

- [ ] **Step 1: Create `client/net.js`**

```javascript
// client/net.js
export class Net {
  constructor(onMessage) {
    this._onMessage = onMessage;
    this._ws        = null;
    this.sessionId  = localStorage.getItem('pirata_session') || null;
    this.shipId     = null;
  }

  connect(name, shipType) {
    const proto  = location.protocol === 'https:' ? 'wss' : 'ws';
    this._ws     = new WebSocket(`${proto}://${location.host}`);
    this._ws.onopen    = () => {
      this._ws.send(JSON.stringify({ t: 'join', sessionId: this.sessionId, name, shipType }));
    };
    this._ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'joined') {
        this.sessionId = msg.sessionId;
        this.shipId    = msg.shipId;
        localStorage.setItem('pirata_session', msg.sessionId);
      }
      this._onMessage(msg);
    };
    this._ws.onclose   = () => this._onMessage({ t: 'disconnect' });
  }

  sendInput(input) {
    if (this._ws && this._ws.readyState === 1)
      this._ws.send(JSON.stringify({ t: 'input', ...input }));
  }

  respawn(name, shipType) {
    if (this._ws && this._ws.readyState === 1)
      this._ws.send(JSON.stringify({ t: 'respawn', name, shipType }));
  }
}
```

- [ ] **Step 2: Create `client/input.js`**

```javascript
// client/input.js
export class Input {
  constructor() {
    this.state = { up: false, down: false, left: false, right: false,
                   firePort: false, fireStarboard: false, dropBarrel: false };
    window.addEventListener('keydown', e => this._onKey(e, true));
    window.addEventListener('keyup',   e => this._onKey(e, false));
  }

  _onKey(e, down) {
    // Space: edge-triggered (one shot per press regardless of hold)
    if (e.key === ' ') {
      e.preventDefault();
      if (down && !e.repeat) this.state.dropBarrel = true;
      return;
    }
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      a: 'firePort', A: 'firePort', d: 'fireStarboard', D: 'fireStarboard',
    };
    const k = map[e.key];
    if (k) { e.preventDefault(); this.state[k] = down; }
  }

  // Returns snapshot; clears one-shot dropBarrel
  snapshot() {
    const snap = { ...this.state };
    this.state.dropBarrel = false;
    return snap;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add client/net.js client/input.js
git commit -m "feat: client network and input handlers"
```

---

## Task 7: Client — Interpolation (`client/interpolation.js`)

**Files:**
- Create: `client/interpolation.js`

- [ ] **Step 1: Create `client/interpolation.js`**

```javascript
// client/interpolation.js
export class Interpolator {
  constructor() {
    this._prev     = null;
    this._next     = null;
    this._prevTime = 0;
    this._nextTime = 0;
  }

  push(state) {
    this._prev     = this._next;
    this._prevTime = this._nextTime;
    this._next     = state;
    this._nextTime = performance.now();
  }

  // Call with current performance.now(); returns smoothed state
  get(now) {
    if (!this._prev || !this._next) return this._next;
    const span = this._nextTime - this._prevTime;
    if (span <= 0) return this._next;
    const t = Math.min((now - this._nextTime) / span + 1, 1);
    return this._lerp(this._prev, this._next, t);
  }

  _lerp(a, b, t) {
    return {
      ...b,
      ships: b.ships.map(bs => {
        const as = a.ships.find(s => s.id === bs.id);
        if (!as) return bs;
        let da = bs.angle - as.angle;
        while (da >  Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        return { ...bs, x: as.x + (bs.x - as.x) * t, y: as.y + (bs.y - as.y) * t, angle: as.angle + da * t };
      }),
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/interpolation.js
git commit -m "feat: client state interpolation"
```

---

## Task 8: Client — Renderer (`client/game.js`)

**Files:**
- Create: `client/game.js`

- [ ] **Step 1: Create `client/game.js`**

```javascript
// client/game.js
import { Net }          from './net.js';
import { Input }        from './input.js';
import { Interpolator } from './interpolation.js';

const CANVAS_W  = 800;
const CANVAS_H  = 600;
const WORLD     = 4000;
const INPUT_HZ  = 60;

class PirataGame {
  constructor() {
    this.canvas     = document.getElementById('game');
    this.ctx        = this.canvas.getContext('2d');
    this.canvas.width  = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.net        = new Net(msg => this._onMsg(msg));
    this.input      = new Input();
    this.interp     = new Interpolator();
    this.myShipId   = null;
    this.lastState  = null;
    this.explosions = [];
    this._itvl      = null;
    this._raf       = null;
  }

  join(name, shipType) { this.net.connect(name, shipType); }

  _onMsg(msg) {
    if (msg.t === 'joined') {
      this.myShipId = msg.shipId;
      this._start();
    } else if (msg.t === 'state') {
      this.interp.push(msg);
      this.lastState = msg;
    } else if (msg.t === 'event') {
      if (msg.e === 'explosion')
        this.explosions.push({ x: msg.x, y: msg.y, r: 0, maxR: msg.radius, age: 0 });
      if (msg.e === 'sink' && msg.shipId === this.myShipId) {
        const me = this.lastState && this.lastState.ships.find(s => s.id === this.myShipId);
        showDeath(me ? me.kills : 0);
      }
    } else if (msg.t === 'disconnect') {
      this._stop();
      showSplash();
    }
  }

  _start() {
    this._itvl = setInterval(() => this.net.sendInput(this.input.snapshot()), 1000 / INPUT_HZ);
    const loop = () => { this._draw(); this._raf = requestAnimationFrame(loop); };
    this._raf  = requestAnimationFrame(loop);
  }

  _stop() {
    clearInterval(this._itvl);
    cancelAnimationFrame(this._raf);
  }

  _draw() {
    const ctx   = this.ctx;
    const state = this.interp.get(performance.now()) || this.lastState;
    if (!state) return;

    const me = state.ships.find(s => s.id === this.myShipId);
    const camX = me ? me.x - CANVAS_W / 2 : WORLD / 2 - CANVAS_W / 2;
    const camY = me ? me.y - CANVAS_H / 2 : WORLD / 2 - CANVAS_H / 2;

    // Background
    ctx.fillStyle = '#1a5276';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.save();
    ctx.translate(-camX, -camY);

    // World border
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, WORLD, WORLD);

    // Barrels
    for (const b of state.barrels) {
      ctx.fillStyle = '#6e2c00';
      ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
    }

    // Ships
    for (const ship of state.ships) {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle);
      ctx.fillStyle = ship.id === this.myShipId ? '#f39c12' : '#c0392b';
      ctx.fillRect(-ship.width / 2, -ship.height / 2, ship.width, ship.height);
      ctx.restore();

      // HP bar
      const bw = ship.width, bx = ship.x - bw / 2, by = ship.y - ship.height / 2 - 9;
      ctx.fillStyle = '#2c3e50'; ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(bx, by, bw * (ship.hp / ship.maxHp), 4);

      // Name + kills
      ctx.fillStyle = 'white'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${ship.name} [${ship.kills}]`, ship.x, ship.y - ship.height / 2 - 13);
    }

    // Cannonballs
    ctx.fillStyle = '#aaa';
    for (const b of state.balls) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
    }

    // Explosions (expand and fade)
    this.explosions = this.explosions.filter(ex => ex.age < 0.6);
    for (const ex of this.explosions) {
      ex.age += 1 / 60;
      const alpha = Math.max(0, 1 - ex.age / 0.6);
      ctx.strokeStyle = `rgba(255,140,0,${alpha})`;
      ctx.lineWidth   = 4;
      ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.maxR * (ex.age / 0.6), 0, Math.PI * 2); ctx.stroke();
    }

    ctx.restore();

    // HUD (fixed position)
    if (me) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(6, 6, 160, 50);
      ctx.fillStyle = 'white'; ctx.font = '13px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`Kanonen: ${me.portCannons + me.starboardCannons}`, 12, 22);
      ctx.fillText(`Kills:   ${me.kills}`, 12, 38);
      // HP bar
      const hpFrac = me.hp / me.maxHp;
      ctx.fillStyle = '#2c3e50'; ctx.fillRect(10, CANVAS_H - 18, 150, 8);
      ctx.fillStyle = hpFrac > 0.5 ? '#2ecc71' : hpFrac > 0.25 ? '#f39c12' : '#e74c3c';
      ctx.fillRect(10, CANVAS_H - 18, 150 * hpFrac, 8);
    }
  }
}

function showSplash() {
  document.getElementById('splash').style.display = 'flex';
  document.getElementById('game').style.display   = 'none';
}

function showDeath(kills) {
  document.getElementById('death-kills').textContent = kills;
  document.getElementById('death-screen').style.display = 'flex';
}

let G = null;

document.getElementById('join-btn').addEventListener('click', () => {
  const name = document.getElementById('username').value.trim() || 'Pirat';
  const type = document.getElementById('ship-select').value;
  document.getElementById('splash').style.display = 'none';
  document.getElementById('game').style.display   = 'block';
  G = new PirataGame();
  G.join(name, type);
});

document.getElementById('respawn-btn').addEventListener('click', () => {
  const name = document.getElementById('username').value.trim() || 'Pirat';
  const type = document.getElementById('respawn-ship').value;
  document.getElementById('death-screen').style.display = 'none';
  document.getElementById('game').style.display         = 'block';
  if (G) G.net.respawn(name, type);
});
```

- [ ] **Step 2: Commit**

```bash
git add client/game.js
git commit -m "feat: canvas renderer with interpolation, HUD, explosions"
```

---

## Task 9: Client — HTML Shell (`client/index.html`)

**Files:**
- Create: `client/index.html`

- [ ] **Step 1: Create `client/index.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pirata</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0d1b2a; color: #fff; font-family: monospace; overflow: hidden; }
    canvas { display: block; margin: 0 auto; }

    #splash, #death-screen {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 14px;
      position: fixed; inset: 0; background: rgba(13,27,42,0.96);
    }
    #death-screen { display: none; }
    h1 { font-size: 2.8rem; color: #f39c12; letter-spacing: 0.1em; }
    h2 { font-size: 1.4rem; color: #e74c3c; }

    input[type=text], select {
      padding: 8px 14px; font-size: 1rem; border-radius: 4px;
      border: 1px solid #444; background: #1c2e40; color: #fff; min-width: 220px;
    }
    button {
      padding: 10px 28px; font-size: 1rem; border-radius: 4px;
      border: none; background: #f39c12; color: #000;
      cursor: pointer; font-weight: bold; letter-spacing: 0.05em;
    }
    button:hover { background: #e67e22; }
    .hint { opacity: 0.5; font-size: 0.78rem; text-align: center; line-height: 1.6; }
  </style>
</head>
<body>

<div id="splash">
  <h1>⚓ PIRATA</h1>
  <input id="username" type="text" placeholder="Dein Kapitän-Name" maxlength="16" />
  <select id="ship-select">
    <option value="sloop">Schaluppe — schnell, 4 Kanonen</option>
    <option value="brigantine">Brigantine — mittel, 8 Kanonen</option>
    <option value="galleon">Galleone — schwer, 16 Kanonen</option>
    <option value="manOWar">Linienschiff — massiv, 24 Kanonen</option>
  </select>
  <button id="join-btn">Leinen los!</button>
  <p class="hint">
    ↑ Beschleunigen &nbsp;·&nbsp; ← → Drehen (Fahrt nötig)<br>
    A = Backbord-Breitseite &nbsp;·&nbsp; D = Steuerbord-Breitseite<br>
    Leertaste = Explosionsfass legen
  </p>
</div>

<div id="death-screen">
  <h2>Versenkt!</h2>
  <p>Kills: <strong id="death-kills">0</strong></p>
  <select id="respawn-ship">
    <option value="sloop">Schaluppe</option>
    <option value="brigantine">Brigantine</option>
    <option value="galleon">Galleone</option>
    <option value="manOWar">Linienschiff</option>
  </select>
  <button id="respawn-btn">Nochmal!</button>
</div>

<canvas id="game" style="display:none"></canvas>

<script type="module" src="game.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add client/index.html
git commit -m "feat: HTML shell with splash and death screens"
```

---

## Task 10: Smoke Test & Caddy Config

**Files:**
- Modify: `/root/caddy/Caddyfile` (add reverse proxy block)

- [ ] **Step 1: Start server and open browser**

```bash
node server/index.js
```
Expected: `Pirata running on :3000`

- [ ] **Step 2: Manual checklist**

Open `http://localhost:3000` in browser:

- [ ] Splash screen renders with ship select
- [ ] Enter name, choose Schaluppe, click "Leinen los!" — canvas appears, yellow rectangle visible
- [ ] Arrow Up: rectangle moves forward
- [ ] Arrow Left/Right at speed: rectangle rotates
- [ ] Standing still + Left/Right: no rotation
- [ ] Press A: 2 grey circles fan out from left side
- [ ] Press D: 2 grey circles fan out from right side
- [ ] Space: brown circle appears at ship position
- [ ] Open second browser tab — two ships visible
- [ ] Tab 2 fires at Tab 1: HP bar shrinks on hit
- [ ] One ship sinks: death screen shows on that tab; other tab shows cannon count increase
- [ ] Respawn: ship reappears on both tabs
- [ ] Reload one tab: session UUID in localStorage restores connection

- [ ] **Step 3: Add Caddy reverse proxy**

Add to `/root/caddy/Caddyfile`:
```
pirata.yourdomain.com {
    reverse_proxy localhost:3000
}
```
Then reload: `caddy reload --config /root/caddy/Caddyfile`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: pirata v1 complete — multiplayer ship battle"
```

---

## Constants Reference

| Constant | Value | File |
|---|---|---|
| WORLD_SIZE | 4000 px | physics.js |
| SHOT_SPEED | 350 px/s | physics.js |
| BROADSIDE_CD | 1.5 s | physics.js |
| DRAG | 1.2 | physics.js |
| BALL_DAMAGE | 10 hp | physics.js |
| BARREL_DAMAGE | 60 hp | physics.js |
| BARREL_BLAST_R | 80 px | physics.js |
| BARREL_TIMEOUT | 60 s | physics.js |
| BASE_RANGE | 200 px | ship.js |
| RANGE_PER_CANNON | 12 px | ship.js |
| MAX_PLAYERS | 20 | game.js |
| TICK_MS | ~16.67 ms (60 Hz) | game.js |
