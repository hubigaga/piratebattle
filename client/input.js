// client/input.js
export class Input {
  constructor() {
    this.state = { up: false, down: false, left: false, right: false,
                   firePort: false, fireStarboard: false, dropBarrel: false };
    window.addEventListener('keydown', e => this._onKey(e, true));
    window.addEventListener('keyup',   e => this._onKey(e, false));
  }

  _onKey(e, down) {
    // Space: edge-triggered — one barrel per press regardless of hold duration
    if (e.key === ' ') {
      e.preventDefault();
      if (down && !e.repeat) this.state.dropBarrel = true;
      return;
    }
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      a: 'firePort', A: 'firePort', d: 'fireStarboard', D: 'fireStarboard',
    };
    const k = map[e.key];
    if (k) { e.preventDefault(); this.state[k] = down; }
  }

  // Returns snapshot and clears one-shot dropBarrel flag
  snapshot() {
    const snap = { ...this.state };
    this.state.dropBarrel = false;
    return snap;
  }
}
