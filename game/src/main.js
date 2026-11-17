// Solmar Bay: the wiring. Builds the renderer, the city and every system,
// runs the frame loop, reads the keyboard and mouse, and owns the game state
// (menu, playing, paused, busted, wasted) plus entering and stealing cars.
import * as THREE from 'three';
import { makeRng, clamp } from './rng.js';
import { WORLD, PALETTE, CAR_MODELS, ECONOMY } from './config.js';
import { buildCity } from './city.js';
import { createPlayer, updatePlayerOnFoot, updateCamera } from './player.js';
import { createCar, updatePlayerCar, nearestStealableCar } from './vehicles.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPedestrians, updatePedestrians } from './pedestrians.js';
import { createPolice, updatePolice, addWanted } from './police.js';
import { createCombat, updateCombat, playerShoot, playerPunch, startReload } from './combat.js';
import { createMissions, startMission, updateMissions, MISSIONS } from './missions.js';
import { createHud } from './hud.js';
import { drawMinimap } from './minimap.js';
import { createAudio } from './audio.js';
import { hasSave, saveGame, loadSave, applySave } from './save.js';
import { applyShot, settleWorld } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = params.get('seed') ? Number(params.get('seed')) : (Date.now() % 100000);
const shotMode = params.get('shot') || null;

window.addEventListener('error', (e) => { window.__solmarError = String(e.message || e.error); });

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.domElement.id = 'gl';
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 260, 820);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 30, 120);

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PALETTE.sun, 2.1);
sun.position.set(180, 240, 140);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
sun.shadow.camera.far = 800;
scene.add(sun);

// A few slow clouds drifting over the bay.
const clouds = [];
{
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(30 + Math.random() * 30, 4, 14 + Math.random() * 10), cloudMat);
    c.position.set(-280 + Math.random() * 560, 95 + Math.random() * 30, -280 + Math.random() * 480);
    scene.add(c);
    clouds.push(c);
  }
}

const game = {
  scene, camera, renderer,
  rng: makeRng(seed),
  time: 0,
  state: 'menu',
  camYaw: 1.77 + Math.PI,
  camPitch: 0.2,
  cash: 0,
  xp: 0,
  wanted: 0,
  level: 1,
  cars: [],
  input: { keys: {} },
  interactPressed: false,
  shotMode: false,
  saveTimer: 0,
  hudTimer: 0,
  hasSave: hasSave(),
};
game.audio = createAudio();
game.city = buildCity(scene, game.rng);
game.player = createPlayer(scene);
game.player.pos.set(20, 0, 44);
game.player.heading = 1.77;
game.traffic = createTraffic(game, 16);
game.peds = createPedestrians(game, 26);
game.police = createPolice(game);
game.combat = createCombat(game);
game.missions = createMissions(game);
game.hud = createHud(game);

// Parked cars along the avenues, waiting to be stolen.
{
  const rng = game.rng;
  for (let i = 0; i < 11; i++) {
    const vertical = rng.chance(0.5);
    const road = rng.pick([-240, -160, -80, 0, 80, 160, 240]);
    const along = rng.range(-260, 260);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = vertical ? road + side * 10.5 : along;
    const z = vertical ? along : road + side * 10.5;
    if (z > WORLD.beachZ - 14) continue;
    if (Math.abs(x) < 30 && Math.abs(z) < 30) continue;
    const model = rng.pick(CAR_MODELS);
    createCar(game, x, z, vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2), model, rng.pick(model.colors), true);
  }
}

// --- Arrest and hospital: lose $200, keep the story, start again at the plaza.
function respawn() {
  const p = game.player;
  if (p.car) { p.car.isPlayer = false; p.car = null; }
  p.onFoot = true;
  p.pos.set(20, 0, 44);
  p.heading = 1.77;
  p.health = p.maxHealth;
  p.ammo = 12;
  game.wanted = 0;
  game.audio.stopSiren();
  game.police.decayTimer = 0;
  game.state = 'playing';
  game.hud.refreshAll();
  saveGame(game);
}
game.busted = () => {
  if (game.state !== 'playing') return;
  game.state = 'busted';
  game.cash = Math.max(0, game.cash - 200);
  game.audio.busted();
  game.audio.stopSiren();
  if (game.missions.active) game.missions.failedIndex = game.missions.active.index;
  game.missions.active = null;
  game.hud.showBusted();
};
game.wasted = () => {
  if (game.state !== 'playing') return;
  game.state = 'wasted';
  game.cash = Math.max(0, game.cash - 200);
  game.audio.busted();
  game.audio.stopSiren();
  if (game.missions.active) game.missions.failedIndex = game.missions.active.index;
  game.missions.active = null;
  game.hud.showWasted();
};

// --- Stealing and entering cars.
function enterCar(car) {
  const p = game.player;
  if (car.traffic) {
    car.traffic = false;
    car.stolen = true;
    addWanted(game, 1);
    game.hud.showMessage('Car stolen! The police are on their way.');
  } else {
    game.hud.showMessage(car.model.name + ' — yours now.');
  }
  car.isPlayer = true;
  car.parked = false;
  p.car = car;
  p.onFoot = false;
  p.group.visible = false;
  game.audio.doorSlam();
  game.audio.engineStart();
  game.camYaw = car.heading + Math.PI;
}
function exitCar() {
  const p = game.player;
  const car = p.car;
  if (!car) return;
  car.isPlayer = false;
  car.speed = 0;
  p.car = null;
  p.onFoot = true;
  p.pos.set(car.pos.x + Math.cos(car.heading) * 2, 0, car.pos.z - Math.sin(car.heading) * 2);
  p.heading = car.heading;
  p.group.visible = true;
  game.audio.doorSlam();
  game.audio.setEngine(0);
}
function tryUseKey() {
  const p = game.player;
  if (p.onFoot) {
    const car = nearestStealableCar(game, 4.5);
    if (car) { enterCar(car); return; }
    game.interactPressed = true;
  } else {
    exitCar();
  }
}

// --- Input: keyboard, mouse drag camera, click to shoot.
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  game.input.keys[e.code] = true;
  game.audio.ensure();
  if (e.code === 'KeyE' && game.state === 'playing') tryUseKey();
  if (e.code === 'KeyF' && game.state === 'playing') playerPunch(game);
  if (e.code === 'KeyR' && game.state === 'playing') startReload(game);
  if (e.code === 'KeyM') { const m = game.audio.toggleMute(); game.hud.showMessage(m ? 'Sound off' : 'Sound on'); }
  if (e.code === 'KeyH') {
    if (game.state === 'playing') { game.hud.showHelp(); game.state = 'help'; }
    else if (game.state === 'help') { game.hud.hideHelp(); game.state = 'playing'; }
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.state === 'playing') { game.state = 'paused'; game.hud.showPause(); }
    else if (game.state === 'paused') { game.state = 'playing'; game.hud.hidePause(); }
  }
  if ((e.code === 'KeyN' || e.code === 'Enter') && game.state === 'playing') {
    const m = game.missions;
    if (!m.active && !m.storyDone) {
      if (m.failedIndex != null) { startMission(game, m.failedIndex); m.failedIndex = null; }
      else if (m.done < MISSIONS.length) startMission(game, m.done);
    }
  }
});
window.addEventListener('keyup', (e) => { game.input.keys[e.code] = false; });

let dragging = false, dragMoved = 0, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true; dragMoved = 0; lastX = e.clientX; lastY = e.clientY;
  game.audio.ensure();
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  game.camYaw -= dx * 0.005;
  game.camPitch = clamp(game.camPitch + dy * 0.004, -0.15, 0.55);
});
window.addEventListener('mouseup', () => {
  if (dragging && dragMoved < 6 && game.state === 'playing' && game.player.onFoot) playerShoot(game);
  dragging = false;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// --- Menu buttons.
const $ = (id) => document.getElementById(id);
$('btn-start').addEventListener('click', () => {
  game.audio.ensure();
  game.hud.hideMenu();
  game.state = 'playing';
  if (game.missions.done === 0 && !game.missions.active) startMission(game, 0);
});
$('btn-continue').addEventListener('click', () => {
  game.audio.ensure();
  const data = loadSave();
  if (data) applySave(game, data);
  game.hud.hideMenu();
  game.state = 'playing';
  game.missions.nextTimer = 3;
  game.hud.refreshAll();
});
$('btn-help').addEventListener('click', () => game.hud.showHelp());
$('btn-help-close').addEventListener('click', () => game.hud.hideHelp());
$('btn-resume').addEventListener('click', () => { game.hud.hidePause(); game.state = 'playing'; });
$('btn-save-quit').addEventListener('click', () => {
  saveGame(game);
  game.hud.hidePause();
  game.hud.showMenu();
  game.state = 'menu';
});
$('btn-busted').addEventListener('click', () => { game.hud.hideBusted(); respawn(); });
$('btn-wasted').addEventListener('click', () => { game.hud.hideWasted(); respawn(); });
$('btn-freeroam').addEventListener('click', () => game.hud.hideStoryEnd());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- The frame update: one step of the whole world.
game.tick = function tick(dt, silent) {
  game.time += dt;
  for (const c of clouds) {
    c.position.x += dt * 1.5;
    if (c.position.x > 340) c.position.x = -340;
  }
  if (game.state === 'menu') {
    const a = game.time * 0.06;
    camera.position.set(Math.sin(a) * 110, 46, Math.cos(a) * 110);
    camera.lookAt(0, 24, 0);
    game.city.update(dt, game.time);
    return;
  }
  if (game.state !== 'playing') return;
  const p = game.player;
  // Staged screenshots drive themselves so the car is moving at capture time.
  if (game.shotMode && p.car) game.input.keys['KeyW'] = true;
  if (p.onFoot) updatePlayerOnFoot(p, game.input, dt, game);
  else if (p.car) {
    updatePlayerCar(p.car, game.input, dt, game);
    p.pos.copy(p.car.pos);
    p.heading = p.car.heading;
  }
  updateTraffic(game, dt);
  updatePedestrians(game, dt);
  updatePolice(game, dt);
  if (game.state !== 'playing') return; // busted mid-update
  updateCombat(game, dt);
  updateMissions(game, dt);
  game.city.update(dt, game.time);
  if (p.health <= 0 && !game.shotMode) { game.wasted(); return; }
  if (p.health <= 0) p.health = 1; // staged screenshots never end the run
  // Level-ups pay out.
  const level = Math.floor(game.xp / ECONOMY.levelXp) + 1;
  if (level > game.level) {
    game.level = level;
    game.cash += ECONOMY.cashPerLevel;
    game.audio.levelUp();
    game.hud.showBanner('LEVEL ' + level, 'Crew respect grows — $' + ECONOMY.cashPerLevel + ' bonus');
  }
  game.saveTimer += dt;
  if (game.saveTimer > 30) { game.saveTimer = 0; saveGame(game); }
  game.hudTimer += dt;
  if (game.hudTimer > 0.15) {
    game.hudTimer = 0;
    game.hud.updateHealth();
    game.hud.updateAmmo();
    game.hud.updateSpeed();
    game.hud.updateMissionPanel();
    game.hud.updateCash();
    game.hud.updateLevel();
    game.hud.clearPrompt();
  }
  if (!silent) drawMinimap(game);
  updateCamera(game, dt);
};

// --- Boot: a screenshot scene, or the start screen over a slow orbit.
if (shotMode) {
  applyShot(game, shotMode);
  settleWorld(game, 3);
  game.hud.refreshAll();
  drawMinimap(game);
} else {
  game.hud.showMenu();
}
game.hud.refreshAll();
window.__solmar = game;

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.tick(dt, false);
  renderer.render(scene, camera);
}
frame();
