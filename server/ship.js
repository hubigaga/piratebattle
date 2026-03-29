'use strict';

const SHIP_TYPES = {
  sloop:      { cannonsPerSide: 2,  baseHP: 40,  maxSpeed: 220, turnRate: 90,  accel: 80,  baseWidth: 40,  baseHeight: 15 },
  brigantine: { cannonsPerSide: 4,  baseHP: 80,  maxSpeed: 180, turnRate: 70,  accel: 65,  baseWidth: 60,  baseHeight: 22 },
  galleon:    { cannonsPerSide: 8,  baseHP: 160, maxSpeed: 130, turnRate: 50,  accel: 45,  baseWidth: 90,  baseHeight: 33 },
  manOWar:    { cannonsPerSide: 12, baseHP: 240, maxSpeed: 100, turnRate: 35,  accel: 35,  baseWidth: 120, baseHeight: 44 },
};

const BASE_RANGE       = 200;
const RANGE_PER_CANNON = 12;

class Ship {
  constructor(id, name, type) {
    const def = SHIP_TYPES[type];
    if (!def) throw new Error(`Unknown ship type: ${type}`);
    this.id                = id;
    this.name              = name;
    this.type              = type;
    this.x                 = 0;
    this.y                 = 0;
    this.angle             = 0;   // radians, 0 = east, clockwise
    this.vx                = 0;
    this.vy                = 0;
    this.portCannons       = def.cannonsPerSide;
    this.starboardCannons  = def.cannonsPerSide;
    this.startTotalCannons = def.cannonsPerSide * 2;
    this.baseWidth         = def.baseWidth;
    this.baseHeight        = def.baseHeight;
    this.baseHP            = def.baseHP;
    this.maxSpeed          = def.maxSpeed;
    this.turnRate          = def.turnRate * Math.PI / 180;  // rad/s
    this.accel             = def.accel;
    this.portCooldown      = 0;
    this.starboardCooldown = 0;
    this.kills             = 0;
    this.alive             = true;
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
    const half            = Math.floor(count / 2);
    this.portCannons     += half;
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
