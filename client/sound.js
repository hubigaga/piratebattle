// client/sound.js

const MUSIC_BPM     = 128;   // murgaparty_mastered.mp3 tempo
const SIXTEENTH_SEC = 60 / MUSIC_BPM / 4;

export class Sound {
  constructor() {
    this._ctx          = null;
    this._buffers      = {};
    this._musicStart   = null;   // AudioContext time when music beat 0 was
    this._music        = null;   // HTMLAudioElement
    this._loadAll();
  }

  _ac() {
    if (!this._ctx)
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  async _load(name, url) {
    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const ac  = this._ac();
      this._buffers[name] = await ac.decodeAudioData(arr);
    } catch (e) {
      console.warn(`Sound load failed: ${name}`, e);
    }
  }

  _loadAll() {
    this._load('vineboom',  '/sounds/vine-boom.mp3');
    this._load('explosion', '/sounds/explosion-meme.mp3');
    this._load('heavebo',   '/sounds/heave-ho.mp3');
  }

  startMusic() {
    if (this._music) return;
    const ac   = this._ac();
    const mus  = new Audio('/sounds/music.mp3');
    mus.loop   = true;
    mus.volume = 0.45;
    mus.play().then(() => {
      // Record AudioContext time aligned to music start so we can quantize
      this._musicStart = ac.currentTime;
    }).catch(() => {});
    this._music = mus;
  }

  // Returns the AudioContext time of the next 16th-note grid point at or after `atTime`
  _nextSixteenth(atTime) {
    if (this._musicStart === null) return atTime;
    const elapsed  = atTime - this._musicStart;
    const position = elapsed % SIXTEENTH_SEC;
    const wait     = position < 0.001 ? 0 : SIXTEENTH_SEC - position;
    // Cap quantize lookahead at 1 beat so it doesn't feel too late
    return atTime + Math.min(wait, SIXTEENTH_SEC * 3);
  }

  _play(name, volume = 1.0, pitchSemitones = 0, quantize = false) {
    const buf = this._buffers[name];
    if (!buf) return;
    const ac  = this._ac();
    const src = ac.createBufferSource();
    src.buffer             = buf;
    src.playbackRate.value = Math.pow(2, pitchSemitones / 12);
    const gain      = ac.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(ac.destination);
    const when = quantize ? this._nextSixteenth(ac.currentTime) : ac.currentTime;
    src.start(when);
  }

  _noise(duration, filterFreq, filterQ, gainVal, quantize = false) {
    const ac  = this._ac();
    const len = Math.ceil(ac.sampleRate * duration);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * duration * 0.6));
    const src  = ac.createBufferSource();
    src.buffer = buf;
    const filt = ac.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = filterFreq; filt.Q.value = filterQ;
    const gain = ac.createGain(); gain.gain.value = gainVal;
    src.connect(filt); filt.connect(gain); gain.connect(ac.destination);
    const when = quantize ? this._nextSixteenth(ac.currentTime) : ac.currentTime;
    src.start(when);
  }

  _tone(freq, duration, type, gainVal) {
    const ac   = this._ac();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainVal, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + duration);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  cannon() {
    // Quantize sound to nearest 8th note (half beat), shot itself fires immediately
    const EIGHTH = SIXTEENTH_SEC * 2;
    const ac     = this._ac();
    const when   = this._musicStart !== null
      ? (() => {
          const elapsed = ac.currentTime - this._musicStart;
          const pos     = elapsed % EIGHTH;
          const wait    = pos < 0.001 ? 0 : EIGHTH - pos;
          return ac.currentTime + Math.min(wait, EIGHTH * 3);
        })()
      : ac.currentTime;

    const play = (name, vol, pitch) => {
      const buf = this._buffers[name]; if (!buf) return;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.pow(2, pitch / 12);
      const g = ac.createGain(); g.gain.value = vol;
      src.connect(g); g.connect(ac.destination);
      src.start(when);
    };
    play('vineboom', 0.7, -2);
    this._noise(0.22, 700, 0.8, 0.20);   // smoke hiss plays immediately (feels tactile)
  }

  explosion() {
    // Quantized to nearest 16th note for musical feel
    this._play('explosion', 0.85, 0, true);
    this._noise(0.55, 250, 0.6, 0.35, true);
  }

  enemySunk() {
    this._play('heavebo', 0.9);
  }

  mineDrop() {
    this._noise(0.18, 2400, 0.7, 0.12);
    this._tone(220, 0.12, 'sine', 0.08);
  }

  hit() {
    // Quantized hits feel rhythmic in combat
    this._play('vineboom', 0.25, -8, true);
    this._noise(0.10, 1400, 1.0, 0.20, true);
  }
}
