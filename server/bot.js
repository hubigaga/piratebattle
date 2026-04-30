'use strict';

// Bot AI — roam / hunt state machine.
// Each Bot manages its own Ship (stored in game.ships under its sessionId)
// and produces an input object each tick.

const DETECT_RANGE    = 720;
const DISENGAGE_RANGE = 1100;
const FIRE_THRESH     = 0.28;   // radians: how close broadside must align to fire
const WORLD           = 4000;
const RESPAWN_DELAY   = 18;     // seconds before a sunk bot respawns

const BOT_CONFIGS = [
  { name: 'El Diablo',    type: 'brigantine' },
  { name: 'Black Pearl',  type: 'galleon'    },
  { name: 'La Muerte',    type: 'sloop'      },
  { name: 'Davy Jones',   type: 'brigantine' },
  { name: 'Bloodhound',   type: 'sloop'      },
  { name: 'Iron Maiden',  type: 'manOWar'    },
  { name: 'Sea Serpent',  type: 'galleon'    },
  { name: 'Red Kraken',   type: 'sloop'      },
];

class BotAI {
  constructor(sessionId) {
    this.sessionId    = sessionId;
    this.state        = 'roam';
    this.targetSid    = null;
    this.dirTimer     = Math.random() * 4;  // stagger initial direction changes
    this.turnDir      = Math.random() < 0.5 ? -1 : 1;
    this.respawnTimer = 0;
    this.dead         = false;
    this._inp = { up: false, down: false, left: false, right: false,
                  firePort: false, fireStarboard: false, dropBarrel: false };
  }

  _delta(ax, ay, bx, by) {
    let dx = bx - ax, dy = by - ay;
    if (dx >  WORLD / 2) dx -= WORLD;
    if (dx < -WORLD / 2) dx += WORLD;
    if (dy >  WORLD / 2) dy -= WORLD;
    if (dy < -WORLD / 2) dy += WORLD;
    return { dx, dy, dist: Math.hypot(dx, dy) };
  }

  _normAngle(a) {
    while (a >  Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  update(dt, myShip, allShips) {
    const inp = this._inp;
    inp.firePort = inp.fireStarboard = inp.dropBarrel = false;

    this.dirTimer -= dt;

    if (this.state === 'roam') {
      // Scan for nearest alive human ship
      let nearestSid  = null;
      let nearestDist = Infinity;
      for (const [sid, ship] of allShips) {
        if (sid === this.sessionId || !ship.alive || ship.isBot) continue;
        const { dist } = this._delta(myShip.x, myShip.y, ship.x, ship.y);
        if (dist < DETECT_RANGE && dist < nearestDist) {
          nearestSid  = sid;
          nearestDist = dist;
        }
      }

      if (nearestSid) {
        this.state     = 'hunt';
        this.targetSid = nearestSid;
      } else {
        // Random wandering — change direction every 3–6 s
        if (this.dirTimer <= 0) {
          this.dirTimer = 3 + Math.random() * 3;
          const r = Math.random();
          this.turnDir = r < 0.33 ? -1 : r < 0.66 ? 0 : 1;
        }
        inp.up    = true;
        inp.left  = this.turnDir === -1;
        inp.right = this.turnDir ===  1;
      }
    }

    if (this.state === 'hunt') {
      const target = allShips.get(this.targetSid);
      if (!target || !target.alive) {
        this.state = 'roam'; this.targetSid = null;
        return this._inp;
      }

      const { dx, dy, dist } = this._delta(myShip.x, myShip.y, target.x, target.y);
      if (dist > DISENGAGE_RANGE) {
        this.state = 'roam'; this.targetSid = null;
        return this._inp;
      }

      const angleToTarget = Math.atan2(dy, dx);
      const diff          = this._normAngle(angleToTarget - myShip.angle);

      inp.up    = true;
      inp.left  = diff < -0.12;
      inp.right = diff >  0.12;

      // Fire when broadside is aimed at target
      if (dist < myShip.range * 1.3) {
        const portDiff = this._normAngle(angleToTarget - (myShip.angle - Math.PI / 2));
        const starDiff = this._normAngle(angleToTarget - (myShip.angle + Math.PI / 2));
        inp.firePort      = Math.abs(portDiff) < FIRE_THRESH;
        inp.fireStarboard = Math.abs(starDiff) < FIRE_THRESH;
      }
    }

    return this._inp;
  }
}

module.exports = { BotAI, BOT_CONFIGS, RESPAWN_DELAY };
