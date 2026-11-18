// pedestrians.js — sidewalk citizens of Solmar Bay. They stroll along the
// pavement grid, pause at crosswalks, and flee from gunfire, shouting cars and
// sidewalk invasions. One merged-geometry mesh each, bobbed as they walk.
// v4: gang cover now scores several candidate corners (line-of-sight cover,
// fighting distance, and slots claimed by other members) instead of always
// diving to the single nearest box, so a fight spreads across the street.

import * as THREE from '../vendor/three.min.js';
import { buildPerson } from './geometry.js';
import { collideCircle, clampToWorld, lineBlocked } from './physics.js';
import { ROAD_LINES, BOULEVARD_Z, WORLD_EDGE } from './city.js';
import { wrapAngle, clamp } from './vehicles.js';

// Pick a hiding spot for a fighter (v4 multi-candidate version). The nearest
// few colliders each offer their four corners (nudged out diagonally) and
// four face points as candidates. A candidate scores well when the box sits
// between it and the threat (the threat's line of sight to it is blocked, or
// the face's outward normal points away from the threat), when it sits at a
// fighting distance of roughly 8–20 units from the fighter, and when no other
// gang member has already claimed a nearby slot — so members spread out.
// `claimed` is an optional list of {x,z} points already taken this fight.
export function findCoverPoint(colliders, x, z, threatX, threatZ, claimed = []) {
  // rank colliders by distance to the fighter and keep the nearest handful
  const near = [];
  for (const c of colliders) {
    if (c.roofOnly) continue;
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const d = Math.hypot(x - nx, z - nz);
    if (d < 26) near.push({ c, d });
  }
  near.sort((a, b) => a.d - b.d);
  let best = null, bestScore = -Infinity;
  for (const { c } of near.slice(0, 6)) {
    const cand = [];
    // the four corners, pushed out along the diagonal so the fighter hugs the corner
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cand.push({ px: (sx < 0 ? c.minX : c.maxX) + sx * 0.85, pz: (sz < 0 ? c.minZ : c.maxZ) + sz * 0.85, nx: sx * 0.7, nz: sz * 0.7 });
    }
    // the four face midpoints nearest the fighter (v3-style points)
    cand.push({ nx: -1, nz: 0, px: c.minX - 0.8, pz: Math.max(c.minZ + 0.4, Math.min(z, c.maxZ - 0.4)) });
    cand.push({ nx: 1, nz: 0, px: c.maxX + 0.8, pz: Math.max(c.minZ + 0.4, Math.min(z, c.maxZ - 0.4)) });
    cand.push({ nx: 0, nz: -1, px: Math.max(c.minX + 0.4, Math.min(x, c.maxX - 0.4)), pz: c.minZ - 0.8 });
    cand.push({ nx: 0, nz: 1, px: Math.max(c.minX + 0.4, Math.min(x, c.maxX - 0.4)), pz: c.maxZ + 0.8 });
    for (const f of cand) {
      // never pick a point buried inside another solid box
      let buried = false;
      for (const o of colliders) {
        if (!o.roofOnly && f.px > o.minX - 0.3 && f.px < o.maxX + 0.3 && f.pz > o.minZ - 0.3 && f.pz < o.maxZ + 0.3) { buried = true; break; }
      }
      if (buried) continue;
      const dist = Math.hypot(f.px - x, f.pz - z);
      if (dist > 30) continue;
      // cover quality: real line-of-sight block from the threat is best; an
      // away-facing normal is a decent proxy when the ray march slips past
      let score = 0;
      if (lineBlocked(colliders, threatX, threatZ, f.px, f.pz)) score += 30;
      const toThreat = (threatX - f.px) * f.nx + (threatZ - f.pz) * f.nz;
      if (toThreat < -0.5) score += 12;
      else if (toThreat > 1.5) score -= 18; // standing on the threat's side of the box is not cover
      // distance: the 8–20 band is free, outside it the score falls off
      if (dist < 8) score -= (8 - dist) * 1.6;
      else if (dist > 20) score -= (dist - 20) * 1.6;
      // a slot another member already claimed is heavily penalised — hard
      // enough that even a mediocre unclaimed corner beats a perfect taken one
      for (const cl of claimed) {
        const cd = Math.hypot(cl.x - f.px, cl.z - f.pz);
        if (cd < 3) score -= 70; else if (cd < 6) score -= 22;
      }
      if (score > bestScore) { bestScore = score; best = { x: f.px, z: f.pz }; }
    }
  }
  return best;
}

const SKINS = [0xf2c79b, 0xc98a5a, 0x8a5a34, 0x6e4525, 0xffdbb0];
const SHIRTS = [0xe4572e, 0x2e7f86, 0xf2f2ea, 0xe39a2d, 0x3c6ec9, 0xc94f7c, 0x7a4a8c, 0x4d9a51, 0xffd23a, 0x90a4ae];
const PANTS = [0x37474f, 0x5d4037, 0x283593, 0xefebe9, 0x00695c, 0x880e4f];

export class PedestrianSystem {
  constructor(scene, rng, colliders) {
    this.scene = scene; this.rng = rng; this.colliders = colliders;
    this.peds = [];
    for (let i = 0; i < 26; i++) this.spawn();
  }
  spawn(near = null) {
    const rng = this.rng;
    const group = buildPerson(THREE, {
      skin: rng.pick(SKINS), shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS),
      hat: rng.chance(0.35) ? rng.pick(SHIRTS) : undefined,
    });
    this.scene.add(group);
    const vertical = rng.chance(0.5);
    const line = rng.pick(ROAD_LINES);
    const side = rng.chance(0.5) ? 8.6 : -8.6;
    const ped = {
      group, x: 0, z: 0, heading: rng.range(0, 6.28), speed: 0,
      axis: vertical ? 'z' : 'x', line, side, dir: rng.chance(0.5) ? 1 : -1,
      state: 'walk', panic: 0, waitT: 0, dead: false, health: 30,
      bob: rng.range(0, 6), isPassenger: false, wantsTaxi: false, gang: false,
      shootCd: 0, target: null,
    };
    if (near) { ped.x = near.x + rng.range(-6, 6); ped.z = near.z + rng.range(-6, 6); }
    else if (vertical) { ped.x = line + side; ped.z = rng.range(-230, 185); }
    else { ped.x = rng.range(-230, 230); ped.z = line + side; }
    ped.group.position.set(ped.x, 0, ped.z);
    this.peds.push(ped);
    return ped;
  }
  startle(x, z, radius) {
    for (const p of this.peds) {
      if (p.dead || p.isPassenger) continue;
      if (Math.hypot(p.x - x, p.z - z) < radius) { p.state = 'flee'; p.panic = this.rng.range(2.2, 3.6); p.fleeFrom = { x, z }; }
    }
  }
  update(ped, dt, ctx) {
    if (ped.dead) return;
    let moveX = 0, moveZ = 0, speed = 0;
    if (ped.state === 'flee') {
      ped.panic -= dt;
      const fx = ped.x - (ped.fleeFrom?.x ?? ped.x), fz = ped.z - (ped.fleeFrom?.z ?? ped.z);
      const len = Math.hypot(fx, fz) || 1;
      moveX = fx / len; moveZ = fz / len; speed = 5.4;
      if (ped.panic <= 0) ped.state = 'walk';
    } else if (ped.state === 'wait') {
      ped.waitT -= dt;
      if (ped.waitT <= 0) ped.state = 'walk';
    } else if (ped.state === 'fight') {
      // gang behaviour: combat.js sets ped.target; the mode machine here
      // (advance / cover / peek / retreat) is v3 — members spread to flank
      // anchors, dive behind boxes, peek to fire, and fall back when hurt.
      const t = ped.target;
      if (t) {
        const dx = t.x - ped.x, dz = t.z - ped.z, d = Math.hypot(dx, dz) || 0.001;
        ped.mode = ped.mode || 'advance';
        ped.modeT = (ped.modeT ?? 3) - dt;
        ped.retreatCd = Math.max(0, (ped.retreatCd ?? 0) - dt);
        if (ped.health < 22 && ped.mode !== 'retreat' && ped.retreatCd <= 0) {
          ped.mode = 'retreat'; ped.modeT = this.rng.range(2.5, 3.5);
        }
        if (ped.mode === 'retreat') {
          moveX = -dx / d; moveZ = -dz / d; speed = 5.6;
          if (ped.modeT <= 0) { ped.mode = 'advance'; ped.modeT = this.rng.range(2.5, 4.5); ped.retreatCd = 7; ped.preferFar = true; ped.farRange = this.rng.range(16, 20); }
        } else if (ped.mode === 'cover') {
          if (!ped.coverPoint) { ped.mode = 'advance'; ped.modeT = this.rng.range(2.5, 4.5); }
          else {
            const cx = ped.coverPoint.x - ped.x, cz = ped.coverPoint.z - ped.z, cd = Math.hypot(cx, cz);
            if (cd < 0.9) { ped.mode = 'peek'; ped.modeT = this.rng.range(1, 1.8); }
            else { moveX = cx / cd; moveZ = cz / cd; speed = 5.2; }
          }
        } else if (ped.mode === 'peek') {
          // hold still behind the box and trade shots
          if (ped.modeT <= 0) { ped.mode = 'advance'; ped.modeT = this.rng.range(2.5, 4.5); ped.coverPoint = null; }
        } else { // advance: hold a flank anchor at fighting range
          const range = ped.preferFar ? (ped.farRange ?? 18) : 13;
          const bearing = Math.atan2(ped.x - t.x, ped.z - t.z) + (ped.flank || 0) * 0.3;
          const ax = t.x + Math.sin(bearing) * range, az = t.z + Math.cos(bearing) * range;
          const adx = ax - ped.x, adz = az - ped.z, ad = Math.hypot(adx, adz);
          if (ad > 1.2) { moveX = adx / ad; moveZ = adz / ad; speed = 3.8; }
          if (d < 5) { moveX = -dx / d; moveZ = -dz / d; speed = 2.2; }
          if (ped.modeT <= 0) {
            const cp = findCoverPoint(this.colliders, ped.x, ped.z, t.x, t.z, ped.coverClaims || []);
            if (cp) { ped.coverPoint = cp; ped.mode = 'cover'; }
            ped.modeT = this.rng.range(2.5, 4.5);
          }
        }
      }
    } else {
      // stroll the sidewalk: follow the current street, maybe turn at crossings
      speed = 1.55;
      if (ped.axis === 'z') {
        moveZ = ped.dir;
        ped.x += (ped.line + ped.side - ped.x) * Math.min(1, dt * 2);
        if (this.rng.chance(dt * 0.05) && ROAD_LINES.some((l) => Math.abs(ped.z - l) < 2)) {
          ped.axis = 'x'; ped.line = Math.round(ped.z / 76) * 76; ped.side = ped.side > 0 ? 8.6 : -8.6; ped.dir = this.rng.chance(0.5) ? 1 : -1;
          if (this.rng.chance(0.4)) { ped.state = 'wait'; ped.waitT = this.rng.range(0.6, 2.2); }
        }
        if (ped.z > BOULEVARD_Z - 12) { ped.axis = 'x'; ped.line = BOULEVARD_Z - 10; ped.dir = this.rng.chance(0.5) ? 1 : -1; }
        if (ped.z < -238) ped.dir = 1;
      } else {
        moveX = ped.dir;
        ped.z += (ped.line + ped.side - ped.z) * Math.min(1, dt * 2);
        if (this.rng.chance(dt * 0.05) && ROAD_LINES.some((l) => Math.abs(ped.x - l) < 2)) {
          ped.axis = 'z'; ped.line = Math.round(ped.x / 76) * 76; ped.side = ped.side > 0 ? 8.6 : -8.6; ped.dir = this.rng.chance(0.5) ? 1 : -1;
          if (this.rng.chance(0.4)) { ped.state = 'wait'; ped.waitT = this.rng.range(0.6, 2.2); }
        }
        if (Math.abs(ped.x) > 245) ped.dir = ped.x > 0 ? -1 : 1;
      }
      // a car on the pavement or bearing down fast is worth running from
      for (const c of ctx.threatCars) {
        const d = Math.hypot(c.x - ped.x, c.z - ped.z);
        if (d < 6.5 && Math.abs(c.speed) > 4) { ped.state = 'flee'; ped.panic = 2.4; ped.fleeFrom = { x: c.x, z: c.z }; break; }
      }
    }
    if (speed > 0 && (moveX !== 0 || moveZ !== 0)) {
      const targetHeading = Math.atan2(moveX, moveZ);
      ped.heading += clamp(wrapAngle(targetHeading - ped.heading), -dt * 7, dt * 7);
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      const res = collideCircle(this.colliders, ped.x, ped.z, 0.45);
      ped.x = res.x; ped.z = res.z;
      clampToWorld(ped, WORLD_EDGE);
      if (ped.z > 236) ped.z = 236;
      ped.bob += dt * speed * 2.4;
    }
    ped.group.position.set(ped.x, Math.abs(Math.sin(ped.bob)) * (speed > 3 ? 0.09 : 0.045), ped.z);
    ped.group.rotation.y = ped.heading;
    ped.group.rotation.z = Math.sin(ped.bob) * (speed > 0.2 ? 0.05 : 0);
  }
  kill(ped) {
    ped.dead = true;
    ped.group.rotation.x = -Math.PI / 2;
    ped.group.position.y = 0.25;
  }
  remove(ped) {
    this.scene.remove(ped.group);
    const i = this.peds.indexOf(ped); if (i >= 0) this.peds.splice(i, 1);
  }
}
