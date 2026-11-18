// combat.js — fists and a pistol: hitscan shots with a tracer and muzzle
// flash, melee swings, damage to pedestrians and cars, and the Los Brasa
// gang members who shoot back during story missions.
// v4: cover dives pass the fight's claimed cover slots into the new
// multi-candidate search, and each frame refreshes every member's claim
// list so the squad spreads across different corners instead of stacking.

import * as THREE from '../vendor/three.min.js';
import { buildPerson } from './geometry.js';
import { lineBlocked } from './physics.js';
import { findCoverPoint } from './pedestrians.js';

const GANG_PALETTE = { skin: 0xc98a5a, shirt: 0xb3231b, pants: 0x22242c, hat: 0xb3231b };

export class Combat {
  constructor(scene, colliders, audio, peds) {
    this.scene = scene; this.colliders = colliders; this.audio = audio; this.peds = peds;
    this.police = null; // wired from main.js so officers are valid targets
    this._deadSeen = new Set();
    this.hasPistol = true;
    this.mag = 12; this.magSize = 12; this.reserve = 60;
    this.reloadT = 0; this.fireCd = 0;
    this.gang = [];
    // one reusable tracer line + a muzzle flash quad
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3));
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.tracer.visible = false; this.tracer.frustumCulled = false;
    scene.add(this.tracer);
    this.tracerT = 0;
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshBasicMaterial({ color: 0xffc95e, transparent: true, opacity: 0.95, depthWrite: false }));
    this.flash.visible = false;
    scene.add(this.flash);
    this.flashT = 0;
  }
  showTracer(x1, y1, z1, x2, y2, z2) {
    const a = this.tracer.geometry.attributes.position.array;
    a[0] = x1; a[1] = y1; a[2] = z1; a[3] = x2; a[4] = y2; a[5] = z2;
    this.tracer.geometry.attributes.position.needsUpdate = true;
    this.tracer.visible = true; this.tracerT = 0.05;
  }
  showFlash(x, y, z, yaw) {
    this.flash.position.set(x, y, z);
    this.flash.rotation.set(0, yaw, 0);
    this.flash.visible = true; this.flashT = 0.045;
  }
  // Hitscan from an eye point along a direction. Returns {kind, ped?, car?, dist}.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, targets) {
    let best = maxDist, hit = { kind: 'none', dist: maxDist };
    // buildings: march the ray in small steps (cheap, colliders are boxes)
    for (let d = 1; d < maxDist; d += 1.2) {
      const x = ox + dx * d, y = oy + dy * d, z = oz + dz * d;
      if (y < 0) { best = d; hit = { kind: 'ground', dist: d }; break; }
      let inside = false;
      for (const c of this.colliders) {
        if (!c.roofOnly && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && y < 90) { inside = true; break; }
      }
      if (inside) { best = d; hit = { kind: 'building', dist: d }; break; }
    }
    // people: distance from the ray to their chest point
    for (const p of targets) {
      if (p.dead) continue;
      const cx = p.x - ox, cy = 1.25 - oy, cz = p.z - oz;
      const t = cx * dx + cy * dy + cz * dz;
      if (t < 0 || t > best) continue;
      const px = ox + dx * t - p.x, py = oy + dy * t - 1.25, pz = oz + dz * t - p.z;
      if (px * px + py * py + pz * pz < 0.42) { best = t; hit = { kind: 'ped', ped: p, dist: t }; }
    }
    return hit;
  }
  // The player fires. yaw/pitch describe the camera aim. Returns what happened.
  playerShoot(G) {
    if (!this.hasPistol || this.reloadT > 0 || this.fireCd > 0) return null;
    if (this.mag <= 0) { this.audio.dryFire(); this.startReload(); return null; }
    this.mag--; this.fireCd = 0.16;
    this.audio.gunshot();
    const yaw = G.cameraYaw, pitch = G.cameraPitch;
    const dx = -Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
    const ox = G.playerPos.x, oy = 1.55, oz = G.playerPos.z;
    this.showFlash(ox - Math.sin(yaw) * 0.5, 1.35, oz - Math.cos(yaw) * 0.5, yaw);
    const officers = this.police ? this.police.officers : [];
    const targets = [...this.peds.peds, ...this.gang, ...officers];
    const hit = this.raycast(ox, oy, oz, dx, dy, dz, 90, targets);
    const ex = ox + dx * hit.dist, ey = oy + dy * hit.dist, ez = oz + dz * hit.dist;
    this.showTracer(ox - Math.sin(yaw) * 0.4, 1.35, oz - Math.cos(yaw) * 0.4, ex, ey, ez);
    // gunfire spooks the gang: nearby members may dive for cover, avoiding
    // slots their squadmates have already claimed (v4 spread)
    for (const p of this.gang) {
      if (p.dead) continue;
      if (Math.hypot(p.x - ox, p.z - oz) < 25 && Math.random() < 0.5) {
        const claimed = this.gang.filter((q) => q !== p && !q.dead && q.coverPoint).map((q) => q.coverPoint);
        const cp = findCoverPoint(this.colliders, p.x, p.z, ox, oz, claimed);
        if (cp && p.mode !== 'retreat') { p.coverPoint = cp; p.mode = 'cover'; }
      }
    }
    if (hit.kind === 'ped') {
      hit.ped.health -= 34;
      this.audio.thud();
      const isOfficer = officers.includes(hit.ped);
      if (hit.ped.health <= 0 && !hit.ped.dead) {
        if (isOfficer) this.police.killOfficer(hit.ped);
        else this.peds.kill(hit.ped);
        return { killed: hit.ped };
      }
      if (isOfficer) { hit.ped.staggerT = 0.3; return { hit: hit.ped }; }
      if (!hit.ped.gang) { hit.ped.state = 'flee'; hit.ped.panic = 3; hit.ped.fleeFrom = { x: ox, z: oz }; }
      return { hit: hit.ped };
    }
    return { missed: true };
  }
  playerMelee(G) {
    let best = null, bd = 2.3;
    const officers = this.police ? this.police.officers : [];
    for (const p of [...this.peds.peds, ...this.gang, ...officers]) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - G.playerPos.x, p.z - G.playerPos.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) {
      best.health -= 18;
      this.audio.thud();
      const isOfficer = officers.includes(best);
      if (best.health <= 0) {
        if (isOfficer) this.police.killOfficer(best);
        else this.peds.kill(best);
        return { killed: best };
      }
      if (isOfficer) { best.staggerT = 0.3; return { hit: best }; }
      if (!best.gang) { best.state = 'flee'; best.panic = 2.6; best.fleeFrom = { x: G.playerPos.x, z: G.playerPos.z }; }
      return { hit: best };
    }
    return null;
  }
  startReload() {
    if (this.reloadT > 0 || this.mag >= this.magSize || this.reserve <= 0) return;
    this.reloadT = 1.1;
    this.audio.reload();
  }
  spawnGang(x, z, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const ped = this.peds.spawn({ x: x + (i % 3) * 2.4 - 2.4, z: z + Math.floor(i / 3) * 2.4 });
      // repaint the gang member in Los Brasa red
      this.scene.remove(ped.group);
      ped.group = buildPerson(THREE, GANG_PALETTE);
      ped.group.position.set(ped.x, 0, ped.z);
      this.scene.add(ped.group);
      ped.gang = true; ped.health = 65; ped.state = 'fight';
      ped.shootCd = 1 + Math.random() * 1.4;
      // v3 tactics: a flank slot around the player, a mode, a staggered clock
      ped.flank = n <= 1 ? 0 : -0.9 + (1.8 * i) / (n - 1);
      ped.mode = 'advance';
      ped.modeT = 1.4 + i * 0.8 + Math.random() * 0.9;
      ped.coverPoint = null; ped.preferFar = false; ped.retreatCd = 0;
      this.gang.push(ped); out.push(ped);
    }
    return out;
  }
  clearGang() {
    for (const p of this.gang) this.peds.remove(p);
    this.gang = [];
    this._deadSeen.clear();
  }
  // A fallen member rattles the rest: everyone close by dives for a box.
  reactToDeath(corpse, G) {
    for (const p of this.gang) {
      if (p.dead || p === corpse) continue;
      if (Math.hypot(p.x - corpse.x, p.z - corpse.z) < 18 && p.mode !== 'retreat') {
        const claimed = this.gang.filter((q) => q !== p && !q.dead && q.coverPoint).map((q) => q.coverPoint);
        const cp = findCoverPoint(this.colliders, p.x, p.z, G.playerPos.x, G.playerPos.z, claimed);
        if (cp) { p.coverPoint = cp; p.mode = 'cover'; }
      }
    }
  }
  // Gang return fire + timers; damages the player through G.hurtPlayer.
  update(dt, G) {
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.tracerT > 0) { this.tracerT -= dt; if (this.tracerT <= 0) this.tracer.visible = false; }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const take = Math.min(this.magSize - this.mag, this.reserve);
        this.mag += take; this.reserve -= take;
      }
    }
    // v4: keep every fighter's claimed-cover list current (everyone else's
    // live cover points), so the pedestrians.js mode machine spreads out
    for (const p of this.gang) {
      if (p.dead) continue;
      p.coverClaims = this.gang.filter((q) => q !== p && !q.dead && q.coverPoint).map((q) => q.coverPoint);
    }
    for (const p of this.gang) {
      if (p.dead) {
        if (!this._deadSeen.has(p)) { this._deadSeen.add(p); this.reactToDeath(p, G); }
        continue;
      }
      p.target = G.playerPos;
      p.shootCd -= dt;
      const d = Math.hypot(p.x - G.playerPos.x, p.z - G.playerPos.z);
      const mayFire = p.mode === 'advance' || p.mode === 'peek' || p.mode === undefined;
      if (p.shootCd <= 0 && d < 30 && !G.playerInCar && mayFire) {
        p.shootCd = 1.15 + Math.random() * 1.3;
        this.audio.gunshot();
        const blocked = lineBlocked(this.colliders, p.x, p.z, G.playerPos.x, G.playerPos.z);
        const spread = blocked ? 9 : 2.6;
        const tx = G.playerPos.x + (Math.random() - 0.5) * spread;
        const tz = G.playerPos.z + (Math.random() - 0.5) * spread;
        this.showTracer(p.x, 1.35, p.z, tx, 1.2, tz);
        if (!blocked && Math.random() < 0.55) G.hurtPlayer(4 + Math.random() * 5, p.x, p.z);
      }
    }
  }
  gangAlive() { return this.gang.filter((p) => !p.dead).length; }
}
