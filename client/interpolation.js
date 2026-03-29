// client/interpolation.js
export class Interpolator {
  constructor() {
    this._prev     = null;
    this._next     = null;
    this._prevTime = 0;
    this._nextTime = 0;
  }

  push(state) {
    this._prev     = this._next;
    this._prevTime = this._nextTime;
    this._next     = state;
    this._nextTime = performance.now();
  }

  // Returns smoothed state for the given timestamp
  get(now) {
    if (!this._prev || !this._next) return this._next;
    const span = this._nextTime - this._prevTime;
    if (span <= 0) return this._next;
    const t = Math.min((now - this._nextTime) / span + 1, 1);
    return this._lerp(this._prev, this._next, t);
  }

  _lerp(a, b, t) {
    return {
      ...b,
      ships: b.ships.map(bs => {
        const as = a.ships.find(s => s.id === bs.id);
        if (!as) return bs;
        let da = bs.angle - as.angle;
        while (da >  Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        return { ...bs, x: as.x + (bs.x - as.x) * t, y: as.y + (bs.y - as.y) * t, angle: as.angle + da * t };
      }),
    };
  }
}
