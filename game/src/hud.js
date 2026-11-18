// hud.js — the heads-up display: cash, stars, health and armour bars,
// weapon readout, objective banner, interaction prompt, bust meter, and
// the live minimap with blips for the player, police, the objective,
// activities and interiors.

export class Hud {
  constructor() {
    this.el = {
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      ammo: document.getElementById('ammo'),
      health: document.getElementById('healthfill'),
      armour: document.getElementById('armourfill'),
      banner: document.getElementById('banner'),
      prompt: document.getElementById('prompt'),
      bustWrap: document.getElementById('bustwrap'),
      bustFill: document.getElementById('bustfill'),
      toast: document.getElementById('toast'),
      map: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.map.getContext('2d');
    this.bannerT = 0;
    this.toastT = 0;
    this.cashValue = 0;
  }

  setCash(n) {
    this.cashValue = n;
    if (this.el.cash) this.el.cash.textContent = '$' + Math.floor(n);
  }

  banner(text) {
    if (this.el.banner) {
      this.el.banner.textContent = text;
      this.el.banner.style.display = text ? 'block' : 'none';
    }
    this.bannerT = 6;
  }

  toast(text) {
    if (this.el.toast) this.el.toast.textContent = text;
    this.toastT = 3;
  }

  setPrompt(text) {
    if (this.el.prompt) {
      this.el.prompt.textContent = text || '';
      this.el.prompt.style.display = text ? 'block' : 'none';
    }
  }

  update(dt, H, objective) {
    this.bannerT -= dt;
    this.toastT -= dt;
    if (this.toastT <= 0 && this.el.toast) this.el.toast.textContent = '';
    this.setCash(H.cash);
    if (this.el.stars) {
      const lvl = H.wanted.level;
      this.el.stars.textContent = lvl > 0 ? '\u2605'.repeat(lvl) + '\u2606'.repeat(5 - lvl) : '';
    }
    if (this.el.health) this.el.health.style.width = Math.max(0, H.player.health) + '%';
    if (this.el.armour) this.el.armour.style.width = Math.max(0, Math.min(100, H.player.armour)) + '%';
    if (this.el.ammo) {
      this.el.ammo.textContent = H.combat.reloadT > 0
        ? 'PISTOL — RELOADING'
        : 'PISTOL ' + H.combat.mag + ' / ' + H.combat.reserve;
    }
    const bust = H.police.bust || 0;
    if (this.el.bustWrap) {
      this.el.bustWrap.style.display = bust > 0.02 ? 'block' : 'none';
      this.el.bustFill.style.width = Math.round(bust * 100) + '%';
    }
    // Keep the current objective on the banner when nothing fresher shows.
    if (this.bannerT <= 0 && objective && this.el.banner) {
      this.el.banner.textContent = objective.label || 'Explore Solmar Bay';
      this.el.banner.style.display = 'block';
    }
    this.drawMap(H, objective);
  }

  drawMap(H, objective) {
    const g = this.mapCtx;
    if (!g) return;
    const S = 176;
    const half = 88;
    const scale = S / 600;
    const toX = (x) => half + x * scale;
    const toY = (z) => half + z * scale;
    g.fillStyle = '#274b63';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#3d5a40';
    g.fillRect(0, 0, toX(252), S);
    // Roads.
    g.strokeStyle = 'rgba(220,220,210,.35)';
    g.lineWidth = 2;
    for (let v = -280; v <= 280; v += 56) {
      g.beginPath(); g.moveTo(toX(v), 0); g.lineTo(toX(v), S); g.stroke();
      g.beginPath(); g.moveTo(0, toY(v)); g.lineTo(S, toY(v)); g.stroke();
    }
    const blip = (x, z, color, r) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(toX(x), toY(z), r || 3, 0, 6.29);
      g.fill();
    };
    // Interiors and named places.
    blip(H.city.garage.x, H.city.garage.z, '#ffb347');
    blip(H.city.shop.x, H.city.shop.z, '#7de8a8');
    blip(H.city.policeStation.x, H.city.policeStation.z, '#7db4ff');
    blip(H.city.hospital.x, H.city.hospital.z, '#ff9d94');
    // Activity markers.
    if (H.activities.taxi) {
      const t = H.activities.taxi.phase === 'pickup'
        ? { x: H.activities.taxi.ped.x, z: H.activities.taxi.ped.z }
        : H.activities.taxi.dest;
      blip(t.x, t.z, '#5ea8e8', 4);
    }
    if (H.activities.race) {
      const p = H.activities.race.points[H.activities.race.idx];
      if (p) blip(p.x, p.z, '#ffd94d', 4);
    }
    // Police in red-blue.
    for (const c of H.police.cars) blip(c.x, c.z, '#ff5e4d', 3);
    for (const o of H.police.officers) blip(o.x, o.z, '#ff5e4d', 2);
    // Gang in purple when a fight is live.
    if (H.combat) for (const f of H.combat.gang) if (!f.dead) blip(f.x, f.z, '#c95ef0', 3);
    // Objective in gold.
    if (objective) blip(objective.x, objective.z, '#ffe14d', 4.5);
    // Player arrow in white.
    const px = toX(H.player.x);
    const py = toY(H.player.z);
    // In a car the arrow follows the car's own (sin, cos) heading;
    // on foot it follows the camera view forward, which in (sin,
    // cos) terms is cameraYaw + PI (see the convention in main.js).
    const yaw = H.player.car ? H.player.car.heading : H.cameraYaw + Math.PI;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(px + Math.sin(yaw) * 6, py + Math.cos(yaw) * 6);
    g.lineTo(px + Math.sin(yaw + 2.5) * 5, py + Math.cos(yaw + 2.5) * 5);
    g.lineTo(px + Math.sin(yaw - 2.5) * 5, py + Math.cos(yaw - 2.5) * 5);
    g.closePath();
    g.fill();
  }
}
