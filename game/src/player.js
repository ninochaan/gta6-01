// player.js — Rico on foot: WASD movement relative to the camera, real
// velocity tracked from position deltas, entering and leaving cars, and
// the health / armour pools.

import { buildPersonMesh } from './geometry.js';
import { collideCircle, applyShore, clampWorld } from './physics.js';
import { clamp } from './rng.js';

export const WALK_SPEED = 5.2;
export const SPRINT_SPEED = 8.6;

export class Player {
  constructor(scene) {
    this.x = 12;
    this.z = 84;
    this.heading = 0;
    this.health = 100;
    this.armour = 0;
    this.car = null;
    this.vx = 0;
    this.vz = 0;
    this.speedNow = 0;
    this.mesh = buildPersonMesh(0xc95f2e, 0x2c3844, 0xc9986a);
    this.mesh.position.set(this.x, 0, this.z);
    scene.add(this.mesh);
    this.walkCycle = 0;
  }

  teleport(x, z, heading) {
    // Teleport always lands the player ON FOOT at the target. If the
    // player was seated in a car, they step out where the car is and
    // the car stays behind at its old position — it is not carried
    // along. (Carrying the car along left the player still seated at
    // on-foot destination points, so on-foot goto steps staged by
    // teleport after a drive step could never register: the step
    // requires !player.car, and syncMesh() would also have snapped
    // an on-foot player back to the car they were still seated in.)
    if (this.car) {
      this.car = null;
      this.mesh.visible = true;
    }
    this.x = x;
    this.z = z;
    if (heading !== undefined) this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.speedNow = 0;
    this.syncMesh();
  }

  enterCar(car) {
    this.car = car;
    car.parked = false;
    this.mesh.visible = false;
    this.x = car.x;
    this.z = car.z;
  }

  exitCar(x, z) {
    const car = this.car;
    this.car = null;
    if (x === undefined && car) {
      x = car.x + Math.cos(car.heading) * 2.2;
      z = car.z - Math.sin(car.heading) * 2.2;
    }
    this.x = x || 0;
    this.z = z || 0;
    this.mesh.visible = true;
    this.syncMesh();
  }

  syncMesh() {
    if (this.car) {
      this.x = this.car.x;
      this.z = this.car.z;
      this.vx = this.car.forwardX() * this.car.speed;
      this.vz = this.car.forwardZ() * this.car.speed;
      this.speedNow = Math.abs(this.car.speed);
      return;
    }
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.walkCycle)) * 0.06, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // On-foot update. moveX/moveZ are camera-relative wish directions.
  update(dt, moveX, moveZ, sprint, colliders) {
    if (this.car) {
      this.x = this.car.x;
      this.z = this.car.z;
      this.vx = this.car.forwardX() * this.car.speed;
      this.vz = this.car.forwardZ() * this.car.speed;
      this.speedNow = Math.abs(this.car.speed);
      return;
    }
    const prevX = this.x;
    const prevZ = this.z;
    const len = Math.hypot(moveX, moveZ);
    if (len > 0.01) {
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
      const nx = moveX / len;
      const nz = moveZ / len;
      this.heading = Math.atan2(nx, nz);
      let tx = this.x + nx * speed * dt;
      let tz = this.z + nz * speed * dt;
      const shore = applyShore(tx, tz, this.x, this.z);
      const hit = collideCircle(shore.x, shore.z, 0.55, colliders);
      const cl = clampWorld(hit.x, hit.z);
      this.x = cl.x;
      this.z = cl.z;
      this.walkCycle += dt * speed * 1.6;
    }
    if (dt > 0) {
      this.vx = (this.x - prevX) / dt;
      this.vz = (this.z - prevZ) / dt;
    }
    this.speedNow = Math.hypot(this.vx, this.vz);
    this.syncMesh();
  }

  // Armour soaks 60% of incoming damage; the soaked part depletes it.
  applyDamage(amount) {
    let rest = amount;
    if (this.armour > 0) {
      const soaked = amount * 0.6;
      const used = Math.min(this.armour, soaked);
      this.armour -= used;
      rest = amount - used;
    }
    this.health -= rest;
    return this.health;
  }
}
