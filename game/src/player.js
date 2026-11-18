// player.js — Rico Marrero: third-person on-foot movement with a mouse-orbit
// camera, entering and stealing cars, arcade driving with a smoothed chase
// camera, run-over and car-to-car contact, and health/damage feedback.
// v4: Rico can wear a vest — an armour pool (bought at Tienda Brisa) that
// soaks 60% of incoming damage until it is shot away, shown on the HUD.
// v4 also fixes the shoreline clamp so the marina pier deck can actually
// be walked on (it was capped at the waterline and unreachable).

import * as THREE from '../vendor/three.min.js';
import { buildPerson } from './geometry.js';
import { collideCircle, clampToWorld } from './physics.js';
import { stepCar, wrapAngle, clamp } from './vehicles.js';
import { WORLD_EDGE } from './city.js';

export class Player {
  constructor(scene, colliders, audio) {
    this.colliders = colliders; this.audio = audio;
    this.group = buildPerson(THREE, { skin: 0xc98a5a, shirt: 0xff7847, pants: 0x283593, hat: 0x22242c });
    scene.add(this.group);
    this.x = -38; this.z = 132; this.heading = Math.PI;
    this.health = 100; this.maxHealth = 100;
    this.armour = 0; this.maxArmour = 100;   // v4 vest pool, bought at the shop
    this.car = null;                 // car being driven, or null on foot
    this.speed = 0;                  // on-foot speed (for camera/FOV feel)
    this.deadT = 0;
    this.camPos = new THREE.Vector3(-38, 4, 140);
    this.hornCd = 0;
    this._prevX = this.x; this._prevZ = this.z;
    this._velX = 0; this._velZ = 0;
  }
  get pos() { return this.car ? { x: this.car.x, z: this.car.z } : { x: this.x, z: this.z }; }
  get vel() {
    if (this.car) return { x: Math.sin(this.car.heading) * this.car.speed, z: Math.cos(this.car.heading) * this.car.speed };
    return { x: this._velX, z: this._velZ };
  }
  get speedAbs() { return this.car ? Math.abs(this.car.speed) : this.speed; }
  teleport(x, z, heading = 0) {
    if (this.car) this.exitCar(x, z);
    this.x = x; this.z = z; this.heading = heading;
    this._prevX = x; this._prevZ = z; this._velX = 0; this._velZ = 0;
    this.syncMesh();
  }
  syncMesh() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    this.group.visible = !this.car;
  }
  enterCar(car) {
    this.car = car;
    car.driver = 'player';
    car.parked = false;
    this.group.visible = false;
  }
  exitCar(px, pz) {
    const car = this.car;
    if (!car) return null;
    car.driver = car.wasTraffic ? 'traffic' : null;
    this.car = null;
    // step out beside the driver's door
    const sx = car.x + Math.cos(car.heading) * -1.8, sz = car.z - Math.sin(car.heading) * -1.8;
    this.x = px !== undefined ? px : sx; this.z = pz !== undefined ? pz : sz;
    const res = collideCircle(this.colliders, this.x, this.z, 0.45);
    this.x = res.x; this.z = res.z;
    this.heading = car.heading;
    this.syncMesh();
    return car;
  }
  hurt(amount, G) {
    if (this.car) amount *= 0.45;                    // the car soaks some of it
    if (this.armour > 0) {                           // v4: the vest eats 60% until it is gone
      const soaked = Math.min(this.armour, amount * 0.6);
      this.armour -= soaked;
      amount -= soaked;
    }
    this.health -= amount;
    G.hud.hurt();
    this.audio.thud();
    if (this.health <= 0 && !this.deadT) { this.health = 0; this.deadT = 0.01; }
  }
  heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }

  update(dt, G) {
    const input = G.input, edges = G.edges;
    this.hornCd -= dt;
    if (this.car) this.updateDriving(dt, G);
    else this.updateOnFoot(dt, G);
    this.updateCamera(dt, G);
  }

  updateOnFoot(dt, G) {
    const input = G.input;
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const fwd = input.axis('KeyS', 'KeyW'), side = input.axis('KeyA', 'KeyD');
    const yaw = G.cameraYaw;
    let mx = 0, mz = 0;
    if (fwd || side) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      mx = fx * fwd + rx * side; mz = fz * fwd + rz * side;
      const len = Math.hypot(mx, mz) || 1; mx /= len; mz /= len;
      this.heading = Math.atan2(mx, mz);
    }
    const target = (fwd || side) ? (run ? 8.6 : 5.2) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);
    const prevX = this.x, prevZ = this.z;
    this.x += mx * this.speed * dt;
    this.z += mz * this.speed * dt;
    const res = collideCircle(this.colliders, this.x, this.z, 0.45);
    this.x = res.x; this.z = res.z;
    // smoothed on-foot velocity, so police intercept leads a runner properly
    if (dt > 0.0001) {
      const rawX = (this.x - prevX) / dt, rawZ = (this.z - prevZ) / dt;
      const blend = Math.min(1, dt * 9);
      this._velX += (rawX - this._velX) * blend;
      this._velZ += (rawZ - this._velZ) * blend;
    }
    this._prevX = this.x; this._prevZ = this.z;
    clampToWorld(this, WORLD_EDGE);
    // the shoreline stops Rico at z=237 — EXCEPT on the marina pier deck
    // (x 149–167), which runs out to z=284 over the water. v4 fix: the old
    // unconditional 237 clamp made the pier, its mission meeting and its
    // hidden package unreachable on foot; the deck-strip check below it
    // was dead code.
    const onPier = this.x > 149 && this.x < 167;
    if (this.z > (onPier ? 284 : 237)) this.z = onPier ? 284 : 237;
    this.group.position.set(this.x, Math.abs(Math.sin(performance.now() * 0.011)) * (this.speed > 0.4 ? 0.05 : 0), this.z);
    this.group.rotation.y = this.heading;
  }

  updateDriving(dt, G) {
    const input = G.input, car = this.car;
    const throttle = input.axis('KeyS', 'KeyW');
    const steer = input.axis('KeyD', 'KeyA'); // note: stepCar steers heading by +steer
    const handbrake = input.down('Space');
    // a beaten-up car loses its top end: limping at zero health, hobbled low
    const healthScale = car.health <= 0 ? 0.12 : (car.health < 35 ? 0.55 : 1);
    const hit = stepCar(car, throttle, -steer, dt, this.colliders, { handbrake, maxSpeed: 34 * healthScale });
    if (hit && Math.abs(car.speed) > 6) {
      this.audio.crash(); G.onPlayerCrash(car);
      car.health = Math.max(0, car.health - 6);
    }
    if (G.edges.pressed.has('KeyH') && this.hornCd <= 0) { this.audio.horn(); this.hornCd = 0.4; G.peds.startle(car.x, car.z, 9); }
    // car-to-car contact: shove, dent, and remember hitting the law
    for (const other of G.allCars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.1 && d > 0.001) {
        const push = (3.1 - d) / 2;
        other.x += (dx / d) * push; other.z += (dz / d) * push;
        car.x -= (dx / d) * push; car.z -= (dz / d) * push;
        other.sync(); car.sync();
        if (Math.abs(car.speed) > 5) {
          other.health -= Math.abs(car.speed) * 1.6;
          car.health = Math.max(0, car.health - 2.5);
          this.audio.crash();
          if (other.isPolice) G.reportCrime('hitPolice', other.x, other.z);
          car.speed *= 0.55;
        }
      }
    }
    // running someone down is fast, loud and very illegal
    if (Math.abs(car.speed) > 3.5) {
      for (const p of [...G.peds.peds]) {
        if (p.dead || p.isPassenger) continue;
        if (Math.hypot(p.x - car.x, p.z - car.z) < 1.75) {
          G.peds.kill(p);
          this.audio.thud();
          G.reportCrime('runOver', p.x, p.z);
          car.speed *= 0.82;
        }
      }
      if (G.police && G.police.officers) {
        for (const off of [...G.police.officers]) {
          if (off.dead) continue;
          if (Math.hypot(off.x - car.x, off.z - car.z) < 1.75) {
            G.police.killOfficer(off);
            this.audio.thud();
            G.reportCrime('runOver', off.x, off.z);
            car.speed *= 0.82;
          }
        }
      }
    }
    this.audio.setEngine(Math.abs(car.speed) / 34, true);
  }

  updateCamera(dt, G) {
    const p = this.pos;
    const inCar = !!this.car;
    const dist = G.camDistOverride || (inCar ? 9.2 : 5.4);
    const height = inCar ? 3.4 : 2.3;
    const pitch = G.cameraPitch;
    const yaw = G.cameraYaw;
    const tx = p.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const tz = p.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    const ty = height + Math.sin(pitch) * dist * 0.7 + (inCar ? 0 : 0.6);
    const smooth = inCar ? 1 - Math.pow(0.0001, dt) : 1 - Math.pow(0.0000001, dt);
    this.camPos.x += (tx - this.camPos.x) * Math.min(1, smooth);
    this.camPos.y += (ty - this.camPos.y) * Math.min(1, smooth * 1.4);
    this.camPos.z += (tz - this.camPos.z) * Math.min(1, smooth);
    const res = collideCircle(this.colliders, this.camPos.x, this.camPos.z, 0.5);
    this.camPos.x = res.x; this.camPos.z = res.z;
    if (this.camPos.y < 0.7) this.camPos.y = 0.7;
    G.camera.position.copy(this.camPos);
    G.camera.lookAt(p.x, 1.5 + (inCar ? 0.4 : 0.2), p.z);
  }
}
