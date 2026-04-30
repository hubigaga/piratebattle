// client/net.js
export class Net {
  constructor(onMessage) {
    this._onMessage = onMessage;
    this._ws        = null;
    this.sessionId  = localStorage.getItem('pirata_session') || null;
    this.shipId     = null;
  }

  connect(name) {
    const proto  = location.protocol === 'https:' ? 'wss' : 'ws';
    this._ws     = new WebSocket(`${proto}://${location.host}`);
    this._ws.onopen    = () => {
      this._ws.send(JSON.stringify({ t: 'join', sessionId: this.sessionId, name }));
    };
    this._ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'joined') {
        this.sessionId = msg.sessionId;
        this.shipId    = msg.shipId;
        localStorage.setItem('pirata_session', msg.sessionId);
      }
      this._onMessage(msg);
    };
    this._ws.onclose   = () => this._onMessage({ t: 'disconnect' });
  }

  sendInput(input) {
    if (this._ws && this._ws.readyState === 1)
      this._ws.send(JSON.stringify({ t: 'input', ...input }));
  }

  sendUpgrade(kind) {
    if (this._ws && this._ws.readyState === 1)
      this._ws.send(JSON.stringify({ t: 'upgrade', kind }));
  }

  sendBuyWeapon(kind) {
    if (this._ws && this._ws.readyState === 1)
      this._ws.send(JSON.stringify({ t: 'buyWeapon', kind }));
  }

  sendBuyMines() {
    if (this._ws && this._ws.readyState === 1)
      this._ws.send(JSON.stringify({ t: 'buyMines' }));
  }

  sendFlag(dataUrl) {
    if (this._ws && this._ws.readyState === 1)
      this._ws.send(JSON.stringify({ t: 'flag', data: dataUrl }));
  }

  sendArrr(dataUrl) {
    if (this._ws && this._ws.readyState === 1)
      this._ws.send(JSON.stringify({ t: 'arrr', data: dataUrl }));
  }

  respawn(name) {
    if (this._ws && this._ws.readyState === 1)
      this._ws.send(JSON.stringify({ t: 'respawn', name }));
  }
}
