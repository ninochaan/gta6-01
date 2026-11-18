// shots.js — the four staged states (?shot=chase|drive|foot|garage)
// that screenshot tooling renders, plus the ?demo=1 autopilot that
// walks and drives Rico around on his own for smoke checks.

import { dist2d } from './rng.js';

// Stage a deterministic scene. env gives main's helpers so this module
// never reaches into the boot code directly.
export function applyShot(name, H, env) {
  const { hud } = env;
  H.playing = true;
  if (name === 'chase') {
    const car = env.grabParkedCar(0, 0, Math.PI / 2);
    car.setPos(0, 0, Math.PI / 2);
    car.speed = 16;
    car.health = 82;
    H.player.enterCar(car);
    H.cameraYaw = -Math.PI / 2;
    H.cameraPitch = 0.3;
    H.cruise = true;
    H.wanted.setStars(3, H.now);
    const a = H.police.spawnCop(27, 4.5);
    a.heading = Math.PI / 2;
    a.speed = 11;
    const b = H.police.spawnCop(-13, -5);
    b.heading = Math.PI / 2;
    b.speed = 15;
    hud.banner('CHASE — lose the Solmar Bay PD!');
    return true;
  }
  if (name === 'drive') {
    const car = env.grabParkedCar(-120, -224, Math.PI / 2);
    car.setPos(-120, -224, Math.PI / 2);
    car.speed = 13;
    H.player.enterCar(car);
    H.cameraYaw = -Math.PI / 2;
    H.cameraPitch = 0.34;
    H.cruise = true;
    hud.banner('Beachfront Boulevard — palms, sea and open road.');
    return true;
  }
  if (name === 'foot') {
    H.player.teleport(60, 58, 0.6);
    H.cameraYaw = 0.7;
    H.cameraPitch = 0.34;
    H.wanted.setStars(2, H.now);
    const car = H.police.spawnCop(66, 52);
    car.speed = 0;
    car.heading = 2.4;
    H.police.spawnOfficer(52, 50, 1, car);
    H.police.spawnOfficer(68, 48, 1, car);
    H.police.spawnOfficer(71, 55, 1, null);
    H.police.bust = 0.45;
    hud.banner('Downtown — the law is closing in!');
    return true;
  }
  if (name === 'garage') {
    const car = env.grabParkedCar(-54, 86, Math.PI);
    car.setPos(-54, 86, Math.PI);
    car.speed = 0;
    car.health = 42;
    H.player.enterCar(car);
    H.cameraYaw = 0;
    H.cameraPitch = 0.3;
    hud.banner("Tito's Garage — the best wrenches in Solmar Bay.");
    return true;
  }
  return false;
}

// A simple autopilot: stroll to a point, steal a car, drive a loop,
// get out, repeat. Returns control overrides for the main loop.
export class DemoAutopilot {
  constructor() {
    this.mode = 'walk';
    this.target = { x: 30, z: 130 };
    this.timer = 0;
    this.carTimer = 0;
  }

  update(dt, H) {
    this.timer += dt;
    const out = { moveX: 0, moveZ: 0, sprint: false, throttle: 0, steer: 0, enter: false, exit: false };
    const px = H.player.x;
    const pz = H.player.z;
    if (this.mode === 'walk') {
      const d = dist2d(px, pz, this.target.x, this.target.z);
      if (d < 3 || this.timer > 25) {
        // Find a car and take it.
        let best = null;
        let bestD = Infinity;
        for (const c of H.allCars) {
          if (c.isPolice) continue;
          const cd = dist2d(px, pz, c.x, c.z);
          if (cd < bestD) {
            bestD = cd;
            best = c;
          }
        }
        if (best && bestD < 3.4) {
          out.enter = true;
          this.mode = 'drive';
          this.carTimer = 0;
          this.target = { x: -this.target.x * 0.6, z: -this.target.z * 0.6 };
        } else if (best) {
          this.target = { x: best.x, z: best.z };
        }
        this.timer = 0;
      }
      const ang = Math.atan2(this.target.x - px, this.target.z - pz);
      out.moveX = Math.sin(ang);
      out.moveZ = Math.cos(ang);
      out.sprint = d > 25;
      // The camera view forward is cameraYaw + PI in (sin, cos)
      // terms, so the camera trails behind the walk direction.
      H.cameraYaw = ang + Math.PI;
    } else {
      this.carTimer += dt;
      const car = H.player.car;
      if (!car) {
        this.mode = 'walk';
        this.timer = 0;
        this.target = { x: 16, z: 96 };
        return out;
      }
      const ang = Math.atan2(this.target.x - px, this.target.z - pz);
      const diff = ((ang - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      out.steer = Math.max(-1, Math.min(1, diff * 1.4));
      out.throttle = Math.abs(diff) > 1.2 ? 0.25 : 0.75;
      H.cameraYaw = car.heading + Math.PI;
      if (dist2d(px, pz, this.target.x, this.target.z) < 10 || this.carTimer > 30) {
        out.exit = true;
        this.mode = 'walk';
        this.timer = 0;
        this.target = { x: 120, z: -120 };
      }
    }
    return out;
  }
}
