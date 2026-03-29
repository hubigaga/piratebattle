// client/game.js
import { Net }          from './net.js';
import { Input }        from './input.js';
import { Interpolator } from './interpolation.js';

const CANVAS_W = 800;
const CANVAS_H = 600;
const WORLD    = 4000;
const INPUT_HZ = 60;

class PirataGame {
  constructor() {
    this.canvas    = document.getElementById('game');
    this.ctx       = this.canvas.getContext('2d');
    this.canvas.width  = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.net       = new Net(msg => this._onMsg(msg));
    this.input     = new Input();
    this.interp    = new Interpolator();
    this.myShipId  = null;
    this.lastState = null;
    this.explosions = [];
    this._itvl     = null;
    this._raf      = null;
  }

  join(name, shipType) { this.net.connect(name, shipType); }

  _onMsg(msg) {
    if (msg.t === 'joined') {
      this.myShipId = msg.shipId;
      this._start();
    } else if (msg.t === 'state') {
      this.interp.push(msg);
      this.lastState = msg;
    } else if (msg.t === 'event') {
      if (msg.e === 'explosion')
        this.explosions.push({ x: msg.x, y: msg.y, r: 0, maxR: msg.radius, age: 0 });
      if (msg.e === 'sink' && msg.shipId === this.myShipId) {
        const me = this.lastState && this.lastState.ships.find(s => s.id === this.myShipId);
        showDeath(me ? me.kills : 0);
      }
    } else if (msg.t === 'disconnect') {
      this._stop();
      showSplash();
    }
  }

  _start() {
    clearInterval(this._itvl);
    cancelAnimationFrame(this._raf);
    this._itvl = setInterval(() => this.net.sendInput(this.input.snapshot()), 1000 / INPUT_HZ);
    const loop = () => { this._draw(); this._raf = requestAnimationFrame(loop); };
    this._raf  = requestAnimationFrame(loop);
  }

  _stop() {
    clearInterval(this._itvl);
    cancelAnimationFrame(this._raf);
  }

  _draw() {
    const ctx   = this.ctx;
    const state = this.interp.get(performance.now()) || this.lastState;
    if (!state) return;

    const me   = state.ships.find(s => s.id === this.myShipId);
    const camX = me ? me.x - CANVAS_W / 2 : WORLD / 2 - CANVAS_W / 2;
    const camY = me ? me.y - CANVAS_H / 2 : WORLD / 2 - CANVAS_H / 2;

    // Ocean background
    ctx.fillStyle = '#1a5276';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.save();
    ctx.translate(-camX, -camY);

    // World border
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, WORLD, WORLD);

    // Barrels
    for (const b of state.barrels) {
      ctx.fillStyle = '#6e2c00';
      ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a04000'; ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Ships
    for (const ship of state.ships) {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle);
      // Hull
      ctx.fillStyle = ship.id === this.myShipId ? '#f39c12' : '#c0392b';
      ctx.fillRect(-ship.width / 2, -ship.height / 2, ship.width, ship.height);
      // Bow indicator (small triangle at front)
      ctx.fillStyle = ship.id === this.myShipId ? '#e67e22' : '#922b21';
      ctx.beginPath();
      ctx.moveTo(ship.width / 2,          0);
      ctx.lineTo(ship.width / 2 - 6, -ship.height / 3);
      ctx.lineTo(ship.width / 2 - 6,  ship.height / 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // HP bar
      const bw = ship.width;
      const bx = ship.x - bw / 2;
      const by = ship.y - ship.height / 2 - 9;
      ctx.fillStyle = '#2c3e50'; ctx.fillRect(bx, by, bw, 4);
      const hpFrac = ship.hp / ship.maxHp;
      ctx.fillStyle = hpFrac > 0.5 ? '#2ecc71' : hpFrac > 0.25 ? '#f39c12' : '#e74c3c';
      ctx.fillRect(bx, by, bw * hpFrac, 4);

      // Name + kills
      ctx.fillStyle = 'white';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${ship.name} [${ship.kills}]`, ship.x, ship.y - ship.height / 2 - 13);
    }

    // Cannonballs
    ctx.fillStyle = '#aaa';
    for (const b of state.balls) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
    }

    // Explosions
    const now60 = 1 / 60;
    this.explosions = this.explosions.filter(ex => ex.age < 0.6);
    for (const ex of this.explosions) {
      ex.age += now60;
      const alpha  = Math.max(0, 1 - ex.age / 0.6);
      const radius = ex.maxR * (ex.age / 0.6);
      ctx.strokeStyle = `rgba(255,140,0,${alpha.toFixed(2)})`;
      ctx.lineWidth   = 5;
      ctx.beginPath(); ctx.arc(ex.x, ex.y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,220,0,${(alpha * 0.5).toFixed(2)})`;
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.arc(ex.x, ex.y, radius * 0.6, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.restore();

    // HUD
    if (me) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(6, 6, 165, 54);
      ctx.fillStyle = 'white'; ctx.font = '13px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`Kanonen: ${me.portCannons + me.starboardCannons}`, 12, 23);
      ctx.fillText(`Kills:   ${me.kills}`, 12, 41);
      // HP bar
      const hpFrac = me.hp / me.maxHp;
      ctx.fillStyle = '#2c3e50'; ctx.fillRect(10, CANVAS_H - 20, 150, 10);
      ctx.fillStyle = hpFrac > 0.5 ? '#2ecc71' : hpFrac > 0.25 ? '#f39c12' : '#e74c3c';
      ctx.fillRect(10, CANVAS_H - 20, 150 * hpFrac, 10);
      ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1;
      ctx.strokeRect(10, CANVAS_H - 20, 150, 10);
    }
  }
}

function showSplash() {
  document.getElementById('splash').style.display = 'flex';
  document.getElementById('game').style.display   = 'none';
}

function showDeath(kills) {
  document.getElementById('death-kills').textContent = kills;
  document.getElementById('death-screen').style.display = 'flex';
}

let G = null;

document.getElementById('join-btn').addEventListener('click', () => {
  const name = document.getElementById('username').value.trim() || 'Pirat';
  const type = document.getElementById('ship-select').value;
  document.getElementById('splash').style.display = 'none';
  document.getElementById('game').style.display   = 'block';
  G = new PirataGame();
  G.join(name, type);
});

document.getElementById('respawn-btn').addEventListener('click', () => {
  const name = document.getElementById('username').value.trim() || 'Pirat';
  const type = document.getElementById('respawn-ship').value;
  document.getElementById('death-screen').style.display = 'none';
  document.getElementById('game').style.display         = 'block';
  if (G) G.net.respawn(name, type);
});
