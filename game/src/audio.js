// Procedural sound for Solmar Bay. Every effect is built from WebAudio
// oscillators and noise buffers at run time, and the music is a small loop of
// warm chords and a bass line. No audio files, no network, nothing to load.
export function createAudio() {
  const audio = {
    ctx: null, master: null, musicGain: null, muted: false,
    sirenNodes: null, engineNodes: null, musicTimer: null, musicStep: 0,

    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.16;
        this.musicGain.connect(this.master);
        this.startMusic();
      } catch { this.ctx = null; }
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
      return this.muted;
    },

    tone(freq, dur, type, vol, slideTo) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      gain.gain.setValueAtTime(vol || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain); gain.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.02);
    },

    noise(dur, vol, filterFreq) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter); filter.connect(gain); gain.connect(this.master);
      src.start(t);
    },

    shoot() { this.noise(0.12, 0.5, 2800); this.tone(180, 0.08, 'square', 0.18, 60); },
    punch() { this.noise(0.08, 0.3, 500); },
    reload() { this.tone(500, 0.06, 'square', 0.1); this.tone(700, 0.06, 'square', 0.1); },
    pickup() { this.tone(660, 0.12, 'sine', 0.25); this.tone(990, 0.18, 'sine', 0.25); },
    crash() { this.noise(0.25, 0.5, 700); this.tone(90, 0.2, 'sawtooth', 0.2, 40); },
    engineStart() { this.tone(70, 0.4, 'sawtooth', 0.15, 140); },
    doorSlam() { this.noise(0.08, 0.35, 400); },
    sirenBlip() { this.tone(900, 0.18, 'sine', 0.12, 1300); },
    busted() { this.tone(440, 0.3, 'sawtooth', 0.2, 220); this.tone(330, 0.5, 'sawtooth', 0.2, 165); },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => this.tone(f, 0.22, 'triangle', 0.25), i * 110);
      });
    },
    missionFail() { this.tone(392, 0.25, 'sawtooth', 0.18, 300); this.tone(311, 0.4, 'sawtooth', 0.18, 200); },
    levelUp() { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'sine', 0.22), i * 90)); },

    // A two-tone police siren that follows the player while wanted.
    startSiren() {
      if (!this.ctx || this.sirenNodes) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 950;
      lfo.type = 'square'; lfo.frequency.value = 0.8;
      lfoGain.gain.value = 280;
      gain.gain.value = 0.05;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      osc.connect(gain); gain.connect(this.master);
      osc.start(); lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    },
    stopSiren() {
      if (!this.sirenNodes) return;
      try { this.sirenNodes.osc.stop(); this.sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      this.sirenNodes = null;
    },

    // A low engine hum whose pitch follows the player's speed.
    setEngine(speedNorm) {
      if (!this.ctx) return;
      if (!this.engineNodes) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.value = 60;
        gain.gain.value = 0;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 500;
        osc.connect(filter); filter.connect(gain); gain.connect(this.master);
        osc.start();
        this.engineNodes = { osc, gain };
      }
      const n = this.engineNodes;
      n.osc.frequency.setTargetAtTime(55 + speedNorm * 160, this.ctx.currentTime, 0.08);
      n.gain.gain.setTargetAtTime(this.muted ? 0 : speedNorm * 0.06, this.ctx.currentTime, 0.1);
    },

    // Sun-soaked loop: a lazy chord pad with a walking bass line.
    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      const chords = [
        [130.81, 164.81, 196.0, 246.94],
        [98.0, 123.47, 146.83, 196.0],
        [110.0, 138.59, 164.81, 220.0],
        [87.31, 110.0, 130.81, 164.81],
      ];
      const bass = [65.41, 49.0, 55.0, 43.65];
      this.musicTimer = setInterval(() => {
        if (this.muted || !this.ctx) return;
        const step = this.musicStep++ % 4;
        const t = this.ctx.currentTime;
        chords[step].forEach((f) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle'; osc.frequency.value = f;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(0.05, t + 0.4);
          gain.gain.linearRampToValueAtTime(0.0001, t + 3.4);
          osc.connect(gain); gain.connect(this.musicGain);
          osc.start(t); osc.stop(t + 3.5);
        });
        const b = this.ctx.createOscillator();
        const bg = this.ctx.createGain();
        b.type = 'sine'; b.frequency.value = bass[step];
        bg.gain.setValueAtTime(0.12, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
        b.connect(bg); bg.connect(this.musicGain);
        b.start(t); b.stop(t + 3.3);
      }, 1800);
    },
  };
  return audio;
}
