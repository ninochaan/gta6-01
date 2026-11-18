// vehicles.js — car factory plus the traffic system. Cars are merged
// vertex-coloured bodies with separate brake-light and headlight meshes (so
// braking can glow), arcade physics, and lane-following traffic AI that
// queues at intersections and brakes for anything in its path.

import * as THREE from '../vendor/three.min.js';
import { ColorBucket } from './geometry.js';
import { collideCircle, clampToWorld } from './physics.js';
import { ROAD_LINES, BOULEVARD_Z, WORLD_EDGE } from './city.js';

export const CAR_COLORS = [0xe4572e, 0x2e7f86, 0xf2f2ea, 0xe39a2d, 0x3c6ec9, 0xc94f7c, 0x7a4a8c, 0x4d9a51, 0xd8d3c3, 0x37474f];
let carSeq = 0;

export function createCar(scene, color, opts = {}) {
  const b = new ColorBucket();
  const isTaxi = opts.taxi === true;
  const isPolice = opts.police === true;
  const body = isPolice ? 0xf2f2ea : color;
  b.box(0, 0.55, 0, 1.8, 0.55, 4.3, body);                    // lower body
  b.box(0, 0.95, -0.25, 1.7, 0.5, 2.2, isPolice ? 0x22242c : body); // cabin band
  b.box(0, 1.02, -0.25, 1.5, 0.42, 2.0, 0x9fd4de);            // glasshouse
  b.box(0, 1.28, -0.25, 1.62, 0.1, 2.1, body);                // roof
  b.box(0, 0.38, 2.18, 1.84, 0.34, 0.14, 0x2b2b30);           // bumpers
  b.box(0, 0.38, -2.18, 1.84, 0.34, 0.14, 0x2b2b30);
  if (isPolice) { b.box(0, 0.62, 0.4, 1.82, 0.4, 1.6, 0x22242c); b.box(0, 0.62, -1.5, 1.82, 0.4, 0.9, 0x22242c); }
  if (isTaxi) b.box(0, 1.42, -0.25, 0.7, 0.22, 0.4, 0xffd23a);
  // wheels (dark boxes read fine at speed and cost nothing)
  for (const [wx, wz] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]])
    b.box(wx, 0.34, wz, 0.28, 0.68, 0.68, 0x1c1c20);
  const mesh = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  // headlights + brake lights as small basic-material planes
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.06), headMat);
  head.position.set(0, 0.62, 2.24); group.add(head);
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x5a0f08 });
  const brake = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.06), brakeMat);
  brake.position.set(0, 0.62, -2.24); group.add(brake);
  let lightbar = null;
  if (isPolice) {
    lightbar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    red.position.x = -0.32;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.x = 0.32;
    lightbar.add(red); lightbar.add(blue);
    lightbar.position.set(0, 1.44, -0.25);
    group.add(lightbar);
  }
  scene.add(group);
  const car = {
    id: carSeq++, group, mesh, brakeMat, lightbar,
    x: 0, z: 0, heading: 0, speed: 0, steer: 0,
    isPolice, isTaxi, parked: false, driver: null, dead: false,
    radius: 1.7, health: 100, color: body,
    ai: null, bustTimer: 0,
    setPos(x, z, heading) { this.x = x; this.z = z; this.heading = heading; this.sync(); },
    sync() {
      this.group.position.set(this.x, 0, this.z);
      this.group.rotation.y = this.heading;
    },
    setBraking(on) { this.brakeMat.color.setHex(on ? 0xff2214 : 0x5a0f08); },
  };
  group.userData.car = car;
  return car;
}

// Arcade car step shared by the player, traffic and police.
export function stepCar(car, throttle, steer, dt, colliders, opts = {}) {
  const maxF = opts.maxSpeed ?? 33, maxR = 10;
  const accel = car.speed < maxF ? 13.5 : 0;
  if (throttle > 0) car.speed += accel * throttle * dt * (1 - car.speed / (maxF + 14));
  else if (throttle < 0) {
    if (car.speed > 0.4) { car.speed -= 26 * dt; car.setBraking(true); }
    else car.speed = Math.max(-maxR, car.speed - 9 * dt);
  } else {
    car.speed -= car.speed * 0.55 * dt;                       // engine drag
    if (Math.abs(car.speed) < 0.04) car.speed = 0;
  }
  if (throttle >= 0) car.setBraking(false);
  const grip = opts.handbrake ? 0.45 : 1;
  if (opts.handbrake) { car.speed -= car.speed * 1.4 * dt; car.setBraking(true); }
  const steerAuthority = steer * 0.62 * grip / (1 + Math.abs(car.speed) * 0.055);
  if (Math.abs(car.speed) > 0.05) car.heading += steerAuthority * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 6 + 0.25) * 2.2;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  car.x += fx * car.speed * dt;
  car.z += fz * car.speed * dt;
  const res = collideCircle(colliders, car.x, car.z, car.radius);
  if (res.hit) { car.x = res.x; car.z = res.z; car.speed *= 0.45; }
  clampToWorld(car, WORLD_EDGE);
  if (car.z > 238) car.z = 238;                               // the sea is not a road
  car.sync();
  return res.hit;
}

// Lane helpers: traffic drives on the right; lanes sit 3.1 from the centre line.
export function laneCoord(line, dirSign) { return line + dirSign * 3.1; }

export class TrafficSystem {
  constructor(scene, rng, colliders) {
    this.scene = scene; this.rng = rng; this.colliders = colliders;
    this.cars = [];
    this.parked = [];
    for (let i = 0; i < 14; i++) this.spawnTraffic(true);
    this.spawnParkedSet(rng);
  }
  spawnTraffic(anywhere = false) {
    const rng = this.rng;
    const vertical = rng.chance(0.5);
    // east-west traffic uses the grid avenues only (never the beach line)
    const line = vertical ? rng.pick(ROAD_LINES) : rng.pick(ROAD_LINES.slice(0, 6));
    const dir = rng.chance(0.5) ? 1 : -1;
    const along = anywhere ? rng.range(-220, 180) : (dir > 0 ? -230 : 190);
    const car = createCar(this.scene, rng.pick(CAR_COLORS), { taxi: rng.chance(0.14) });
    car.driver = 'traffic';
    car.ai = { axis: vertical ? 'z' : 'x', line, dir, cruise: rng.range(9, 13.5), turnCooldown: 0 };
    if (vertical) car.setPos(laneCoord(line, dir), along, dir > 0 ? 0 : Math.PI);
    else car.setPos(along, laneCoord(line, -dir), dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.cars.push(car);
    return car;
  }
  spawnParkedSet(rng) {
    const spots = [
      [-69.5, -40, 0], [69.5, 30, Math.PI], [-145.5, 90, 0], [145.5, -90, Math.PI], [8, -69.5, Math.PI / 2],
      [-8, 69.5, -Math.PI / 2], [221.5, -20, 0], [-221.5, 120, Math.PI], [80, 188.5, Math.PI / 2], [-60, 188.5, Math.PI / 2],
      [-69.5, 150, 0], [152 - 7, -160, Math.PI], [30, -221.5, Math.PI / 2], [-160, 221.5 - 76, 0], [100, 8, Math.PI / 2], [-100, -8, -Math.PI / 2],
    ];
    for (const [x, z, h] of spots) {
      const car = createCar(this.scene, rng.pick(CAR_COLORS), {});
      car.parked = true; car.driver = null;
      car.setPos(x, z, h);
      this.parked.push(car);
    }
  }
  // One AI tick for a traffic car; staggered by main loop across frames.
  updateCar(car, dt, ctx) {
    const ai = car.ai;
    if (!ai || car.dead) return;
    ai.turnCooldown -= dt;
    // desired heading along the lane
    let targetHeading = ai.axis === 'z' ? (ai.dir > 0 ? 0 : Math.PI) : (ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    // v3 arc turns: a decision is taken ~9 units BEFORE the crossing line and
    // the car then steers at a guide point on the exit lane, so it sweeps
    // through the junction on the road instead of snapping sideways.
    const along = ai.axis === 'z' ? car.z : car.x;
    if (ai.turnKey && Math.abs(along - (ai.turnKeyLine ?? 0)) > 30) ai.turnKey = null;
    if (!ai.turn && ai.turnCooldown <= 0) {
      for (const l of ROAD_LINES) {
        const aheadDist = (l - along) * ai.dir;
        if (aheadDist < 5 || aheadDist > 12) continue;
        const key = `${ai.axis}|${l}|${ai.dir}`;
        if (ai.turnKey === key) continue;
        ai.turnKey = key; ai.turnKeyLine = l;
        if (!this.rng.chance(0.4)) continue;
        const newDir = this.rng.chance(0.5) ? 1 : -1;
        if (ai.axis === 'z') {
          ai.turn = { axis: 'x', line: l, dir: newDir, guideX: ai.line + newDir * 13, guideZ: laneCoord(l, -newDir), t: 0 };
        } else {
          ai.turn = { axis: 'z', line: l, dir: newDir, guideX: laneCoord(l, newDir), guideZ: ai.line + newDir * 13, t: 0 };
        }
        break;
      }
    }
    if (!ai.turn && ai.axis === 'z' && car.z > 186) { // swing onto the boulevard
      const dir = car.x > 0 ? -1 : 1;
      ai.turn = { axis: 'x', line: BOULEVARD_Z, dir, guideX: car.x + dir * 13, guideZ: laneCoord(BOULEVARD_Z, -dir), t: 0 };
    }
    if (!ai.turn && ai.axis === 'z' && car.z < -238) { // north edge: arc onto the top avenue
      const dir = this.rng.chance(0.5) ? 1 : -1;
      ai.turn = { axis: 'x', line: -228, dir, guideX: ai.line + dir * 13, guideZ: laneCoord(-228, -dir), t: 0 };
    }
    if (ai.turn) {
      const tr = ai.turn;
      tr.t += dt;
      targetHeading = Math.atan2(tr.guideX - car.x, tr.guideZ - car.z);
      const newHeading = tr.axis === 'z' ? (tr.dir > 0 ? 0 : Math.PI) : (tr.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const passed = ai.axis === 'z' ? (car.z - tr.line) * ai.dir > 0 : (car.x - tr.line) * ai.dir > 0;
      const aligned = Math.abs(wrapAngle(newHeading - car.heading)) < 0.3;
      const atGuide = Math.hypot(tr.guideX - car.x, tr.guideZ - car.z) < 3.5;
      if ((aligned && passed) || atGuide || tr.t > 7) {
        ai.axis = tr.axis; ai.line = tr.line; ai.dir = tr.dir;
        ai.turn = null; ai.turnCooldown = 4;
        targetHeading = newHeading;
      }
    }
    // obstacle scan: anything slow or stopped ahead in the lane
    let want = ai.cruise;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const ahead = (ox, oz, r) => {
      const dx = ox - car.x, dz = oz - car.z;
      const fwd = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      return fwd > 0 && fwd < r && side < 2.2;
    };
    for (const other of ctx.allCars) {
      if (other === car || other.dead) continue;
      if (ahead(other.x, other.z, 10)) { want = Math.min(want, Math.max(0, (Math.hypot(other.x - car.x, other.z - car.z) - 5.5) * 1.6)); }
    }
    if (ctx.playerCar && ctx.playerCar !== car && ahead(ctx.playerCar.x, ctx.playerCar.z, 10)) want = 0.5;
    if (!ctx.playerInCar && ahead(ctx.playerPos.x, ctx.playerPos.z, 7)) want = 0;
    for (const p of ctx.peds) { if (!p.dead && ahead(p.x, p.z, 7)) { want = 0; break; } }
    if (ai.turn) want = Math.min(want, 6); // junctions are taken slowly
    // boulevard is a through road; grid cars yield when crossing it busy
    let throttle = 0, steer = 0;
    const diff = wrapAngle(targetHeading - car.heading);
    steer = clamp(diff * 1.6, -1, 1);
    if (car.speed < want) throttle = 0.75; else if (car.speed > want + 1.5) throttle = -0.55;
    if (want <= 0.1 && car.speed < 0.4) { throttle = 0; car.setBraking(true); }
    stepCar(car, throttle, steer, dt, this.colliders, { maxSpeed: 15 });
    // keep the lane centred gently (suspended mid-turn: the arc owns the car)
    if (!ai.turn) {
      if (ai.axis === 'z') car.x += (laneCoord(ai.line, ai.dir) - car.x) * Math.min(1, dt * 1.4);
      else car.z += (laneCoord(ai.line, -ai.dir) - car.z) * Math.min(1, dt * 1.4);
    }
    car.sync();
    // despawn far traffic and respawn near the edges to keep streets alive
    const d = Math.hypot(car.x - ctx.playerPos.x, car.z - ctx.playerPos.z);
    if (d > 330) {
      const fresh = this.spawnTraffic(false);
      fresh.ai.axis = ai.axis; fresh.ai.line = ai.line;
      this.removeCar(car);
    }
  }
  removeCar(car) {
    car.dead = true;
    this.scene.remove(car.group);
    const i = this.cars.indexOf(car); if (i >= 0) this.cars.splice(i, 1);
    const j = this.parked.indexOf(car); if (j >= 0) this.parked.splice(j, 1);
  }
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
