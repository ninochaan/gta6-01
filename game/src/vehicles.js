// Cars: box-built models in several shapes and colours, parked cars to steal,
// the player's driving physics, and simple car-to-car bumps.
import * as THREE from 'three';
import { CAR_MODELS, PRIZE_CAR } from './config.js';
import { clamp, turnToward, groundDist } from './rng.js';
import { resolveCollisions } from './city.js';

// Build one car mesh from boxes: body, cabin, wheels, lights and a roof sign
// for taxis. Returns the group; wheels are kept for a spin animation.
export function buildCarMesh(model, color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(model.wid, model.h * 0.55, model.len), bodyMat);
  body.position.y = model.h * 0.45;
  body.castShadow = true;
  g.add(body);
  const cabinH = model.h * 0.5;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(model.wid * 0.85, cabinH, model.len * 0.5), glassMat);
  cabin.position.set(0, model.h * 0.75 + cabinH / 2, -model.len * 0.05);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx * (model.wid / 2), 0.36, wz * model.len * 0.32);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const s of [-1, 1]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), lightMat);
    light.position.set(s * model.wid * 0.3, model.h * 0.5, model.len / 2 + 0.02);
    g.add(light);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xc01818 });
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), tailMat);
    tail.position.set(s * model.wid * 0.3, model.h * 0.5, -model.len / 2 - 0.02);
    g.add(tail);
  }
  if (model.id === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe018 }));
    sign.position.set(0, model.h * 1.35, 0);
    g.add(sign);
  }
  g.userData.wheels = wheels;
  return g;
}

export function createCar(game, x, z, heading, model, color, parked) {
  const mesh = buildCarMesh(model, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  game.scene.add(mesh);
  const car = {
    mesh, model, color,
    pos: new THREE.Vector3(x, 0, z),
    heading,
    speed: 0,
    steer: 0,
    parked: !!parked,
    isPlayer: false,
    isPolice: false,
    driver: null,       // a pedestrian mesh when a traffic car has a driver
    health: 100,
    stuck: 0,
  };
  game.cars.push(car);
  return car;
}

// The player's car: accelerate, brake, reverse, steer harder at low speed,
// scrape along buildings instead of passing through them.
export function updatePlayerCar(car, input, dt, game) {
  const m = car.model;
  let throttle = 0;
  if (input.keys['KeyW'] || input.keys['ArrowUp']) throttle = 1;
  if (input.keys['KeyS'] || input.keys['ArrowDown']) throttle = -1;
  let steer = 0;
  if (input.keys['KeyA'] || input.keys['ArrowLeft']) steer = 1;
  if (input.keys['KeyD'] || input.keys['ArrowRight']) steer = -1;
  const braking = throttle < 0 && car.speed > 0.5;
  if (throttle > 0) car.speed += m.accel * dt;
  else if (throttle < 0) car.speed += (braking ? -26 : -9) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  if (car.speed > m.top) car.speed = m.top;
  if (car.speed < -12) car.speed = -12;
  const steerAmount = steer * m.grip * clamp(Math.abs(car.speed) / 10, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.heading += steerAmount * dt * (car.speed >= 0 ? 1 : -1) * 0.9;
  car.steer += (steer - car.steer) * Math.min(1, dt * 8);
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  const trial = { x: nx, z: nz };
  const hitWall = resolveCollisions(trial, 1.4, game.city.colliders);
  if (hitWall && Math.abs(car.speed) > 6) {
    game.audio.crash();
    game.hud.flashDamage();
    car.speed *= 0.35;
  } else if (hitWall) {
    car.speed *= 0.5;
  }
  car.pos.x = trial.x;
  car.pos.z = trial.z;
  // Bump other cars: push apart and trade a little speed.
  for (const other of game.cars) {
    if (other === car || other.parked) continue;
    const d = groundDist(car.pos.x, car.pos.z, other.pos.x, other.pos.z);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      const dx = (car.pos.x - other.pos.x) / d, dz = (car.pos.z - other.pos.z) / d;
      car.pos.x += dx * push; car.pos.z += dz * push;
      other.pos.x -= dx * push; other.pos.z -= dz * push;
      if (Math.abs(car.speed) > 8) { game.audio.crash(); car.speed *= 0.7; }
    }
  }
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt * 2.8;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  game.audio.setEngine(clamp(Math.abs(car.speed) / m.top, 0, 1));
}

// Find the nearest car the player could steal, within reach on foot.
export function nearestStealableCar(game, maxDist) {
  let best = null, bestD = maxDist;
  for (const car of game.cars) {
    if (car.isPlayer) continue;
    const d = groundDist(game.player.pos.x, game.player.pos.z, car.pos.x, car.pos.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

// The prize car for the final mission: gold coupe waiting at the harbor.
export function spawnPrizeCar(game, x, z, heading) {
  const car = createCar(game, x, z, heading, CAR_MODELS.find((m) => m.id === PRIZE_CAR.id), PRIZE_CAR.color, true);
  car.prize = true;
  return car;
}
