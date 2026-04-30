'use strict';

const { Ship } = require('./ship');
const { BotAI, BOT_CONFIGS, RESPAWN_DELAY } = require('./bot');
const {
  updateShip, resolveShipCollisions, applyTornado,
  spawnBroadside, spawnFlame, spawnScatter, spawnHarpune, spawnKraken,
  spawnBarrel, updateBalls, updateBarrels,
  spawnBanana, updateBananas,
  circleVsRotatedRect, circleVsCircle,
  BALL_DAMAGE, BARREL_DAMAGE, BARREL_BLAST_R, BANANA_BLAST_R, BANANA_DAMAGE,
  WORLD_SIZE, WORLD_CENTER_X, WORLD_CENTER_Y,
} = require('./physics');

const TICK_MS      = 1000 / 60;
const MAX_PLAYERS  = 20;

const POWERUP_KINDS   = ['flame', 'scatter', 'harpune', 'kraken'];
const POWERUP_COUNT   = 5;
const POWERUP_RADIUS  = 28;
const POWERUP_RESPAWN = 22;   // seconds until a collected powerup respawns
const WEAPON_AMMO     = { flame: 30, scatter: 6, harpune: 3, kraken: 2, banana: 3 };

function randInCircle(margin = 200) {
  return {
    x: margin + Math.random() * (WORLD_SIZE - margin * 2),
    y: margin + Math.random() * (WORLD_SIZE - margin * 2),
  };
}

class Game {
  constructor(broadcast) {
    this.broadcast     = broadcast;
    this.ships         = new Map();
    this.balls         = new Map();
    this.barrels       = new Map();
    this.bananas       = new Map();
    this.powerups      = new Map();
    this.inputs        = new Map();
    this.bots          = new Map();
    this.botTimers     = new Map();
    this._powerupQueue = [];   // { timer, kind } pending respawns
    this.events        = [];
    this._nextId       = 1;
    this._tick         = 0;
    this._interval     = null;
  }

  idGen() { return this._nextId++; }

  start() {
    this._spawnBots();
    this._spawnInitialPowerups();
    let last = Date.now();
    this._interval = setInterval(() => {
      const now = Date.now();
      this._update(Math.min((now - last) / 1000, 0.1));
      last = now;
    }, TICK_MS);
  }

  _spawnBots() {
    for (let i = 0; i < BOT_CONFIGS.length; i++) {
      this._spawnBot(`bot_${i}`, i);
    }
  }

  _spawnBot(sid, idx) {
    const cfg  = BOT_CONFIGS[idx % BOT_CONFIGS.length];
    const ship = new Ship(this.idGen(), cfg.name, cfg.type);
    ship.isBot = true;
    { const p = randInCircle(); ship.x = p.x; ship.y = p.y; }
    
    ship.angle = Math.random() * Math.PI * 2;
    this.ships.set(sid, ship);
    this.inputs.set(sid, {});
    if (!this.bots.has(sid)) this.bots.set(sid, new BotAI(sid));
    this.botTimers.delete(sid);
  }

  _spawnInitialPowerups() {
    for (let i = 0; i < POWERUP_COUNT; i++) {
      this._spawnPowerup(POWERUP_KINDS[i % POWERUP_KINDS.length]);
    }
  }

  _spawnPowerup(kind) {
    const id = this.idGen();
    this.powerups.set(id, {
      id,
      ...randInCircle(300),

      kind,
    });
  }

  stop() { clearInterval(this._interval); }

  addPlayer(sessionId, name) {
    if (this.ships.size >= MAX_PLAYERS) return null;
    const ship  = new Ship(this.idGen(), name, 'sloop');
    { const p2 = randInCircle(); ship.x = p2.x; ship.y = p2.y; }
    
    ship.angle  = Math.random() * Math.PI * 2;
    ship.sails  = 0;
    this.ships.set(sessionId, ship);
    this.inputs.set(sessionId, {});
    return ship;
  }

  getShip(sessionId) { return this.ships.get(sessionId) || null; }

  buyWeapon(sessionId, kind) {
    const ship = this.ships.get(sessionId);
    const COSTS = { flame: 2, scatter: 2, harpune: 3, kraken: 4, banana: 3 };
    const cost  = COSTS[kind];
    if (!ship || !cost || ship.upgradePoints < cost) return;
    ship.upgradePoints -= cost;
    ship.weapon     = kind;
    ship.weaponAmmo = WEAPON_AMMO[kind] || 1;
  }

  buyMines(sessionId) {
    const ship = this.ships.get(sessionId);
    if (!ship || ship.upgradePoints < 1) return;
    ship.upgradePoints -= 1;
    ship.mineAmmo += 3;
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

    // Survival coins — 1 coin per minute for non-bot players
    for (const [sid, ship] of this.ships) {
      if (!ship.alive || this.bots.has(sid)) continue;
      ship._survivalTimer = (ship._survivalTimer || 0) + dt;
      if (ship._survivalTimer >= 60) {
        ship._survivalTimer -= 60;
        ship.upgradePoints++;
        this.events.push({ t: 'event', e: 'survivalCoin', shipId: ship.id });
      }
    }

    // Bot AI
    for (const [sid, bot] of this.bots) {
      const ship = this.ships.get(sid);
      if (ship && ship.alive) this.inputs.set(sid, bot.update(dt, ship, this.ships));
    }

    // Bot respawns
    for (const [sid, timer] of this.botTimers) {
      const remaining = timer - dt;
      if (remaining <= 0) {
        const idx = parseInt(sid.replace('bot_', ''), 10);
        this._spawnBot(sid, idx);
      } else {
        this.botTimers.set(sid, remaining);
      }
    }

    // Powerup respawns
    this._powerupQueue = this._powerupQueue
      .map(p => ({ ...p, timer: p.timer - dt }))
      .filter(p => {
        if (p.timer <= 0) { this._spawnPowerup(p.kind); return false; }
        return true;
      });

    // Ship updates + firing
    for (const [sid, ship] of this.ships) {
      if (!ship.alive) continue;
      const input = this.inputs.get(sid) || {};
      if (input.sailUp)   ship.sails = Math.min(3, ship.sails + 1);
      if (input.sailDown) ship.sails = Math.max(0, ship.sails - 1);
      // Apply tornado gravity to velocity BEFORE position integration
      if (applyTornado(ship, dt)) { this._sinkShip(sid, null, true); continue; }
      updateShip(ship, input, dt);

      if (input.firePort) {
        const nb = spawnBroadside(ship, 'port', ig);
        for (const b of nb) this.balls.set(b.id, b);
        if (nb.length) this.events.push({ t: 'event', e: 'broadside', shipId: ship.id });
      }
      if (input.fireStarboard) {
        const nb = spawnBroadside(ship, 'starboard', ig);
        for (const b of nb) this.balls.set(b.id, b);
        if (nb.length) this.events.push({ t: 'event', e: 'broadside', shipId: ship.id });
      }
      if (input.dropBarrel && ship.mineAmmo > 0) {
        const barrel = spawnBarrel(ship, ig);
        this.barrels.set(barrel.id, barrel);
        ship.mineAmmo--;
      }

      // Special weapon fire
      if (input.fireSpecial && ship.weapon) {
        let nb = [];
        if (ship.weapon === 'flame')   nb = spawnFlame(ship, ig);
        if (ship.weapon === 'scatter') nb = spawnScatter(ship, ig);
        if (ship.weapon === 'harpune') nb = spawnHarpune(ship, ig);
        if (ship.weapon === 'kraken')  nb = spawnKraken(ship, ig);
        for (const b of nb) this.balls.set(b.id, b);
        if (nb.length) this.events.push({ t: 'event', e: 'broadside', shipId: ship.id });
        if (ship.weapon === 'banana') {
          const bn = spawnBanana(ship, ig);
          if (bn) this.bananas.set(bn.id, bn);
        }
      }
    }

    resolveShipCollisions(this.ships);
    for (const id of updateBalls(this.balls, dt, this.ships)) this.balls.delete(id);
    for (const id of updateBarrels(this.barrels, dt)) this.barrels.delete(id);
    const { expired: bExp, toExplode } = updateBananas(this.bananas, dt);
    for (const id of bExp) this.bananas.delete(id);
    for (const bn of toExplode) this._explodeBanana(bn);

    // Ball vs ship
    for (const [bid, ball] of this.balls) {
      for (const [sid, ship] of this.ships) {
        if (!ship.alive || ball.ownerId === ship.id) continue;
        if (circleVsRotatedRect(ball.x, ball.y, ball.radius, ship.x, ship.y, ship.width, ship.height, ship.angle)) {
          const dmg  = ball.damage != null ? ball.damage : BALL_DAMAGE;
          const dead = ship.takeDamage(dmg);
          this.events.push({ t: 'event', e: 'hit', shipId: ship.id, hp: ship.hp, maxHp: ship.maxHP, x: ball.x, y: ball.y });
          this.balls.delete(bid);
          if (dead) this._sinkShip(sid, ball.ownerId);
          break;
        }
      }
    }

    // Barrel vs ship — owner cannot trigger their own barrel
    for (const [barid, barrel] of this.barrels) {
      for (const ship of this.ships.values()) {
        if (!ship.alive || ship.id === barrel.ownerId) continue;
        if (circleVsRotatedRect(barrel.x, barrel.y, barrel.radius, ship.x, ship.y, ship.width, ship.height, ship.angle)) {
          this._explodeBarrel(barid, barrel);
          break;
        }
      }
    }

    // Powerup pickup
    for (const [pid, pu] of this.powerups) {
      for (const [sid, ship] of this.ships) {
        if (!ship.alive || this.bots.has(sid)) continue;
        const r = Math.max(ship.width, ship.height) / 2;
        if (circleVsCircle(pu.x, pu.y, POWERUP_RADIUS, ship.x, ship.y, r)) {
          ship.weapon    = pu.kind;
          ship.weaponAmmo = WEAPON_AMMO[pu.kind] || 10;
          this.powerups.delete(pid);
          this.events.push({ t: 'event', e: 'powerup', shipId: ship.id, kind: pu.kind });
          this._powerupQueue.push({ timer: POWERUP_RESPAWN, kind: pu.kind });
          break;
        }
      }
    }

    this._flush();
  }

  applyUpgrade(sessionId, kind) {
    const ship = this.ships.get(sessionId);
    if (ship && ship.alive) ship.applyUpgrade(kind);
  }

  _sinkShip(victimSid, victorShipId, tornado = false) {
    const victim = this.ships.get(victimSid);
    if (!victim) return;
    victim.alive = false;
    // Find the top-kill player for bounty tracking
    let topKills = 0;
    for (const s of this.ships.values()) {
      if (s.alive && s.kills > topKills) topKills = s.kills;
    }
    const victimIsLeader = victim.kills > 0 && victim.kills >= topKills;

    for (const ship of this.ships.values()) {
      if (ship.id === victorShipId) {
        ship.kills++;
        // Base points = victim's kill count (min 1), doubled if victim was the leader
        const bounty = Math.max(1, victim.kills) * (victimIsLeader ? 2 : 1);
        ship.upgradePoints += bounty;
        break;
      }
    }
    this.events.push({ t: 'event', e: 'sink', shipId: victim.id, name: victim.name, killerShipId: victorShipId, bounty: Math.max(1, victim.kills) * (victimIsLeader ? 2 : 1), tornado });
    if (this.bots.has(victimSid)) this.botTimers.set(victimSid, RESPAWN_DELAY);
  }

  _explodeBanana(bn) {
    this.events.push({ t: 'event', e: 'explosion', x: bn.x, y: bn.y, radius: BANANA_BLAST_R });
    for (const [sid, ship] of this.ships) {
      if (!ship.alive) continue;
      const r = Math.max(ship.width, ship.height) / 2;
      if (circleVsCircle(bn.x, bn.y, BANANA_BLAST_R, ship.x, ship.y, r)) {
        if (ship.takeDamage(BANANA_DAMAGE)) this._sinkShip(sid, bn.ownerId);
      }
    }
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
    for (const ev of this.events) this.broadcast(JSON.stringify(ev));
    this.events = [];
    const state = JSON.stringify({
      t: 'state', tick: this._tick,
      ships:    [...this.ships.values()].filter(s => s.alive).map(s => s.toState()),
      balls:    [...this.balls.values()].map(b  => ({ id: b.id, x: b.x, y: b.y, type: b.type, radius: b.radius, angle: b.angle })),
      barrels:  [...this.barrels.values()].map(b => ({ id: b.id, x: b.x, y: b.y })),
      bananas:  [...this.bananas.values()].map(b => ({ id: b.id, x: b.x, y: b.y, state: b.state, age: b.age, fuseAge: b.fuseAge })),
      powerups: [...this.powerups.values()].map(p => ({ id: p.id, x: p.x, y: p.y, kind: p.kind })),
    });
    this.broadcast(state);
  }
}

module.exports = { Game };
