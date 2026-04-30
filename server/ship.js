'use strict';

const SHIP_TYPES = {
  // Player starter ship — all players begin here, upgrades grow it
  sloop:      { cannonsPerSide: 2,  baseHP: 50,  maxSpeed: 71,  turnRate: 100, accel: 70,  baseWidth: 40,  baseHeight: 15 },
  // Bot types
  brigantine: { cannonsPerSide: 4,  baseHP: 80,  maxSpeed: 63,  turnRate: 80,  accel: 56,  baseWidth: 80,  baseHeight: 30 },
  galleon:    { cannonsPerSide: 8,  baseHP: 160, maxSpeed: 47,  turnRate: 58,  accel: 41,  baseWidth: 120, baseHeight: 45 },
  manOWar:    { cannonsPerSide: 12, baseHP: 240, maxSpeed: 37,  turnRate: 42,  accel: 29,  baseWidth: 160, baseHeight: 60 },
};

const UPGRADE_COSTS = {
  cannon: [1, 2, 3],   // +4 cannons total per tier
  hull:   [1, 2, 3],   // +30% base HP per tier
  speed:  [1, 2, 4],   // +20% maxSpeed per tier
  range:  [1, 1, 2],   // +60 range per tier
  zoom:   [1, 2, 3],   // zoom out tiers (client-only effect)
};
const UPGRADE_MAX = 3;

const BASE_RANGE       = 400;
const RANGE_PER_CANNON = 12;
const MAX_CANNONS      = 36;  // hard cap so ships can't grow infinitely

class Ship {
  constructor(id, name, type) {
    const def = SHIP_TYPES[type];
    if (!def) throw new Error(`Unknown ship type: ${type}`);
    this.id                = id;
    this.name              = name;
    this.type              = type;
    this.x                 = 0;
    this.y                 = 0;
    this.angle             = 0;
    this.vx                = 0;
    this.vy                = 0;
    this.portCannons       = def.cannonsPerSide;
    this.starboardCannons  = def.cannonsPerSide;
    this.startTotalCannons = def.cannonsPerSide * 2;
    this.baseWidth         = def.baseWidth;
    this.baseHeight        = def.baseHeight;
    this.baseHP            = def.baseHP;
    this.maxSpeed          = def.maxSpeed;
    this.turnRate          = def.turnRate * Math.PI / 180;
    this.accel             = def.accel;
    this.portCooldown      = 0;
    this.starboardCooldown = 0;
    this.weaponCooldown    = 0;
    this.weapon            = null;
    this.weaponAmmo        = 0;
    this.mineAmmo          = 3;
    this.sails             = 3;
    this.burnerTimer       = 0;
    this.burnerCooldown    = 0;
    this.kills             = 0;
    this.upgradePoints     = 0;
    this.upgradeTiers      = { cannon: 0, hull: 0, speed: 0, range: 0, zoom: 0 };
    this.alive             = true;
    this.isBot             = false;
    this.kuehni            = name.toLowerCase() === 'kühni';
    // Set by _recalculate:
    this.width = 0; this.height = 0; this.hp = 0; this.maxHP = 0; this.range = 0;
    this._recalculate(true);
    if (this.kuehni) { this.maxSpeed *= 2; this.accel *= 2; this.upgradePoints = 100; }
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

  applyUpgrade(kind) {
    const tier = this.upgradeTiers[kind];
    if (tier >= UPGRADE_MAX) return false;
    const cost = UPGRADE_COSTS[kind][tier];
    if (this.upgradePoints < cost) return false;
    this.upgradePoints -= cost;
    this.upgradeTiers[kind]++;
    if (kind === 'cannon') this.addCannons(4);
    if (kind === 'hull')   { this.baseHP = Math.round(this.baseHP * 1.3); this._recalculate(); }
    if (kind === 'speed')  this.maxSpeed = Math.round(this.maxSpeed * 1.2);
    if (kind === 'range')  this.range   += 60;
    return true;
  }

  restoreUpgrades(upgradePoints, upgradeTiers) {
    this.upgradePoints = upgradePoints;
    for (const [kind, tier] of Object.entries(upgradeTiers)) {
      for (let i = 0; i < tier; i++) {
        if (kind === 'cannon') this.addCannons(4);
        if (kind === 'hull')   { this.baseHP = Math.round(this.baseHP * 1.3); this._recalculate(); }
        if (kind === 'speed')  this.maxSpeed = Math.round(this.maxSpeed * 1.2);
        if (kind === 'range')  this.range   += 60;
      }
      this.upgradeTiers[kind] = tier;
    }
  }

  addCannons(count) {
    const available = Math.max(0, MAX_CANNONS - this.totalCannons);
    if (available === 0) return;
    const add  = Math.min(count, available);
    const half = Math.floor(add / 2);
    this.portCannons     += half;
    this.starboardCannons += add - half;
    this._recalculate();
  }

  takeDamage(dmg) {
    this.hp = Math.max(0, this.hp - dmg);
    return this.hp === 0;
  }

  toState() {
    return {
      id: this.id, name: this.name, isBot: this.isBot,
      x: this.x, y: this.y, angle: this.angle, vx: this.vx, vy: this.vy,
      hp: this.hp, maxHp: this.maxHP, kills: this.kills,
      portCannons: this.portCannons, starboardCannons: this.starboardCannons,
      width: this.width, height: this.height,
      weapon: this.weapon, weaponAmmo: this.weaponAmmo, mineAmmo: this.mineAmmo,
      sails: this.sails,
      burnerTimer: this.burnerTimer, burnerCooldown: this.burnerCooldown,
      upgradePoints: this.upgradePoints, upgradeTiers: this.upgradeTiers,
    };
  }
}

module.exports = { Ship, SHIP_TYPES };
