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
  // Port side fires north (angle - π/2), forward component adds to vx
  // ball.vx = cos(-π/2)*350 + cos(0)*100*0.4 = 0 + 40 = 40
  // ball.vy = sin(-π/2)*350 = -350
  assert.ok(balls[0].vx > 0, 'forward component should add to x velocity');
  assert.ok(balls[0].vy < 0, 'port side fires north (negative y)');
});

test('updateBalls removes expired balls', () => {
  const balls = new Map();
  balls.set(2, { id: 2, x: 100, y: 100, vx: 1000, vy: 0, distTravelled: 290, range: 300 });
  const expired = updateBalls(balls, 0.1);  // dist += 100 -> 390 > 300: expired
  assert.ok(expired.includes(2));
});

test('circleVsRotatedRect hits centered circle', () => {
  assert.ok(circleVsRotatedRect(100, 100, 5, 100, 100, 80, 30, 0));
});

test('circleVsRotatedRect misses distant circle', () => {
  assert.ok(!circleVsRotatedRect(200, 200, 5, 100, 100, 80, 30, 0));
});

test('circleVsCircle overlapping', () => {
  assert.ok( circleVsCircle(0, 0, 10, 5,  0, 10));
});

test('circleVsCircle not overlapping', () => {
  assert.ok(!circleVsCircle(0, 0, 10, 21, 0, 10));
});
