// client/radar.js — minimap radar with compass

const RADAR_R     = 58;    // screen radius (px)
const RADAR_RANGE = 850;   // world units visible on radar edge
const WORLD       = 4000;

export class Radar {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} state   — interpolated game state
   * @param {number} myId    — own ship id
   * @param {number} W       — canvas width
   * @param {number} H       — canvas height
   */
  draw(ctx, state, myId, W, H) {
    const me = state.ships.find(s => s.id === myId);
    if (!me) return;

    const cx = W - RADAR_R - 14;
    const cy = H - RADAR_R - 14;

    ctx.save();

    // ── background ──────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, RADAR_R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(5, 18, 32, 0.78)';
    ctx.fill();

    // outer ring
    ctx.strokeStyle = 'rgba(80, 170, 230, 0.55)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // ── range rings ─────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(80, 170, 230, 0.18)';
    ctx.lineWidth   = 0.8;
    for (const f of [0.33, 0.66]) {
      ctx.beginPath();
      ctx.arc(cx, cy, RADAR_R * f, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── crosshairs ──────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(80, 170, 230, 0.18)';
    ctx.lineWidth   = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - RADAR_R, cy); ctx.lineTo(cx + RADAR_R, cy);
    ctx.moveTo(cx, cy - RADAR_R); ctx.lineTo(cx, cy + RADAR_R);
    ctx.stroke();

    // ── clip to inner circle so dots don't overflow ──────────────
    ctx.beginPath();
    ctx.arc(cx, cy, RADAR_R - 2, 0, Math.PI * 2);
    ctx.clip();

    // ── other ships ─────────────────────────────────────────────
    for (const ship of state.ships) {
      if (ship.id === myId) continue;

      // torus-aware delta
      let dx = ship.x - me.x;
      let dy = ship.y - me.y;
      if (dx >  WORLD / 2) dx -= WORLD;
      if (dx < -WORLD / 2) dx += WORLD;
      if (dy >  WORLD / 2) dy -= WORLD;
      if (dy < -WORLD / 2) dy += WORLD;

      if (Math.hypot(dx, dy) > RADAR_RANGE) continue;

      const sx = cx + (dx / RADAR_RANGE) * RADAR_R;
      const sy = cy + (dy / RADAR_RANGE) * RADAR_R;

      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = ship.isBot ? '#f39c12' : '#e74c3c';
      ctx.fill();
    }

    // ── powerups ────────────────────────────────────────────────
    const PU_COLORS = { flame: '#ff7700', scatter: '#ffcc00', harpune: '#cc00ff', kraken: '#aa00ff' };
    for (const pu of (state.powerups || [])) {
      let dx = pu.x - me.x, dy = pu.y - me.y;
      if (dx >  WORLD / 2) dx -= WORLD;
      if (dx < -WORLD / 2) dx += WORLD;
      if (dy >  WORLD / 2) dy -= WORLD;
      if (dy < -WORLD / 2) dy += WORLD;
      const sx = cx + (dx / RADAR_RANGE) * RADAR_R;
      const sy = cy + (dy / RADAR_RANGE) * RADAR_R;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = PU_COLORS[pu.kind] || '#ffffff';
      ctx.fill();
    }

    // ── player dot ───────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#2ecc71';
    ctx.fill();

    // ── heading line ─────────────────────────────────────────────
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(me.angle) * 14, cy + Math.sin(me.angle) * 14);
    ctx.stroke();

    ctx.restore(); // restore before drawing compass labels (outside clip)

    // ── compass labels ───────────────────────────────────────────
    // World convention: angle 0 = +X (east), +Y = south (canvas).
    // N = top, S = bottom, E = right, W = left of radar circle.
    ctx.fillStyle    = 'rgba(160, 215, 255, 0.85)';
    ctx.font         = 'bold 9px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx,              cy - RADAR_R - 7);
    ctx.fillText('S', cx,              cy + RADAR_R + 7);
    ctx.fillText('E', cx + RADAR_R + 7, cy);
    ctx.fillText('W', cx - RADAR_R - 7, cy);
  }
}
