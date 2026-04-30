// client/input.js
export class Input {
  constructor() {
    this.state = { left: false, right: false,
                   firePort: false, fireStarboard: false, dropBarrel: false,
                   fireSpecial: false, sailUp: false, sailDown: false,
                   fireBurner: false };
    window.addEventListener('keydown', e => this._onKey(e, true));
    window.addEventListener('keyup',   e => this._onKey(e, false));
  }

  _onKey(e, down) {
    if (e.key === ' ') {
      e.preventDefault();
      if (down && !e.repeat) this.state.dropBarrel = true;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (down && !e.repeat) this.state.sailUp = true;
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (down && !e.repeat) this.state.sailDown = true;
      return;
    }
    const map = {
      ArrowLeft: 'left', ArrowRight: 'right',
      a: 'firePort', A: 'firePort', d: 'fireStarboard', D: 'fireStarboard',
      q: 'fireSpecial', Q: 'fireSpecial',
      w: 'fireBurner', W: 'fireBurner',
    };
    const k = map[e.key];
    if (k) { e.preventDefault(); this.state[k] = down; }
  }

  snapshot() {
    const snap = { ...this.state };
    this.state.dropBarrel = false;
    this.state.sailUp     = false;
    this.state.sailDown   = false;
    return snap;
  }
}
