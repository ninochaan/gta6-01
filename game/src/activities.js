// activities.js — the city's side economy: taxi fares flagged by
// strolling pedestrians, a 12-checkpoint race from the pad at
// (-252, 196) worth exactly $500, and twenty hidden packages.

import * as THREE from 'three';
import { markerMesh, meshOf, box } from './geometry.js';
import { dist2d, clamp } from './rng.js';

export const RACE_START = { x: -252, z: 196 };
const RACE_POINTS = [
  [-224, 140], [-112, 168], [-56, 56], [56, 56], [112, 140], [196, 168],
  [224, 56], [168, -56], [56, -84], [56, -168], [-56, -168], [-168, -56],
];

export const PACKAGE_SPOTS = [
  [158, 278], [158, 218], [20, 62], [-20, 62], [-54, 79], [84, -52], [-196, -191],
  [0, -232], [120, -232], [-120, -232], [230, 100], [-230, -100], [6, 28], [-6, -84],
  [62, 120], [-62, -140], [118, 0], [-174, -56], [62, -224], [-118, 168],
];

export class Activities {
  constructor(scene, rng, env) {
    this.scene = scene;
    this.rng = rng;
    this.env = env; // { audio, banner, onSave, peds }
    this.taxiFlagTimer = 14;
    this.taxi = null;
    this.race = null;
    // Race marker: always shows the current checkpoint (or the start pad).
    this.raceMarker = markerMesh(0xffd94d);
    this.raceMarker.position.set(RACE_START.x, 0, RACE_START.z);
    scene.add(this.raceMarker);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3, 20), new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.5 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(RACE_START.x, 0.05, RACE_START.z);
    scene.add(pad);
    this.taxiMarker = markerMesh(0x5ea8e8);
    this.taxiMarker.visible = false;
    scene.add(this.taxiMarker);
    // Packages.
    this.pkgData = PACKAGE_SPOTS.map(([x, z], i) => {
      const mesh = meshOf([box(0, 0, 0, 0.55, 0.55, 0.55, 0x9fe870), box(0, 0, 0, 0.62, 0.2, 0.62, 0xe8f7c0)]);
      mesh.position.set(x, 0.8, z);
      scene.add(mesh);
      return { x, z, y: 0.8, found: false, mesh, i };
    });
    this.foundCount = 0;
    this.spin = 0;
  }

  applySave(foundStr) {
    if (!foundStr) return;
    this.foundCount = 0;
    this.pkgData.forEach((p, i) => {
      p.found = foundStr[i] === '1';
      p.mesh.visible = !p.found;
      if (p.found) this.foundCount++;
    });
  }

  foundString() {
    return this.pkgData.map((p) => (p.found ? '1' : '0')).join('');
  }

  startRace(H) {
    this.race = { idx: 0, points: RACE_POINTS.map(([x, z]) => ({ x, z })) };
    this.env.banner('Race on! Hit every checkpoint — $500 at the finish.');
    this.env.audio.ui();
    this.moveRaceMarker();
  }

  moveRaceMarker() {
    if (this.race) {
      const p = this.race.points[this.race.idx];
      this.raceMarker.position.set(p.x, 0, p.z);
    } else {
      this.raceMarker.position.set(RACE_START.x, 0, RACE_START.z);
    }
  }

  flagFare(H) {
    let best = null;
    let bestD = Infinity;
    for (const ped of this.env.peds.peds) {
      if (ped.state !== 'stroll') continue;
      const d = dist2d(ped.x, ped.z, H.player.x, H.player.z);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    if (!best) {
      this.taxiFlagTimer = 5;
      return;
    }
    best.state = 'waiting';
    const dx = Math.round(this.rng.range(-4, 4)) * 56 + this.rng.range(-6, 6);
    const dz = Math.round(this.rng.range(-4, 4)) * 56 + this.rng.range(-6, 6);
    this.taxi = {
      ped: best,
      dest: { x: clamp(dx, -260, 240), z: clamp(dz, -260, 200) },
      phase: 'pickup',
      pickupAt: { x: best.x, z: best.z },
    };
    this.taxiMarker.visible = true;
    this.taxiMarker.position.set(best.x, 0, best.z);
    this.env.banner('A fare is flagging you down — pick them up in a car.');
  }

  update(dt, H) {
    this.spin += dt;
    for (const p of this.pkgData) {
      if (!p.found) p.mesh.rotation.y = this.spin * 2;
    }
    // Packages: collected on foot only, within about 2.5 units.
    if (!H.player.car) {
      for (const p of this.pkgData) {
        if (p.found) continue;
        if (dist2d(H.player.x, H.player.z, p.x, p.z) < 2.5) {
          p.found = true;
          p.mesh.visible = false;
          this.foundCount++;
          H.cash += 25;
          this.env.audio.pickup();
          this.env.banner('Hidden package found — $25. ' + this.foundCount + ' of 20.');
          this.env.onSave();
        }
      }
    }
    // Taxi timer counts down only while the player is on foot.
    if (!this.taxi) {
      if (!H.player.car) {
        this.taxiFlagTimer -= dt;
        if (this.taxiFlagTimer <= 0) this.flagFare(H);
      }
    } else if (this.taxi.phase === 'pickup') {
      const ped = this.taxi.ped;
      this.taxiMarker.position.set(ped.x, 0, ped.z);
      if (H.player.car && dist2d(H.player.x, H.player.z, ped.x, ped.z) < 4) {
        this.taxi.phase = 'drive';
        ped.state = 'riding';
        this.taxiMarker.position.set(this.taxi.dest.x, 0, this.taxi.dest.z);
        this.env.banner('Fare aboard — take them to the blue marker.');
        this.env.audio.ui();
      }
    } else if (this.taxi.phase === 'drive') {
      const ped = this.taxi.ped;
      ped.x = H.player.x;
      ped.z = H.player.z;
      if (H.player.car && dist2d(H.player.x, H.player.z, this.taxi.dest.x, this.taxi.dest.z) < 6.5) {
        const trip = dist2d(this.taxi.pickupAt.x, this.taxi.pickupAt.z, this.taxi.dest.x, this.taxi.dest.z);
        const fare = Math.round(clamp(150 + trip * 0.32, 150, 250));
        H.cash += fare;
        this.env.audio.cash();
        this.env.banner('Fare delivered — $' + fare + '.');
        ped.state = 'stroll';
        ped.x = this.taxi.dest.x + 2;
        ped.z = this.taxi.dest.z + 2;
        ped.target = null;
        this.taxi = null;
        this.taxiFlagTimer = this.rng.range(14, 22);
        this.taxiMarker.visible = false;
        this.env.onSave();
      }
    }
    // Race.
    if (!this.race) {
      if (H.player.car && dist2d(H.player.x, H.player.z, RACE_START.x, RACE_START.z) < 4) {
        this.startRace(H);
      }
    } else {
      const p = this.race.points[this.race.idx];
      if (H.player.car && dist2d(H.player.x, H.player.z, p.x, p.z) < 8) {
        this.race.idx++;
        this.env.audio.pickup();
        if (this.race.idx >= this.race.points.length) {
          this.race = null;
          H.cash += 500;
          this.env.audio.cash();
          this.env.banner('Race finished — $500! The bay salutes you.');
          this.env.onSave();
        } else {
          this.env.banner('Checkpoint ' + this.race.idx + ' of 12.');
        }
        this.moveRaceMarker();
      }
    }
  }

  objectivePoint() {
    if (this.taxi) {
      if (this.taxi.phase === 'pickup') return { x: this.taxi.ped.x, z: this.taxi.ped.z };
      return { x: this.taxi.dest.x, z: this.taxi.dest.z };
    }
    if (this.race) return this.race.points[this.race.idx];
    return null;
  }
}
