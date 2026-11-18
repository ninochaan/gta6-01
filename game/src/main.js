// main.js — Solmar Bay's bootstrap: builds the world and the __solmar
// test handle, wires every module together, owns the save, the
// interactions, the busted / wasted flows, and runs the loop with an
// adaptive quality scaler watching the frame budget.

import * as THREE from 'three';
import { makeRng, seedFromQuery, queryParam, clamp, dist2d } from './rng.js';
import { City } from './city.js';
import { Traffic, Car } from './vehicles.js';
import { Player } from './player.js';
import { Peds } from './pedestrians.js';
import { Police, Wanted } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Activities } from './activities.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { Input } from './input.js';
import { lineBlocked } from './physics.js';
import { applyShot, DemoAutopilot } from './shots.js';

const SAVE_KEY = 'solmar-bay-v2';
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec9e8);
scene.fog = new THREE.Fog(0xf0cf9e, 130, 430);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1000);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setSize(innerWidth, innerHeight);

const hemi = new THREE.HemisphereLight(0xbfe0f5, 0xe6c69a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a6, 1.75);
sun.position.set(140, 190, 70);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -95;
sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95;
sun.shadow.camera.bottom = -95;
sun.shadow.camera.far = 520;
scene.add(sun);
scene.add(sun.target);

// ---------------------------------------------------------------- world
const rng = makeRng(seedFromQuery());
const city = new City(scene, rng);
const audio = new GameAudio();

// The handle exists from the moment the world boots.
const H = {
  playing: false,
  now: 0,
  cash: 120,
  playerPos: { x: 12, z: 84 },
  cameraYaw: 0.6,
  cameraPitch: 0.32,
  playerFiredAt: -99999, // negative sentinel: the player has never fired
  cruise: false,
};
window.__solmar = H;

const player = new Player(scene);
H.player = player;
const traffic = new Traffic(scene, rng, city.colliders);
H.traffic = traffic;
const allCars = [...traffic.cars, ...traffic.parked];
H.allCars = allCars;
function registerCar(car) {
  if (!allCars.includes(car)) allCars.push(car);
}
function unregisterCar(car) {
  const i = allCars.indexOf(car);
  if (i >= 0) allCars.splice(i, 1);
}

// Gunfire tracers: a small pool of fading line segments.
const tracerPool = [];
function tracer(x1, z1, x2, z2) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, 1.25, z1),
    new THREE.Vector3(x2, 1.15, z2),
  ]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracerPool.push({ line, t: 0.09 });
}

const blocked = (ax, az, bx, bz) => lineBlocked(ax, az, bx, bz, city.colliders);
const hud = new Hud();
H.hud = hud;

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: H.cash,
      armour: player.armour,
      missionIndex: missions.index,
      packages: { found: activities.foundString() },
    }));
  } catch { /* private mode: play on unsaved */ }
}

const police = new Police(scene, rng, {
  colliders: city.colliders,
  registerCar,
  unregisterCar,
  lineBlocked: blocked,
  audio,
  tracer,
});
H.police = police;
const wanted = new Wanted();
H.wanted = wanted;
const combat = new Combat(scene, rng, { colliders: city.colliders, audio, tracer, lineBlocked: blocked });
H.combat = combat;
const peds = new Peds(scene, rng);
H.peds = peds;
const missions = new Missions(scene, {
  combat,
  registerCar,
  banner: (t) => hud.banner(t),
  audio,
  onSave: () => save(),
});
H.missions = missions;
const activities = new Activities(scene, rng, {
  audio,
  banner: (t) => hud.banner(t),
  onSave: () => save(),
  peds,
});
H.activities = activities;
H.city = city;
H.colliders = city.colliders;

H.hurtPlayer = (amount, sx, sz) => {
  if (!H.playing || amount <= 0) return;
  player.applyDamage(amount);
  audio.hurt();
  if (player.health <= 0 && !H.flowShown) wastedFlow();
};

// ---------------------------------------------------------------- save load
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.cash === 'number') H.cash = s.cash;
    if (typeof s.armour === 'number') player.armour = s.armour;
    if (typeof s.missionIndex === 'number') {
      missions.index = Math.min(5, Math.max(0, s.missionIndex));
      if (missions.index >= 5) missions.complete = true;
    }
    if (s.packages && typeof s.packages.found === 'string') activities.applySave(s.packages.found);
  } catch { /* a corrupt save is just a fresh start */ }
}
load();
hud.setCash(H.cash);

// ---------------------------------------------------------------- flows
const startEl = document.getElementById('start');
const bustedEl = document.getElementById('busted');
const wastedEl = document.getElementById('wasted');

function clearPolicePresence() {
  for (const car of [...police.cars]) police.removeCar(car);
  for (const o of [...police.officers]) police.removeOfficer(o);
  police.roadblock = null;
  police.bust = 0;
}

function bustedFlow() {
  if (H.flowShown) return;
  H.flowShown = true;
  const fine = 100 + 75 * wanted.level;
  H.cash = Math.max(0, H.cash - fine);
  wanted.clear();
  clearPolicePresence();
  if (player.car) player.exitCar(city.policeStation.x, city.policeStation.z);
  player.teleport(city.policeStation.x, city.policeStation.z, 0);
  document.getElementById('bustedtext').textContent =
    'The Solmar Bay PD got you. Fine paid: $' + fine + '.';
  bustedEl.style.display = 'flex';
  H.playing = false;
  save();
}

function wastedFlow() {
  if (H.flowShown) return;
  H.flowShown = true;
  const bill = 120;
  H.cash = Math.max(0, H.cash - bill);
  wanted.clear();
  clearPolicePresence();
  combat.clearGang();
  if (player.car) player.exitCar(city.hospital.x, city.hospital.z);
  player.health = 100;
  player.teleport(city.hospital.x, city.hospital.z, 0);
  document.getElementById('wastedtext').textContent =
    'You wake up at Solmar General. Hospital bill: $' + bill + '.';
  wastedEl.style.display = 'flex';
  H.playing = false;
  save();
}
H.flowShown = false;

function resumeFromFlow(el) {
  el.style.display = 'none';
  H.flowShown = false;
  H.playing = true;
  audio.ensure();
  audio.ui();
}
document.getElementById('bustedbtn').addEventListener('click', () => resumeFromFlow(bustedEl));
document.getElementById('wastedbtn').addEventListener('click', () => resumeFromFlow(wastedEl));
startEl.addEventListener('click', () => {
  startEl.style.display = 'none';
  H.playing = true;
  audio.ensure();
  audio.ui();
});

const input = new Input(canvas, H);

// ---------------------------------------------------------------- staging
const shotEnv = {
  hud,
  grabParkedCar: (x, z, heading) => {
    const car = traffic.parked.find((c) => c.parked) || traffic.parked[0];
    car.setPos(x, z, heading);
    return car;
  },
};
const shotName = queryParam('shot');
if (shotName && applyShot(shotName, H, shotEnv)) {
  startEl.style.display = 'none';
}
const demo = queryParam('demo') ? new DemoAutopilot() : null;
if (demo) {
  startEl.style.display = 'none';
  H.playing = true;
}

// ---------------------------------------------------------------- quality
const quality = {
  step: 0,
  ema: 16,
  timer: 0,
  ratios: [Math.min(devicePixelRatio || 1, 2), 1.5, 1.15, 1],
  apply() {
    renderer.setPixelRatio(this.ratios[this.step]);
    renderer.shadowMap.enabled = this.step < 2;
    scene.fog.far = [430, 380, 320, 260][this.step];
    sun.castShadow = this.step < 2;
  },
  update(dt) {
    this.ema = this.ema * 0.95 + dt * 1000 * 0.05;
    this.timer += dt;
    if (this.timer < 2) return;
    this.timer = 0;
    if (this.ema > 26 && this.step < 3) {
      this.step++;
      this.apply();
    } else if (this.ema < 11 && this.step > 0) {
      this.step--;
      this.apply();
    }
  },
};
quality.apply();

// ---------------------------------------------------------------- loop
let last = performance.now();
let saveCheckT = 0;
let lastSaveKey = '';
const camPos = new THREE.Vector3(0, 6, 70);
let camInit = false;

function nearestEnterableCar() {
  let best = null;
  let bestD = 3.4;
  for (const c of allCars) {
    if (c.isPolice && c.crewOut) continue;
    const d = dist2d(player.x, player.z, c.x, c.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function interactions(dt) {
  let prompt = '';
  if (player.car) {
    const car = player.car;
    const dPad = dist2d(car.x, car.z, city.garage.repair.x, city.garage.repair.z);
    if (dPad < 3.6) {
      if (car.health < 99.5) {
        prompt = "Press K to repair your car for $40 — Tito's Garage";
        if (input.hit('KeyK')) {
          if (H.cash >= 40) {
            H.cash -= 40;
            car.health = 100;
            audio.cash();
            hud.toast('Tito fixed her up — good as new.');
            save();
          } else {
            hud.toast('Not enough cash for the repair.');
            audio.ui();
          }
        }
      } else {
        prompt = "Tito's Garage — your car is in perfect shape";
      }
    }
  } else {
    const dSave = dist2d(player.x, player.z, city.safehouse.save.x, city.safehouse.save.z);
    const dShop = dist2d(player.x, player.z, city.shop.counter.x, city.shop.counter.z);
    if (dSave < 2.2) {
      prompt = 'Safehouse — your game is saved here';
      player.health = Math.min(100, player.health + dt * 12);
      save();
    } else if (dShop < 2.8) {
      prompt = 'TIENDA BRISA — 1: First aid $30 (+50 health)  2: Kevlar vest $75 (armour 100)  3: Pistol ammo $25 (+48 rounds)';
      const buy = (cost, apply, label) => {
        if (H.cash < cost) {
          hud.toast('Not enough cash for ' + label + '.');
          audio.ui();
          return;
        }
        H.cash -= cost;
        apply();
        audio.cash();
        hud.toast(label + ' bought for $' + cost + '.');
        save();
      };
      if (input.hit('Digit1')) buy(30, () => { player.health = Math.min(100, player.health + 50); }, 'First aid');
      if (input.hit('Digit2')) buy(75, () => { player.armour = 100; }, 'Kevlar vest');
      if (input.hit('Digit3')) buy(25, () => { combat.reserve += 48; }, 'Pistol ammo');
    } else {
      const car = nearestEnterableCar();
      if (car) prompt = 'Press E to enter the car';
      const def = missions.currentDef;
      if (!missions.active && def && dist2d(player.x, player.z, def.start.x, def.start.z) < 4) {
        prompt = 'Starting: ' + def.title + '…';
      }
    }
  }
  hud.setPrompt(prompt);
}

function frame(nowMs) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (nowMs - last) / 1000 || 0.016);
  last = nowMs;
  if (dt <= 0) dt = 0.016;
  H.now += dt * 1000;
  const t = H.now / 1000;

  let ctl = null;
  if (demo && H.playing) ctl = demo.update(dt, H);

  if (H.playing) {
    // --- movement intent
    // Camera convention: cameraYaw names the bearing the camera hangs
    // at, not where Rico looks — the view forward is -(sin yaw, cos
    // yaw), so yaw 0 faces -Z with the camera sitting at +Z behind
    // him. Combat reads its aim in this same convention.
    const fX = -Math.sin(H.cameraYaw);
    const fZ = -Math.cos(H.cameraYaw);
    const rX = Math.cos(H.cameraYaw);
    const rZ = -Math.sin(H.cameraYaw);
    let moveX = 0;
    let moveZ = 0;
    let sprint = false;
    if (ctl) {
      moveX = ctl.moveX;
      moveZ = ctl.moveZ;
      sprint = ctl.sprint;
    } else {
      if (input.down('KeyW')) { moveX += fX; moveZ += fZ; }
      if (input.down('KeyS')) { moveX -= fX; moveZ -= fZ; }
      if (input.down('KeyD')) { moveX += rX; moveZ += rZ; }
      if (input.down('KeyA')) { moveX -= rX; moveZ -= rZ; }
      sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    }

    if (player.car) {
      let throttle = 0;
      let steer = 0;
      if (ctl) {
        throttle = ctl.throttle;
        steer = ctl.steer;
        if (ctl.exit) player.exitCar();
      } else if (H.cruise) {
        throttle = player.car.speed < 14 ? 0.65 : 0.2;
      } else {
        if (input.down('KeyW')) throttle = 1;
        if (input.down('KeyS')) throttle = -1;
        if (input.down('KeyA')) steer += 1;
        if (input.down('KeyD')) steer -= 1;
      }
      const crash = player.car.drive(dt, throttle, steer, city.colliders);
      player.syncMesh(); // the handle and camera track the car, not the curb we left
      if (crash > 0) {
        audio.crash();
        if (crash > 9 && police.seenByAnyone(H)) wanted.addHeat(0.5, H.now);
      }
      if (!ctl && input.hit('KeyE')) player.exitCar();
    } else {
      player.update(dt, moveX, moveZ, sprint, city.colliders);
      if (ctl && ctl.enter) {
        const car = nearestEnterableCar();
        if (car) player.enterCar(car);
      } else if (!ctl && input.hit('KeyE')) {
        const car = nearestEnterableCar();
        if (car) {
          player.enterCar(car);
          audio.ui();
        }
      }
      const wantShoot = ctl ? false : (input.hit('KeyF') || input.hit('MouseFire'));
      if (wantShoot) {
        const fired = combat.playerShoot(H);
        if (fired) {
          if (police.seenByAnyone(H) || combat.gangAlive() > 0) {
            if (wanted.level === 0) wanted.setStars(1, H.now);
            else wanted.addHeat(0.34, H.now);
          }
        }
      }
      if (!ctl && input.hit('KeyR')) combat.startReload();
    }

    traffic.update(dt, allCars, player.car);
    peds.update(dt, city.colliders);
    const seen = police.seenByAnyone(H);
    wanted.update(dt, H.now, seen);
    police.update(dt, H);
    if (police.bust >= 1 && !player.car) {
      bustedFlow();
    }
    combat.update(dt, H);
    missions.update(dt, H);
    activities.update(dt, H);
    interactions(dt);

    // Save whenever the persisted fields change.
    saveCheckT += dt;
    if (saveCheckT > 0.5) {
      saveCheckT = 0;
      const key = H.cash + '|' + player.armour + '|' + missions.index + '|' + activities.foundString();
      if (key !== lastSaveKey) {
        lastSaveKey = key;
        save();
      }
    }
  }

  // --- camera
  const inGarage = player.x > -72 && player.x < -40 && player.z > 72 && player.z < 96;
  const inShop = player.x > 73 && player.x < 95 && player.z > -65 && player.z < -47;
  const inSafe = player.x > -206 && player.x < -186 && player.z > -204 && player.z < -188;
  const indoors = inGarage || inShop || inSafe;
  const dist = indoors ? 5.2 : player.car ? 9 : 7.2;
  // Same convention as movement: forward is -(sin yaw, cos yaw), so
  // the camera hangs at player - forward * dist and looks along it.
  const fX = -Math.sin(H.cameraYaw);
  const fZ = -Math.cos(H.cameraYaw);
  const tx = player.x - fX * dist;
  const tz = player.z - fZ * dist;
  const ty = indoors ? 0.9 + H.cameraPitch * 2 : 1.6 + H.cameraPitch * 4.6;
  if (!camInit || Math.hypot(tx - camPos.x, tz - camPos.z) > 60) {
    camPos.set(tx, ty + 1.4, tz);
    camInit = true;
  } else {
    const k = 1 - Math.pow(0.0001, dt);
    camPos.x += (tx - camPos.x) * k;
    camPos.z += (tz - camPos.z) * k;
    camPos.y += (ty + 1.4 - camPos.y) * k;
  }
  camera.position.copy(camPos);
  camera.lookAt(player.x + fX * 5, 1.1 - H.cameraPitch * 1.2, player.z + fZ * 5);
  sun.position.set(player.x + 140, 190, player.z + 70);
  sun.target.position.set(player.x, 0, player.z);

  // --- tracers
  for (let i = tracerPool.length - 1; i >= 0; i--) {
    const tr = tracerPool[i];
    tr.t -= dt;
    tr.line.material.opacity = Math.max(0, tr.t / 0.09) * 0.9;
    if (tr.t <= 0) {
      scene.remove(tr.line);
      tr.line.geometry.dispose();
      tr.line.material.dispose();
      tracerPool.splice(i, 1);
    }
  }

  city.update(dt, t);
  H.playerPos.x = player.x;
  H.playerPos.z = player.z;

  const objective = missions.objectivePoint() || activities.objectivePoint();
  hud.update(dt, H, objective ? { ...objective, label: objective.label || (missions.active ? missions.active.def.steps[missions.active.stepIdx]?.label : undefined) } : null);
  audio.update(dt, !!player.car, player.car ? Math.abs(player.car.speed) / 27 : 0, wanted.level > 0 && police.nearestCopDistance(player.x, player.z) < 60);
  input.endFrame(dt);
  quality.update(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
