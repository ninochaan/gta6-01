// The story of Solmar Bay: five linked jobs for Ray Marlowe, from coming home
// to stealing the Commodore's gold coupe. Each job is a list of steps with a
// beacon in the world, a marker on the minimap, timers and fail states.
import * as THREE from 'three';
import { ECONOMY } from './config.js';
import { groundDist } from './rng.js';
import { spawnEnemies, clearEnemies } from './combat.js';
import { setWanted } from './police.js';
import { spawnPrizeCar } from './vehicles.js';
import { saveGame } from './save.js';

export const MISSIONS = [
  {
    id: 'homecoming', title: '1 — Homecoming', giver: 'Lena Voss',
    briefing: 'Ray is back in Solmar Bay after five years away. Lena waits at the corner cafe — go say hello, then walk her to the tower plaza.',
    reward: 300,
    steps: [
      { text: 'Meet Lena at the corner cafe', kind: 'goto', x: 60, z: 40, radius: 6 },
      { text: 'Walk Lena to the tower plaza', kind: 'goto', x: 40, z: 20, radius: 8 },
    ],
  },
  {
    id: 'pickup', title: '2 — The Pickup', giver: 'Marco Hale',
    briefing: 'Marco needs a crate collected from the old warehouse on the west side and brought to his garage. No questions, no peeking. Press E at the crate.',
    reward: 500,
    steps: [
      { text: 'Go to the west warehouse', kind: 'goto', x: -160, z: -160, radius: 8 },
      { text: 'Press E to pick up the crate', kind: 'interact', x: -160, z: -160, radius: 5 },
      { text: 'Deliver the crate to Marco\u2019s garage', kind: 'goto', x: 160, z: 160, radius: 8 },
    ],
  },
  {
    id: 'getaway', title: '3 — Getaway Driver', giver: 'Lena Voss',
    briefing: 'A courier run across town — three drops, one hundred seconds, and the police already on your tail. Drive fast, stay on the roads.',
    reward: 800, time: 100,
    onStart(game) { setWanted(game, 2); },
    steps: [
      { text: 'Drop 1: the north avenue', kind: 'goto', x: -240, z: 80, radius: 12 },
      { text: 'Drop 2: the east docks road', kind: 'goto', x: 80, z: -240, radius: 12 },
      { text: 'Drop 3: the south corner', kind: 'goto', x: 240, z: 240, radius: 12 },
    ],
  },
  {
    id: 'turf', title: '4 — Turf War', giver: 'Marco Hale',
    briefing: 'The Commodore\u2019s crew is muscling into the docks. Go to the south docks and send all five of his gunmen packing. Pistol ready.',
    reward: 1000,
    onStart(game) {
      spawnEnemies(game, [
        { x: -248, z: 232 }, { x: -232, z: 248 }, { x: -240, z: 220 },
        { x: -256, z: 240 }, { x: -224, z: 236 },
      ]);
    },
    steps: [
      { text: 'Reach the south docks', kind: 'goto', x: -240, z: 232, radius: 14 },
      { text: 'Take out the Commodore\u2019s gunmen (0/5)', kind: 'kill', x: -240, z: 232, radius: 20 },
    ],
  },
  {
    id: 'heist', title: '5 — The Harbor Heist', giver: 'Lena Voss',
    briefing: 'The big one. The Commodore\u2019s gold coupe sits at the harbor under guard. Steal it, lose the heat, and bring it to Marco\u2019s garage before the clock runs out.',
    reward: 2000, time: 180,
    onStart(game) {
      setWanted(game, 3);
      spawnPrizeCar(game, 240, 240, Math.PI);
      spawnEnemies(game, [{ x: 232, z: 232 }, { x: 248, z: 248 }]);
    },
    steps: [
      { text: 'Reach the gold coupe at the harbor', kind: 'goto', x: 240, z: 240, radius: 10 },
      { text: 'Steal the Commodore\u2019s coupe (press E)', kind: 'steal', x: 240, z: 240, radius: 8 },
      { text: 'Deliver the coupe to Marco\u2019s garage', kind: 'deliver', x: 160, z: 160, radius: 10 },
    ],
  },
];

export function createMissions(game) {
  return {
    done: 0,                 // jobs finished
    active: null,            // {def, step, timer, beacon, ring}
    nextTimer: 0,            // countdown to auto-start the next job
    storyDone: false,
  };
}

function makeBeacon(game, x, z) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
  );
  beam.position.y = 30;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 3.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd860, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);
  group.position.set(x, 0, z);
  game.scene.add(group);
  return group;
}

export function startMission(game, index) {
  const def = MISSIONS[index];
  if (!def) return false;
  const m = game.missions;
  if (m.active) clearBeacon(game);
  clearEnemies(game);
  const step = def.steps[0];
  const beacon = makeBeacon(game, step.x, step.z);
  m.active = { def, step: 0, timer: def.time || 0, beacon, index };
  game.hud.showBanner(def.title, def.briefing);
  game.hud.showMessage(def.giver + ': ' + def.steps[0].text);
  game.audio.pickup();
  if (def.onStart) def.onStart(game);
  return true;
}

function clearBeacon(game) {
  const m = game.missions;
  if (m.active && m.active.beacon) game.scene.remove(m.active.beacon);
}

export function currentTarget(game) {
  const m = game.missions;
  if (!m.active) return null;
  const step = m.active.def.steps[m.active.step];
  return { x: step.x, z: step.z };
}

function advanceStep(game) {
  const m = game.missions;
  const a = m.active;
  a.step += 1;
  if (a.step >= a.def.steps.length) { completeMission(game); return; }
  const step = a.def.steps[a.step];
  game.scene.remove(a.beacon);
  a.beacon = makeBeacon(game, step.x, step.z);
  game.hud.showMessage(step.text);
  game.audio.pickup();
}

function completeMission(game) {
  const m = game.missions;
  const a = m.active;
  clearBeacon(game);
  clearEnemies(game);
  game.cash += a.def.reward;
  game.xp += ECONOMY.missionXp;
  const levelBefore = Math.floor(game.xp / ECONOMY.levelXp) + 1;
  m.done += 1;
  m.active = null;
  game.audio.missionDone();
  game.hud.showBanner('JOB DONE', a.def.title + ' — $' + a.def.reward + ' earned');
  game.hud.showMessage('Cash $' + game.cash + ' — level ' + levelBefore);
  saveGame(game);
  if (m.done >= MISSIONS.length) {
    m.storyDone = true;
    game.hud.showStoryEnd();
    return;
  }
  m.nextTimer = 5; // the next job starts itself shortly
}

export function failMission(game, reason) {
  const m = game.missions;
  if (!m.active) return;
  const a = m.active;
  clearBeacon(game);
  clearEnemies(game);
  game.audio.missionFail();
  game.hud.showBanner('JOB FAILED', reason);
  game.hud.showMessage('Press N to try the job again');
  m.active = null;
  m.failedIndex = a.index;
}

export function updateMissions(game, dt) {
  const m = game.missions;
  if (!m.active) {
    if (m.nextTimer > 0) {
      m.nextTimer -= dt;
      if (m.nextTimer <= 0 && m.done < MISSIONS.length && !m.storyDone) {
        startMission(game, m.done);
      }
    }
    return;
  }
  const a = m.active;
  const step = a.def.steps[a.step];
  if (a.timer > 0) {
    a.timer -= dt;
    if (a.timer <= 0) { failMission(game, 'Out of time on ' + a.def.title); return; }
  }
  const px = game.player.pos.x, pz = game.player.pos.z;
  const d = groundDist(px, pz, step.x, step.z);
  if (step.kind === 'goto' || step.kind === 'interact' || step.kind === 'steal') {
    if (d < step.radius) {
      if (step.kind === 'goto') { advanceStep(game); return; }
      if (step.kind === 'interact' && game.interactPressed) {
        game.interactPressed = false;
        game.audio.pickup();
        game.hud.showMessage('Crate secured');
        advanceStep(game); return;
      }
      if (step.kind === 'steal') {
        const car = game.player.car;
        if (car && car.prize) { advanceStep(game); return; }
        game.hud.showPrompt('Press E to steal the gold coupe');
      }
      if (step.kind === 'interact') game.hud.showPrompt('Press E to pick up the crate');
    }
  } else if (step.kind === 'kill') {
    const left = game.combat.enemies.length;
    const total = 5;
    step.text = 'Take out the Commodore\u2019s gunmen (' + (total - left) + '/' + total + ')';
    if (left === 0) { advanceStep(game); return; }
  } else if (step.kind === 'deliver') {
    const car = game.player.car;
    if (d < step.radius && car && car.prize) { advanceStep(game); return; }
    if (d < step.radius && !(car && car.prize)) game.hud.showPrompt('Bring the gold coupe here');
  }
}
