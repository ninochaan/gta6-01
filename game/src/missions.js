// missions.js — Rico's story: five jobs from Marisol Vega, told through
// objective banners with short story beats. Step types: goto (on foot),
// enterMissionCar, drive, fight, escape (reach with zero stars), hold.
// Every step point sits on a road, the marina grounds, the pier, or a
// reserved interior, so it can always actually be reached.

import { Car } from './vehicles.js';
import { dist2d } from './rng.js';

export const MISSION_DEFS = [
  {
    title: 'First Wheels',
    intro: 'Marisol Vega: "Rico. Walk to my office, take the coupe, and park it clean by the marina. Simple money."',
    reward: 250,
    start: { x: 12, z: 84 },
    steps: [
      { type: 'goto', x: 26, z: 86, label: 'Reach Marisol\u2019s beachfront office' },
      { type: 'enterMissionCar', x: 14, z: 58, label: 'Get into the coupe Marisol left for you' },
      { type: 'drive', x: 128, z: 176, label: 'Drive the coupe to the marina lot' },
    ],
    gang: null,
  },
  {
    title: 'Package for the Pier',
    intro: 'Marisol: "A package waits at the end of the marina pier. The Palma crew disagrees. Settle it."',
    reward: 450,
    start: { x: 12, z: 84 },
    steps: [
      { type: 'drive', x: 132, z: 188, label: 'Drive to the marina' },
      { type: 'goto', x: 158, z: 272, label: 'Walk the pier to the package' },
      { type: 'fight', x: 158, z: 250, label: 'Drive off the Palma crew' },
      { type: 'escape', x: 26, z: 86, label: 'Lose the heat and return to Marisol\u2019s office' },
    ],
    gang: [[150, 246], [166, 246], [158, 232], [150, 262]],
  },
  {
    title: 'Tito\u2019s Favour',
    intro: 'Tito Ramos: "My tow rig got pinched downtown. Bring her home to the garage, primo."',
    reward: 700,
    start: { x: -44, z: 108 },
    steps: [
      { type: 'goto', x: -6, z: 28, label: 'Find Tito\u2019s rig downtown' },
      { type: 'enterMissionCar', x: -6, z: 20, label: 'Get into Tito\u2019s rig' },
      { type: 'drive', x: -54, z: 86, label: 'Bring the rig onto the garage repair pad' },
      { type: 'hold', x: -54, z: 86, label: 'Hold position while Tito checks her over', holdTime: 6 },
    ],
    gang: null,
  },
  {
    title: 'The Brisa Shakedown',
    intro: 'Marisol: "The Palma crew is leaning on Tienda Brisa. Go lean back — then vanish."',
    reward: 950,
    start: { x: 12, z: 84 },
    steps: [
      { type: 'drive', x: 84, z: -36, label: 'Drive to Tienda Brisa' },
      { type: 'fight', x: 84, z: -40, label: 'Clear the Palma crew from the shop' },
      { type: 'escape', x: -196, z: -186, label: 'Reach the safehouse with no heat' },
    ],
    gang: [[74, -34], [94, -34], [84, -26], [70, -44], [98, -44]],
  },
  {
    title: 'Bay Run',
    intro: 'Marisol: "Last job, Rico. Take my sedan, hold the pier drop while I count, and bring us home rich."',
    reward: 1200,
    start: { x: 12, z: 84 },
    steps: [
      { type: 'enterMissionCar', x: 18, z: 74, label: 'Take Marisol\u2019s sedan' },
      { type: 'drive', x: 140, z: 190, label: 'Drive to the marina drop' },
      { type: 'hold', x: 140, z: 190, label: 'Hold the drop point while Marisol counts', holdTime: 6 },
      { type: 'fight', x: 140, z: 190, label: 'Fight off the Palma ambush' },
      { type: 'escape', x: 26, z: 86, label: 'Escape back to Marisol\u2019s office, clean' },
    ],
    gang: [[128, 178], [152, 178], [140, 168], [120, 182], [156, 196], [140, 206]],
  },
];

export class Missions {
  constructor(scene, env) {
    this.scene = scene;
    this.env = env; // { combat, registerCar, banner, audio, onSave }
    this.index = 0;
    this.active = null;
    this.complete = false;
    this.holdT = 0;
  }

  get currentDef() {
    return this.complete ? null : MISSION_DEFS[this.index];
  }

  startMission(H) {
    const def = this.currentDef;
    if (!def || this.active) return;
    this.active = { def, stepIdx: 0, missionCar: null };
    this.holdT = 0;
    this.env.banner(def.title + ' — ' + def.intro);
    this.advanceSetup(H);
  }

  // Spawn whatever the current step needs (mission car, gang).
  advanceSetup(H) {
    const a = this.active;
    if (!a) return;
    const step = a.def.steps[a.stepIdx];
    if (!step) return;
    if (step.type === 'enterMissionCar' && !a.missionCar) {
      const car = new Car(this.scene, step.x, step.z, 0.6, 0xd9b23c, false);
      car.missionCar = true;
      a.missionCar = car;
      this.env.registerCar(car);
    }
    if (step.type === 'fight' && a.def.gang) {
      this.env.combat.spawnGang(a.def.gang);
      H.wanted.addHeat(1, H.now);
    }
    this.env.banner(step.label);
  }

  finishStep(H) {
    const a = this.active;
    a.stepIdx += 1;
    this.holdT = 0;
    if (a.stepIdx >= a.def.steps.length) {
      const reward = a.def.reward;
      this.active = null;
      this.index += 1;
      if (this.index >= MISSION_DEFS.length) this.complete = true;
      H.cash += reward;
      this.env.audio.cash();
      this.env.banner('Mission complete: ' + a.def.title + ' — $' + reward + ' earned.');
      this.env.onSave();
      return;
    }
    this.advanceSetup(H);
  }

  currentStep() {
    if (!this.active) return null;
    return this.active.def.steps[this.active.stepIdx] || null;
  }

  update(dt, H) {
    if (!this.active) {
      // Standing on the next mission's start point begins it — on foot or
      // still seated in the car you arrived in. Requiring on-foot here
      // dead-locked the chain: a finished drive step leaves the player in
      // the mission car at the drop-off, so the next mission's start point
      // could never trigger for a driver who rolls straight back to it.
      const def = this.currentDef;
      if (def && dist2d(H.player.x, H.player.z, def.start.x, def.start.z) < 3.2) {
        this.startMission(H);
      }
      return;
    }
    const step = this.currentStep();
    if (!step) return;
    const px = H.player.x;
    const pz = H.player.z;
    const d = step.x !== undefined ? dist2d(px, pz, step.x, step.z) : Infinity;
    switch (step.type) {
      case 'goto':
        if (!H.player.car && d < 3) this.finishStep(H);
        break;
      case 'enterMissionCar':
        if (H.player.car && this.active.missionCar && H.player.car === this.active.missionCar) this.finishStep(H);
        break;
      case 'drive':
        if (H.player.car && d < 7) this.finishStep(H);
        break;
      case 'fight':
        if (this.env.combat.gangAlive() === 0 && this.env.combat.gang.length > 0) this.finishStep(H);
        break;
      case 'escape':
        if (d < 6 && H.wanted.level === 0) this.finishStep(H);
        break;
      case 'hold':
        if (d < 6) {
          this.holdT += dt;
          if (this.holdT >= (step.holdTime || 6)) this.finishStep(H);
        } else {
          this.holdT = Math.max(0, this.holdT - dt);
        }
        break;
    }
  }

  // The objective point the HUD/minimap should mark right now.
  objectivePoint() {
    if (this.active) {
      const s = this.currentStep();
      if (s && s.x !== undefined) return { x: s.x, z: s.z, label: s.label };
      return null;
    }
    const def = this.currentDef;
    if (def) return { x: def.start.x, z: def.start.z, label: 'Meet Marisol Vega — ' + def.title };
    return null;
  }
}
