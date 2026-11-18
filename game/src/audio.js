// v3: unchanged — the foot-police and garage round reused the existing audio beds (siren, chime, crash, thud).
// audio.js — all sound is procedural WebAudio: an engine hum that follows
// speed, a two-tone siren, horns, gunshots, thuds, chimes and a soft ambient
// pad. Nothing is loaded; the context wakes on the first user gesture.

export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null;
    this.padTimer = 0;
  }
  wake() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // engine: a low sawtooth through a muffler, gain/freq driven per frame
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    const muffle = this.ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 420;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(muffle); muffle.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
    // siren: square wave whose pitch the police system wobbles
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }
  setEngine(speedRatio, inCar) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(inCar ? 0.05 + speedRatio * 0.075 : 0, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speedRatio * 165, t, 0.06);
  }
  setSiren(level, t) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.045, this.ctx.currentTime, 0.15);
    this.sirenOsc.frequency.setTargetAtTime(650 + Math.sin(t * 5.2) * 190, this.ctx.currentTime, 0.03);
  }
  blip(freq, dur, type = 'sine', vol = 0.16, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  noise(dur, vol, freq = 1200) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }
  gunshot() { this.noise(0.16, 0.5, 2600); this.blip(120, 0.09, 'square', 0.2); }
  dryFire() { this.blip(1400, 0.04, 'square', 0.07); }
  reload() { this.blip(500, 0.05, 'square', 0.1); this.blip(760, 0.05, 'square', 0.1, 0.14); }
  thud() { this.noise(0.09, 0.3, 300); }
  crash() { this.noise(0.3, 0.42, 700); this.blip(70, 0.25, 'sine', 0.25); }
  horn() { this.blip(370, 0.32, 'square', 0.11); this.blip(466, 0.32, 'square', 0.09); }
  chime() { this.blip(880, 0.14, 'sine', 0.16); this.blip(1318, 0.22, 'sine', 0.16, 0.1); }
  cash() { this.blip(990, 0.09, 'square', 0.1); this.blip(1320, 0.16, 'square', 0.1, 0.07); }
  jingle() { [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.22, 'triangle', 0.16, i * 0.11)); }
  fail() { [330, 262, 196].forEach((f, i) => this.blip(f, 0.24, 'triangle', 0.14, i * 0.13)); }
  // a lazy warm pad chord every few seconds keeps the bay feeling alive
  updateAmbient(dt) {
    if (!this.ctx) return;
    this.padTimer -= dt;
    if (this.padTimer <= 0) {
      this.padTimer = 7.5;
      const base = [220, 261.6, 329.6][(Math.random() * 3) | 0];
      this.blip(base, 3.4, 'sine', 0.028);
      this.blip(base * 1.5, 3.4, 'sine', 0.02, 0.05);
    }
  }
}
