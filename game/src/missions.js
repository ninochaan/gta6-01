// missions.js — Marisol Vega's five-job story chain for Rico, plus the
// repeatable side work: taxi fares, a checkpoint street race, and the 20
// hidden packages scattered over Solmar Bay. Markers are glowing rings in
// the world and blips on the minimap.

import * as THREE from '../vendor/three.min.js';
import { createCar } from './vehicles.js';
import { ROAD_LINES } from './city.js';

export function makeMarker(scene, color = 0xffd23a) {
  const geo = new THREE.CylinderGeometry(2.2, 2.2, 14, 20, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 7;
  const group = new THREE.Group();
  group.add(mesh);
  group.visible = false;
  scene.add(group);
  return group;
}

const STORY = [
  {
    title: 'FIRST WHEELS', sub: 'Marisol Vega has a job for you',
    start: { x: 146, z: 186 }, reward: 250,
    intro: [['MARISOL VEGA', 'Rico! You made it off the ferry. I need a driver, not a tourist.'],
            ['MARISOL VEGA', 'There is a Veloz coupe waiting on the boulevard. Take it west, to the old lighthouse point.']],
    steps: [
      { type: 'goto', x: 158, z: 190, r: 6, text: 'Get to the Veloz coupe on the boulevard' },
      { type: 'enterMissionCar', text: 'Get in the Veloz coupe' },
      { type: 'drive', x: -196, z: 196, r: 9, text: 'Drive west along the boulevard' },
    ],
    outro: [['MARISOL VEGA', 'Smooth. The bay might just make a wheelman of you yet.']],
  },
  {
    title: 'PACKAGE RUN', sub: 'A quiet pickup. Probably.',
    start: { x: 12, z: -138 }, reward: 400,
    intro: [['MARISOL VEGA', 'Pick up a crate behind the Farmacia Luna, downtown.'],
            ['MARISOL VEGA', 'Deliver it to the Hotel Brisa garage. If the PD notice… they notice.']],
    steps: [
      { type: 'goto', x: 10, z: -145, r: 5, text: 'Collect the package behind the Farmacia' },
      { type: 'drive', x: -120, z: 186, r: 9, text: 'Deliver the package to Hotel Brisa', heat: 2 },
    ],
    outro: [['MARISOL VEGA', 'Delivered, and barely a scratch on the paint. Good.']],
  },
  {
    title: 'BAD NEIGHBOURS', sub: 'Los Brasa are leaning on Marisol’s shops',
    start: { x: 62, z: 62 }, reward: 600,
    intro: [['TITO RAMOS', 'Los Brasa think this block is theirs now, hermano.'],
            ['TITO RAMOS', 'Four of them, by the east alley. Send a message — a loud one.']],
    steps: [
      { type: 'goto', x: 69, z: 69, r: 7, text: 'Confront Los Brasa in the east alley' },
      { type: 'fight', x: 69, z: 69, n: 4, text: 'Drive off Los Brasa (0/4)' },
    ],
    outro: [['TITO RAMOS', 'Message received, all over the block. You are family now.']],
  },
  {
    title: 'HARBOUR HEAT', sub: 'The marina deal goes sideways',
    start: { x: 150, z: 232 }, reward: 800,
    intro: [['MARISOL VEGA', 'Meet my contact at the marina pier. Cash for the harbour ledger.'],
            ['MARISOL VEGA', 'If it smells wrong, run. The safehouse is home — lose the heat, then knock.']],
    steps: [
      { type: 'goto', x: 158, z: 258, r: 7, text: 'Meet the contact on the marina pier' },
      { type: 'escape', x: -38, z: 121, r: 6, text: 'Lose the police, then reach the safehouse door', heat: 3 },
    ],
    outro: [['MARISOL VEGA', 'You walked out of a trap with the ledger. Captain Ruiz will hate that.']],
  },
  {
    title: 'THE SOLMAR JOB', sub: 'One vault. One sunset. No mistakes.',
    start: { x: 14, z: -62 }, reward: 1500,
    intro: [['MARISOL VEGA', 'Banco del Sol, north downtown. The vault crew is already inside.'],
            ['MARISOL VEGA', 'Hold the door for them, then bring the take home. Every star in the sky will follow.']],
    steps: [
      { type: 'goto', x: 10, z: -69, r: 6, text: 'Get to Banco del Sol' },
      { type: 'hold', x: 10, z: -69, r: 7, secs: 6, text: 'Hold position while the crew works…', heat: 4 },
      { type: 'drive', x: -38, z: 124, r: 7, text: 'Bring the take to the safehouse' },
    ],
    outro: [['MARISOL VEGA', 'That is the bay paid in full, Rico. The rest of the summer is ours.'],
           ['SOLMAR BAY', 'Story complete — the city stays open. Taxis, races and packages remain.']],
  },
];

export class StoryMissions {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;              // next mission to offer
    this.active = null;          // {def, stepIdx, missionCar, holdT, spawned}
    this.marker = makeMarker(scene, 0xffd23a);
    this.startMarker = makeMarker(scene, 0x51e07a);
    this.complete = false;
  }
  get currentDef() { return STORY[this.index] || null; }
  saveState() { return { index: this.index, complete: this.complete }; }
  loadState(s) { if (s) { this.index = s.index ?? 0; this.complete = !!s.complete; } }

  update(dt, G) {
    const def = this.currentDef;
    // idle: offer the next mission at its start marker
    if (!this.active) {
      this.marker.visible = false;
      if (!def || this.complete) { this.startMarker.visible = false; G.blips.story = null; return; }
      this.startMarker.visible = true;
      this.startMarker.position.set(def.start.x, 0, def.start.z);
      G.blips.objective = def.start;
      G.objectiveText = `Go to the green marker — ${def.title} ($${def.reward})`;
      const p = G.playerPos;
      if (Math.hypot(p.x - def.start.x, p.z - def.start.z) < 4 && !G.playerInCar) this.begin(G);
      return;
    }
    const a = this.active;
    const step = a.def.steps[a.stepIdx];
    if (!step) { this.finish(G); return; }
    // heat applied once when the step begins
    if (!step._heated) { step._heated = true; if (step.heat) G.setWantedAtLeast(step.heat); }
    let done = false;
    const p = G.playerPos;
    const distTo = (x, z) => Math.hypot(p.x - x, p.z - z);
    switch (step.type) {
      case 'goto':
        this.showMarker(step.x, step.z);
        G.objectiveText = step.text;
        done = distTo(step.x, step.z) < step.r;
        break;
      case 'drive':
        this.showMarker(step.x, step.z);
        G.objectiveText = step.text;
        done = G.playerInCar && distTo(step.x, step.z) < step.r;
        if (!G.playerInCar) G.objectiveText = step.text + ' (you need wheels)';
        break;
      case 'enterMissionCar': {
        this.marker.visible = false;
        G.objectiveText = step.text;
        if (a.missionCar) G.blips.objective = a.missionCar;
        done = G.playerInCar && G.playerCar === a.missionCar;
        break;
      }
      case 'fight': {
        if (!a.spawned) {
          a.spawned = true;
          G.combat.spawnGang(step.x, step.z, step.n);
          G.hud.banner('TITO RAMOS', 'There they are — Los Brasa red. Watch the crossfire!');
        }
        this.marker.visible = false;
        const alive = G.combat.gangAlive();
        G.objectiveText = `Drive off Los Brasa (${step.n - alive}/${step.n})`;
        G.blips.objective = { x: step.x, z: step.z };
        done = alive <= 0;
        if (done) G.combat.clearGang();
        break;
      }
      case 'escape':
        this.showMarker(step.x, step.z);
        G.objectiveText = G.wanted.level > 0 ? 'Lose the police first (break line of sight)' : step.text;
        done = G.wanted.level <= 0 && distTo(step.x, step.z) < step.r;
        break;
      case 'hold': {
        this.showMarker(step.x, step.z);
        if (distTo(step.x, step.z) < step.r) {
          a.holdT = (a.holdT || 0) + dt;
          G.objectiveText = `${step.text} ${Math.max(0, step.secs - a.holdT).toFixed(0)}s`;
          done = a.holdT >= step.secs;
        } else G.objectiveText = step.text;
        break;
      }
    }
    if (done) {
      a.stepIdx++;
      G.audio.chime();
      if (a.stepIdx >= a.def.steps.length) this.finish(G);
    }
  }
  showMarker(x, z) {
    this.marker.visible = true;
    this.marker.position.set(x, 0, z);
    this.marker.rotation.y += 0.02;
  }
  begin(G) {
    const def = this.currentDef;
    this.active = { def, stepIdx: 0, missionCar: null, spawned: false, holdT: 0 };
    this.startMarker.visible = false;
    G.hud.missionTitle(def.title, def.sub);
    for (const [who, line] of def.intro) G.hud.banner(who, line);
    // mission 1 spawns its coupe when the player nears the boulevard step
    if (this.index === 0) {
      const car = createCar(G.scene, 0xe39a2d, {});
      car.setPos(158, 192.5, Math.PI / 2);
      car.parked = true;
      this.active.missionCar = car;
      G.extraCars.push(car);
    }
    G.audio.jingle();
  }
  finish(G) {
    const def = this.active.def;
    G.addCash(def.reward);
    G.hud.banner('MISSION COMPLETE', `${def.title} — $${def.reward} earned`);
    for (const [who, line] of def.outro) G.hud.banner(who, line);
    G.audio.jingle();
    if (this.active.missionCar && G.playerCar !== this.active.missionCar) {
      // leave the coupe in the world as a normal parked car
      const i = G.extraCars.indexOf(this.active.missionCar);
      if (i >= 0) G.extraCars.splice(i, 1);
      G.traffic.parked.push(this.active.missionCar);
    }
    this.active = null;
    this.index++;
    if (this.index >= STORY.length) this.complete = true;
    G.saveGame();
  }
}

// ---------------------------------------------------------------------------
// Side activities: taxi fares, the boulevard checkpoint race, hidden packages.
const RACE_POINTS = [
  [-160, 196], [-40, 196], [80, 196], [200, 196], [221, 110], [221, 6], [150, -69],
  [40, -76], [-80, -69], [-180, 6], [-221, 110], [-252, 196],
];
const RACE_PAR = 175;

export class Activities {
  constructor(scene, city, rng) {
    this.scene = scene; this.rng = rng;
    this.marker = makeMarker(scene, 0x51e07a);
    this.raceMarker = makeMarker(scene, 0xc77dff);
    // packages: one instanced mesh of spinning teal gems
    const geo = new THREE.OctahedronGeometry(0.55);
    this.pkgMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x2affd8 }), city.packages.length);
    this.pkgData = city.packages.map((p) => ({ ...p, found: false }));
    this.dummy = new THREE.Object3D();
    this.refreshPackages(0);
    scene.add(this.pkgMesh);
    this.foundCount = 0;
    // taxi state
    this.taxi = null;              // {ped, phase:'pickup'|'drive', dest, timer}
    this.taxiFlagTimer = 6;
    this.flagMesh = makeMarker(scene, 0x51e07a);
    this.flagMesh.scale.setScalar(0.35);
    // race state
    this.race = null;              // {idx, timer}
    this.raceCooldown = 0;
  }
  refreshPackages(t) {
    this.pkgData.forEach((p, i) => {
      this.dummy.position.set(p.x, p.y + Math.sin(t * 2 + i) * 0.15, p.z);
      this.dummy.rotation.set(0, t * 1.6 + i, 0);
      this.dummy.scale.setScalar(p.found ? 0.0001 : 1);
      this.dummy.updateMatrix();
      this.pkgMesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.pkgMesh.instanceMatrix.needsUpdate = true;
  }
  saveState() { return { found: this.pkgData.map((p) => p.found ? 1 : 0).join('') }; }
  loadState(s) {
    if (!s || !s.found) return;
    this.pkgData.forEach((p, i) => { p.found = s.found[i] === '1'; });
    this.foundCount = this.pkgData.filter((p) => p.found).length;
    this.refreshPackages(0);
  }

  update(dt, G) {
    this.refreshPackages(G.now);
    const p = G.playerPos;
    // --- packages ------------------------------------------------------------
    for (const pkg of this.pkgData) {
      if (pkg.found) continue;
      const reach = G.playerInCar ? 2.9 : 2.1;
      if (Math.hypot(p.x - pkg.x, p.z - pkg.z) < reach && pkg.y < 3.4) {
        pkg.found = true; this.foundCount++;
        G.addCash(25);
        G.audio.chime();
        G.hud.banner('HIDDEN PACKAGE', `${this.foundCount} of ${this.pkgData.length} found — $25`);
        if (this.foundCount % 5 === 0) { G.addCash(150); G.hud.banner('PACKAGE BONUS', 'Every fifth package pays an extra $150'); }
        G.saveGame();
      }
    }
    G.packageBlips = this.pkgData.filter((k) => !k.found);
    // --- taxi ------------------------------------------------------------------
    this.updateTaxi(dt, G);
    // --- race ------------------------------------------------------------------
    this.updateRace(dt, G);
  }

  updateTaxi(dt, G) {
    const p = G.playerPos;
    if (!this.taxi) {
      this.taxiFlagTimer -= dt;
      if (this.taxiFlagTimer <= 0) {
        this.taxiFlagTimer = 20;
        // flag the nearest strolling pedestrian as a fare
        let best = null, bd = 60;
        for (const ped of G.peds.peds) {
          if (ped.dead || ped.gang || ped.wantsTaxi) continue;
          const d = Math.hypot(ped.x - p.x, ped.z - p.z);
          if (d < bd) { bd = d; best = ped; }
        }
        if (best) {
          best.wantsTaxi = true; best.state = 'wait'; best.waitT = 9999;
          this.taxi = { ped: best, phase: 'pickup', dest: null, timer: 0 };
        }
      }
      this.flagMesh.visible = false;
      G.blips.taxi = null;
      return;
    }
    const t = this.taxi, ped = t.ped;
    if (ped.dead) { this.taxi = null; ped.wantsTaxi = false; return; }
    if (t.phase === 'pickup') {
      this.flagMesh.visible = true;
      this.flagMesh.position.set(ped.x, 1.2, ped.z);
      G.blips.taxi = ped;
      if (G.playerInCar && Math.hypot(G.playerCar.x - ped.x, G.playerCar.z - ped.z) < 5.5 && Math.abs(G.playerCar.speed) < 1.2) {
        ped.isPassenger = true; ped.group.visible = false; ped.wantsTaxi = false;
        t.phase = 'drive';
        const dx = ROAD_LINES[this.rng.int(0, ROAD_LINES.length - 1)], dz = ROAD_LINES[this.rng.int(0, ROAD_LINES.length - 1)];
        t.dest = { x: dx + this.rng.range(-4, 4), z: Math.min(dz, 186) };
        const dist = Math.hypot(t.dest.x - ped.x, t.dest.z - ped.z);
        t.timer = 26 + dist / 7.5;
        t.dist = dist;
        this.marker.visible = true;
        this.marker.position.set(t.dest.x, 0, t.dest.z);
        G.hud.banner('TAXI', 'Fare on board! Follow the green marker — the clock is running.');
        G.audio.chime();
      } else if (Math.hypot(ped.x - p.x, ped.z - p.z) > 130) {
        ped.wantsTaxi = false; ped.state = 'walk'; this.taxi = null; // gave up waiting
      }
      return;
    }
    // driving the fare
    G.blips.taxi = t.dest;
    t.timer -= dt;
    G.hud.setTimer(`TAXI ${Math.max(0, t.timer).toFixed(0)}s`);
    if (!G.activityObjective) G.activityObjective = `Taxi: drive your fare to the green marker — ${Math.max(0, t.timer).toFixed(0)}s left`;
    if (t.timer <= 0) {
      G.hud.banner('TAXI', 'Too slow — the fare walks away annoyed.');
      G.audio.fail();
      this.endTaxi(G, false);
      return;
    }
    if (Math.hypot(G.playerPos.x - t.dest.x, G.playerPos.z - t.dest.z) < 8 && G.playerSpeedAbs < 2) {
      const pay = Math.round(35 + t.dist * 0.32 + Math.max(0, t.timer) * 1.2);
      G.addCash(pay);
      G.hud.banner('TAXI', `Fare delivered — $${pay}. Solmar thanks you.`);
      G.audio.cash();
      this.endTaxi(G, true);
    }
  }
  endTaxi(G, happy) {
    const ped = this.taxi.ped;
    ped.isPassenger = false;
    ped.group.visible = true;
    ped.x = G.playerPos.x + 2.5; ped.z = G.playerPos.z + 1;
    ped.state = happy ? 'walk' : 'flee';
    if (!happy) { ped.panic = 1.6; ped.fleeFrom = { x: G.playerPos.x, z: G.playerPos.z }; }
    this.marker.visible = false;
    G.hud.setTimer(null);
    G.blips.taxi = null;
    this.taxi = null;
    this.taxiFlagTimer = 26;
  }

  updateRace(dt, G) {
    this.raceCooldown -= dt;
    const start = { x: -252, z: 196 };
    if (!this.race) {
      this.raceMarker.visible = this.raceCooldown <= 0;
      this.raceMarker.position.set(start.x, 0, start.z);
      G.blips.race = this.raceCooldown <= 0 ? start : null;
      if (this.raceCooldown <= 0 && G.playerInCar && Math.hypot(G.playerPos.x - start.x, G.playerPos.z - start.z) < 7) {
        this.race = { idx: 0, timer: RACE_PAR };
        this.raceMarker.visible = false;
        G.hud.banner('STREET RACE', `Hit every purple checkpoint before the clock dies. Par ${RACE_PAR}s — $500 prize.`);
        G.audio.jingle();
      }
      return;
    }
    const r = this.race;
    r.timer -= dt;
    const cp = RACE_POINTS[r.idx];
    this.raceMarker.visible = true;
    this.raceMarker.position.set(cp[0], 0, cp[1]);
    G.blips.race = { x: cp[0], z: cp[1] };
    G.hud.setTimer(`RACE ${Math.max(0, r.timer).toFixed(0)}s · CP ${r.idx + 1}/${RACE_POINTS.length}`);
    if (!G.activityObjective) G.activityObjective = `Race: checkpoint ${r.idx + 1} of ${RACE_POINTS.length}`;
    if (r.timer <= 0) {
      G.hud.banner('STREET RACE', 'Out of time. The boulevard keeps its crown.');
      G.audio.fail();
      this.race = null; this.raceCooldown = 20;
      G.hud.setTimer(null); G.blips.race = null;
      return;
    }
    if (Math.hypot(G.playerPos.x - cp[0], G.playerPos.z - cp[1]) < 10) {
      r.idx++;
      G.audio.chime();
      if (r.idx >= RACE_POINTS.length) {
        G.addCash(500);
        G.hud.banner('STREET RACE', `Finished with ${r.timer.toFixed(0)}s to spare — $500 prize!`);
        G.audio.jingle();
        this.race = null; this.raceCooldown = 45;
        G.hud.setTimer(null); G.blips.race = null;
      }
    }
  }
}
