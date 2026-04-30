// client/water.js — animated ocean background with caustic interference

// Low primes used as wave frequencies and speeds
const CAUST_PRIMES = [2, 3, 5, 7, 11, 13];
// Wave directions spread evenly + slight rotation per prime
const CAUST_ANGLES = CAUST_PRIMES.map((_, i) => (i / CAUST_PRIMES.length) * Math.PI * 2);

const LAYERS = [
  { scrollX:  9, freq: 0.018, amp: 5.0, spacing: 34, alpha: 0.10, lw: 1.5 },
  { scrollX: -6, freq: 0.026, amp: 2.8, spacing: 22, alpha: 0.08, lw: 1.0 },
  { scrollX: 14, freq: 0.011, amp: 7.0, spacing: 52, alpha: 0.07, lw: 2.0 },
];

const SPARKLE_GRID = 90;
const CAUST_SCALE  = 8;   // render caustics at 1/8 resolution then upscale

export class Water {
  constructor() {
    this.time      = 0;
    this._offscreen = null;
    this._offCtx    = null;
  }

  update(dt) { this.time += dt; }

  _ensureOffscreen(W, H) {
    const sw = Math.ceil(W / CAUST_SCALE);
    const sh = Math.ceil(H / CAUST_SCALE);
    if (!this._offscreen || this._offscreen.width !== sw || this._offscreen.height !== sh) {
      this._offscreen        = document.createElement('canvas');
      this._offscreen.width  = sw;
      this._offscreen.height = sh;
      this._offCtx           = this._offscreen.getContext('2d');
    }
    return { sw, sh };
  }

  _drawCaustics(ctx, camX, camY, zoom, t) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const { sw, sh } = this._ensureOffscreen(W, H);

    const img  = this._offCtx.createImageData(sw, sh);
    const data = img.data;

    for (let py = 0; py < sh; py++) {
      for (let px = 0; px < sw; px++) {
        // World-space coordinates for this pixel
        const wx = camX + (px * CAUST_SCALE) / zoom;
        const wy = camY + (py * CAUST_SCALE) / zoom;

        // Sum interference of all prime-frequency waves in their directions
        let sum = 0;
        for (let i = 0; i < CAUST_PRIMES.length; i++) {
          const p   = CAUST_PRIMES[i];
          const ang = CAUST_ANGLES[i];
          const proj = wx * Math.cos(ang) + wy * Math.sin(ang);
          sum += Math.sin(proj * 0.012 * p + t * p * 0.18);
        }

        // Normalize and sharpen into bright caustic spots
        const norm   = (sum / CAUST_PRIMES.length + 1) / 2;  // 0..1
        const bright = Math.pow(norm, 2.8);                    // sharpen peaks

        const idx        = (py * sw + px) * 4;
        // Neon cyan-purple caustic colour
        data[idx]     = Math.round(40  + bright * 180);   // R
        data[idx + 1] = Math.round(120 + bright * 135);   // G
        data[idx + 2] = Math.round(200 + bright * 55);    // B
        data[idx + 3] = Math.round(bright * 110);          // A
      }
    }

    this._offCtx.putImageData(img, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled  = true;
    ctx.imageSmoothingQuality  = 'high';
    ctx.globalAlpha            = 0.72;
    ctx.drawImage(this._offscreen, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  draw(ctx, camX, camY, zoom = 1) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const t = this.time;

    // --- base gradient (deep ocean) ---
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0d1f3a');
    grad.addColorStop(1, '#060e1c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // --- caustic interference layer ---
    this._drawCaustics(ctx, camX, camY, zoom, t);

    // --- wave lines ---
    for (const L of LAYERS) {
      const rawOff = camY * zoom;
      const yOff   = ((rawOff % L.spacing) + L.spacing) % L.spacing;

      ctx.strokeStyle = `rgba(80,200,255,${L.alpha})`;
      ctx.lineWidth   = L.lw;

      for (let y = -yOff; y < H + L.spacing; y += L.spacing) {
        ctx.beginPath();
        const phaseX = t * L.scrollX * 0.012;
        for (let x = 0; x <= W + 4; x += 5) {
          const wx   = camX + x / zoom;
          const wave = Math.sin(wx * L.freq + phaseX) * L.amp
                     + Math.sin(wx * L.freq * 2.1 + phaseX * 1.6) * L.amp * 0.28;
          x === 0 ? ctx.moveTo(x, y + wave) : ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
      }
    }

    // --- sparkle highlights ---
    const wW  = W / zoom;
    const wH  = H / zoom;
    const gx0 = Math.floor(camX / SPARKLE_GRID) - 1;
    const gy0 = Math.floor(camY / SPARKLE_GRID) - 1;
    const gx1 = Math.ceil((camX + wW) / SPARKLE_GRID) + 1;
    const gy1 = Math.ceil((camY + wH) / SPARKLE_GRID) + 1;

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const h    = ((gx * 2654435761) ^ (gy * 1234567891)) >>> 0;
        const offX = (h         & 0xFF) / 255 * SPARKLE_GRID;
        const offY = ((h >>  8) & 0xFF) / 255 * SPARKLE_GRID;
        const phs  = ((h >> 16) & 0xFF) / 255 * Math.PI * 2;
        const brightness = Math.sin(t * 2.2 + phs) * 0.5 + 0.5;
        if (brightness < 0.35) continue;
        const sx = (gx * SPARKLE_GRID + offX - camX) * zoom;
        const sy = (gy * SPARKLE_GRID + offY - camY) * zoom;
        if (sx < -3 || sx > W + 3 || sy < -3 || sy > H + 3) continue;
        ctx.globalAlpha = brightness * 0.5;
        ctx.fillStyle   = '#80e8ff';
        ctx.beginPath();
        ctx.arc(sx, sy, 1.8 * zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
