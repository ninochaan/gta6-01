// Traffic: AI cars that cruise the road grid in their lanes, turn at
// intersections, and slow down for the car or pedestrian ahead of them.
import * as THREE from 'three';
import { CAR_MODELS, WORLD } from './config.js';
import { clamp, groundDist, turnToward, angleDiff } from './rng.js';
import { nearestRoadCoord, resolveCollisions } from './city.js';
import { createCar } from './vehicles.js';

const ROADS = [];
for (let c = -3; c <= 3; c++) ROADS.push(c * WORLD.roadGap);

export function createTraffic(game, count) {
  const traffic = { cars: [], spawnTimer: 0 };
  for (let i = 0; i < count; i++) {
    const car = spawnTrafficCar(game, traffic);
    if (car) traffic.cars.push(car);
  }
  return traffic;
}

// Put a traffic car on a random road, heading along it, in the right lane.
export function spawnTrafficCar(game, traffic) {
  const rng = game.rng;
  const vertical = rng.chance(0.5);
  const road = rng.pick(ROADS);
  const along = rng.range(-280, 280);
  const lane = rng.chance(0.5) ? WORLD.lane : -WORLD.lane;
  const heading = vertical
    ? (lane > 0 ? 0 : Math.PI)
    : (lane > 0 ? Math.PI / 2 : -Math.PI / 2);
  const x = vertical ? road + lane : along;
  const z = vertical ? along : road + lane;
  if (z > WORLD.beachZ - 12) return null;
  if (groundDist(x, z, game.player.pos.x, game.player.pos.z) < 18) return null;
  const model = rng.pick(CAR_MODELS);
  const car = createCar(game, x, z, heading, model, rng.pick(model.colors), false);
  car.traffic = true;
  car.cruise = rng.range(9, 14);
  car.vertical = vertical;
  car.road = road;
  car.wait = 0;
  return car;
}

function carAhead(game, car, dist) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let nearest = Infinity;
  for (const other of game.cars) {
    if (other === car) continue;
    const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < dist && side < 2.4) nearest = Math.min(nearest, along);
  }
  for (const ped of game.peds.list) {
    const dx = ped.pos.x - car.pos.x, dz = ped.pos.z - car.pos.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < dist && side < 2.2) nearest = Math.min(nearest, along);
  }
  return nearest;
}

export function updateTraffic(game, dt) {
  const traffic = game.traffic;
  for (const car of traffic.cars) {
    if (car.isPlayer || car.isPolice) continue;
    // Slow for whatever is ahead, stop for what is close.
    const ahead = carAhead(game, car, 22);
    let target = car.cruise;
    if (ahead < 8) target = 0;
    else if (ahead < 18) target = car.cruise * 0.35;
    car.speed += (target - car.speed) * Math.min(1, dt * 2.5);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;

    // At an intersection, sometimes turn onto the crossing road.
    const onRoadX = Math.abs(car.pos.x - nearestRoadCoord(car.pos.x)) < 2;
    const onRoadZ = Math.abs(car.pos.z - nearestRoadCoord(car.pos.z)) < 2;
    if (onRoadX && onRoadZ && game.rng.chance(dt * 0.5)) {
      const turn = game.rng.pick([-Math.PI / 2, Math.PI / 2]);
      car.heading += turn;
      car.vertical = !car.vertical;
      const lane = game.rng.chance(0.5) ? WORLD.lane : -WORLD.lane;
      if (car.vertical) car.pos.x = nearestRoadCoord(car.pos.x) + lane;
      else car.pos.z = nearestRoadCoord(car.pos.z) + lane;
      car.heading = Math.round(car.heading / (Math.PI / 2)) * (Math.PI / 2);
    }
    // Wrap around the far edge so the streets never run dry.
    if (car.pos.x > 310 || car.pos.x < -310 || car.pos.z > 290 || car.pos.z < -310) {
      car.heading += Math.PI;
      car.pos.x = clamp(car.pos.x, -300, 300);
      car.pos.z = clamp(car.pos.z, -300, 280);
    }
    resolveCollisions(car.pos, 1.4, game.city.colliders);
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    const spin = car.speed * dt * 2.8;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  }
  // Keep the streets full: replace cars that were stolen or wrecked.
  traffic.spawnTimer -= dt;
  if (traffic.spawnTimer <= 0) {
    traffic.spawnTimer = 3;
    const alive = traffic.cars.filter((c) => !c.isPlayer && !c.stolen).length;
    if (alive < 14) {
      const car = spawnTrafficCar(game, traffic);
      if (car) traffic.cars.push(car);
    }
  }
}
