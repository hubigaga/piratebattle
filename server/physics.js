'use strict';

const WORLD_SIZE    = 4000;
const DRAG          = 1.2;
const SHOT_SPEED    = 350;   // px/s
const BROADSIDE_CD  = 1.5;   // s
const BALL_RADIUS   = 4;
const BALL_DAMAGE   = 10;
const BARREL_RADIUS = 10;
const BARREL_TIMEOUT = 60;   // s
const BARREL_BLAST_R = 80;
const BARREL_DAMAGE  = 60;

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
  const cdKey   = side === 'port' ? 'portCooldown' : 'starboardCooldown';
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

// Circle vs rotated rectangle (rect centered at rx,ry)
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
