// vehicles.js — car objects, player driving physics with crash damage,
// and ambient traffic that follows lanes, brakes for the car ahead and
// steers through corners in arcs toward a guide point on the exit lane.

import { buildCarMesh } from './geometry.js';
import { collideCircle, applyShore, clampWorld } from './physics.js';
import { clamp, angDiff } from './rng.js';

export const CAR_COLORS = [0xc95f2e, 0x38618f, 0xe3cfa5, 0x2e7d6b, 0xa03a3a, 0xd9d4c5, 0x7a4a8f, 0x4a5560, 0xb8862e, 0x87a8b8];

export class Car {
  constructor(scene, x, z, heading, color, isPolice) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.health = 100;
    this.color = color;
    this.isPolice = !!isPolice;
    this.parked = false;
    this.braking = false;
    this.steer = 0;
    this.mesh = buildCarMesh(color, this.isPolice);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.brakeMat = this.mesh.userData.brakeMat;
    this.barMat = this.mesh.userData.barMat;
    this.barT = Math.random() * 6;
  }

  setPos(x, z, heading) {
    this.x = x;
    this.z = z;
    if (heading !== undefined) this.heading = heading;
    this.syncMesh();
  }

  forwardX() { return Math.sin(this.heading); }
  forwardZ() { return Math.cos(this.heading); }

  topSpeed() {
    if (this.health < 30) return 9; // a wreck limps
    if (this.health < 60) return 19;
    return 27;
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    if (this.brakeMat) this.brakeMat.color.setHex(this.braking ? 0xffffff : 0x5a5a5a);
    if (this.barMat) {
      const on = Math.sin(this.barT * 9) > 0;
      this.barMat.color.setHex(on ? 0xff2a2a : 0x2a6bff);
    }
  }

  // Player-driven update. Returns crash damage dealt this frame (0 if none).
  drive(dt, throttle, steer, colliders) {
    const top = this.topSpeed();
    if (throttle > 0) this.speed += 15 * dt * throttle;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= 26 * dt;
      else this.speed = Math.max(-8, this.speed - 8 * dt);
    }
    // Gentle drag and rolling resistance.
    this.speed -= this.speed * 0.55 * dt;
    if (throttle === 0) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 3.2 * dt);
    this.speed = clamp(this.speed, -8, top);
    const steerAuthority = clamp(Math.abs(this.speed) / 6, 0, 1) * (this.speed < 0 ? -1 : 1);
    this.heading += steer * 1.65 * dt * steerAuthority * (1 - Math.min(0.45, Math.abs(this.speed) / 60));
    this.steer = steer;
    const prevSpeed = this.speed;
    let nx = this.x + this.forwardX() * this.speed * dt;
    let nz = this.z + this.forwardZ() * this.speed * dt;
    const shore = applyShore(nx, nz, this.x, this.z);
    nx = shore.x;
    nz = shore.z;
    const hit = collideCircle(nx, nz, 1.55, colliders);
    let crash = 0;
    const push = Math.hypot(hit.x - nx, hit.z - nz);
    if (push > 0.25 && Math.abs(prevSpeed) > 6) {
      crash = (Math.abs(prevSpeed) - 5) * 2.1;
      this.health = Math.max(0, this.health - crash);
      this.speed *= 0.25;
    }
    nx = hit.x;
    nz = hit.z;
    const cl = clampWorld(nx, nz);
    this.x = cl.x;
    this.z = cl.z;
    this.braking = throttle < 0 || (throttle === 0 && Math.abs(this.speed) > 2);
    this.barT += dt;
    this.syncMesh();
    return crash;
  }

  // Shared seek steering for AI drivers: turn the heading toward a point
  // and manage speed, braking for whatever is ahead.
  seek(dt, tx, tz, cruise, allCars, colliders) {
    const want = Math.atan2(tx - this.x, tz - this.z);
    const diff = angDiff(this.heading, want);
    const turnRate = 1.9;
    this.heading += clamp(diff, -turnRate * dt, turnRate * dt);
    let target = cruise;
    if (Math.abs(diff) > 0.55) target = Math.min(target, 6.5);
    // Brake for a car or the player ahead in this lane.
    this.braking = false;
    const fx = this.forwardX();
    const fz = this.forwardZ();
    for (let i = 0; i < allCars.length; i++) {
      const o = allCars[i];
      if (o === this) continue;
      const rx = o.x - this.x;
      const rz = o.z - this.z;
      const along = rx * fx + rz * fz;
      if (along < 0.5 || along > 10) continue;
      const side = Math.abs(rx * fz - rz * fx);
      if (side < 2.1) {
        target = Math.min(target, Math.max(0, (along - 5.5) * 1.6));
        if (along < 8) this.braking = true;
      }
    }
    if (this.speed < target) this.speed = Math.min(target, this.speed + 9 * dt);
    else this.speed = Math.max(target, this.speed - 22 * dt);
    let nx = this.x + fx * this.speed * dt;
    let nz = this.z + fz * this.speed * dt;
    const shore = applyShore(nx, nz, this.x, this.z);
    const hit = collideCircle(shore.x, shore.z, 1.55, colliders);
    if (Math.hypot(hit.x - shore.x, hit.z - shore.z) > 0.3) this.speed *= 0.4;
    const cl = clampWorld(hit.x, hit.z);
    this.x = cl.x;
    this.z = cl.z;
    this.barT += dt;
    this.syncMesh();
  }

  dispose(scene) {
    scene.remove(this.mesh);
  }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Traffic {
  constructor(scene, rng, colliders) {
    this.cars = [];
    this.parked = [];
    this.colliders = colliders;
    // Ambient traffic on the grid.
    for (let i = 0; i < 9; i++) {
      const dir = DIRS[i % 4];
      const gx = Math.round(rng.range(-4, 4)) * 56;
      const gz = Math.round(rng.range(-4, 4)) * 56;
      const along = rng.range(-24, 24);
      const lane = lanePoint(gx, gz, dir, along);
      const car = new Car(scene, lane.x, lane.z, Math.atan2(dir[0], dir[1]), rng.pick(CAR_COLORS), false);
      car.speed = rng.range(7, 11);
      car.ai = { dir, decidedAt: null, guide: null };
      this.cars.push(car);
    }
    // Parked cars along the curbs, ready to be stolen.
    const parkSpots = [
      [-50, -20, 0], [62, 30, 1], [-118, 40, 0], [118, -40, 1], [6, 118, 0], [-62, -118, 1],
      [174, 60, 0], [-174, -60, 1], [50, 174, 0], [-230, 118, 1], [230, -174, 0], [118, 230, 1],
      [-6, -62, 0], [200, -118, 1], [-200, 200, 0], [90, -202, 0],
    ];
    parkSpots.forEach(([px, pz, vert], i) => {
      const heading = vert ? 0 : Math.PI / 2;
      const car = new Car(scene, px, pz, heading + (i % 2 ? Math.PI : 0), CAR_COLORS[(i * 3) % CAR_COLORS.length], false);
      car.parked = true;
      this.parked.push(car);
    });
  }

  update(dt, allCars, skipCar) {
    for (const car of this.cars) {
      if (car === skipCar) continue;
      const ai = car.ai;
      const [dx, dz] = ai.dir;
      // Distance to the next intersection centre along our direction.
      const alongAxis = dx !== 0 ? car.x : car.z;
      const nextLine = dx !== 0
        ? (Math.floor(alongAxis / 56) + (dx > 0 ? 1 : 0)) * 56 + (dx < 0 ? 0 : 0)
        : (Math.floor(alongAxis / 56) + (dz > 0 ? 1 : 0)) * 56;
      const crossX = dx !== 0 ? nextLine : Math.round(car.x / 56) * 56;
      const crossZ = dz !== 0 ? nextLine : Math.round(car.z / 56) * 56;
      const distCross = Math.hypot(crossX - car.x, crossZ - car.z);
      // Decide the turn about 9 units before the crossing.
      if (distCross < 10 && ai.decidedAt !== crossX * 1000 + crossZ) {
        ai.decidedAt = crossX * 1000 + crossZ;
        if (Math.random() < 0.38) {
          const nd = DIRS[Math.floor(Math.random() * 4)];
          if (!(nd[0] === -dx && nd[1] === -dz)) ai.nextDir = nd;
          else ai.nextDir = ai.dir;
        } else ai.nextDir = ai.dir;
        const nd = ai.nextDir;
        const g = lanePoint(crossX, crossZ, nd, 13);
        ai.guide = { x: g.x, z: g.z, crossX, crossZ, nd };
      }
      let tx;
      let tz;
      let cruise = 10.5;
      if (ai.guide) {
        tx = ai.guide.x;
        tz = ai.guide.z;
        cruise = 7.5; // slow for the corner, steering as an arc
        if (Math.hypot(tx - car.x, tz - car.z) < 4.5) {
          ai.dir = ai.guide.nd;
          ai.guide = null;
        }
      } else {
        const ahead = lanePoint(car.x, car.z, ai.dir, 16);
        tx = ahead.x;
        tz = ahead.z;
      }
      car.seek(dt, tx, tz, cruise, allCars, this.colliders);
      // Keep traffic out of the bay and off the pier.
      if (car.z > 200 || car.x > 246) {
        car.setPos(car.x > 246 ? 240 : car.x, car.z > 200 ? 196 : car.z, car.heading + Math.PI);
        ai.dir = DIRS[Math.floor(Math.random() * 4)];
        ai.guide = null;
      }
    }
    for (const p of this.parked) {
      if (!p.parked) continue; // stolen: the driver code moves it now
      p.syncMesh();
    }
  }
}

// The point on the right-hand lane of the road through (gx, gz) heading
// along dir, `along` units past the reference point.
export function lanePoint(gx, gz, dir, along) {
  const [dx, dz] = dir;
  const rx = dz;
  const rz = -dx;
  return { x: gx + dx * along + rx * 3.4, z: gz + dz * along + rz * 3.4 };
}
