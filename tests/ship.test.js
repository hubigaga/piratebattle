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
  s.addCannons(12);  // now 16 total: sqrt(16/4)=2, width=80
  assert.equal(s.totalCannons, 16);
  assert.equal(s.width, Math.round(40 * Math.sqrt(16 / 4)));  // 80
  assert.equal(s.range, 200 + 16 * 12);  // 392
});

test('HP scales proportionally when cannons added', () => {
  const s = new Ship(4, 'X', 'sloop');
  s.hp = 20;  // half health
  s.addCannons(12);
  // maxHP was 40, new maxHP = round(40 * sqrt(16/4)) = 80
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
