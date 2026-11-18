// audio.js — procedural WebAudio sound: engine hum, siren, gunfire,
// pickups and UI blips, all synthesised in code. No audio files.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenT = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.ctx.destination);
      this.sirenOsc.start();
    } catch {
      this.ctx = null;
    }
  }

  blip(freq, dur, type, vol, slide) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol || 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch { /* silent */ }
  }

  shoot() { this.blip(190, 0.14, 'square', 0.12, -140); }
  enemyShoot() { this.blip(150, 0.12, 'square', 0.05, -100); }
  pickup() { this.blip(880, 0.16, 'sine', 0.1, 320); }
  cash() { this.blip(660, 0.12, 'sine', 0.09, 220); this.blip(990, 0.2, 'sine', 0.07, 0); }
  ui() { this.blip(520, 0.07, 'sine', 0.06, 60); }
  crash() { this.blip(90, 0.25, 'sawtooth', 0.14, -50); }
  hurt() { this.blip(220, 0.15, 'sawtooth', 0.08, -90); }

  update(dt, driving, speedRatio, sirenNear) {
    if (!this.ctx) return;
    this.sirenT += dt;
    try {
      const eg = driving ? 0.028 + speedRatio * 0.03 : 0;
      this.engineGain.gain.setTargetAtTime(eg, this.ctx.currentTime, 0.1);
      if (driving) this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 95, this.ctx.currentTime, 0.1);
      const sg = sirenNear ? 0.016 : 0;
      this.sirenGain.gain.setTargetAtTime(sg, this.ctx.currentTime, 0.2);
      if (sirenNear) this.sirenOsc.frequency.setTargetAtTime(700 + Math.sin(this.sirenT * 5.2) * 180, this.ctx.currentTime, 0.05);
    } catch { /* silent */ }
  }
}
