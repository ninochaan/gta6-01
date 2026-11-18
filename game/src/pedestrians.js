// pedestrians.js — ambient strolling pedestrians, the gang fighters and
// their shared cover search. findCoverPoint is the squad's one cover
// brain: it scores the corners and faces of the nearest colliders so a
// whole squad, sharing one claims list, spreads across distinct points.

import { buildPersonMesh } from './geometry.js';
import { collideCircle, applyShore, clampWorld, segmentHitsBox } from './physics.js';
import { clamp, dist2d } from './rng.js';

export function findCoverPoint(colliders, fx, fz, tx, tz, claims) {
  if (!colliders || colliders.length === 0) return null;
  const near = colliders
    .map((c) => ({ c, d: Math.hypot(c.x - fx, c.z - fz) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  let best = null;
  let bestScore = -Infinity;
  for (const { c } of near) {
    const cand = [];
    // Corners, nudged out from the box.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        cand.push({ x: c.x + sx * (c.hw + 1.1), z: c.z + sz * (c.hd + 1.1) });
      }
    }
    // Face midpoints, nudged out from the box.
    cand.push({ x: c.x, z: c.z - c.hd - 1.1 });
    cand.push({ x: c.x, z: c.z + c.hd + 1.1 });
    cand.push({ x: c.x - c.hw - 1.1, z: c.z });
    cand.push({ x: c.x + c.hw + 1.1, z: c.z });
    for (const p of cand) {
      let score = 0;
      // Strong bonus when this collider itself blocks the threat's line.
      if (segmentHitsBox(p.x, p.z, tx, tz, c)) score += 30;
      // Bonus when the candidate faces away from the threat.
      const awayX = p.x - c.x;
      const awayZ = p.z - c.z;
      if (awayX * (tx - p.x) + awayZ * (tz - p.z) < 0) score += 12;
      // Prefer cover 8 to 20 units from the fighter.
      const dF = Math.hypot(p.x - fx, p.z - fz);
      if (dF >= 8 && dF <= 20) score += 10;
      else score -= Math.abs(dF - 14) * 0.8;
      // Stay out of the threat's lap.
      const dT = Math.hypot(p.x - tx, p.z - tz);
      if (dT < 5) score -= 15;
      // Claims: a taken point is nearly worthless, a near one is poor.
      for (const q of claims || []) {
        const dC = Math.hypot(p.x - q.x, p.z - q.z);
        if (dC < 1.5) score -= 70;
        else if (dC < 4) score -= 22;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { x: p.x, z: p.z };
      }
    }
  }
  return best;
}

const SHIRTS = [0xe3cfa5, 0x87a8b8, 0xd98a68, 0x9db98a, 0xc9b8d4, 0xf0ece2, 0x7a8f6b, 0xd4a08a];
const PANTS = [0x2c3844, 0x5a4632, 0x3c4148, 0x6b5a44, 0x22304a];

export class Pedestrian {
  constructor(scene, rng, x, z) {
    this.x = x;
    this.z = z;
    this.heading = rng.range(0, 6.28);
    this.state = 'stroll';
    this.speed = rng.range(1.3, 1.9);
    this.target = null;
    this.mesh = buildPersonMesh(rng.pick(SHIRTS), rng.pick(PANTS), 0xc9986a);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.rng = rng;
    this.waitT = 0;
  }

  pickTarget() {
    // Stroll the sidewalks: aim for a point along a nearby road edge.
    const gx = Math.round(this.x / 56) * 56;
    const gz = Math.round(this.z / 56) * 56;
    const side = this.rng.chance(0.5) ? 9.5 : -9.5;
    if (this.rng.chance(0.5)) this.target = { x: gx + side, z: this.z + this.rng.range(-70, 70) };
    else this.target = { x: this.x + this.rng.range(-70, 70), z: gz + side };
    this.target.x = clamp(this.target.x, -272, 240);
    this.target.z = clamp(this.target.z, -240, 196);
  }

  update(dt, colliders) {
    if (this.state === 'riding') {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    if (this.state === 'waiting') {
      this.mesh.position.set(this.x, 0, this.z);
      this.mesh.rotation.y = this.heading;
      return;
    }
    if (!this.target || dist2d(this.x, this.z, this.target.x, this.target.z) < 1.6) this.pickTarget();
    const dx = this.target.x - this.x;
    const dz = this.target.z - this.z;
    const len = Math.hypot(dx, dz) || 1;
    this.heading = Math.atan2(dx, dz);
    let nx = this.x + (dx / len) * this.speed * dt;
    let nz = this.z + (dz / len) * this.speed * dt;
    const shore = applyShore(nx, nz, this.x, this.z);
    const hit = collideCircle(shore.x, shore.z, 0.5, colliders);
    if (Math.hypot(hit.x - shore.x, hit.z - shore.z) > 0.4) this.target = null;
    const cl = clampWorld(hit.x, hit.z);
    this.x = cl.x;
    this.z = cl.z;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  dispose(scene) {
    scene.remove(this.mesh);
  }
}

export class Peds {
  constructor(scene, rng) {
    this.peds = [];
    const spots = [
      [20, -40], [-30, 90], [70, 20], [-80, -30], [130, 90], [-140, 130], [40, -140],
      [-40, -190], [90, -190], [-120, -190], [170, -30], [-190, 60], [230, 40], [15, 200],
      [-90, 200], [60, 150], [-160, -120], [150, -150], [210, 140], [-230, -40],
    ];
    for (const [x, z] of spots) this.peds.push(new Pedestrian(scene, rng, x, z));
  }

  update(dt, colliders) {
    for (const p of this.peds) p.update(dt, colliders);
  }
}

// A gang fighter: flank anchor, a cover / peek / advance / retreat mode
// machine, and gunfire that out-paces the police (55% hits, 4–9 damage).
export class GangFighter {
  constructor(scene, x, z, angle, rng) {
    this.x = x;
    this.z = z;
    this.heading = 0;
    this.health = 30;
    this.dead = false;
    this.angle = angle;
    this.mode = 'advance';
    this.modeT = 0;
    this.fireT = rng.range(0.5, 1.4);
    this.coverPoint = null;
    this.rng = rng;
    this.mesh = buildPersonMesh(0x30343c, 0x22262c, 0xb8895e);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
  }

  onShotAt(claims, colliders, threat) {
    if (this.dead) return;
    this.mode = 'cover';
    this.modeT = 0;
    this.coverPoint = findCoverPoint(colliders, this.x, this.z, threat.x, threat.z, claims);
  }

  moveToward(dt, tx, tz, speed, colliders) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.4) return true;
    this.heading = Math.atan2(dx, dz);
    let nx = this.x + (dx / len) * speed * dt;
    let nz = this.z + (dz / len) * speed * dt;
    const shore = applyShore(nx, nz, this.x, this.z);
    const hit = collideCircle(shore.x, shore.z, 0.5, colliders);
    const cl = clampWorld(hit.x, hit.z);
    this.x = cl.x;
    this.z = cl.z;
    return len < 1.4;
  }

  update(dt, H, env) {
    if (this.dead) return;
    const px = H.player.x;
    const pz = H.player.z;
    const dist = dist2d(this.x, this.z, px, pz);
    this.modeT += dt;
    this.heading = Math.atan2(px - this.x, pz - this.z);
    if (this.health < 22 && this.mode !== 'retreat' && this.mode !== 'cover' && this.mode !== 'peek') {
      this.mode = 'retreat';
      this.modeT = 0;
    }
    if (this.mode === 'advance') {
      const ax = px + Math.sin(this.angle) * 13;
      const az = pz + Math.cos(this.angle) * 13;
      if (this.moveToward(dt, ax, az, 4.7, env.colliders) || dist < 12) {
        this.mode = 'peek';
        this.modeT = 0;
      }
    } else if (this.mode === 'cover') {
      if (!this.coverPoint) this.coverPoint = findCoverPoint(env.colliders, this.x, this.z, px, pz, env.claims);
      if (!this.coverPoint) {
        this.mode = 'peek';
        this.modeT = 0;
      } else if (this.moveToward(dt, this.coverPoint.x, this.coverPoint.z, 5.4, env.colliders) || this.modeT > 4) {
        this.mode = 'peek';
        this.modeT = 0;
      }
    } else if (this.mode === 'retreat') {
      const away = Math.atan2(this.x - px, this.z - pz);
      const tx = px + Math.sin(away) * 25;
      const tz = pz + Math.cos(away) * 25;
      if (this.moveToward(dt, tx, tz, 4.9, env.colliders) || dist > 23 || this.modeT > 3.5) {
        this.mode = 'peek';
        this.modeT = 0;
      }
    } else if (this.mode === 'peek') {
      // Stand and shoot on a fast cadence.
      this.fireT -= dt;
      if (this.fireT <= 0 && dist < 42) {
        this.fireT = this.rng.range(0.85, 1.5);
        env.audio.enemyShoot();
        env.tracer(this.x, this.z, px, pz);
        if (this.rng.chance(0.55) && !env.lineBlocked(this.x, this.z, px, pz)) {
          H.hurtPlayer(this.rng.range(4, 9), this.x, this.z);
        }
      }
      if (this.modeT > this.rng.range(1.8, 2.8)) {
        this.mode = this.rng.chance(0.55) ? 'cover' : 'advance';
        this.modeT = 0;
        this.coverPoint = null;
        if (this.mode === 'cover') this.coverPoint = findCoverPoint(env.colliders, this.x, this.z, px, pz, env.claims);
      }
    }
    this.angle += dt * 0.05;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  kill(scene) {
    this.dead = true;
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.y = 0.25;
  }
}
