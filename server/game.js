'use strict';

const { Ship } = require('./ship');
const {
  updateShip, spawnBroadside, spawnBarrel, updateBalls, updateBarrels,
  circleVsRotatedRect, circleVsCircle,
  BALL_DAMAGE, BARREL_DAMAGE, BARREL_BLAST_R,
} = require('./physics');

const TICK_MS    = 1000 / 60;
const MAX_PLAYERS = 20;

class Game {
  constructor(broadcast) {
    this.broadcast = broadcast;   // fn(jsonString) — sends to all connected clients
    this.ships     = new Map();   // sessionId -> Ship
    this.balls     = new Map();   // id -> ball object
    this.barrels   = new Map();   // id -> barrel object
    this.inputs    = new Map();   // sessionId -> latest input
    this.events    = [];          // flushed each tick
    this._nextId   = 1;
    this._tick     = 0;
    this._interval = null;
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

    for (const id of updateBalls(this.balls, dt))    this.balls.delete(id);
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
    for (const ship of this.ships.values()) {
      if (ship.id === victorShipId) {
        ship.kills++;
        ship.addCannons(victim.totalCannons);
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
