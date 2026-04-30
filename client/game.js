// client/game.js
import { Net }          from './net.js';
import { Input }        from './input.js';
import { Interpolator } from './interpolation.js';
import { Water }        from './water.js';
import { Radar }        from './radar.js';
import { Sound }        from './sound.js';

let CANVAS_W = window.innerWidth;
let CANVAS_H = window.innerHeight;
const WORLD    = 6000;
const INPUT_HZ = 60;
const ZOOM     = 0.60;   // world units per screen pixel: lower = farther out

// ── Ship sprite sheet ────────────────────────────────────────────────────────
let SHIPS_CANVAS = null;

// Reusable offscreen canvas for tinting — grows to fit, never shrinks
const _tintCanvas = document.createElement('canvas');
function _getTintCanvas(w, h) {
  if (_tintCanvas.width < w)  _tintCanvas.width  = w;
  if (_tintCanvas.height < h) _tintCanvas.height = h;
  return _tintCanvas;
}
{
  const _img = new Image();
  _img.onload = () => {
    const oc  = document.createElement('canvas');
    oc.width  = _img.naturalWidth;
    oc.height = _img.naturalHeight;
    oc.getContext('2d').drawImage(_img, 0, 0);
    SHIPS_CANVAS = oc;
  };
  _img.onerror = () => console.error('Failed to load sprites/ships.png');
  _img.src = 'sprites/ships.png?v=2';
}

// Grid coordinates measured from the spritesheet (1024x1024)
const SHIP_ROWS = [
  { y: 50,  h: 246 },   // row 0: Sloop
  { y: 334, h: 242 },   // row 1: Brigantine / 1-sail
  { y: 616, h: 262 },   // row 2: Galleon / 3-sail
];
const SHIP_COLS = [
  { x: 84,  w: 165 },   // col 0: Intact      (hp > 75%)
  { x: 249, w: 190 },   // col 1: Lightly Dmg (hp > 50%)
  { x: 439, w: 208 },   // col 2: Heavily Dmg (hp > 25%)
  { x: 647, w: 171 },   // col 3: Burning     (hp >  0%)
  { x: 818, w: 178 },   // col 4: Wreck       (hp == 0)
];

const NEON_PALETTE = [
  '#ff7700','#cc00ff','#ffcc00','#ff0088',
  '#00ffee','#44aaff','#ff4455','#88ff00',
  '#ff88cc','#00ccff','#ffaa33','#aa44ff',
];

// Returns a stable neon color for a given ship id
function shipNeonColor(id) { return NEON_PALETTE[id % NEON_PALETTE.length]; }

// Ship type → sprite row
const TYPE_ROW = { sloop: 0, brigantine: 1, galleon: 2, manOWar: 2 };

// ── Ship drawing ─────────────────────────────────────────────────────────────

// Bananenbombe — spritesheet: 8 cols × 4 rows, each frame 176×192
const BN_FW = 176, BN_FH = 192;
const BN_ROW = { flying: 0, ticking: 1 };

function drawBanana(ctx, bn, img, time) {
  const size = 48;
  const row  = bn.state === 'flying' ? 0 : (bn.fuseAge > 3.5 ? 2 : 1);
  const fps  = bn.state === 'flying' ? 10 : 4;
  const col  = Math.floor((bn.state === 'flying' ? bn.age : bn.fuseAge) * fps) % 7;

  // ticking pulse when near explosion
  if (bn.state === 'ticking') {
    const pulse = Math.sin(time * (4 + bn.fuseAge * 2)) * 0.5 + 0.5;
    ctx.save();
    ctx.globalAlpha = 0.25 + pulse * 0.25;
    ctx.beginPath();
    ctx.arc(bn.x, bn.y, 20 + pulse * 10, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcc00';
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(bn.x, bn.y);
  if (bn.state === 'flying') ctx.rotate(bn.age * 6);
  ctx.drawImage(img, col * BN_FW, row * BN_FH, BN_FW, BN_FH, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawMine(ctx, mine, time) {
  const r    = 12;
  const x    = mine.x;
  const y    = mine.y;
  const SPIKES = 8;

  // Proximity warning pulse (outer glow)
  const pulse = Math.sin(time * 3.5) * 0.5 + 0.5;
  ctx.beginPath();
  ctx.arc(x, y, r + 8 + pulse * 6, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(200,30,30,${(pulse * 0.18).toFixed(2)})`;
  ctx.fill();

  // Body
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grad.addColorStop(0, '#5a5a5a');
  grad.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1 / ZOOM;
  ctx.stroke();

  // Spikes
  ctx.strokeStyle = '#4a4a4a';
  ctx.lineWidth   = 2 / ZOOM;
  for (let i = 0; i < SPIKES; i++) {
    const a  = (i / SPIKES) * Math.PI * 2;
    const ix = x + Math.cos(a) * r;
    const iy = y + Math.sin(a) * r;
    const ox = x + Math.cos(a) * (r + 7);
    const oy = y + Math.sin(a) * (r + 7);
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(ox, oy);
    ctx.stroke();
    // Spike tip
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(ox, oy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Blinking light
  const blink = Math.sin(time * 4) > 0 ? 1 : 0;
  if (blink) {
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWake(ctx, ship) {
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed < 12) return;
  const frac = Math.min(speed / 200, 1);
  const len  = ship.width * 2.0 * frac;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.strokeStyle = `rgba(160,225,255,${(frac * 0.38).toFixed(2)})`;
  ctx.lineWidth   = 2.5 / ZOOM;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-ship.width * 0.44, s * ship.height * 0.28);
    ctx.quadraticCurveTo(
      -ship.width * 0.44 - len * 0.55,  s * ship.height * 0.55 * frac,
      -ship.width * 0.44 - len,          s * ship.height * 0.12
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawShip(ctx, ship, isMe, time) {
  const sw = ship.width;
  const sh = ship.height;

  const glowColor = isMe ? '#ffcc00' : ship.isBot ? '#cc00ff' : shipNeonColor(ship.id);

  // Sprite row by sail count, col by damage state
  const sails  = ship.sails ?? 0;
  const rowIdx = sails === 0 ? 0 : sails <= 2 ? 1 : 2;
  const hpFrac = ship.maxHp > 0 ? ship.hp / ship.maxHp : 0;
  const colIdx = ship.hp <= 0 ? 4 : hpFrac > 0.75 ? 0 : hpFrac > 0.50 ? 1 : hpFrac > 0.25 ? 2 : 3;
  const row    = SHIP_ROWS[rowIdx];
  const col    = SHIP_COLS[colIdx];

  // Draw size: scale sprite so its longer axis matches ship width
  const aspect   = col.w / row.h;
  const drawW    = sw * 1.6;
  const drawH    = drawW / aspect;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle - Math.PI / 2);

  // Neon glow behind sprite
  ctx.shadowColor = glowColor;
  ctx.shadowBlur  = 20 / ZOOM;

  if (SHIPS_CANVAS) {
    // Tint only opaque pixels: composite on a temp canvas
    const tw = Math.ceil(drawW), th = Math.ceil(drawH);
    const tc  = _getTintCanvas(tw, th);
    const tc2 = tc.getContext('2d');
    tc2.clearRect(0, 0, tw, th);
    tc2.drawImage(SHIPS_CANVAS, col.x, row.y, col.w, row.h, 0, 0, tw, th);
    tc2.globalCompositeOperation = 'source-atop';
    tc2.globalAlpha = ship.isBot ? 0.18 : 0.28;
    tc2.fillStyle   = glowColor;
    tc2.fillRect(0, 0, tw, th);
    tc2.globalCompositeOperation = 'source-over';
    tc2.globalAlpha = 1;
    ctx.drawImage(tc, 0, 0, tw, th, -drawW / 2, -drawH / 2, drawW, drawH);
  } else {
    // Fallback: simple rect while image loads
    ctx.fillStyle = glowColor;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

// Flag fluttering at the bow — wave wobble driven by ship speed
const FLAG_COLS = 14;
function drawShipFlag(ctx, ship, flagImg, time) {
  if (!flagImg || !flagImg.complete || !flagImg.naturalWidth) return;
  const speed     = Math.hypot(ship.vx ?? 0, ship.vy ?? 0);
  const wobble    = Math.min(speed / 180, 1);          // 0 = still, 1 = full flap
  const fw        = ship.width * 2.0;
  const fh        = fw * 0.55;
  const bowDist   = ship.height * 0.60;
  const colW      = fw / FLAG_COLS;
  const srcColW   = flagImg.naturalWidth / FLAG_COLS;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle - Math.PI / 2);

  // Draw column-by-column with a travelling sine wave
  for (let i = 0; i < FLAG_COLS; i++) {
    const t    = i / (FLAG_COLS - 1);
    const wave = Math.sin(t * Math.PI * 2.5 - time * 7) * wobble * fh * 0.28;
    const wave2= Math.sin(t * Math.PI * 1.2 - time * 5) * wobble * fh * 0.10;
    const dy   = wave + wave2;
    const stretchedH = fh + Math.abs(dy) * 0.3;
    ctx.drawImage(
      flagImg,
      i * srcColW, 0, srcColW, flagImg.naturalHeight,
      -fw / 2 + i * colW, -bowDist - fh + dy, colW + 0.5, stretchedH
    );
  }
  ctx.restore();
}

// Tornado sprite sheet: 4 cols × 3 rows = 12 frames, each 704×512 px
const TORNADO_COLS   = 4;
const TORNADO_ROWS   = 3;
const TORNADO_FRAMES = TORNADO_COLS * TORNADO_ROWS;  // 12
const TORNADO_FW     = 704;
const TORNADO_FH     = 512;
const TORNADO_FPS    = 8;   // animation speed
const TORNADO_SIZE   = 800; // world-unit draw size (square)

// Offscreen canvas for compositing the radial fade mask
const _tornadoOC = document.createElement('canvas');
_tornadoOC.width  = TORNADO_FW;
_tornadoOC.height = TORNADO_FH;

function drawTornado(ctx, tornadoImg, time) {
  const x = WORLD / 2, y = WORLD / 2;
  if (!tornadoImg || !tornadoImg.complete || !tornadoImg.naturalWidth) return;

  const frame = Math.floor(time * TORNADO_FPS) % TORNADO_FRAMES;
  const col   = frame % TORNADO_COLS;
  const row   = Math.floor(frame / TORNADO_COLS);

  // Draw frame onto offscreen canvas, then punch a radial fade mask into it
  const oc  = _tornadoOC;
  const oc2 = oc.getContext('2d');
  oc2.clearRect(0, 0, TORNADO_FW, TORNADO_FH);
  oc2.drawImage(tornadoImg, col * TORNADO_FW, row * TORNADO_FH, TORNADO_FW, TORNADO_FH, 0, 0, TORNADO_FW, TORNADO_FH);

  // Radial gradient mask: fully opaque at centre, transparent at edges
  const cx = TORNADO_FW / 2, cy = TORNADO_FH / 2;
  const mask = oc2.createRadialGradient(cx, cy, TORNADO_FW * 0.15, cx, cy, TORNADO_FW * 0.40);
  mask.addColorStop(0,   'rgba(0,0,0,1)');
  mask.addColorStop(1,   'rgba(0,0,0,0)');
  oc2.globalCompositeOperation = 'destination-in';
  oc2.fillStyle = mask;
  oc2.fillRect(0, 0, TORNADO_FW, TORNADO_FH);
  oc2.globalCompositeOperation = 'source-over';

  const half = TORNADO_SIZE / 2;
  ctx.save();
  ctx.drawImage(oc, x - half, y - half, TORNADO_SIZE, TORNADO_SIZE);
  ctx.restore();
}

// Tiny flickering fire spots on damaged ships (hp < 50%)
function drawShipFire(ctx, ship, time) {
  const hpFrac = ship.maxHp > 0 ? ship.hp / ship.maxHp : 0;
  if (hpFrac >= 0.5 || ship.hp <= 0) return;

  // More fire spots the more damaged the ship is
  const count = Math.round(4 + (1 - hpFrac) * 10);
  const hw = ship.width  / 2;
  const hh = ship.height / 2;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle - Math.PI / 2);

  for (let i = 0; i < count; i++) {
    // Stable pseudo-random position per spot, seeded by ship id + index
    const h1 = Math.sin(ship.id * 127.1 + i * 311.7) * 43758.5453;
    const h2 = Math.sin(ship.id * 269.5 + i * 183.3) * 43758.5453;
    const fx = (h1 - Math.floor(h1) - 0.5) * ship.width  * 0.9;
    const fy = (h2 - Math.floor(h2) - 0.5) * ship.height * 0.9;

    // Each spot flickers at its own phase
    const phase  = (Math.sin(ship.id * 31 + i * 57.3) * 43758.5) % (Math.PI * 2);
    const flicker = Math.pow(Math.max(0, Math.sin(time * 8 + phase)), 1.5);
    if (flicker < 0.1) continue;  // spot is "out" this moment

    const radius = (1.5 + flicker * 2.5) / ZOOM;
    const alpha  = flicker * (0.5 + (1 - hpFrac) * 0.5);

    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur  = 8 / ZOOM;
    ctx.globalAlpha = alpha;
    // Inner bright core
    ctx.fillStyle = `hsl(${30 + flicker * 30},100%,${60 + flicker * 30}%)`;
    ctx.beginPath();
    ctx.arc(fx, fy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.restore();
}

function drawSquid(ctx, x, y, r, time) {
  const t = time * 3;
  ctx.save();
  // Glow
  ctx.shadowColor = '#cc00ff';
  ctx.shadowBlur  = 18;
  // Body (mantle)
  ctx.fillStyle = '#6600aa';
  ctx.strokeStyle = '#cc00ff';
  ctx.lineWidth = 1.5 / ZOOM;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.75, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Eyes
  ctx.fillStyle = '#ff88ff';
  ctx.shadowBlur = 6;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + s * r * 0.3, y - r * 0.15, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#110011';
    ctx.beginPath();
    ctx.arc(x + s * r * 0.3, y - r * 0.15, r * 0.10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff88ff';
  }
  // Tentacles (8, wavy)
  ctx.strokeStyle = '#9900cc';
  ctx.lineWidth   = 1.2 / ZOOM;
  ctx.shadowBlur  = 4;
  for (let i = 0; i < 8; i++) {
    const baseA  = (i / 8) * Math.PI + Math.PI * 0.1;
    const wave   = Math.sin(t + i * 0.8) * r * 0.3;
    const bx     = x + Math.cos(baseA) * r * 0.55;
    const by     = y + r * 0.6 + Math.sin(baseA) * r * 0.2;
    const ex     = bx + Math.cos(baseA + 0.4) * r * 0.9 + wave * 0.4;
    const ey     = by + r * 0.9 + wave;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + wave * 0.5, by + r * 0.5, ex, ey);
    ctx.stroke();
  }
  ctx.restore();
}

// Exhaust trail — fixed-world-position puffs spawned at stern, each plays explosion 0→9
// Matches the Snap! "Explosionssalve" recipe: each clone spawns at a position and
// independently cycles through 10 frames at t/10 seconds per frame, then dies.
const EX_FRAMES_T    = 10;
const EX_SZ_T        = 40;
const TRAIL_DURATION = 0.9;    // total seconds one puff lives
const TRAIL_SPAWN_MS = 140;    // ms between new puff pairs (halved → twice as dense)
const TRAIL_SZ       = 34;     // smaller — two rows side by side
const TRAIL_ROW_OFFSET = 10;   // perpendicular offset from ship axis (world units)
const TRAIL_DRIFT    = 28;     // how far each puff drifts outward over its lifetime

// Per-ship hue palette — distinct colors cycling across the visible spectrum
const TRAIL_HUES = [160, 30, 280, 55, 200, 0, 320, 90, 240, 130];
// shipId → assigned hue index
const _shipHueIndex = new Map();
let _nextHueIndex = 0;
function getShipTrailHue(shipId) {
  if (!_shipHueIndex.has(shipId)) {
    _shipHueIndex.set(shipId, _nextHueIndex % TRAIL_HUES.length);
    _nextHueIndex++;
  }
  return TRAIL_HUES[_shipHueIndex.get(shipId)];
}

// shipId → { lastSpawn: ms, puffs: [{x,y,dx,dy,born,hue}] }
// dx/dy is the outward drift direction (unit vector × TRAIL_DRIFT)
const _trailState = new Map();

function tickShipTrail(ship, nowMs) {
  const speed = Math.hypot(ship.vx ?? 0, ship.vy ?? 0);
  if (!_trailState.has(ship.id)) _trailState.set(ship.id, { lastSpawn: 0, puffs: [] });
  const st = _trailState.get(ship.id);

  st.puffs = st.puffs.filter(p => (nowMs - p.born) < TRAIL_DURATION * 1000);

  const spawnInterval = (ship.burnerTimer ?? 0) > 0 ? TRAIL_SPAWN_MS / 4 : TRAIL_SPAWN_MS;
  if (speed > 8 && (ship.sails ?? 0) > 0 && nowMs - st.lastSpawn >= spawnInterval) {
    const sternDist = (ship.height ?? 30) * 0.65;
    const sx  = ship.x - Math.cos(ship.angle) * sternDist;
    const sy  = ship.y - Math.sin(ship.angle) * sternDist;
    // Perpendicular (port/starboard) unit vector
    const px  = -Math.sin(ship.angle);
    const py  =  Math.cos(ship.angle);
    const hue = getShipTrailHue(ship.id);
    // Spawn two puffs — one each side, drifting outward
    for (const side of [-1, 1]) {
      st.puffs.push({
        x:    sx + px * TRAIL_ROW_OFFSET * side,
        y:    sy + py * TRAIL_ROW_OFFSET * side,
        dx:   px * TRAIL_DRIFT * side,   // drift direction × magnitude
        dy:   py * TRAIL_DRIFT * side,
        born: nowMs,
        hue,
      });
    }
    st.lastSpawn = nowMs;
  }
}

function drawShipThrust(ctx, ship, exImg, nowMs) {
  if (!exImg.complete || !exImg.naturalWidth) return;
  const st = _trailState.get(ship.id);
  if (!st || st.puffs.length === 0) return;

  ctx.save();
  for (const puff of st.puffs) {
    const elapsed = (nowMs - puff.born) / 1000;
    const frac    = elapsed / TRAIL_DURATION;
    const frame   = Math.min(Math.floor(frac * EX_FRAMES_T), EX_FRAMES_T - 1);
    const alpha   = 0.75 * (1 - frac);
    // Apply outward drift based on elapsed time
    const wx = puff.x + puff.dx * frac;
    const wy = puff.y + puff.dy * frac;

    // Draw puff to offscreen canvas, then tint turquoise via source-atop
    const tc = _getTintCanvas(TRAIL_SZ, TRAIL_SZ);
    const tc2 = tc.getContext('2d');
    tc2.clearRect(0, 0, TRAIL_SZ, TRAIL_SZ);
    tc2.drawImage(exImg, frame * EX_SZ_T, 0, EX_SZ_T, EX_SZ_T, 0, 0, TRAIL_SZ, TRAIL_SZ);
    tc2.globalCompositeOperation = 'source-atop';
    tc2.fillStyle = `hsla(${puff.hue}, 100%, 65%, 0.72)`;
    tc2.fillRect(0, 0, TRAIL_SZ, TRAIL_SZ);
    tc2.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = alpha;
    ctx.drawImage(tc, 0, 0, TRAIL_SZ, TRAIL_SZ, wx - TRAIL_SZ / 2, wy - TRAIL_SZ / 2, TRAIL_SZ, TRAIL_SZ);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

const POWERUP_ICONS = { flame: '🔥', scatter: '💥', harpune: '🔱', kraken: '🐙' };
const POWERUP_COLORS = { flame: '#ff7700', scatter: '#ffcc00', harpune: '#cc00ff', kraken: '#aa00ff' };

function drawPowerup(ctx, pu, time) {
  const color = POWERUP_COLORS[pu.kind] || '#ffffff';
  const bob   = Math.sin(time * 2.2 + pu.id * 1.7) * 4;
  const pulse = Math.sin(time * 3) * 0.5 + 0.5;
  const x = pu.x;
  const y = pu.y + bob;

  ctx.save();
  // Outer ring
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2 / ZOOM;
  ctx.globalAlpha = 0.5 + pulse * 0.5;
  ctx.beginPath();
  ctx.arc(x, y, 24 + pulse * 5, 0, Math.PI * 2);
  ctx.stroke();
  // Inner glow disc
  ctx.globalAlpha = 0.25 + pulse * 0.15;
  ctx.fillStyle   = color;
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Icon
  ctx.font      = `${Math.round(22 / ZOOM)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(POWERUP_ICONS[pu.kind] || '?', x, y);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// ── Game class ───────────────────────────────────────────────────────────────

class PirataGame {
  constructor() {
    this.canvas     = document.getElementById('game');
    this.ctx        = this.canvas.getContext('2d');
    CANVAS_W = window.innerWidth;
    CANVAS_H = window.innerHeight;
    this.canvas.width  = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.net        = new Net(msg => this._onMsg(msg));
    this.input      = new Input();
    this._exImg      = new Image(); this._exImg.src = 'sprites/explosion.png';
    this._tornadoImg = new Image(); this._tornadoImg.src = 'sprites/tornado.png';
    this._krakenImg  = new Image(); this._krakenImg.src = 'sprites/kraken_missile.png';
    this._bananaImg  = new Image(); this._bananaImg.src = 'sprites/banana.png';
    this._krakenFrame = 0;
    this.interp     = new Interpolator();
    this.water      = new Water();
    this.radar      = new Radar();
    this.sound      = new Sound();
    this.myShipId   = null;
    this.flagImages = new Map(); // shipId -> HTMLImageElement
    this.arrrAudio  = new Map(); // shipId -> base64 data URL
    this.lastState  = null;
    this.explosions = [];
    this._splashes    = [];   // water splash particles
    this._prevBallIds = new Set();
    this._ballPositions = new Map(); // id -> {x,y}
    this._shopOpen     = false;
    this._bountyNotif  = null;
    this._itvl         = null;
    this._raf       = null;
    this._lastTime  = null;
  }

  join(name) { this.net.connect(name); }

  _toggleShop() { this._shopOpen = !this._shopOpen; }

  _buyUpgrade(kind) {
    this.net.sendUpgrade(kind);
  }

  _onMsg(msg) {
    if (msg.t === 'flag') {
      const img = new Image();
      img.src = msg.data;
      this.flagImages.set(msg.shipId, img);
      return;
    }
    if (msg.t === 'arrr') {
      this.arrrAudio.set(msg.shipId, msg.data);
      return;
    }
    if (msg.t === 'joined') {
      this.myShipId = msg.shipId;
      const flagToSend = window._flagDataUrl || window._skullFlagDataUrl;
      if (flagToSend) this.net.sendFlag(flagToSend);
      if (window._arrrDataUrl) this.net.sendArrr(window._arrrDataUrl);
      this._start();
    } else if (msg.t === 'state') {
      this.interp.push(msg);
      this.lastState = msg;
    } else if (msg.t === 'event') {
      if (msg.e === 'explosion') {
        this.explosions.push({ x: msg.x, y: msg.y, maxR: msg.radius, age: 0 });
        this.sound.explosion();
      }
      if (msg.e === 'hit') {
        this.sound.hit();
        if (msg.x != null) this.explosions.push({ x: msg.x, y: msg.y, maxR: 20, age: 0 });
      }
      // Cannon sound only when our ship actually fires (server confirmed)
      if (msg.e === 'broadside' && msg.shipId === this.myShipId) this.sound.cannon();
      if (msg.e === 'survivalCoin' && msg.shipId === this.myShipId) {
        this._bountyNotif = { text: '🍌 +1 Überlebens-Coin', age: 0 };
      }
      if (msg.e === 'sink') {
        if (msg.killerShipId === this.myShipId) {
          this.sound.enemySunk();
          this._bountyNotif = { text: `+${msg.bounty ?? 1} Punkte`, age: 0 };
        }
        // Play the killer's Arrr for everyone to hear
        if (msg.killerShipId != null) {
          const arrrUrl = this.arrrAudio.get(msg.killerShipId);
          if (arrrUrl) { const a = new Audio(arrrUrl); a.volume = 0.9; a.play().catch(() => {}); }
        }
        if (msg.shipId === this.myShipId) {
          const me = this.lastState && this.lastState.ships.find(s => s.id === this.myShipId);
          if (msg.tornado) {
            const u = window.speechSynthesis;
            const ut = new SpeechSynthesisUtterance('Gotcha Bishhhhhhh');
            ut.pitch = 1.5; ut.rate = 0.85;
            const voices = u.getVoices();
            const female = voices.find(v => /female|woman|girl|zira|samantha|victoria|karen|moira|fiona|tessa/i.test(v.name));
            if (female) ut.voice = female;
            u.speak(ut);
          }
          showDeath(me ? me.kills : 0);
        }
      }
    } else if (msg.t === 'disconnect') {
      this._stop();
      showSplash();
    }
  }

  _start() {
    clearInterval(this._itvl);
    cancelAnimationFrame(this._raf);
    this._shopKeyHandler = e => {
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); this._toggleShop(); }
      if (this._shopOpen) {
        const UPGRADE_KINDS = ['cannon', 'hull', 'speed', 'range', 'zoom'];
        const WEAPON_KINDS  = ['flame', 'scatter', 'harpune', 'kraken'];
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < UPGRADE_KINDS.length) { e.preventDefault(); this._buyUpgrade(UPGRADE_KINDS[idx]); }
        // Q/W/E/R for weapons
        const wKeys = { q:0, w:1, e:2, r:3 };
        const wi = wKeys[e.key.toLowerCase()];
        if (wi !== undefined) { e.preventDefault(); this.net.sendBuyWeapon(WEAPON_KINDS[wi]); }
        // M for mines
        if (e.key === 'm' || e.key === 'M') { e.preventDefault(); this.net.sendBuyMines(); }
      }
    };
    window.addEventListener('keydown', this._shopKeyHandler);
    this._resizeHandler = () => {
      CANVAS_W = window.innerWidth;
      CANVAS_H = window.innerHeight;
      this.canvas.width  = CANVAS_W;
      this.canvas.height = CANVAS_H;
    };
    window.addEventListener('resize', this._resizeHandler);
    this._itvl = setInterval(() => {
      const snap = this.input.snapshot();
      if (snap.dropBarrel) this.sound.mineDrop();
      this.net.sendInput(snap);
    }, 1000 / INPUT_HZ);
    this._lastTime = performance.now();
    const loop = ts => {
      const dt = Math.min((ts - this._lastTime) / 1000, 0.1);
      this._lastTime = ts;
      this.water.update(dt);
      this._draw(dt, ts);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stop() {
    clearInterval(this._itvl);
    cancelAnimationFrame(this._raf);
    if (this._shopKeyHandler) window.removeEventListener('keydown', this._shopKeyHandler);
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
  }

  _drawShop(ctx, me) {
    const UPGRADES = [
      { kind: 'cannon', label: 'KANONEN',        desc: '+4 Kanonen',        costs: [1,2,3], icon: '💣' },
      { kind: 'hull',   label: 'RUMPF',          desc: '+30% Hülle',        costs: [1,2,3], icon: '🛡' },
      { kind: 'speed',  label: 'GESCHWINDIGKEIT',desc: '+20% Geschw.',      costs: [1,2,4], icon: '💨' },
      { kind: 'range',  label: 'REICHWEITE',     desc: '+60 Reichweite',    costs: [1,1,2], icon: '🎯' },
      { kind: 'zoom',   label: 'ZOOM',           desc: 'Weiterer Blick',    costs: [1,2,3], icon: '🔭' },
    ];
    const WEAPONS = [
      { kind: 'flame',   label: 'FLAMMENWERFER', cost: 2, icon: '🔥', ammo: 30 },
      { kind: 'scatter', label: 'STREUKANONE',   cost: 2, icon: '💥', ammo: 6  },
      { kind: 'harpune', label: 'HARPUNE',       cost: 3, icon: '🔱', ammo: 3  },
      { kind: 'kraken',  label: 'KRAKEN-MISSILE',cost: 4, icon: '🐙', ammo: 2  },
      { kind: 'banana',  label: 'BANANENBOMBE',  cost: 3, icon: '🍌', ammo: 3  },
    ];
    const pts    = me.upgradePoints ?? 0;
    const tiers  = me.upgradeTiers  ?? {};
    const W = CANVAS_W, H = CANVAS_H;
    const bw = 380, bh = 36 + UPGRADES.length * 68 + 16 + WEAPONS.length * 44 + 54 + 30;
    const bx = (W - bw) / 2, by = (H - bh) / 2;

    // Backdrop
    ctx.fillStyle = 'rgba(8,2,16,0.92)';
    ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
    ctx.strokeStyle = '#cc00ff';
    ctx.shadowColor = '#cc00ff';
    ctx.shadowBlur  = 20;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
    ctx.shadowBlur = 0;

    // Title
    ctx.fillStyle   = '#cc00ff';
    ctx.shadowColor = '#cc00ff';
    ctx.shadowBlur  = 12;
    ctx.font        = 'bold 15px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText(`⚓ UPGRADE-SHOP  — ${pts} Punkte  [B]=Schliessen`, W / 2, by + 22);
    ctx.shadowBlur = 0;

    UPGRADES.forEach((up, i) => {
      const tier    = tiers[up.kind] ?? 0;
      const maxed   = tier >= 3;
      const cost    = maxed ? null : up.costs[tier];
      const canBuy  = !maxed && pts >= cost;
      const uy      = by + 36 + i * 68;

      // Row bg
      ctx.fillStyle = canBuy ? 'rgba(255,204,0,0.06)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(bx, uy, bw, 62);

      // Key badge
      ctx.fillStyle   = canBuy ? '#ffcc00' : '#444';
      ctx.shadowColor = canBuy ? '#ffcc00' : 'transparent';
      ctx.shadowBlur  = canBuy ? 10 : 0;
      ctx.font        = 'bold 16px monospace';
      ctx.textAlign   = 'center';
      ctx.fillText(`[${i + 1}]`, bx + 24, uy + 34);
      ctx.shadowBlur = 0;

      // Icon + label
      ctx.fillStyle = maxed ? '#555' : canBuy ? '#fff' : '#888';
      ctx.font      = '14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${up.icon} ${up.label}`, bx + 48, uy + 20);

      // Desc + cost
      ctx.fillStyle = '#666';
      ctx.font      = '11px monospace';
      ctx.fillText(up.desc, bx + 48, uy + 36);

      const costStr = maxed ? 'MAXIMAL' : `${cost} Punkte`;
      ctx.fillStyle = maxed ? '#336' : canBuy ? '#ffcc00' : '#553';
      ctx.fillText(costStr, bx + 48, uy + 52);

      // Tier pips
      for (let t = 0; t < 3; t++) {
        ctx.fillStyle = t < tier ? '#cc00ff' : '#222';
        ctx.shadowColor = t < tier ? '#cc00ff' : 'transparent';
        ctx.shadowBlur  = t < tier ? 8 : 0;
        ctx.fillRect(bx + bw - 80 + t * 26, uy + 22, 20, 20);
        ctx.shadowBlur = 0;
      }
    });

    // ── Weapon shop section ───────────────────────────────────────
    const weapY0 = by + 36 + UPGRADES.length * 68 + 8;
    ctx.fillStyle   = 'rgba(255,204,0,0.08)';
    ctx.fillRect(bx, weapY0, bw, 14);
    ctx.fillStyle   = '#ffcc00';
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur  = 8;
    ctx.font        = 'bold 11px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('── WAFFEN  [Q/W/E/R] ──', W / 2, weapY0 + 10);
    ctx.shadowBlur  = 0;

    WEAPONS.forEach((wp, i) => {
      const canBuy = pts >= wp.cost;
      const active = me.weapon === wp.kind;
      const wy     = weapY0 + 16 + i * 44;
      ctx.fillStyle = active ? 'rgba(255,200,0,0.12)' : canBuy ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0)';
      ctx.fillRect(bx, wy, bw, 40);
      // Key badge
      const wKey = ['Q','W','E','R'][i];
      ctx.fillStyle   = canBuy ? '#ffcc00' : '#444';
      ctx.shadowColor = canBuy ? '#ffcc00' : 'transparent';
      ctx.shadowBlur  = canBuy ? 8 : 0;
      ctx.font        = 'bold 12px monospace';
      ctx.textAlign   = 'center';
      ctx.fillText(wKey, bx + 18, wy + 24);
      ctx.shadowBlur  = 0;
      // Icon + label
      ctx.font      = '18px serif';
      ctx.textAlign = 'left';
      ctx.fillText(wp.icon, bx + 34, wy + 26);
      ctx.font      = 'bold 12px monospace';
      ctx.fillStyle = active ? '#ffcc00' : canBuy ? '#fff' : '#555';
      ctx.fillText(`${wp.label}${active ? '  ▶AKTIV' : ''}`, bx + 58, wy + 16);
      ctx.font      = '10px monospace';
      ctx.fillStyle = '#888';
      ctx.fillText(`Munition: ${wp.ammo}  Kosten: ${wp.cost} Pkt`, bx + 58, wy + 30);
      // Cost badge
      ctx.font      = 'bold 11px monospace';
      ctx.fillStyle = canBuy ? '#ffcc00' : '#555';
      ctx.textAlign = 'right';
      ctx.fillText(`${wp.cost}P`, bx + bw - 8, wy + 24);
    });

    // ── Mine shop row ─────────────────────────────────────────────
    const mineY  = weapY0 + 16 + WEAPONS.length * 44 + 8;
    const mineAmmo = me.mineAmmo ?? 0;
    const canBuyMines = pts >= 1;
    ctx.fillStyle = canBuyMines ? 'rgba(255,170,0,0.07)' : 'rgba(0,0,0,0)';
    ctx.fillRect(bx, mineY, bw, 40);
    ctx.fillStyle   = '#ff7700';
    ctx.shadowColor = '#ff7700';
    ctx.shadowBlur  = 8;
    ctx.font        = 'bold 11px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('M', bx + 18, mineY + 24);
    ctx.shadowBlur  = 0;
    ctx.font        = '18px serif';
    ctx.textAlign   = 'left';
    ctx.fillText('💣', bx + 34, mineY + 26);
    ctx.font        = 'bold 12px monospace';
    ctx.fillStyle   = canBuyMines ? '#fff' : '#555';
    ctx.fillText(`MINEN  +3  (aktuell: ${mineAmmo})`, bx + 58, mineY + 16);
    ctx.font        = '10px monospace';
    ctx.fillStyle   = '#888';
    ctx.fillText('Kosten: 1 Pkt', bx + 58, mineY + 30);
    ctx.font        = 'bold 11px monospace';
    ctx.fillStyle   = canBuyMines ? '#ffcc00' : '#555';
    ctx.textAlign   = 'right';
    ctx.fillText('1P', bx + bw - 8, mineY + 24);

    ctx.textAlign = 'left';
  }

  _draw(dt = 1 / 60, nowMs = performance.now()) {
    const ctx   = this.ctx;
    const state = this.interp.get(performance.now()) || this.lastState;
    if (!state) return;

    const me       = state.ships.find(s => s.id === this.myShipId);
    const zoomTier = me?.upgradeTiers?.zoom ?? 0;
    const effZoom  = ZOOM * (1 - zoomTier * 0.12);   // each tier = 12% further out
    const camX = me ? me.x - CANVAS_W / (2 * effZoom) : WORLD / 2 - CANVAS_W / (2 * effZoom);
    const camY = me ? me.y - CANVAS_H / (2 * effZoom) : WORLD / 2 - CANVAS_H / (2 * effZoom);

    // ── Water (screen-space, before world transform) ──────────────
    this.water.draw(ctx, camX, camY, effZoom);

    // ── Soft dark fade at the world boundary ─────────────────────
    {
      const wcx = (WORLD / 2 - camX) * effZoom;
      const wcy = (WORLD / 2 - camY) * effZoom;
      const wsr = WORLD / 2 * effZoom;
      ctx.save();
      const grad = ctx.createRadialGradient(wcx, wcy, wsr * 0.88, wcx, wcy, wsr * 1.08);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    // ── World transform ───────────────────────────────────────────
    ctx.save();
    ctx.scale(effZoom, effZoom);
    ctx.translate(-camX, -camY);

    const IZ = 1 / effZoom;   // inverse zoom — keeps world-space sizes readable

    // Tornado vortex at world center
    drawTornado(ctx, this._tornadoImg, this.water.time);

    // Mines
    for (const b of state.barrels) drawMine(ctx, b, this.water.time);

    // Bananenbomben
    for (const bn of (state.bananas || [])) drawBanana(ctx, bn, this._bananaImg, this.water.time);

    // Wakes (behind ships)
    for (const ship of state.ships) drawWake(ctx, ship);

    // Detect balls that vanished this frame (water landing) → splash
    const currentBallIds = new Set(state.balls.map(b => b.id));
    for (const [id, pos] of this._ballPositions) {
      if (!currentBallIds.has(id)) {
        const nearHit = this.explosions.some(ex => {
          const dx = ex.x - pos.x, dy = ex.y - pos.y;
          return ex.age < 0.1 && Math.hypot(dx, dy) < 30;
        });
        if (!nearHit) this._splashes.push({ x: pos.x, y: pos.y, age: 0 });
      }
    }
    this._prevBallIds = currentBallIds;
    this._ballPositions.clear();
    for (const b of state.balls) {
      if (b.type === 'normal') this._ballPositions.set(b.id, { x: b.x, y: b.y });
    }

    // Cannonballs (below ships)
    for (const b of state.balls) {
      const r = b.radius || 5;
      if (b.type === 'squid') {
        drawSquid(ctx, b.x, b.y, r, this.water.time);
      } else if (b.type === 'flame') {
        ctx.save();
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur  = 14;
        ctx.fillStyle = `hsl(${20 + Math.random() * 30},100%,60%)`;
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (b.type === 'kraken') {
        const KSZ = 48, KFRAMES = 8;
        const kframe = Math.floor(this.water.time * 12) % KFRAMES;
        const kSize  = r * 3.2;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate((b.angle ?? 0));
        ctx.shadowColor = '#aa00ff';
        ctx.shadowBlur  = 16;
        if (this._krakenImg.complete && this._krakenImg.naturalWidth) {
          ctx.drawImage(this._krakenImg, kframe * KSZ, 0, KSZ, KSZ,
            -kSize / 2, -kSize / 2, kSize, kSize);
        } else {
          ctx.fillStyle = '#8800ff';
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      } else if (b.type === 'harpune') {
        ctx.save();
        ctx.shadowColor = '#cc00ff';
        ctx.shadowBlur  = 18;
        ctx.fillStyle   = '#1a0030';
        ctx.strokeStyle = '#cc00ff';
        ctx.lineWidth   = 2 / ZOOM;
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      } else {
        // Fiery orange cannonball
        const pulse = 0.7 + 0.3 * Math.sin(this.water.time * 11 + b.id * 1.7);
        ctx.save();
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur  = 22 * pulse;
        ctx.globalAlpha = 0.35;
        ctx.fillStyle   = '#ff4400';
        ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
        grad.addColorStop(0,   '#fff8e0');
        grad.addColorStop(0.3, '#ffcc00');
        grad.addColorStop(0.7, '#ff6600');
        grad.addColorStop(1,   '#cc2200');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    // Ships
    for (const ship of state.ships) {
      tickShipTrail(ship, nowMs);
      drawShipThrust(ctx, ship, this._exImg, nowMs);
      drawShip(ctx, ship, ship.id === this.myShipId, this.water.time);
      drawShipFlag(ctx, ship, this.flagImages.get(ship.id), this.water.time);
      drawShipFire(ctx, ship, this.water.time);

      // HP bar
      const bw = ship.width;
      const bx = ship.x - bw / 2;
      const by = ship.y - ship.height / 2 - 10 * IZ;
      const bh = 5 * IZ;
      ctx.fillStyle = '#1a252f'; ctx.fillRect(bx, by, bw, bh);
      const hpFrac = ship.hp / ship.maxHp;
      ctx.fillStyle = hpFrac > 0.5 ? '#2ecc71' : hpFrac > 0.25 ? '#f39c12' : '#e74c3c';
      ctx.fillRect(bx, by, bw * hpFrac, bh);

      // Name + kills with neon glow
      const nameGlow = ship.id === this.myShipId ? '#ffcc00' : ship.isBot ? '#cc00ff' : '#ff0088';
      ctx.fillStyle    = 'rgba(255,255,255,0.95)';
      ctx.shadowColor  = nameGlow;
      ctx.shadowBlur   = 8 * IZ;
      ctx.font         = `${Math.round(11 * IZ)}px 'Pirata One', cursive`;
      ctx.textAlign    = 'center';
      ctx.fillText(`${ship.name} [${ship.kills}]`, ship.x, ship.y - ship.height / 2 - 14 * IZ);
      ctx.shadowBlur   = 0;
    }

    // Powerup pickups
    for (const pu of (state.powerups || [])) {
      drawPowerup(ctx, pu, this.water.time);
    }

    // Water splashes
    const SPLASH_DUR = 0.55;
    this._splashes = this._splashes.filter(s => s.age < SPLASH_DUR);
    for (const s of this._splashes) {
      s.age += dt;
      const p = s.age / SPLASH_DUR;
      const easeOut = 1 - p * p;
      const maxR = 18 * IZ;
      const numDrops = 7;
      ctx.save();
      ctx.globalAlpha = easeOut * 0.75;
      for (let i = 0; i < numDrops; i++) {
        const a  = (i / numDrops) * Math.PI * 2;
        const r  = maxR * p;
        const dx = Math.cos(a) * r;
        const dy = Math.sin(a) * r * 0.55;
        const dr = Math.max(0.1, (2.5 + 1.5 * Math.sin(i)) * IZ * easeOut);
        ctx.fillStyle = `rgba(140,200,255,${(easeOut * 0.8).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(s.x + dx, s.y + dy, dr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = easeOut * 0.35;
      ctx.strokeStyle = 'rgba(180,220,255,0.9)';
      ctx.lineWidth   = 1.5 * IZ;
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.1, maxR * p * 0.7), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Explosions
    const EX_FRAMES = 10, EX_DURATION = 0.65, EX_SZ = 40;
    this.explosions = this.explosions.filter(ex => ex.age < EX_DURATION);
    for (const ex of this.explosions) {
      ex.age += dt;
      const frame   = Math.min(EX_FRAMES - 1, Math.floor(ex.age / EX_DURATION * EX_FRAMES));
      const drawSz  = ex.maxR * 2.4 * IZ;
      if (this._exImg.complete && this._exImg.naturalWidth) {
        ctx.drawImage(this._exImg, frame * EX_SZ, 0, EX_SZ, EX_SZ,
          ex.x - drawSz / 2, ex.y - drawSz / 2, drawSz, drawSz);
      } else {
        const alpha  = Math.max(0, 1 - ex.age / EX_DURATION);
        const radius = ex.maxR * (ex.age / EX_DURATION);
        ctx.strokeStyle = `rgba(255,140,0,${alpha.toFixed(2)})`;
        ctx.lineWidth   = 6 * IZ;
        ctx.beginPath(); ctx.arc(ex.x, ex.y, radius, 0, Math.PI * 2); ctx.stroke();
      }
    }

    ctx.restore(); // world transform

    // ── Edge vignette — water fades out at canvas border ─────────
    {
      const vx = CANVAS_W / 2, vy = CANVAS_H / 2;
      const vr = Math.max(CANVAS_W, CANVAS_H) * 0.55;  // covers corners
      ctx.save();
      const grad = ctx.createRadialGradient(vx, vy, vr * 0.55, vx, vy, vr);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,4,16,0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    // ── HUD (screen-space) ────────────────────────────────────────
    if (me) {
      const hasWeapon  = me.weapon && me.weaponAmmo > 0;
      const pts        = me.upgradePoints ?? 0;
      const burnerOn   = (me.burnerTimer ?? 0) > 0;
      const burnerReady= (me.burnerCooldown ?? 0) <= 0 && !burnerOn;
      const hudH       = hasWeapon ? 152 : 130;
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      ctx.fillRect(6, 6, 220, hudH);
      ctx.fillStyle = 'white'; ctx.font = '13px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`Kanonen: ${me.portCannons + me.starboardCannons}`, 12, 23);
      ctx.fillText(`Kills:   ${me.kills}`, 12, 41);
      const sails = me.sails ?? 3;
      const sailBar = '■'.repeat(sails) + '□'.repeat(3 - sails);
      ctx.fillStyle = sails > 0 ? '#a8d8ff' : '#888';
      ctx.fillText(`Segel: ${sailBar}  [↑/↓]`, 12, 59);
      ctx.fillStyle = pts > 0 ? '#ffcc00' : '#6a4020';
      ctx.shadowColor = pts > 0 ? '#ffcc00' : 'transparent';
      ctx.shadowBlur  = pts > 0 ? 8 : 0;
      ctx.fillText(`Punkte: ${pts}  [B]=Shop`, 12, 77);
      ctx.shadowBlur = 0;
      const mineAmmo = me.mineAmmo ?? 0;
      ctx.fillStyle   = mineAmmo > 0 ? '#ffaa00' : '#664400';
      ctx.shadowColor = mineAmmo > 0 ? '#ff8800' : 'transparent';
      ctx.shadowBlur  = mineAmmo > 0 ? 6 : 0;
      ctx.fillText(`Minen: ${'💣'.repeat(Math.min(mineAmmo, 6))}${mineAmmo > 6 ? ` +${mineAmmo - 6}` : ''}${mineAmmo === 0 ? '— (kaufen im Shop)' : ''}  [Space]`, 12, 95);
      ctx.shadowBlur = 0;
      // Burner row
      if (burnerOn) {
        ctx.fillStyle = '#ff6600';
        ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 10;
        const pct = Math.ceil((me.burnerTimer / 3) * 8);
        ctx.fillText(`🔥 BURNER  ${'█'.repeat(pct)}${'░'.repeat(8 - pct)}`, 12, 113);
        ctx.shadowBlur = 0;
      } else if (burnerReady) {
        ctx.fillStyle = '#ff9900';
        ctx.fillText(`[W] BURNER  BEREIT`, 12, 113);
      } else {
        const cd = Math.ceil(me.burnerCooldown ?? 0);
        ctx.fillStyle = '#554433';
        ctx.fillText(`[W] BURNER  ${cd}s`, 12, 113);
      }
      if (hasWeapon) {
        const WEAPON_ICON = { flame: '🔥', scatter: '💥', harpune: '🔱', kraken: '🐙', banana: '🍌' };
        const WEAPON_NAME = { flame: 'FLAMME', scatter: 'STREUUU', harpune: 'HARPUN', kraken: 'KRAKEN', banana: 'BANANE' };
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(`[Q] ${WEAPON_ICON[me.weapon] || '?'} ${WEAPON_NAME[me.weapon] || me.weapon}  ×${me.weaponAmmo}`, 12, 131);
      }
      const hpFrac = me.hp / me.maxHp;
      ctx.fillStyle = '#1a252f'; ctx.fillRect(10, CANVAS_H - 20, 150, 10);
      ctx.fillStyle = hpFrac > 0.5 ? '#2ecc71' : hpFrac > 0.25 ? '#f39c12' : '#e74c3c';
      ctx.fillRect(10, CANVAS_H - 20, 150 * hpFrac, 10);
      ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
      ctx.strokeRect(10, CANVAS_H - 20, 150, 10);

      // ── Shop overlay ──────────────────────────────────────────────
      if (this._shopOpen) this._drawShop(ctx, me);
    }

    // Bounty toast
    if (this._bountyNotif) {
      this._bountyNotif.age += dt;
      const age   = this._bountyNotif.age;
      const alpha = Math.max(0, 1 - age / 2.2);
      const rise  = age * 30;
      if (alpha > 0) {
        ctx.save();
        ctx.globalAlpha  = alpha;
        ctx.fillStyle    = '#ffcc00';
        ctx.shadowColor  = '#ffcc00';
        ctx.shadowBlur   = 16;
        ctx.font         = 'bold 22px monospace';
        ctx.textAlign    = 'center';
        ctx.fillText(this._bountyNotif.text, CANVAS_W / 2, CANVAS_H / 2 - 60 - rise);
        ctx.globalAlpha  = 1;
        ctx.restore();
      } else {
        this._bountyNotif = null;
      }
    }

    // Crown on leader ship (most kills)
    let leaderKills = 0;
    let leaderId    = null;
    for (const s of state.ships) {
      if (s.kills > leaderKills) { leaderKills = s.kills; leaderId = s.id; }
    }
    if (leaderId && leaderKills > 0) {
      const leader = state.ships.find(s => s.id === leaderId);
      if (leader) {
        const sx = (leader.x - camX) * ZOOM;
        const sy = (leader.y - camY) * ZOOM - leader.height * ZOOM / 2 - 26;
        ctx.save();
        ctx.font      = '18px serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur  = 14;
        ctx.fillText('👑', sx, sy);
        ctx.restore();
      }
    }

    // Radar
    this.radar.draw(ctx, state, this.myShipId, CANVAS_W, CANVAS_H);
  }
}

function showSplash() {
  document.getElementById('splash').style.display = 'flex';
  document.getElementById('game').style.display   = 'none';
}

function showDeath(kills) {
  document.getElementById('death-kills').textContent = kills;
  document.getElementById('death-screen').classList.add('visible');
}

let G = null;

document.getElementById('join-btn').addEventListener('click', () => {
  const name = document.getElementById('username').value.trim() || 'Pirat';
  document.getElementById('splash').classList.remove('visible');
  document.getElementById('game').style.display = 'block';
  G = new PirataGame();
  G.join(name);
  G.sound.startMusic();
});

document.getElementById('respawn-btn').addEventListener('click', () => {
  const name = document.getElementById('username').value.trim() || 'Pirat';
  document.getElementById('death-screen').classList.remove('visible');
  document.getElementById('game').style.display = 'block';
  if (G) G.net.respawn(name);
});
