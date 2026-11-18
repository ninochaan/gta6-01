// hud.js — every piece of screen furniture: health, cash, wanted stars,
// weapon readout, objective line, prompts, dialogue banners, mission titles,
// the bust meter, damage vignette and the canvas minimap with live blips.
// v4: the minimap gains a steady teal blip for Tienda Brisa, and the weapon
// line (set from main.js) reports Rico's vest percentage while he wears one.

import { ROAD_LINES, BOULEVARD_Z } from './city.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.health = $('healthbar'); this.cash = $('cash'); this.pkgs = $('packages');
    this.weapon = $('weapon'); this.wanted = $('wanted'); this.objective = $('objective');
    this.prompt = $('prompt'); this.bannerEl = $('banner'); this.timer = $('timer');
    this.titleEl = $('missiontitle'); this.speedo = $('speedo');
    this.vignette = $('vignette'); this.bustwrap = $('bustwrap'); this.bustfill = $('bustfill');
    this.map = $('minimap').getContext('2d');
    this.bannerQueue = []; this.bannerT = 0; this.titleT = 0;
    this.lastStars = -1; this.hurtT = 0;
    this.wanted.innerHTML = [0, 1, 2, 3, 4].map(() => '<span>★</span>').join('');
    this.starEls = [...this.wanted.children];
  }
  setHealth(v) { this.health.style.width = Math.max(0, Math.min(100, v)) + '%'; }
  setCash(v) { this.cash.textContent = '$' + Math.floor(v).toLocaleString('en-US'); }
  setPackages(n, total) { this.pkgs.textContent = `◆ Packages ${n} / ${total}`; }
  setWeapon(text) { this.weapon.textContent = text; }
  setWanted(stars) {
    const lit = Math.ceil(stars - 0.001);
    if (lit === this.lastStars) return;
    this.lastStars = lit;
    this.starEls.forEach((el, i) => el.className = i < lit ? 'lit' : '');
  }
  setObjective(text) { if (this.objective.textContent !== text) this.objective.textContent = text; }
  setPrompt(text) {
    if (!text) { this.prompt.style.display = 'none'; return; }
    this.prompt.style.display = 'block';
    if (this.prompt.textContent !== text) this.prompt.textContent = text;
  }
  setTimer(text) {
    if (!text) { this.timer.style.display = 'none'; return; }
    this.timer.style.display = 'block';
    if (this.timer.textContent !== text) this.timer.textContent = text;
  }
  setSpeed(kmh, inCar) {
    this.speedo.style.display = inCar ? 'block' : 'none';
    if (inCar) this.speedo.innerHTML = `${Math.abs(Math.round(kmh))}<small>KM/H</small>`;
  }
  setBust(ratio) {
    this.bustwrap.style.display = ratio > 0.02 ? 'block' : 'none';
    this.bustfill.style.width = Math.round(ratio * 100) + '%';
  }
  hurt() { this.hurtT = 0.55; }
  banner(who, line, dur = 3.4) { this.bannerQueue.push({ who, line, dur }); }
  missionTitle(big, sub) {
    this.titleEl.querySelector('.big').textContent = big;
    this.titleEl.querySelector('.sub').textContent = sub;
    this.titleEl.style.display = 'block';
    this.titleT = 3.2;
  }
  update(dt) {
    if (this.hurtT > 0) { this.hurtT -= dt; this.vignette.style.opacity = Math.min(0.9, this.hurtT).toFixed(2); }
    else this.vignette.style.opacity = '0';
    if (this.titleT > 0) { this.titleT -= dt; if (this.titleT <= 0) this.titleEl.style.display = 'none'; }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerEl.style.display = 'none'; }
    else if (this.bannerQueue.length) {
      const b = this.bannerQueue.shift();
      this.bannerEl.querySelector('.who').textContent = b.who;
      this.bannerEl.querySelector('.line').textContent = b.line;
      this.bannerEl.style.display = 'block';
      this.bannerT = b.dur;
    }
  }
  // North-up whole-city minimap: roads, the bay, and a blip per live system.
  drawMinimap(G) {
    const c = this.map, S = 184, scale = S / 580;
    const px = (x) => (x + 290) * scale, pz = (z) => (z + 290) * scale;
    c.fillStyle = '#cdbb9c'; c.fillRect(0, 0, S, S);
    c.fillStyle = '#2e7fa8'; c.fillRect(0, pz(240), S, S - pz(240));
    c.fillStyle = '#e8cf9e'; c.fillRect(0, pz(204), S, pz(240) - pz(204));
    c.strokeStyle = '#55555e'; c.lineWidth = 3;
    for (const l of ROAD_LINES) {
      c.beginPath(); c.moveTo(px(l), 0); c.lineTo(px(l), pz(BOULEVARD_Z)); c.stroke();
      if (l < 200) { c.beginPath(); c.moveTo(0, pz(l)); c.lineTo(S, pz(l)); c.stroke(); }
    }
    c.beginPath(); c.moveTo(0, pz(BOULEVARD_Z)); c.lineTo(S, pz(BOULEVARD_Z)); c.stroke();
    const blip = (x, z, color, r) => { c.fillStyle = color; c.beginPath(); c.arc(px(x), pz(z), r, 0, 7); c.fill(); };
    for (const p of G.packageBlips) blip(p.x, p.z, 'rgba(255,255,255,0.75)', 1.6);
    if (G.blips.shop) blip(G.blips.shop.x, G.blips.shop.z, '#2affd8', 2.8);
    if (G.blips.taxi) blip(G.blips.taxi.x, G.blips.taxi.z, '#51e07a', 3.4);
    if (G.blips.race) blip(G.blips.race.x, G.blips.race.z, '#c77dff', 3.4);
    for (const cop of G.blips.police) blip(cop.x, cop.z, (performance.now() % 600 < 300) ? '#ff4030' : '#3a7bff', 2.6);
    if (G.blips.objective) {
      const pulse = 3.6 + Math.sin(performance.now() * 0.006) * 1.1;
      blip(G.blips.objective.x, G.blips.objective.z, '#ffd23a', pulse);
    }
    // the player: a white wedge pointing where the camera faces
    const p = G.playerPos;
    c.save();
    c.translate(px(p.x), pz(p.z));
    c.rotate(-(G.cameraYaw || 0));
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -5.5); c.lineTo(3.6, 4.4); c.lineTo(-3.6, 4.4); c.closePath(); c.fill();
    c.restore();
  }
}
