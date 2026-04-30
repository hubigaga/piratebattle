'use strict';

const WORLD_SIZE     = 6000;
const WORLD_CENTER_X = WORLD_SIZE / 2;
const WORLD_CENTER_Y = WORLD_SIZE / 2;
const WORLD_RADIUS   = WORLD_SIZE / 2;
const WATER_DRAG     = 0.8;  // water resistance — brakes the ship
const SAIL_FORCE     = 4.0;  // sail thrust factor — equilibrium = maxSpeed * SAIL_FORCE/WATER_DRAG
const SHOT_SPEED     = 430;
const BROADSIDE_CD   = 1.5;
const BALL_RADIUS    = 8;
const BALL_DAMAGE    = 10;
const BARREL_RADIUS  = 10;
const BARREL_TIMEOUT = 60;
const BARREL_BLAST_R = 80;
const BARREL_DAMAGE  = 60;

// Kühni squid ball
const SQUID_RADIUS = 14;
const SQUID_DAMAGE = 9999;

// Flammenwerfer
const FLAME_CD     = 0.09;
const FLAME_SPEED  = 520;
const FLAME_RANGE  = 200;
const FLAME_DAMAGE = 8;
const FLAME_RADIUS = 5;
const FLAME_SPREAD = 0.16; // radians, narrow cone

// Streukanone
const SCATTER_CD     = 1.4;
const SCATTER_BALLS  = 7;
const SCATTER_ARC    = Math.PI / 2.2;
const SCATTER_DAMAGE = 14;
const SCATTER_RADIUS = 5;

// Missile Kraken
const KRAKEN_CD      = 4.0;
const KRAKEN_SPEED   = 280;
const KRAKEN_RANGE   = 1800;
const KRAKEN_DAMAGE  = 60;
const KRAKEN_RADIUS  = 14;
const KRAKEN_TURN    = 2.8;   // homing turn rate rad/s

// Harpune
const HARPUNE_CD     = 2.5;
const HARPUNE_SPEED  = 210;
const HARPUNE_RANGE  = 650;
const HARPUNE_DAMAGE = 220;
const HARPUNE_RADIUS = 16;

const BURNER_FORCE    = 900;   // forward thrust while burner is active
const BURNER_DURATION = 1.0;
const BURNER_COOLDOWN = 18.0;

function updateShip(ship, input, dt) {
  const speed = Math.hypot(ship.vx, ship.vy);

  const turnFactor = Math.min(speed / ship.maxSpeed, 1);
  if (input.left)  ship.angle -= ship.turnRate * turnFactor * dt;
  if (input.right) ship.angle += ship.turnRate * turnFactor * dt;

  // Sail force — equilibrium speed settles at maxSpeed × (sails/3).
  if (ship.sails > 0) {
    const targetSpeed = ship.maxSpeed * (ship.sails / 3);
    const force       = SAIL_FORCE * targetSpeed;
    ship.vx += Math.cos(ship.angle) * force * dt;
    ship.vy += Math.sin(ship.angle) * force * dt;
  }

  // Burner — strong forward thrust, ignores normal speed cap
  if (ship.burnerTimer > 0) {
    ship.burnerTimer = Math.max(0, ship.burnerTimer - dt);
    ship.vx += Math.cos(ship.angle) * BURNER_FORCE * dt;
    ship.vy += Math.sin(ship.angle) * BURNER_FORCE * dt;
  } else if (ship.burnerCooldown > 0) {
    ship.burnerCooldown = Math.max(0, ship.burnerCooldown - dt);
  }
  if (input.fireBurner && ship.burnerTimer <= 0 && ship.burnerCooldown <= 0) {
    ship.burnerTimer    = BURNER_DURATION;
    ship.burnerCooldown = BURNER_COOLDOWN;
  }

  const df = 1 - WATER_DRAG * dt;
  ship.vx *= df;
  ship.vy *= df;

  // No hard speed cap — drag naturally limits thrust speed; external forces
  // (tornado slingshot, burner) can legitimately push past maxSpeed.

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  // Outside the sea: pull toward center — cubic growth so ships cannot drift far into the dark
  const edgeDist = Math.hypot(ship.x - WORLD_CENTER_X, ship.y - WORLD_CENTER_Y);
  if (edgeDist > WORLD_RADIUS) {
    const overflow = edgeDist - WORLD_RADIUS;
    const pull     = 80 * Math.pow(1 + overflow / 300, 3);
    const nx       = (WORLD_CENTER_X - ship.x) / edgeDist;
    const ny       = (WORLD_CENTER_Y - ship.y) / edgeDist;
    ship.vx += nx * pull * dt;
    ship.vy += ny * pull * dt;
  }

  if (ship.portCooldown > 0)   ship.portCooldown   = Math.max(0, ship.portCooldown   - dt);
  if (ship.starboardCooldown > 0) ship.starboardCooldown = Math.max(0, ship.starboardCooldown - dt);
  if (ship.weaponCooldown > 0) ship.weaponCooldown = Math.max(0, ship.weaponCooldown - dt);
}

function spawnBroadside(ship, side, idGen) {
  const cdKey = side === 'port' ? 'portCooldown' : 'starboardCooldown';
  if (ship[cdKey] > 0) return [];

  const cannons   = side === 'port' ? ship.portCannons : ship.starboardCannons;
  const sideAngle = ship.angle + (side === 'port' ? -Math.PI / 2 : Math.PI / 2);
  const sdx       = Math.cos(sideAngle);
  const sdy       = Math.sin(sideAngle);
  const fwdX      = Math.cos(ship.angle);
  const fwdY      = Math.sin(ship.angle);
  const fwdSpeed  = ship.vx * fwdX + ship.vy * fwdY;

  const isKuhni = ship.kuehni;
  const radius  = isKuhni ? SQUID_RADIUS : BALL_RADIUS;
  const damage  = isKuhni ? SQUID_DAMAGE : BALL_DAMAGE;
  const type    = isKuhni ? 'squid' : 'normal';

  const balls = [];
  for (let i = 0; i < cannons; i++) {
    const t = cannons > 1 ? i / (cannons - 1) - 0.5 : 0;
    balls.push({
      id:            idGen(),
      x:             ship.x + fwdX * t * ship.width * 1.4 + sdx * ship.height / 2,
      y:             ship.y + fwdY * t * ship.width * 1.4 + sdy * ship.height / 2,
      vx:            sdx * SHOT_SPEED + ship.vx,
      vy:            sdy * SHOT_SPEED + ship.vy,
      distTravelled: 0,
      range:         ship.range,
      ownerId:       ship.id,
      radius,
      damage,
      type,
    });
  }
  ship[cdKey] = BROADSIDE_CD;
  return balls;
}

function spawnFlame(ship, idGen) {
  if (ship.weaponCooldown > 0 || ship.weapon !== 'flame') return [];
  const balls = [];
  for (let i = -1; i <= 1; i++) {
    const a = ship.angle + i * FLAME_SPREAD;
    balls.push({
      id:            idGen(),
      x:             ship.x + Math.cos(a) * (ship.height + 4),
      y:             ship.y + Math.sin(a) * (ship.height + 4),
      vx:            Math.cos(a) * FLAME_SPEED,
      vy:            Math.sin(a) * FLAME_SPEED,
      distTravelled: 0,
      range:         FLAME_RANGE,
      ownerId:       ship.id,
      radius:        FLAME_RADIUS,
      damage:        FLAME_DAMAGE,
      type:          'flame',
    });
  }
  ship.weaponCooldown = FLAME_CD;
  ship.weaponAmmo--;
  if (ship.weaponAmmo <= 0) ship.weapon = null;
  return balls;
}

function spawnScatter(ship, idGen) {
  if (ship.weaponCooldown > 0 || ship.weapon !== 'scatter') return [];
  const balls = [];
  for (let i = 0; i < SCATTER_BALLS; i++) {
    const t = SCATTER_BALLS > 1 ? i / (SCATTER_BALLS - 1) - 0.5 : 0;
    const a = ship.angle + t * SCATTER_ARC;
    balls.push({
      id:            idGen(),
      x:             ship.x + Math.cos(a) * (ship.height + 4),
      y:             ship.y + Math.sin(a) * (ship.height + 4),
      vx:            Math.cos(a) * SHOT_SPEED,
      vy:            Math.sin(a) * SHOT_SPEED,
      distTravelled: 0,
      range:         ship.range * 7.5,
      ownerId:       ship.id,
      radius:        SCATTER_RADIUS,
      damage:        SCATTER_DAMAGE,
      type:          'scatter',
    });
  }
  ship.weaponCooldown = SCATTER_CD;
  ship.weaponAmmo--;
  if (ship.weaponAmmo <= 0) ship.weapon = null;
  return balls;
}

function spawnHarpune(ship, idGen) {
  if (ship.weaponCooldown > 0 || ship.weapon !== 'harpune') return [];
  const fwdX = Math.cos(ship.angle);
  const fwdY = Math.sin(ship.angle);
  const ball = {
    id:            idGen(),
    x:             ship.x + fwdX * (ship.width * 0.5 + HARPUNE_RADIUS),
    y:             ship.y + fwdY * (ship.width * 0.5 + HARPUNE_RADIUS),
    vx:            fwdX * HARPUNE_SPEED,
    vy:            fwdY * HARPUNE_SPEED,
    distTravelled: 0,
    range:         HARPUNE_RANGE,
    ownerId:       ship.id,
    radius:        HARPUNE_RADIUS,
    damage:        HARPUNE_DAMAGE,
    type:          'harpune',
  };
  ship.weaponCooldown = HARPUNE_CD;
  ship.weaponAmmo--;
  if (ship.weaponAmmo <= 0) ship.weapon = null;
  return [ball];
}

function spawnKraken(ship, idGen) {
  if (ship.weaponCooldown > 0 || ship.weapon !== 'kraken') return [];
  const fwdX = Math.cos(ship.angle);
  const fwdY = Math.sin(ship.angle);
  const ball = {
    id:            idGen(),
    x:             ship.x + fwdX * (ship.width * 0.5 + KRAKEN_RADIUS),
    y:             ship.y + fwdY * (ship.width * 0.5 + KRAKEN_RADIUS),
    vx:            fwdX * KRAKEN_SPEED,
    vy:            fwdY * KRAKEN_SPEED,
    angle:         ship.angle,
    distTravelled: 0,
    range:         KRAKEN_RANGE,
    ownerId:       ship.id,
    radius:        KRAKEN_RADIUS,
    damage:        KRAKEN_DAMAGE,
    type:          'kraken',
  };
  ship.weaponCooldown = KRAKEN_CD;
  ship.weaponAmmo--;
  if (ship.weaponAmmo <= 0) ship.weapon = null;
  return [ball];
}

function spawnBarrel(ship, idGen) {
  return { id: idGen(), x: ship.x, y: ship.y, radius: BARREL_RADIUS, ownerId: ship.id, age: 0 };
}

// Bananenbombe
const BANANA_CD      = 3.0;
const BANANA_SPEED   = 300;
const BANANA_RANGE   = 500;
const BANANA_FUSE    = 5.0;
const BANANA_BLAST_R = 350;
const BANANA_DAMAGE  = 150;

function spawnBanana(ship, idGen) {
  if (ship.weaponCooldown > 0 || ship.weapon !== 'banana') return null;
  const fwdX = Math.cos(ship.angle);
  const fwdY = Math.sin(ship.angle);
  const banana = {
    id:            idGen(),
    x:             ship.x + fwdX * ship.height,
    y:             ship.y + fwdY * ship.height,
    vx:            fwdX * BANANA_SPEED + ship.vx,
    vy:            fwdY * BANANA_SPEED + ship.vy,
    state:         'flying',
    age:           0,
    fuseAge:       0,
    distTravelled: 0,
    ownerId:       ship.id,
  };
  ship.weaponCooldown = BANANA_CD;
  ship.weaponAmmo--;
  if (ship.weaponAmmo <= 0) ship.weapon = null;
  return banana;
}

function updateBananas(bananas, dt) {
  const expired   = [];
  const toExplode = [];
  for (const [id, b] of bananas) {
    b.age += dt;
    if (b.state === 'flying') {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.distTravelled += Math.hypot(b.vx, b.vy) * dt;
      if (b.distTravelled >= BANANA_RANGE) {
        b.state = 'ticking';
        b.vx = 0; b.vy = 0;
        b.fuseAge = 0;
      }
    } else {
      b.fuseAge += dt;
      if (b.fuseAge >= BANANA_FUSE) {
        toExplode.push(b);
        expired.push(id);
      }
    }
  }
  return { expired, toExplode };
}

function updateBalls(balls, dt, ships) {
  const expired = [];
  for (const ball of balls.values()) {
    // Homing for kraken missiles
    if (ball.type === 'kraken' && ships) {
      let bestDist = Infinity, bestShip = null;
      for (const [sid, ship] of ships) {
        if (!ship.alive || ship.id === ball.ownerId) continue;
        const dx = ship.x - ball.x, dy = ship.y - ball.y;
        const d  = Math.hypot(dx, dy);
        if (d < bestDist) { bestDist = d; bestShip = ship; }
      }
      if (bestShip) {
        const dx      = bestShip.x - ball.x, dy = bestShip.y - ball.y;
        const desired = Math.atan2(dy, dx);
        let   diff    = desired - ball.angle;
        while (diff >  Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const turn  = Math.sign(diff) * Math.min(Math.abs(diff), KRAKEN_TURN * dt);
        ball.angle += turn;
        ball.vx     = Math.cos(ball.angle) * KRAKEN_SPEED;
        ball.vy     = Math.sin(ball.angle) * KRAKEN_SPEED;
      }
    }

    const dist = Math.hypot(ball.vx, ball.vy) * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (Math.hypot(ball.x - WORLD_CENTER_X, ball.y - WORLD_CENTER_Y) > WORLD_RADIUS) {
      expired.push(ball.id); continue;
    }
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

// Tornado — inverse-square gravity across the entire map.
// Weak at the edges, deadly up close. No artificial cutoff radius.
const TORNADO_GM      = 126000;
const TORNADO_DEATH_R = 70;

function applyTornado(ship, dt) {
  const dx   = WORLD_CENTER_X - ship.x;
  const dy   = WORLD_CENTER_Y - ship.y;
  const dist = Math.hypot(dx, dy);
  if (dist < TORNADO_DEATH_R) return true;

  const nx    = dx / dist, ny = dy / dist;
  // F = GM / r  — linear falloff with distance
  const force = TORNADO_GM / dist;
  ship.vx += nx * force * dt;
  ship.vy += ny * force * dt;
  return false;
}

function circleVsCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by;
  const r  = ar + br;
  return dx * dx + dy * dy <= r * r;
}

// Approximate each ship as a circle with radius = max(w,h)/2 and resolve overlaps.
function resolveShipCollisions(ships) {
  const arr = [...ships.values()].filter(s => s.alive);
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      const ra = Math.max(a.width, a.height) / 2;
      const rb = Math.max(b.width, b.height) / 2;
      const minDist = ra + rb;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= minDist || dist === 0) continue;

      // Separation axis (normalised)
      const nx = dx / dist, ny = dy / dist;

      // Push ships apart so they no longer overlap
      const overlap = (minDist - dist) / 2;
      a.x -= nx * overlap;  a.y -= ny * overlap;
      b.x += nx * overlap;  b.y += ny * overlap;

      // Exchange velocity components along the collision normal (1-D elastic, equal mass)
      const dvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (dvn > 0) {  // only resolve if ships are moving toward each other
        const RESTITUTION = 0.4;
        const impulse = dvn * (1 + RESTITUTION) / 2;
        a.vx -= impulse * nx;  a.vy -= impulse * ny;
        b.vx += impulse * nx;  b.vy += impulse * ny;
      }
    }
  }
}

module.exports = {
  updateShip, resolveShipCollisions, applyTornado,
  spawnBroadside, spawnFlame, spawnScatter, spawnHarpune, spawnKraken,
  spawnBarrel, updateBalls, updateBarrels,
  spawnBanana, updateBananas,
  circleVsRotatedRect, circleVsCircle,
  BALL_DAMAGE, BARREL_DAMAGE, BARREL_BLAST_R, BANANA_BLAST_R, BANANA_DAMAGE,
  WORLD_SIZE, WORLD_CENTER_X, WORLD_CENTER_Y, WORLD_RADIUS,
};
