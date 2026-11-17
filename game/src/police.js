// The wanted system and the police who answer it: patrol cruisers that chase
// and ram, foot cops who run the player down, BUSTED on capture, and a wanted
// level that cools off when the player stays out of sight.
import * as THREE from 'three';
import { WANTED_TABLE, WORLD } from './config.js';
import { clamp, groundDist, turnToward } from './rng.js';
import { createCar } from './vehicles.js';
import { resolveCollisions } from './city.js';

export function createPolice(game) {
  return {
    cruisers: [],
    cops: [],
    decayTimer: 0,
    bustedTimer: 0,
    spawnTimer: 0,
    sirenOn: false,
  };
}

export function addWanted(game, stars) {
  game.wanted = clamp(game.wanted + stars, 0, WORLD.maxWanted);
  game.police.decayTimer = 25;
  if (game.wanted > 0) {
    game.audio.startSiren();
    game.police.sirenOn = true;
  }
  game.hud.updateStars();
}

export function setWanted(game, stars) {
  game.wanted = clamp(stars, 0, WORLD.maxWanted);
  game.police.decayTimer = 25;
  if (game.wanted > 0) game.audio.startSiren();
  game.hud.updateStars();
}

function buildPoliceCar(game, x, z, heading) {
  const model = { id: 'cruiser', name: 'Police Cruiser', len: 4.8, wid: 2.0, h: 1.4, top: 36, accel: 20, grip: 3.0, colors: [0x1a1a1a] };
  const car = createCar(game, x, z, heading, model, 0x1a1a1a, false);
  car.isPolice = true;
  car.cruise = 30;
  // White doors and a flashing light bar.
  const doorMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 1.4), doorMat);
    door.position.set(s * (model.wid / 2 + 0.01), 0.7, 0);
    car.mesh.add(door);
  }
  const bar = new THREE.Group();
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  red.position.x = -0.35;
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
  blue.position.x = 0.35;
  bar.add(red); bar.add(blue);
  bar.position.set(0, 1.75, 0);
  car.mesh.add(bar);
  car.lightBar = { red, blue };
  car.flash = Math.random() * 2;
  return car;
}

// Build one cruiser and add it to the active response. An anchored cruiser is
// a staged one: it holds its lane and paces the player (or sits parked with
// its light bar flashing when the player is on foot) instead of chasing.
export function spawnPoliceCruiser(game, x, z, heading, anchor) {
  const car = buildPoliceCar(game, x, z, heading);
  car.shotAnchor = !!anchor;
  game.police.cruisers.push(car);
  return car;
}

function buildFootCop(game, x, z) {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.4), navy);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.82;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 8), navy);
  cap.position.y = 2.05;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.75, 0.28), navy);
  legL.position.set(-0.19, 0.38, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.19;
  g.add(legR);
  g.position.set(x, 0, z);
  game.scene.add(g);
  return { group: g, legL, legR, pos: new THREE.Vector3(x, 0, z), heading: 0, walkPhase: 0, grabTimer: 0 };
}

export function updatePolice(game, dt) {
  const police = game.police;
  const player = game.player;
  const wanted = game.wanted;

  // Wanted cools off when the player commits no crime and no police is near.
  if (wanted > 0) {
    police.decayTimer -= dt;
    const near = police.cruisers.some((c) => groundDist(c.pos.x, c.pos.z, player.pos.x, player.pos.z) < 30)
      || police.cops.some((c) => groundDist(c.pos.x, c.pos.z, player.pos.x, player.pos.z) < 30);
    if (police.decayTimer <= 0 && !near) {
      game.wanted = wanted - 1;
      police.decayTimer = 25;
      game.hud.updateStars();
      game.hud.showMessage('The heat is cooling off…');
      if (game.wanted === 0) { game.audio.stopSiren(); police.sirenOn = false; }
    }
  }

  // Keep the response matched to the wanted level.
  police.spawnTimer -= dt;
  if (police.spawnTimer <= 0) {
    police.spawnTimer = 1.5;
    const want = WANTED_TABLE[wanted];
    while (police.cruisers.length < want.cruisers) {
      const a = game.rng.range(0, Math.PI * 2);
      const d = game.rng.range(45, 70);
      const x = clamp(player.pos.x + Math.sin(a) * d, -300, 300);
      const z = clamp(player.pos.z + Math.cos(a) * d, -300, 280);
      const car = buildPoliceCar(game, x, z, Math.atan2(player.pos.x - x, player.pos.z - z));
      police.cruisers.push(car);
    }
    while (police.cops.length < want.cops && player.onFoot) {
      const a = game.rng.range(0, Math.PI * 2);
      const d = game.rng.range(25, 40);
      const cop = buildFootCop(game,
        clamp(player.pos.x + Math.sin(a) * d, -300, 300),
        clamp(player.pos.z + Math.cos(a) * d, -300, 280));
      police.cops.push(cop);
    }
  }
  // Stand the response down when the wanted level falls.
  const want = WANTED_TABLE[wanted];
  while (police.cruisers.length > want.cruisers) {
    const car = police.cruisers.pop();
    game.scene.remove(car.mesh);
    game.cars.splice(game.cars.indexOf(car), 1);
  }
  while (police.cops.length > want.cops) {
    const cop = police.cops.pop();
    game.scene.remove(cop.group);
  }

  // Cruisers chase the player and ram: hard when the player is driving, and
  // they pull alongside on foot to let a cop out.
  for (const car of police.cruisers) {
    // A staged cruiser holds its lane and paces the player (parked, lights
    // flashing, while the player is on foot) so the shot keeps its framing.
    if (car.shotAnchor) {
      const pace = player.car ? Math.abs(player.car.speed) : 0;
      car.speed += (pace - car.speed) * Math.min(1, dt * 2);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      resolveCollisions(car.pos, 1.4, game.city.colliders);
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      car.flash += dt * 8;
      const on = Math.sin(car.flash) > 0;
      car.lightBar.red.material.color.setHex(on ? 0xff2020 : 0x501010);
      car.lightBar.blue.material.color.setHex(on ? 0x102050 : 0x2040ff);
      continue;
    }
    const dx = player.pos.x - car.pos.x, dz = player.pos.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    car.heading = turnToward(car.heading, wantHeading, dt * 2.4);
    // Pace the player when close, so a chase reads as a chase instead of a
    // pile-up on the player's bumper.
    const playerSpeed = player.car ? Math.abs(player.car.speed) : 0;
    let targetSpeed = d > 60 ? 34 : 30;
    if (d < 12) targetSpeed = Math.min(targetSpeed, playerSpeed + 2);
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    resolveCollisions(car.pos, 1.4, game.city.colliders);
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    car.flash += dt * 8;
    const on = Math.sin(car.flash) > 0;
    car.lightBar.red.material.color.setHex(on ? 0xff2020 : 0x501010);
    car.lightBar.blue.material.color.setHex(on ? 0x102050 : 0x2040ff);
    // Ramming the player's car damages it and shakes the player.
    if (player.car && d < 3.6) {
      player.car.speed *= 0.92;
      player.health -= 6 * dt;
      game.audio.crash();
      game.hud.flashDamage();
      const push = 3.6 - d;
      player.car.pos.x += (player.car.pos.x - car.pos.x) / Math.max(d, 0.1) * push * 0.5;
      player.car.pos.z += (player.car.pos.z - car.pos.z) / Math.max(d, 0.1) * push * 0.5;
    }
    // A cruiser right on top of a player on foot ends the run (never during
    // a staged screenshot, where the police are set dressing).
    if (player.onFoot && d < 2.2 && !game.shotMode) {
      police.bustedTimer += dt;
      if (police.bustedTimer > 0.8) { game.busted(); return; }
    }
  }
  if (player.onFoot) police.bustedTimer = Math.max(0, police.bustedTimer - dt);

  // Foot cops run the player down; caught on foot means BUSTED.
  for (const cop of police.cops) {
    const dx = player.pos.x - cop.pos.x, dz = player.pos.z - cop.pos.z;
    const d = Math.hypot(dx, dz);
    cop.heading = turnToward(cop.heading, Math.atan2(dx, dz), dt * 5);
    const runSpeed = player.car ? 0 : 6.8;
    cop.pos.x += Math.sin(cop.heading) * runSpeed * dt;
    cop.pos.z += Math.cos(cop.heading) * runSpeed * dt;
    resolveCollisions(cop.pos, 0.5, game.city.colliders);
    cop.walkPhase += dt * 8;
    cop.legL.rotation.x = Math.sin(cop.walkPhase) * 0.6;
    cop.legR.rotation.x = -Math.sin(cop.walkPhase) * 0.6;
    cop.group.position.copy(cop.pos);
    cop.group.rotation.y = cop.heading;
    if (player.onFoot && d < 1.6 && !game.shotMode) {
      cop.grabTimer += dt;
      game.hud.showPrompt('A cop has you — break free!');
      if (cop.grabTimer > 1.2) { game.busted(); return; }
    } else {
      cop.grabTimer = 0;
    }
  }
}
