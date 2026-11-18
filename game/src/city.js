// city.js — Solmar Bay's layout: a road grid every 56 units from -280 to
// +280, seeded buildings with colliders in every quadrant, a downtown
// core, the beachfront boulevard, the east marina with its pier, and the
// three enterable interiors (safehouse, Tito's Garage, Tienda Brisa).

import * as THREE from 'three';
import { facadeTexture, groundTexture, waterTexture, posterTexture } from './textures.js';
import { mergeBoxes, meshOf, box, palmCrownGeometry, lampGeometry, boatMesh, colourMaterial } from './geometry.js';

export const GRID = 56;
export const ROAD_HALF = 7;

const RESERVED = [
  { x0: -84, z0: 56, x1: -28, z1: 112 },    // Tito's Garage block
  { x0: 56, z0: -84, x1: 112, z1: -28 },    // Tienda Brisa block
  { x0: -224, z0: -224, x1: -168, z1: -168 }, // safehouse block
  { x0: 0, z0: 56, x1: 56, z1: 112 },       // Marisol Vega's office plaza
  { x0: -280, z0: 168, x1: -224, z1: 224 }, // the race start pad block: the
  // pad at (-252, 196) is this block's centre, and a building spawning
  // there ejects every car that tries to sit on the pad, so the race
  // could never start. The block stays open ground on every seed.
];

function inReserved(bx, bz) {
  return RESERVED.some((r) => bx >= r.x0 && bz >= r.z0 && bx < r.x1 && bz < r.z1);
}

export class City {
  constructor(scene, rng) {
    this.colliders = [];
    this.boats = [];
    this.policeStation = { x: 20, z: 66 };
    this.hospital = { x: -20, z: 66 };
    this.buildGround(scene);
    this.buildSea(scene);
    this.buildBuildings(scene, rng);
    this.buildPalmsAndLamps(scene, rng);
    this.buildMarina(scene, rng);
    this.garage = this.buildGarage(scene);
    this.shop = this.buildShop(scene);
    this.safehouse = this.buildSafehouse(scene);
    this.buildLandmarks(scene);
  }

  buildGround(scene) {
    const tex = groundTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  buildSea(scene) {
    this.waterTex = waterTexture();
    this.waterTex.repeat.set(10, 10);
    const mat = new THREE.MeshLambertMaterial({ map: this.waterTex, transparent: true, opacity: 0.94 });
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(230, 110), mat);
    bay.rotation.x = -Math.PI / 2;
    bay.position.set(205, 0.04, 252);
    scene.add(bay);
    const south = new THREE.Mesh(new THREE.PlaneGeometry(900, 220), mat);
    south.rotation.x = -Math.PI / 2;
    south.position.set(0, -0.15, -380);
    scene.add(south);
    const east = new THREE.Mesh(new THREE.PlaneGeometry(220, 700), mat);
    east.rotation.x = -Math.PI / 2;
    east.position.set(370, -0.15, 0);
    scene.add(east);
  }

  addBuilding(list, x, z, w, d, h, variant) {
    list.push({ x, z, w, d, h, variant });
    this.colliders.push({ x, z, hw: w / 2, hd: d / 2 });
  }

  buildBuildings(scene, rng) {
    const perVariant = [[], [], [], []];
    for (let bx = -280; bx < 280; bx += GRID) {
      for (let bz = -280; bz < 280; bz += GRID) {
        if (inReserved(bx, bz)) continue;
        if (bz < -224) continue; // beach blocks stay open sand
        if (bx >= 112 && bz >= 168) continue; // marina grounds
        if (bx >= 56 && bz >= 224) continue; // bay shore
        const cx = bx + 28;
        const cz = bz + 28;
        const downtown = Math.hypot(cx, cz) < 130;
        const variant = rng.int(0, 3);
        if (rng.chance(0.45)) {
          const w = rng.range(24, 32);
          const d = rng.range(24, 32);
          const h = downtown ? rng.range(20, 40) : rng.range(9, 20);
          this.addBuilding(perVariant[variant], cx + rng.range(-3, 3), cz + rng.range(-3, 3), w, d, h, variant);
        } else {
          for (const [ox, oz] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
            if (rng.chance(0.22)) continue;
            const w = rng.range(13, 17);
            const d = rng.range(13, 17);
            const h = downtown ? rng.range(14, 30) : rng.range(6, 14);
            this.addBuilding(perVariant[variant], cx + ox, cz + oz, w, d, h, variant);
          }
        }
      }
    }
    // The downtown tower watching the crossing near x 69, z 67.
    this.addBuilding(perVariant[1], 74, 74, 20, 20, 34, 1);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const dummy = new THREE.Object3D();
    perVariant.forEach((list, vi) => {
      if (!list.length) return;
      const mat = new THREE.MeshLambertMaterial({ map: facadeTexture(rng) });
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((b, i) => {
        dummy.position.set(b.x, 0, b.z);
        dummy.scale.set(b.w, b.h, b.d);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      scene.add(inst);
    });
  }

  buildPalmsAndLamps(scene, rng) {
    const spots = [];
    for (let x = -266; x <= 266; x += 19) {
      spots.push([x + rng.range(-2, 2), -186]);
      spots.push([x + rng.range(-2, 2), -238]);
    }
    for (let z = -160; z <= 160; z += 38) spots.push([238, z + rng.range(-3, 3)]);
    for (let i = 0; i < 26; i++) spots.push([rng.range(-260, 260), rng.range(-244, -230)]);
    spots.push([140, 190], [176, 190], [140, 150], [120, 214], [190, 200]);
    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 5.6, 6);
    trunkGeo.translate(0, 2.8, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const crownGeo = palmCrownGeometry();
    crownGeo.translate(0, 5.6, 0);
    const crowns = new THREE.InstancedMesh(crownGeo, colourMaterial, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(rng.range(-0.05, 0.05), rng.range(0, 6.28), rng.range(-0.05, 0.05));
      const s = rng.range(0.85, 1.2);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      crowns.setMatrixAt(i, dummy.matrix);
    });
    trunks.castShadow = true;
    scene.add(trunks);
    scene.add(crowns);
    // Street lamps at intersections and mid-blocks.
    const lampSpots = [];
    for (let x = -280; x <= 280; x += GRID) {
      for (let z = -280; z <= 280; z += GRID) {
        lampSpots.push([x + 9, z + 9]);
        if (z < 260) lampSpots.push([x + 9, z + 37]);
      }
    }
    const lamps = new THREE.InstancedMesh(lampGeometry(), colourMaterial, lampSpots.length);
    lampSpots.forEach(([x, z], i) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, (i % 4) * Math.PI / 2, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lamps.setMatrixAt(i, dummy.matrix);
    });
    scene.add(lamps);
  }

  buildMarina(scene, rng) {
    // Pier deck: x 149..167, running from the shore out to z 284.
    const deck = meshOf([
      box(158, 0.1, 240, 18, 0.2, 92, 0x9a7c58),
      box(158, -0.7, 200, 1.2, 1.6, 1.2, 0x6e5136),
      box(158, -0.7, 240, 1.2, 1.6, 1.2, 0x6e5136),
      box(158, -0.7, 280, 1.2, 1.6, 1.2, 0x6e5136),
      box(149.5, 0.65, 240, 0.25, 0.9, 92, 0x7c6244),
      box(166.5, 0.65, 240, 0.25, 0.9, 92, 0x7c6244),
    ]);
    scene.add(deck);
    // Marina office and crates on the shore.
    const office = meshOf([box(128, 3, 196, 16, 6, 10, 0xd9c9a8), box(128, 6.4, 196, 17, 0.7, 11, 0xa03a3a)]);
    scene.add(office);
    this.colliders.push({ x: 128, z: 196, hw: 8, hd: 5 });
    const crates = meshOf([
      box(120, 0.8, 224, 1.6, 1.6, 1.6, 0xb8862e), box(123, 0.8, 224, 1.6, 1.6, 1.6, 0x2e7d6b),
      box(121.5, 2.3, 224, 1.6, 1.4, 1.6, 0x38618f), box(186, 0.8, 214, 1.6, 1.6, 1.6, 0xa03a3a),
    ]);
    scene.add(crates);
    this.colliders.push({ x: 121.5, z: 224, hw: 2.6, hd: 1.2 });
    const boatCols = [0xf0ece2, 0xc95f2e, 0x38618f, 0x2e7d6b, 0xe3cfa5];
    for (let i = 0; i < 5; i++) {
      const b = boatMesh(boatCols[i]);
      b.position.set(186 + (i % 2) * 22, 0, 224 + i * 13);
      b.rotation.y = Math.PI / 2 + rng.range(-0.15, 0.15);
      scene.add(b);
      this.boats.push({ mesh: b, baseY: 0, phase: rng.range(0, 6) });
    }
  }

  // Walls with a door gap; returns the room record. Wall segments become
  // colliders so the rooms are genuinely enterable on foot (and the
  // garage, whose door is wide, by car).
  buildRoom(scene, cx, cz, w, d, wallColor, floorColor, doorW, doorWall) {
    const hw = w / 2;
    const hd = d / 2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: floorColor }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.03, cz);
    floor.receiveShadow = true;
    scene.add(floor);
    const parts = [];
    const H = 3.4;
    const T = 0.4;
    const seg = (x, z, sw, sd) => {
      parts.push(box(x, H / 2, z, sw, H, sd, wallColor));
      this.colliders.push({ x, z, hw: sw / 2, hd: sd / 2 });
    };
    // North and south walls (door may split the south wall).
    if (doorWall === 'south') {
      const side = (w - doorW) / 2;
      seg(cx - (doorW / 2 + side / 2), cz + hd, side, T);
      seg(cx + (doorW / 2 + side / 2), cz + hd, side, T);
      parts.push(box(cx, H - 0.25, cz + hd, doorW, 0.5, T, wallColor));
    } else {
      seg(cx, cz + hd, w, T);
    }
    seg(cx, cz - hd, w, T);
    seg(cx - hw, cz, T, d);
    seg(cx + hw, cz, T, d);
    // Roof rim: four edge strips (never a slab — the camera looks in).
    parts.push(box(cx, H + 0.15, cz - hd - 0.2, w + 0.8, 0.3, 0.7, 0x8a4a34));
    parts.push(box(cx, H + 0.15, cz + hd + 0.2, w + 0.8, 0.3, 0.7, 0x8a4a34));
    parts.push(box(cx - hw - 0.2, H + 0.15, cz, 0.7, 0.3, d + 0.8, 0x8a4a34));
    parts.push(box(cx + hw + 0.2, H + 0.15, cz, 0.7, 0.3, d + 0.8, 0x8a4a34));
    scene.add(meshOf(parts, true));
    return { x: cx, z: cz };
  }

  buildGarage(scene) {
    const room = this.buildRoom(scene, -56, 84, 30, 22, 0xcbb98f, 0x7d7d84, 8, 'south');
    const props = meshOf([
      box(-66, 0.5, 76, 5, 1, 2, 0x38618f),            // lift base
      box(-66, 1.6, 76, 0.4, 2.2, 2, 0x2c3844),
      box(-44, 0.55, 76, 6, 1.1, 1.2, 0x8a6f4d),        // workbench
      box(-44, 0.55, 92, 6, 1.1, 1.2, 0x8a6f4d),
      box(-68, 0.8, 92, 2.4, 1.6, 1.2, 0xa03a3a),       // tool cabinet
      box(-40, 0.45, 84, 1, 0.9, 1, 0x333a42),          // tyre stack
      box(-40, 1.3, 84, 1, 0.8, 1, 0x333a42),
    ]);
    scene.add(props);
    this.colliders.push({ x: -66, z: 76, hw: 2.6, hd: 1.2 });
    this.colliders.push({ x: -44, z: 76, hw: 3.1, hd: 0.8 });
    this.colliders.push({ x: -44, z: 92, hw: 3.1, hd: 0.8 });
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 3),
      new THREE.MeshLambertMaterial({ map: posterTexture(["TITO'S", 'GARAGE', 'FIX • TUNE'], '#e8e2d2', '#a03a3a') })
    );
    poster.position.set(-56, 2, 73.3);
    scene.add(poster);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 1.8),
      new THREE.MeshLambertMaterial({ map: posterTexture(["TITO'S GARAGE"], '#38618f', '#fff6df') })
    );
    sign.position.set(-56, 4.3, 95.4);
    scene.add(sign);
    // The repair pad.
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 5), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.55 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(-54, 0.06, 86);
    scene.add(pad);
    room.repair = { x: -54, z: 86 };
    room.door = { x: -56, z: 95 };
    return room;
  }

  buildShop(scene) {
    const room = this.buildRoom(scene, 84, -56, 20, 16, 0xa8c4b8, 0xc9b48a, 2.6, 'south');
    const props = meshOf([
      box(84, 0.6, -61, 10, 1.2, 1.4, 0x7a4a2e),        // counter
      box(76, 1, -50, 1.2, 2, 5, 0x2e7d6b),             // shelves
      box(92, 1, -50, 1.2, 2, 5, 0x38618f),
      box(76, 1, -61.5, 1.2, 2, 2.4, 0xb8862e),
    ]);
    scene.add(props);
    this.colliders.push({ x: 84, z: -61, hw: 5.1, hd: 0.8 });
    this.colliders.push({ x: 76, z: -50, hw: 0.8, hd: 2.6 });
    this.colliders.push({ x: 92, z: -50, hw: 0.8, hd: 2.6 });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 1.7),
      new THREE.MeshLambertMaterial({ map: posterTexture(['TIENDA BRISA'], '#2e7d6b', '#fff6df') })
    );
    sign.position.set(84, 4.2, -47.6);
    scene.add(sign);
    room.counter = { x: 84, z: -58.6 };
    room.door = { x: 84, z: -48 };
    return room;
  }

  buildSafehouse(scene) {
    const room = this.buildRoom(scene, -196, -196, 18, 15, 0xd4c5a5, 0x9a7c58, 2.4, 'south');
    const props = meshOf([
      box(-201, 0.4, -200, 2.2, 0.8, 4.4, 0x38618f),    // bed
      box(-201, 0.75, -202, 2.2, 0.25, 1, 0xf0ece2),
      box(-191, 0.5, -193, 3.4, 1, 1.6, 0x8a6f4d),      // table
      box(-191, 0.9, -200, 2.6, 1.8, 0.9, 0x5a4632),    // dresser
    ]);
    scene.add(props);
    this.colliders.push({ x: -201, z: -200, hw: 1.2, hd: 2.3 });
    this.colliders.push({ x: -191, z: -193, hw: 1.8, hd: 0.9 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), new THREE.MeshBasicMaterial({ color: 0x9fe870, transparent: true, opacity: 0.6 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(-196, 0.06, -192);
    scene.add(disc);
    room.save = { x: -196, z: -192 };
    room.door = { x: -196, z: -188.5 };
    return room;
  }

  buildLandmarks(scene) {
    // Police station and hospital get signs in front of their blocks; the
    // buildings themselves come from the normal block generation.
    const mk = (text, color, x, z) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(10, 2), new THREE.MeshLambertMaterial({ map: posterTexture([text], color, '#ffffff') }));
      s.position.set(x, 3.4, z);
      scene.add(s);
    };
    mk('SOLMAR BAY PD', '#22304a', 20, 48.6);
    mk('SOLMAR GENERAL', '#e8e2d2', -20, 48.6);
    // Marisol Vega's beachfront office on the reserved plaza: one small
    // building with its door facing the open plaza where Rico starts.
    const office = meshOf([
      box(38, 3.5, 86, 14, 7, 12, 0xe3cfa5),
      box(38, 7.3, 86, 15, 0.6, 13, 0xc95f2e),
      box(30.8, 1.1, 86, 0.3, 2.2, 1.6, 0x5a4632),
    ]);
    scene.add(office);
    this.colliders.push({ x: 38, z: 86, hw: 7, hd: 6 });
    const vs = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 1.7),
      new THREE.MeshLambertMaterial({ map: posterTexture(['VEGA • FIXER'], '#38618f', '#fff6df') })
    );
    vs.position.set(30.7, 4.6, 86);
    vs.rotation.y = -Math.PI / 2;
    scene.add(vs);
    // Beach umbrellas.
    const parts = [];
    for (let i = 0; i < 10; i++) {
      const x = -240 + i * 48;
      parts.push(box(x, 1.1, -228, 0.12, 2.2, 0.12, 0x8a6f4d));
      parts.push(box(x, 2.3, -228, 3, 0.25, 3, i % 2 ? 0xc95f2e : 0x2e7d8f));
    }
    scene.add(meshOf(parts));
  }

  update(dt, t) {
    if (this.waterTex) this.waterTex.offset.set((t * 0.008) % 1, (t * 0.005) % 1);
    for (const b of this.boats) {
      b.mesh.position.y = Math.sin(t * 0.7 + b.phase) * 0.12;
      b.mesh.rotation.z = Math.sin(t * 0.5 + b.phase) * 0.02;
    }
  }
}
