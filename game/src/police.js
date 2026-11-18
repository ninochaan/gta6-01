// police.js — the Solmar Bay PD: a 0–5 star wanted level that rises on
// witnessed crime and decays while you stay unseen, patrol spawns, pursuit
// steering toward an intercept point, roadblocks at four stars and up, and
// — new in v3 — officers on foot who bail out of stopped pursuit cars and
// chase Rico down the sidewalk, plus guards posted at roadblocks.
// v4: officers carry pistols, but the rules of engagement are strict — they
// draw only at 3+ stars, or when Rico is shooting back, or (for a posted
// guard) when he flees past in a car. At 1–2 stars against an unarmed man
// on foot they stay tackle-and-bust only, exactly as in v3. Officer fire is
// deliberately weaker than Los Brasa's: slower, less accurate, lighter hits.

import * as THREE from '../vendor/three.min.js';
import { createCar, stepCar, wrapAngle, clamp } from './vehicles.js';
import { lineBlocked, collideCircle, clampToWorld } from './physics.js';
import { buildPerson } from './geometry.js';
import { ROAD_LINES, WORLD_EDGE } from './city.js';

const OFFICER_SKINS = [0xf2c79b, 0xc98a5a, 0x8a5a34, 0x6e4525];
const MAX_OFFICERS = 6;

export class Wanted {
  constructor() { this.level = 0; this.lastSeen = -99; this.lastCrime = -99; }
  get stars() { return Math.ceil(this.level - 0.001); }
  addCrime(amount, witnessed, now) {
    if (witnessed || this.level > 0) {
      this.level = Math.min(5, this.level + amount);
      this.lastCrime = now;
    } else if (amount >= 1) {
      this.level = Math.min(5, this.level + amount * 0.5); // unwitnessed serious crime still stirs patrols
      this.lastCrime = now;
    }
  }
  update(dt, now, seen) {
    if (seen) this.lastSeen = now;
    if (this.level > 0 && now - this.lastSeen > 6 && now - this.lastCrime > 4) {
      this.level = Math.max(0, this.level - dt * 0.055);
    }
  }
  clear() { this.level = 0; }
}

export class PoliceSystem {
  constructor(scene, colliders, rng) {
    this.scene = scene; this.colliders = colliders; this.rng = rng;
    this.cars = [];
    this.officers = [];
    this.roadblocks = [];
    this.roadblockTimer = 0;
    this.spawnTimer = 0;
  }
  targetCount(level) { return level <= 0 ? 0 : Math.min(2 + Math.floor(level), 6); }
  spawnCop(px, pz) {
    const rng = this.rng;
    const vertical = rng.chance(0.5);
    const line = ROAD_LINES.reduce((best, l) => Math.abs(l - (vertical ? px : pz)) < Math.abs(best - (vertical ? px : pz)) ? l : best, ROAD_LINES[0]);
    const car = createCar(this.scene, 0xf2f2ea, { police: true });
    car.driver = 'police';
    const back = rng.range(85, 130) * (rng.chance(0.5) ? 1 : -1);
    if (vertical) car.setPos(line + 3.1, clamp(pz + back, -240, 185), back > 0 ? Math.PI : 0);
    else car.setPos(clamp(px + back, -250, 250), line + 3.1, back > 0 ? -Math.PI / 2 : Math.PI / 2);
    this.cars.push(car);
    return car;
  }
  // ---- foot officers -------------------------------------------------------
  spawnOfficer(x, z, heading, car) {
    const live = this.officers.filter((o) => !o.dead).length;
    if (live >= MAX_OFFICERS) return null;
    const group = buildPerson(THREE, {
      skin: this.rng.pick(OFFICER_SKINS), shirt: 0x1e3a5f, pants: 0x22242c, hat: 0x16283f,
    });
    group.position.set(x, 0, z);
    this.scene.add(group);
    // v4: a holstered sidearm — a small dark box at the hip that only shows
    // (in the raised arm line) once the officer has drawn under the rules
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.34),
      new THREE.MeshBasicMaterial({ color: 0x1c1c20 }));
    gun.position.set(0.42, 1.12, 0.18);
    gun.visible = false;
    group.add(gun);
    const officer = {
      group, gun, x, z, heading: heading ?? 0, speed: 0,
      health: 40, dead: false, state: 'pursue', car: car || null,
      bob: this.rng.range(0, 6), staggerT: 0, corpseT: 0,
      shootCd: this.rng.range(1.2, 2.4), drawn: false,
    };
    group.rotation.y = officer.heading;
    this.officers.push(officer);
    return officer;
  }
  killOfficer(officer) {
    if (officer.dead) return;
    officer.dead = true;
    officer.group.rotation.x = -Math.PI / 2;
    officer.group.position.y = 0.25;
  }
  removeOfficer(officer) {
    this.scene.remove(officer.group);
    const i = this.officers.indexOf(officer);
    if (i >= 0) this.officers.splice(i, 1);
  }
  carStillPosted(car) {
    if (!car) return false;
    if (this.cars.includes(car)) return true;
    return this.roadblocks.some((rb) => rb.car === car);
  }
  strobe(car, t) {
    if (!car.lightbar) return;
    const phase = (t * 6 + car.id) % 2 < 1;
    car.lightbar.children[0].visible = phase;
    car.lightbar.children[1].visible = !phase;
  }
  update(dt, G) {
    const level = G.wanted.level;
    const want = this.targetCount(level);
    this.spawnTimer -= dt;
    if (this.cars.length < want && this.spawnTimer <= 0) {
      this.spawnCop(G.playerPos.x, G.playerPos.z);
      this.spawnTimer = 1.6;
    }
    let anySees = false;
    const t = G.now;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const cop = this.cars[i];
      if (cop.dead) { this.cars.splice(i, 1); continue; }
      const dx = G.playerPos.x - cop.x, dz = G.playerPos.z - cop.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 55 && !lineBlocked(this.colliders, cop.x, cop.z, G.playerPos.x, G.playerPos.z)) anySees = true;
      if (cop.bailed) { // parked with its crew out on foot: strobe and hold
        this.strobe(cop, t);
        cop.setBraking(true);
        continue;
      }
      if (level <= 0) { // stand down: slow to a stop and despawn politely
        stepCar(cop, cop.speed > 0.5 ? -0.4 : 0, 0, dt, this.colliders, { maxSpeed: 12 });
        // v3 fix: a stopped car only pops away once the player has left it
        // behind — never while it sits right next to them
        if (dist > 70 || (cop.speed === 0 && dist > 14)) { this.scene.remove(cop.group); this.cars.splice(i, 1); }
        continue;
      }
      if (dist > 300) { // recycle far units back into the hunt
        this.scene.remove(cop.group); this.cars.splice(i, 1); continue;
      }
      // bail out: close, slow, and the player is on foot — the chase leaves
      // the car and continues down the sidewalk
      if (!G.playerInCar && dist < 17 && Math.abs(cop.speed) < 7) {
        const rx = Math.cos(cop.heading), rz = -Math.sin(cop.heading);
        this.spawnOfficer(cop.x + rx * 1.9, cop.z + rz * 1.9, cop.heading, cop);
        this.spawnOfficer(cop.x - rx * 1.9, cop.z - rz * 1.9, cop.heading, cop);
        cop.parked = true; cop.bailed = true; cop.speed = 0;
        cop.sync();
        this.strobe(cop, t);
        continue;
      }
      // steer at an intercept point ahead of the player
      const lead = clamp(dist / 38, 0, 1.4);
      const tx = G.playerPos.x + G.playerVel.x * lead, tz = G.playerPos.z + G.playerVel.z * lead;
      const desired = Math.atan2(tx - cop.x, tz - cop.z);
      const diff = wrapAngle(desired - cop.heading);
      const steer = clamp(diff * 1.9, -1, 1);
      let throttle = 0.9;
      if (dist < 6 && G.playerSpeed < 2) throttle = 0;            // boxed in: hold and bust
      else if (dist < 10) throttle = 0.35;
      if (Math.abs(diff) > 2.4 && cop.speed > 6) throttle = -0.5; // too sharp: brake and swing round
      stepCar(cop, throttle, steer, dt, this.colliders, { maxSpeed: 30 + level * 1.6 });
      this.strobe(cop, t);
      cop.setBraking(throttle < 0);
    }
    // foot officers
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const off = this.officers[i];
      if (off.dead) {
        off.corpseT += dt;
        if (off.corpseT > 15) this.removeOfficer(off);
        continue;
      }
      const dx = G.playerPos.x - off.x, dz = G.playerPos.z - off.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 45 && !lineBlocked(this.colliders, off.x, off.z, G.playerPos.x, G.playerPos.z)) anySees = true;
      // v4 rules of engagement: draw only at 3+ stars, or when Rico is
      // shooting back, or — for a posted roadblock guard — when he flees
      // past in a vehicle. Otherwise the pistol stays holstered.
      const playerFiring = G.now - (G.playerFiredAt ?? -99) < 6;
      off.engaged = !!(G.wanted.stars >= 3 || playerFiring || (G.playerInCar && off.state === 'guard' && level > 0));
      off.drawn = off.engaged && dist < 42;
      if (off.gun) off.gun.visible = off.drawn;
      // their unit is gone (recycled or cleared): drift off once far away
      if (off.car && !this.carStillPosted(off.car)) {
        if (dist > 50) { this.removeOfficer(off); continue; }
      }
      if (off.state === 'pursue') {
        if (level <= 0 || dist > 55 || G.playerInCar) off.state = 'return';
      } else if (off.state === 'guard') {
        if (!G.playerInCar && dist < 20 && level > 0) off.state = 'pursue';
      }
      // v4 officer fire: a drawn officer inside 34 units plants his feet and
      // shoots on a slow cadence — lighter and less accurate than gang fire
      // (34% hits for 3–6.5, vs the gang's 55% for 4–9), so 3 stars is
      // dangerous but survivable, and a point-blank tackle still wins.
      if (off.drawn && off.staggerT <= 0 && dist < 34 && dist > 2.2) {
        off.shootCd -= dt;
        if (off.shootCd <= 0) {
          off.shootCd = 1.7 + Math.random() * 1.1;
          if (G.audio) G.audio.gunshot();
          const blocked = lineBlocked(this.colliders, off.x, off.z, G.playerPos.x, G.playerPos.z);
          const spread = blocked ? 9 : 3.4;
          const tx2 = G.playerPos.x + (Math.random() - 0.5) * spread;
          const tz2 = G.playerPos.z + (Math.random() - 0.5) * spread;
          if (G.combat) {
            G.combat.showTracer(off.x, 1.35, off.z, tx2, 1.2, tz2);
            G.combat.showFlash(off.x + Math.sin(off.heading) * 0.4, 1.35, off.z + Math.cos(off.heading) * 0.4, off.heading);
          }
          if (!blocked && Math.random() < 0.34) G.hurtPlayer(3 + Math.random() * 3.5, off.x, off.z);
        }
      }
      let moveX = 0, moveZ = 0, speed = 0;
      if (off.state === 'pursue') {
        const leadT = 0.35;
        const tx = G.playerPos.x + G.playerVel.x * leadT, tz = G.playerPos.z + G.playerVel.z * leadT;
        const ddx = tx - off.x, ddz = tz - off.z, len = Math.hypot(ddx, ddz) || 1;
        moveX = ddx / len; moveZ = ddz / len;
        // a shooting pursuer stops to aim; a holstered one keeps running
        speed = off.staggerT > 0 ? 0 : (off.drawn && dist < 34 && dist > 2.2 ? 0 : 6.4);
      } else if (off.state === 'return') {
        if (!off.car) { this.removeOfficer(off); continue; }
        const ddx = off.car.x - off.x, ddz = off.car.z - off.z;
        const dCar = Math.hypot(ddx, ddz);
        if (dCar < 2.5) {
          const rbEntry = this.roadblocks.find((rb) => rb.car === off.car);
          if (rbEntry) { off.state = 'guard'; rbEntry.guard = off; } // resume the post
          else { off.car.parked = false; off.car.bailed = false; this.removeOfficer(off); }
          continue;
        }
        moveX = ddx / dCar; moveZ = ddz / dCar; speed = 5.6;
      } else { // guard: hold the post, watch the player
        if (dist > 0.01) off.heading += clamp(wrapAngle(Math.atan2(dx, dz) - off.heading), -dt * 5, dt * 5);
      }
      if (off.staggerT > 0) off.staggerT -= dt;
      off.speed = speed;
      if (speed > 0 && (moveX !== 0 || moveZ !== 0)) {
        const targetHeading = Math.atan2(moveX, moveZ);
        off.heading += clamp(wrapAngle(targetHeading - off.heading), -dt * 7, dt * 7);
        off.x += Math.sin(off.heading) * speed * dt;
        off.z += Math.cos(off.heading) * speed * dt;
        const res = collideCircle(this.colliders, off.x, off.z, 0.45);
        off.x = res.x; off.z = res.z;
        clampToWorld(off, WORLD_EDGE);
        off.bob += dt * speed * 2.4;
      }
      off.group.position.set(off.x, Math.abs(Math.sin(off.bob)) * (speed > 3 ? 0.09 : 0.045), off.z);
      off.group.rotation.y = off.heading;
      off.group.rotation.z = Math.sin(off.bob) * (speed > 0.2 ? 0.05 : 0);
    }
    // roadblocks at four stars: two units parked across the road ahead
    this.roadblockTimer -= dt;
    if (level >= 4 && this.roadblockTimer <= 0) {
      this.placeRoadblock(G);
      this.roadblockTimer = 26;
    }
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const rb = this.roadblocks[i];
      rb.age += dt;
      this.strobe(rb.car, t);
      if (rb.age > 30 || level < 3) {
        if (rb.guard && !rb.guard.dead) this.removeOfficer(rb.guard);
        this.scene.remove(rb.car.group); this.roadblocks.splice(i, 1);
      }
    }
    return anySees;
  }
  placeRoadblock(G) {
    const fx = Math.sin(G.playerHeading), fz = Math.cos(G.playerHeading);
    const aheadX = G.playerPos.x + fx * 55, aheadZ = G.playerPos.z + fz * 55;
    const vertical = Math.abs(fx) < Math.abs(fz);
    const line = ROAD_LINES.reduce((best, l) => Math.abs(l - (vertical ? aheadX : aheadZ)) < Math.abs(best - (vertical ? aheadX : aheadZ)) ? l : best, ROAD_LINES[0]);
    let firstCar = null;
    for (const off of [-2.6, 2.6]) {
      const car = createCar(this.scene, 0xf2f2ea, { police: true });
      car.driver = 'police'; car.parked = true;
      if (vertical) car.setPos(line + off, aheadZ, Math.PI / 2);
      else car.setPos(aheadX, line + off, 0);
      const entry = { car, age: 0, guard: null };
      this.roadblocks.push(entry);
      if (!firstCar) {
        firstCar = car;
        // one officer stands post beside the lead unit
        const gx = vertical ? car.x : car.x + 2.4, gz = vertical ? car.z + 2.4 : car.z;
        const guard = this.spawnOfficer(gx, gz, G.playerHeading, car);
        if (guard) { guard.state = 'guard'; entry.guard = guard; }
      }
    }
  }
  nearestCopDistance(x, z) {
    let best = Infinity;
    for (const c of this.cars) best = Math.min(best, Math.hypot(c.x - x, c.z - z));
    for (const rb of this.roadblocks) best = Math.min(best, Math.hypot(rb.car.x - x, rb.car.z - z));
    for (const o of this.officers) if (!o.dead) best = Math.min(best, Math.hypot(o.x - x, o.z - z));
    return best;
  }
  clearAll() {
    for (const c of this.cars) this.scene.remove(c.group);
    for (const rb of this.roadblocks) this.scene.remove(rb.car.group);
    for (const o of this.officers) this.scene.remove(o.group);
    this.cars = []; this.roadblocks = []; this.officers = [];
  }
}
