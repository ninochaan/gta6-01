// main.js — boots Solmar Bay and runs the loop. Owns the renderer, the sun
// and sky, the shared game context G that every system reads, crime and
// punishment, saving, the adaptive quality scaler that defends 60 fps, the
// ?demo=1 autopilot used to measure frame rate, and the ?shot= states.
// v4: Tienda Brisa's till lives here (keys 1/2/3 buy health, a vest, or
// pistol ammo — cash and goods move together or not at all), the vest pool
// rides along in the save, and G.playerFiredAt timestamps Rico's gunfire so
// the PD's new rules of engagement can tell a shootout from a foot chase.

import * as THREE from '../vendor/three.min.js';
import { makeRng } from './rng.js';
import { buildCity } from './city.js';
import { makeSkyTexture, makeBlobTexture } from './textures.js';
import { TrafficSystem, wrapAngle } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { PoliceSystem, Wanted } from './police.js';
import { Combat } from './combat.js';
import { StoryMissions, Activities } from './missions.js';
import { Player } from './player.js';
import { Hud } from './hud.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { setupShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const demoMode = params.get('demo') === '1';
const seed = Number(params.get('seed') || 1337) >>> 0;

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = makeSkyTexture();
scene.fog = new THREE.Fog(0xf2cf9e, 130, 430);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
camera.position.set(-38, 4, 142);

const hemi = new THREE.HemisphereLight(0xbfd9ea, 0xe8c9a0, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe3b3, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(20, 24), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }));
sunDisc.position.set(-300, 165, -390); sunDisc.lookAt(0, 10, 0);
scene.add(sunDisc);
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeBlobTexture(), color: 0xffdf8a, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
glow.scale.setScalar(150); glow.position.copy(sunDisc.position);
scene.add(glow);

const rng = makeRng(seed);
const city = buildCity(scene, rng);
const colliders = city.colliders;

const hud = new Hud();
const audio = new AudioSys();
const input = new Input(canvas);
const traffic = new TrafficSystem(scene, rng, colliders);
const peds = new PedestrianSystem(scene, rng, colliders);
const police = new PoliceSystem(scene, colliders, rng);
const wanted = new Wanted();
const combat = new Combat(scene, colliders, audio, peds);
combat.police = police;
const player = new Player(scene, colliders, audio);
const missions = new StoryMissions(scene);
const activities = new Activities(scene, city, rng);

const SAVE_KEY = 'solmar-bay-v2';
const G = {
  scene, camera, renderer, hud, audio, input, traffic, peds, police, wanted, combat, player, missions, activities,
  colliders, city, edges: { pressed: new Set(), clicked: false, dx: 0, dy: 0 },
  now: 0, cameraYaw: Math.PI, cameraPitch: 0.14,
  cash: 120, bust: 0, playing: false, paused: false, shotMode: false,
  playerFiredAt: -99,
  playerPos: { x: -38, z: 132 }, playerVel: { x: 0, z: 0 }, playerSpeed: 0, playerSpeedAbs: 0,
  playerInCar: false, playerCar: null, playerHeading: 0,
  blips: { objective: null, taxi: null, race: null, police: [], story: null },
  packageBlips: [], objectiveText: '', activityObjective: '',
  extraCars: [], allCars: [], threatCars: [],
  addCash(n) { G.cash += n; hud.setCash(G.cash); },
  setWantedAtLeast(n) { if (wanted.level < n) { wanted.level = n; wanted.lastSeen = G.now; } },
  reportCrime(kind, x, z) {
    let amount = 0;
    if (kind === 'carjack') amount = 1;
    else if (kind === 'assault') amount = 1;
    else if (kind === 'gunfire') amount = 1;
    else if (kind === 'kill') amount = 2;
    else if (kind === 'runOver') amount = 2;
    else if (kind === 'hitPolice') amount = 1;
    let witnessed = false;
    for (const p of peds.peds) if (!p.dead && Math.hypot(p.x - x, p.z - z) < 24) { witnessed = true; break; }
    if (police.nearestCopDistance(x, z) < 65) witnessed = true;
    wanted.addCrime(amount, witnessed, G.now);
    if (kind === 'gunfire' || kind === 'kill' || kind === 'runOver') peds.startle(x, z, 30);
  },
  hurtPlayer(amount, fromX, fromZ) { player.hurt(amount, G); },
  onPlayerCrash(car) { /* contact crimes are reported in player.js */ },
  saveGame() {
    if (G.shotMode || demoMode) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: G.cash, missions: missions.saveState(), packages: activities.saveState(),
        x: player.x, z: player.z, health: player.health, armour: player.armour,
      }));
    } catch { /* private mode etc. — the game simply will not persist */ }
  },
  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      G.cash = s.cash ?? 120;
      missions.loadState(s.missions);
      activities.loadState(s.packages);
      if (typeof s.x === 'number') player.teleport(s.x, s.z, 0);
      player.health = s.health ?? 100;
      player.armour = s.armour ?? 0;
    } catch { /* a corrupt save is ignored, a fresh start is fine */ }
  },
};
window.__solmar = G; // a handle for automated smoke tests and curious players
player.teleport(city.playerStart.x, city.playerStart.z, city.playerStart.heading);
if (!shotName && !demoMode) G.loadGame();
hud.setCash(G.cash);

// ---------------------------------------------------------------- screens
const $ = (id) => document.getElementById(id);
function showScreen(id, on) { $(id).style.display = on ? 'flex' : 'none'; }
if (shotName || demoMode) {
  showScreen('start', false);
  G.playing = true;
  input.wantLock = false;
} else {
  $('playbtn').addEventListener('click', () => {
    audio.wake();
    showScreen('start', false);
    G.playing = true;
    canvas.requestPointerLock();
  });
}
$('resumebtn').addEventListener('click', () => { G.paused = false; showScreen('pause', false); });
$('restartbtn').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  location.reload();
});
$('bustedbtn').addEventListener('click', () => { showScreen('busted', false); G.playing = true; });
$('wastedbtn').addEventListener('click', () => { showScreen('wasted', false); G.playing = true; });

function doBusted() {
  const fine = 100 + wanted.stars * 75;
  G.cash = Math.max(0, G.cash - fine);
  hud.setCash(G.cash);
  if (player.car) { const c = player.car; player.exitCar(city.policeStation.x, city.policeStation.z); c.driver = null; }
  else player.teleport(city.policeStation.x, city.policeStation.z, 0);
  wanted.clear(); police.clearAll(); G.bust = 0;
  player.heal(30);
  G.playing = false;
  showScreen('busted', true);
  audio.fail();
  G.saveGame();
}
function doWasted() {
  G.cash = Math.max(0, G.cash - 120);
  hud.setCash(G.cash);
  if (player.car) player.exitCar(city.hospital.x, city.hospital.z);
  else player.teleport(city.hospital.x, city.hospital.z, 0);
  player.health = player.maxHealth;
  wanted.clear(); police.clearAll();
  G.playing = false;
  showScreen('wasted', true);
  audio.fail();
  G.saveGame();
}

// ---------------------------------------------------------------- demo mode
let demoCar = null;
if (demoMode) {
  demoCar = traffic.spawnTraffic(true);
  demoCar.setPos(-120, 192.9, Math.PI / 2);
  player.enterCar(demoCar);
  const el = $('fps-report');
  el.style.display = 'block';
  el.textContent = 'measuring…';
}

// ---------------------------------------------------------------- quality
const TIERS = [
  { pr: 1.5, shadow: 1024, far: 430 },
  { pr: 1.25, shadow: 1024, far: 390 },
  { pr: 1.0, shadow: 512, far: 340 },
  { pr: 1.0, shadow: 0, far: 290 },
  { pr: 0.85, shadow: 0, far: 240 },
];
let tier = 0, qualityTimer = 0, goodChecks = 0;
function applyTier(t) {
  const q = TIERS[t];
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pr));
  renderer.setSize(innerWidth, innerHeight);
  camera.far = q.far + 300;
  scene.fog.far = q.far;
  camera.updateProjectionMatrix();
  if (q.shadow === 0) {
    if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; sun.castShadow = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
  } else {
    if (!renderer.shadowMap.enabled) { renderer.shadowMap.enabled = true; sun.castShadow = true; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
    if (sun.shadow.mapSize.x !== q.shadow) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }
}
applyTier(0);
addEventListener('resize', () => applyTier(tier));

// ---------------------------------------------------------------- the loop
let last = performance.now();
let frame = 0;
let fpsFrames = 0, fpsTime = 0, fpsReported = false, fpsWorst = 0;
const trafficCtx = { allCars: [], playerCar: null, playerPos: G.playerPos, playerInCar: false, peds: [] };

function refreshContext() {
  const p = player.pos;
  G.playerPos.x = p.x; G.playerPos.z = p.z;
  const v = player.vel;
  G.playerVel.x = v.x; G.playerVel.z = v.z;
  G.playerInCar = !!player.car;
  G.playerCar = player.car;
  G.playerSpeed = player.car ? player.car.speed : player.speed;
  G.playerSpeedAbs = player.speedAbs;
  G.playerHeading = player.car ? player.car.heading : player.heading;
  G.allCars.length = 0;
  for (const c of traffic.cars) G.allCars.push(c);
  for (const c of traffic.parked) G.allCars.push(c);
  for (const c of police.cars) G.allCars.push(c);
  for (const rb of police.roadblocks) G.allCars.push(rb.car);
  for (const c of G.extraCars) G.allCars.push(c);
  G.threatCars = G.allCars;
  trafficCtx.allCars = G.allCars;
  trafficCtx.playerCar = player.car;
  trafficCtx.playerInCar = G.playerInCar;
  trafficCtx.peds = peds.peds;
  G.blips.police = police.cars.concat(police.officers);
  G.blips.shop = city.shop.center;
}

function tryInteract() {
  // E: enter/exit cars, K: safehouse save / garage repair. Prompts refresh
  // every frame.
  if (player.car) {
    const gr = city.garage;
    const onPad = Math.hypot(player.car.x - gr.repair.x, player.car.z - gr.repair.z) < 3.5;
    if (onPad && player.car.health < 100) {
      if (G.cash >= 40) {
        hud.setPrompt("K — repair your car at Tito's Garage ($40)");
        if (G.edges.pressed.has('KeyK')) {
          player.car.health = 100;
          G.cash -= 40; hud.setCash(G.cash);
          audio.chime();
          hud.banner("TITO'S GARAGE", 'Good as new. Tito sends his regards.');
        }
      } else {
        hud.setPrompt("Tito's Garage — repairs cost $40 and you are short");
      }
      return;
    }
    hud.setPrompt('E — get out');
    if (G.edges.pressed.has('KeyE')) { audio.setEngine(0, false); player.exitCar(); }
    return;
  }
  let best = null, bd = 3.4;
  for (const c of G.allCars) {
    if (c.dead) continue;
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < bd) { bd = d; best = c; }
  }
  const sh = city.safehouse;
  const nearSave = Math.hypot(player.x - sh.save.x, player.z - sh.save.z) < 3;
  if (nearSave) {
    hud.setPrompt('K — rest & save at your safehouse');
    if (G.edges.pressed.has('KeyK')) { player.heal(100); G.saveGame(); hud.banner('SAFEHOUSE', 'Game saved. Rico sleeps off the day.'); audio.chime(); }
    return;
  }
  if (best) {
    hud.setPrompt(best.driver === 'traffic' ? 'E — steal this car' : 'E — enter car');
    if (G.edges.pressed.has('KeyE')) {
      const wasTraffic = best.driver === 'traffic';
      const wasPolice = best.isPolice;
      if (wasTraffic) {
        const driver = peds.spawn({ x: best.x + 2, z: best.z });
        driver.state = 'flee'; driver.panic = 3.5; driver.fleeFrom = { x: player.x, z: player.z };
        G.reportCrime('carjack', best.x, best.z);
        const ti = traffic.cars.indexOf(best);
        if (ti >= 0) { traffic.cars.splice(ti, 1); G.extraCars.push(best); best.wasTraffic = true; }
      }
      if (wasPolice) G.reportCrime('carjack', best.x, best.z);
      const pi = traffic.parked.indexOf(best);
      if (pi >= 0) { traffic.parked.splice(pi, 1); G.extraCars.push(best); }
      player.enterCar(best);
      G.cameraYaw = best.heading + Math.PI;
      audio.wake();
    }
    return;
  }
  // Tienda Brisa: at the counter, keys 1/2/3 buy from the till. Every sale
  // is atomic — cash is checked and deducted in the same breath as the
  // goods land, so there is no free-buy and no negative-cash path.
  const shop = city.shop;
  if (Math.hypot(player.x - shop.counter.x, player.z - shop.counter.z) < 3.2) {
    const buy = (price, apply, label) => {
      if (G.cash < price) { hud.banner('TIENDA BRISA', `Not enough cash — ${label} costs $${price}.`); audio.fail(); return; }
      G.cash -= price; hud.setCash(G.cash); apply();
      audio.cash(); hud.banner('TIENDA BRISA', `${label} — $${price}. Gracias!`); G.saveGame();
    };
    hud.setPrompt('TIENDA BRISA — 1: first aid +50 ($30) · 2: kevlar vest ($75) · 3: pistol ammo +48 ($25)');
    if (G.edges.pressed.has('Digit1')) {
      if (player.health >= player.maxHealth) hud.banner('TIENDA BRISA', 'You are already at full health.');
      else buy(30, () => player.heal(50), 'First aid');
    } else if (G.edges.pressed.has('Digit2')) {
      if (player.armour >= player.maxArmour) hud.banner('TIENDA BRISA', 'Your vest is already fresh.');
      else buy(75, () => { player.armour = player.maxArmour; }, 'Kevlar vest');
    } else if (G.edges.pressed.has('Digit3')) {
      buy(25, () => { combat.reserve += 48; }, 'Pistol ammo +48');
    }
    return;
  }
  const gr = city.garage;
  if (Math.hypot(player.x - gr.repair.x, player.z - gr.repair.z) < 4.5) {
    hud.setPrompt("Tito's Garage — roll a bent car onto the pad and Tito will straighten it ($40)");
    return;
  }
  hud.setPrompt(null);
}

function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const rawDt = Math.max(0.0005, (nowMs - last) / 1000);
  let dt = Math.min(0.05, rawDt);
  last = nowMs;
  G.now += dt;
  frame++;
  const edges = input.consume();
  G.edges = edges;

  // fps accounting uses the RAW frame time (the gameplay dt is clamped, and
  // counting clamped time would flatter the number at low frame rates)
  fpsFrames++; fpsTime += rawDt;
  if (demoMode && !fpsReported && G.now > 6) {
    fpsReported = true;
    const avg = fpsFrames / fpsTime;
    const info = renderer.info.render;
    const msg = `FPSRESULT avg=${avg.toFixed(1)} frames=${fpsFrames} seconds=${fpsTime.toFixed(1)} pixelRatio=${renderer.getPixelRatio().toFixed(2)} size=${renderer.domElement.width}x${renderer.domElement.height} calls=${info.calls} triangles=${info.triangles}`;
    console.log(msg);
    document.title = msg;
    $('fps-report').textContent = msg;
  }
  if (G.now > 2.5) {
    qualityTimer += dt;
    if (qualityTimer > 2.5) {
      qualityTimer = 0;
      const avg = fpsFrames / Math.max(0.001, fpsTime);
      if (avg < 50 && tier < TIERS.length - 1) { tier++; applyTier(tier); goodChecks = 0; }
      else if (avg > 57.5 && tier > 0) { if (++goodChecks >= 3) { tier--; applyTier(tier); goodChecks = 0; } }
      else goodChecks = 0;
      fpsFrames = 0; fpsTime = 0;
    }
  }

  if (edges.pressed.has('KeyP') && G.playing && !shotName) {
    G.paused = !G.paused;
    showScreen('pause', G.paused);
    if (G.paused) $('pausestats').textContent = `Cash $${G.cash} · Packages ${activities.foundCount}/20 · Missions done ${missions.index}/5`;
  }

  refreshContext();

  if (G.playing && !G.paused) {
    // mouse look
    if (edges.dx || edges.dy) {
      G.cameraYaw -= edges.dx * 0.0026;
      G.cameraPitch = Math.max(-0.42, Math.min(0.62, G.cameraPitch - edges.dy * 0.0022));
    }
    if (demoMode && demoCar) {
      // the demo car is a traffic car with an AI driver; the traffic loop
      // below drives it — here we only swing the chase camera behind it
      G.cameraYaw += wrapAngle(demoCar.heading + Math.PI - G.cameraYaw) * Math.min(1, dt * 2);
      player.updateCamera(dt, G);
    } else if (G.shotMode && player.car) {
      // staged shots keep rolling at a steady cruise
      const car = player.car;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      car.x += fx * car.speed * dt; car.z += fz * car.speed * dt;
      car.sync();
      player.updateCamera(dt, G);
    } else {
      player.update(dt, G);
      // ease the chase camera behind a moving car when the mouse is idle
      if (player.car && Math.abs(player.car.speed) > 3 && !edges.dx) {
        G.cameraYaw += wrapAngle(player.car.heading + Math.PI - G.cameraYaw) * Math.min(1, dt * 1.7);
      }
      tryInteract();
      // combat inputs (on foot)
      if (!player.car) {
        if (edges.clicked) {
          const res = combat.playerShoot(G);
          if (res) {
            G.playerFiredAt = G.now; // v4: the PD may now answer gunfire with gunfire
            G.reportCrime('gunfire', player.x, player.z);
            if (res.killed) G.reportCrime(res.killed.gang ? 'kill' : 'kill', player.x, player.z);
          }
        }
        if (edges.pressed.has('KeyF')) {
          const res = combat.playerMelee(G);
          if (res && res.hit) G.reportCrime('assault', player.x, player.z);
          if (res && res.killed) G.reportCrime('kill', player.x, player.z);
        }
        if (edges.pressed.has('KeyR')) combat.startReload();
      }
    }

    // world systems (AI staggered: peds update on alternating frames)
    for (const car of traffic.cars) traffic.updateCar(car, dt, trafficCtx);
    refreshContext();
    const pedList = peds.peds;
    for (let i = 0; i < pedList.length; i++) {
      const ped = pedList[i];
      if (ped.state === 'flee' || ped.state === 'fight') peds.update(ped, dt, { threatCars: G.threatCars });
      else if ((i + frame) % 2 === 0) peds.update(ped, dt * 2, { threatCars: G.threatCars });
    }
    const seen = police.update(dt, G);
    wanted.update(dt, G.now, seen);
    combat.update(dt, G);
    G.activityObjective = '';
    missions.update(dt, G);
    activities.update(dt, G);
    city.update(dt, G.now);

    // bust meter: boxed in at low speed with an officer on your door
    if (wanted.level > 0 && G.playerSpeedAbs < 2.4 && police.nearestCopDistance(G.playerPos.x, G.playerPos.z) < 8.5) {
      G.bust = Math.min(1, G.bust + dt / 3);
      if (G.bust >= 1) doBusted();
    } else G.bust = Math.max(0, G.bust - dt * 0.7);
    if (player.health <= 0 && G.playing) doWasted();

    // audio beds
    if (!player.car) audio.setEngine(0, false);
    const copD = police.nearestCopDistance(G.playerPos.x, G.playerPos.z);
    audio.setSiren(wanted.level > 0 ? Math.max(0, 1 - copD / 70) : 0, G.now);
    audio.updateAmbient(dt);
  }

  // sun + shadow box follow the player so shadows stay crisp and local
  const p = G.playerPos;
  sun.position.set(p.x - 55, 95, p.z + 38); // late sun in the south-west: beachfronts glow
  sun.target.position.set(p.x, 0, p.z);
  sun.target.updateMatrixWorld();

  // HUD
  hud.setHealth(player.health);
  hud.setWanted(wanted.level);
  hud.setPackages(activities.foundCount, activities.pkgData.length);
  hud.setWeapon(combat.reloadT > 0 ? 'Pistol — reloading…' : (player.car ? '—' : `Pistol ${combat.mag} / ${combat.reserve} · F melee`) + (player.armour > 0.5 ? ` · Vest ${Math.round(player.armour)}%` : ''));
  hud.setSpeed(G.playerSpeedAbs * 3.6, !!player.car);
  hud.setBust(G.bust);
  hud.setObjective(G.shotObjective || G.activityObjective || G.objectiveText || 'Free roam — find the green marker for work.');
  hud.update(dt);
  if (frame % 2 === 0) hud.drawMinimap(G);

  renderer.render(scene, camera);
}

if (shotName) setupShot(G, shotName);
animate();
