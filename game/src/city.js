// city.js — builds Solmar Bay: a seeded coastal grid city with textured towers
// downtown, beachfront hotels, suburbs, a marina, palm avenues, streetlights,
// painted roads and one enterable safehouse interior. Static geometry is merged
// into a few big meshes; palms and lamps are InstancedMeshes. Also exports the
// gameplay data other systems need: building colliders, road lines, package
// spots, the safehouse, and respawn points.
// v4: a third interior — Tienda Brisa, a corner shop with a working till
// (health, vests, pistol ammo) — joins the safehouse and Tito's Garage, and
// the clouds and marina boats are merged into one mesh each to pay the
// triangle/draw-call cost of the new room.

import * as THREE from '../vendor/three.min.js';
import { ColorBucket, UvBucket } from './geometry.js';
import { makeFacadeAtlas, makeWaterTexture, makePosterTexture, tileUv, ROOF_UV } from './textures.js';

export const ROAD_LINES = [-228, -152, -76, 0, 76, 152, 228];
export const BOULEVARD_Z = 196;
export const WORLD_EDGE = 262;
const ROAD_HALF = 6, WALK_HALF = 8.6;

export function buildCity(scene, rng) {
  const colliders = [];       // {minX,maxX,minZ,maxZ} solid building/wall AABBs
  const packages = [];        // {x,y,z} hidden package spots
  const animated = [];        // fn(dt, t) water, boats, clouds
  const ground = new ColorBucket();
  const paint = new ColorBucket();

  // ---- ground base: dry grass, then sand, then the sea -------------------
  ground.quad(0, 0, 620, 620, 0, 0x93a86f);
  ground.quad(0, 222, 620, 44, 0.03, 0xe8cf9e);                    // sand beach
  ground.quad(0, 210, 620, 6, 0.045, 0xf2e2bc);                    // wet sand lip
  const waterTex = makeWaterTexture(rng);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 130),
    new THREE.MeshPhongMaterial({ map: waterTex, color: 0x9fd4e8, shininess: 90, specular: 0x99ccee }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.12, 240 + 62);
  scene.add(water);
  animated.push((dt) => { waterTex.offset.y += dt * 0.014; waterTex.offset.x = Math.sin(performance.now() * 0.00005) * 0.03; });

  // ---- city block pavement -------------------------------------------------
  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    for (let j = 0; j < ROAD_LINES.length - 1; j++) {
      const cx = (ROAD_LINES[i] + ROAD_LINES[i + 1]) / 2, cz = (ROAD_LINES[j] + ROAD_LINES[j + 1]) / 2;
      if (cz > 170) continue;
      ground.quad(cx, cz, 76 - WALK_HALF * 2 + 4, 76 - WALK_HALF * 2 + 4, 0.02, 0xcdbb9c);
    }
  }
  ground.quad(0, 178, 620, 26, 0.02, 0xcdbb9c); // beachfront strip pavement

  // ---- roads, sidewalks, lane paint, crosswalks ----------------------------
  const asphalt = 0x474650, walk = 0xd9cfbc;
  for (const c of ROAD_LINES) {
    ground.quad(c, -14, WALK_HALF * 2, 424, 0.04, walk);
    ground.quad(c, -14, ROAD_HALF * 2, 424, 0.06, asphalt);
    if (c < 200) { // no east-west grid road south of here: the beach takes over
      ground.quad(-14, c, 424, WALK_HALF * 2, 0.04, walk);
      ground.quad(-14, c, 424, ROAD_HALF * 2, 0.06, asphalt);
    }
    for (let t = -236; t < 196; t += 12) {                          // centre dashes
      if (ROAD_LINES.some((l) => Math.abs(t - l) < 10)) continue;
      paint.quad(c, t, 0.35, 5, 0.09, 0xf5e9c8);
      if (c < 200) paint.quad(t, c, 5, 0.35, 0.09, 0xf5e9c8);
    }
    for (const l of ROAD_LINES) {                                   // crosswalks
      if (l > 200) continue;
      for (let s = -5; s <= 5; s += 2) {
        paint.quad(c + s * 0.95, l - ROAD_HALF - 1.6, 1.1, 2.6, 0.09, 0xf2f2ea);
        paint.quad(l - ROAD_HALF - 1.6, c + s * 0.95, 2.6, 1.1, 0.09, 0xf2f2ea);
      }
    }
  }
  // beach boulevard: a wide promenade road along the sand
  ground.quad(0, BOULEVARD_Z, 620, WALK_HALF * 2, 0.04, 0xe3d3ae);
  ground.quad(0, BOULEVARD_Z, 620, ROAD_HALF * 2, 0.06, 0x51464a);
  for (let t = -300; t < 300; t += 12) paint.quad(t, BOULEVARD_Z, 5, 0.35, 0.09, 0xffd977);

  const groundMesh = ground.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  const paintMesh = paint.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  paintMesh.receiveShadow = true;
  scene.add(paintMesh);

  // ---- buildings (merged, facade atlas) ------------------------------------
  const atlas = makeFacadeAtlas(rng);
  const uvb = new UvBucket();
  const roofSpots = [];
  const safehouseRect = { minX: -50, maxX: -26, minZ: 102, maxZ: 126 };
  const overlapsSafe = (minX, maxX, minZ, maxZ) =>
    maxX > safehouseRect.minX - 2 && minX < safehouseRect.maxX + 2 && maxZ > safehouseRect.minZ - 2 && minZ < safehouseRect.maxZ + 2;
  const garageRect = { minX: 106, maxX: 122, minZ: 108, maxZ: 120 };
  const overlapsGarage = (minX, maxX, minZ, maxZ) =>
    maxX > garageRect.minX - 2 && minX < garageRect.maxX + 2 && maxZ > garageRect.minZ - 2 && minZ < garageRect.maxZ + 2;
  const shopRect = { minX: -122, maxX: -106, minZ: 31, maxZ: 45 };
  const overlapsShop = (minX, maxX, minZ, maxZ) =>
    maxX > shopRect.minX - 2 && minX < shopRect.maxX + 2 && maxZ > shopRect.minZ - 2 && minZ < shopRect.maxZ + 2;

  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    for (let j = 0; j < ROAD_LINES.length - 1; j++) {
      const bx = ROAD_LINES[i] + WALK_HALF + 2, ex = ROAD_LINES[i + 1] - WALK_HALF - 2;
      const bz = ROAD_LINES[j] + WALK_HALF + 2, ez = ROAD_LINES[j + 1] - WALK_HALF - 2;
      if ((bz + ez) / 2 > 168) continue; // the southern row is beachfront, not blocks
      const cx = (bx + ex) / 2, cz = (bz + ez) / 2;
      const downtown = Math.max(0, 1 - Math.hypot(cx, cz) / 210);
      const lots = downtown > 0.45 ? 1 : 2;                 // downtown: one tower per block
      for (let a = 0; a < lots; a++) for (let b = 0; b < lots; b++) {
        const lx = lots === 1 ? cx : bx + (ex - bx) * (a + 0.5) / lots;
        const lz = lots === 1 ? cz : bz + (ez - bz) * (b + 0.5) / lots;
        const w = (lots === 1 ? rng.range(30, 40) : rng.range(17, 25));
        const d = (lots === 1 ? rng.range(30, 40) : rng.range(17, 25));
        if (overlapsSafe(lx - w / 2, lx + w / 2, lz - d / 2, lz + d / 2)) continue;
        if (overlapsGarage(lx - w / 2, lx + w / 2, lz - d / 2, lz + d / 2)) continue;
        if (overlapsShop(lx - w / 2, lx + w / 2, lz - d / 2, lz + d / 2)) continue;
        const h = downtown > 0.45 ? rng.range(34, 78) : downtown > 0.2 ? rng.range(16, 36) : rng.range(8, 17);
        const tile = tileUv(rng.int(0, 7));
        tile.h = Math.min(0.5, Math.max(0.12, h / 95));
        uvb.building(lx, lz, w, d, h, tile, ROOF_UV);
        colliders.push({ minX: lx - w / 2, maxX: lx + w / 2, minZ: lz - d / 2, maxZ: lz + d / 2 });
        if (roofSpots.length < 40 && h > 14) roofSpots.push({ x: lx, y: h, z: lz });
      }
    }
  }
  // beachfront hotel row along the promenade
  for (let x = -240; x <= 240; x += 48) {
    const w = rng.range(26, 34), d = 16, h = rng.range(20, 38);
    const tile = tileUv(rng.int(0, 7)); tile.h = Math.min(0.5, h / 95);
    uvb.building(x, 178, w, d, h, tile, ROOF_UV);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: 178 - d / 2, maxZ: 178 + d / 2 });
  }
  const buildingsMesh = uvb.build(new THREE.MeshLambertMaterial({ map: atlas }));
  buildingsMesh.castShadow = true;
  buildingsMesh.receiveShadow = true;
  scene.add(buildingsMesh);

  // ---- palms (instanced) -----------------------------------------------------
  const palmBucket = new ColorBucket();
  palmBucket.box(0, 1.6, 0, 0.34, 3.2, 0.34, 0x8a6844);
  palmBucket.box(0.25, 3.6, 0, 0.28, 1.2, 0.28, 0x96754e);
  // v3 crown: each frond is two chained segments — an inner blade kicked up
  // a few degrees, then an outer blade pitched down hard, so every tip ends
  // below the crown base and the silhouette droops like a real palm. The
  // blade axis after rotY=-ang runs along (cos ang, -sin ang), so segment
  // centres are chained along that same direction.
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2;
    const dirX = Math.cos(ang), dirZ = -Math.sin(ang);
    const wob = Math.abs(Math.sin(k * 2.7));
    const baseY = 4.32 - wob * 0.18;
    const up = (11 + (k % 3) * 1.5) * Math.PI / 180;          // 11–14 degrees
    const down = -(27 + (k % 3) * 2.5) * Math.PI / 180;       // 27–32 degrees
    const len1 = 1.25 + wob * 0.12, len2 = 1.15 - wob * 0.08;
    const col = k % 2 ? 0x3f9e4d : 0x358f43;
    const e1x = dirX * Math.cos(up) * len1, e1y = baseY + Math.sin(up) * len1, e1z = dirZ * Math.cos(up) * len1;
    palmBucket.box(dirX * Math.cos(up) * len1 / 2, baseY + Math.sin(up) * len1 / 2, dirZ * Math.cos(up) * len1 / 2,
      len1, 0.08, 0.5, col, -ang, up);
    palmBucket.box(e1x + dirX * Math.cos(down) * len2 / 2, e1y + Math.sin(down) * len2 / 2, e1z + dirZ * Math.cos(down) * len2 / 2,
      len2, 0.07, 0.32, col, -ang, down);
  }
  palmBucket.box(0.3, 4.05, 0.15, 0.3, 0.3, 0.3, 0x6e4f2a);
  const palmGeo = palmBucket.build(new THREE.MeshLambertMaterial({ vertexColors: true })).geometry;
  const palmSpots = [];
  let palmRow = 0;
  for (let x = -296; x <= 296; x += 15, palmRow++) {
    palmSpots.push([x + rng.range(-2, 2), BOULEVARD_Z + 10.5]);
    if (palmRow % 3 === 0) palmSpots.push([x + rng.range(-2, 2), 214 + rng.range(0, 14)]); // sand row at third density (v4 triangle budget for the shop)
  }
  for (const c of ROAD_LINES) for (let t = -220; t <= 160; t += 52) if (rng.chance(0.6)) palmSpots.push([c + 10.5, t + rng.range(-4, 4)]);
  const palms = new THREE.InstancedMesh(palmGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), palmSpots.length);
  const dummy = new THREE.Object3D();
  palmSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rng.range(0, 6.28), 0);
    const s = rng.range(0.85, 1.3); dummy.scale.set(s, s * rng.range(0.9, 1.25), s);
    dummy.updateMatrix();
    palms.setMatrixAt(i, dummy.matrix);
  });
  palms.castShadow = true;
  palms.instanceMatrix.needsUpdate = true;
  scene.add(palms);

  // ---- streetlights (instanced poles + glowing heads) ------------------------
  const poleBucket = new ColorBucket();
  poleBucket.box(0, 2.6, 0, 0.16, 5.2, 0.16, 0x3d3d44);
  poleBucket.box(0, 5.2, 0.8, 0.14, 0.14, 1.7, 0x3d3d44);
  const poleGeo = poleBucket.build(new THREE.MeshLambertMaterial({ vertexColors: true })).geometry;
  const lampSpots = [];
  for (const c of ROAD_LINES) for (let t = -228; t <= 190; t += 38) { lampSpots.push([c - 7.4, t, Math.PI / 2]); lampSpots.push([c + 7.4, t + 19, -Math.PI / 2]); }
  for (let x = -290; x <= 290; x += 38) lampSpots.push([x, BOULEVARD_Z - 7.4, 0]);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), lampSpots.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.16, 0.9),
    new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), lampSpots.length);
  lampSpots.forEach(([x, z, rot], i) => {
    dummy.rotation.set(0, rot, 0); dummy.scale.set(1, 1, 1);
    dummy.position.set(x, 0, z); dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x + Math.sin(rot) * 0.8, 5.25, z + Math.cos(rot) * 0.8); dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
  scene.add(poles); scene.add(heads);

  // ---- marina pier + boats ---------------------------------------------------
  const wood = new ColorBucket();
  wood.box(158, 1.0, 262, 15, 0.5, 46, 0x9a7648);
  for (let z = 242; z <= 282; z += 8) { wood.box(151.5, 0.4, z, 0.5, 1.6, 0.5, 0x77572f); wood.box(164.5, 0.4, z, 0.5, 1.6, 0.5, 0x77572f); }
  const pier = wood.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  pier.castShadow = true; scene.add(pier);
  // v4: all five boats are merged into ONE mesh (they used to cost a draw
  // call each); the whole flotilla bobs gently together instead of singly.
  const boatCols = [0xe4572e, 0x2e7f86, 0xf2f2ea, 0xe39a2d, 0x3c6ec9];
  const bb = new ColorBucket();
  for (let i = 0; i < 5; i++) {
    const col = boatCols[i];
    const bx = 138 + i * 11, bz = 252 + (i % 2) * 16;
    bb.box(bx, 0.5, bz, 2.6, 0.9, 6.4, col);
    bb.box(bx, 1.15, bz - 0.6, 1.8, 0.7, 2.4, 0xf7f3e8);
    bb.box(bx, 2.6, bz + 0.9, 0.12, 3.4, 0.12, 0x8a6844);
    bb.box(bx, 2.9, bz + 1.5, 0.05, 2.0, 1.3, 0xfff6da);
  }
  const boatsMesh = bb.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  boatsMesh.matrixAutoUpdate = true;
  boatsMesh.position.y = 0.15;
  scene.add(boatsMesh);
  animated.push((dt, t) => { boatsMesh.position.y = 0.15 + Math.sin(t * 0.9) * 0.07; boatsMesh.rotation.z = Math.sin(t * 0.7) * 0.006; });

  // ---- drifting low clouds ----------------------------------------------------
  // v4: all clouds merged into ONE mesh that drifts as a single sky sheet
  // (eight draw calls became one; the sheet wraps around the world edge).
  const cb = new ColorBucket();
  const cloudBase = [];
  for (let i = 0; i < 8; i++) {
    const cx = rng.range(-320, 320), cy = rng.range(85, 120), cz = rng.range(-320, 240);
    cloudBase.push(cx);
    cb.box(cx, cy, cz, rng.range(22, 40), 2.2, rng.range(9, 15), 0xffffff);
    cb.box(cx + rng.range(-9, 9), cy + 1.2, cz + rng.range(-3, 3), rng.range(12, 20), 2, 8, 0xffffff);
  }
  const cloudsMesh = cb.build(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82 }));
  cloudsMesh.matrixAutoUpdate = true;
  scene.add(cloudsMesh);
  animated.push((dt) => { cloudsMesh.position.x += dt * 1.6; if (cloudsMesh.position.x > 90) cloudsMesh.position.x = -90; });

  // ---- the safehouse: an enterable room --------------------------------------
  const safehouse = buildSafehouse(scene, colliders);

  // ---- Tito's Garage: the second interior, a working repair bay -------------
  const garage = buildGarage(scene, colliders);

  // ---- Tienda Brisa: the third interior, a corner shop with a till ---------
  const shop = buildShop(scene, colliders);

  // ---- hidden package spots: alleys, the beach, the pier, quiet corners -----
  const alleySpots = [
    { x: -69, y: 0.6, z: -69 }, { x: 69, y: 0.6, z: 69 }, { x: -145, y: 0.6, z: 10 }, { x: 145, y: 0.6, z: -140 },
    { x: 10, y: 0.6, z: -145 }, { x: -10, y: 0.6, z: 145 }, { x: 219, y: 0.6, z: 40 }, { x: -219, y: 0.6, z: -40 },
    { x: 60, y: 0.6, z: 214 }, { x: -120, y: 0.6, z: 226 }, { x: 200, y: 0.6, z: 220 }, { x: -250, y: 0.6, z: 208 },
    { x: 158, y: 1.9, z: 280 }, { x: 30, y: 0.6, z: -250 }, { x: -38, y: 0.6, z: 96 },
    { x: -160, y: 0.6, z: -180 }, { x: 110, y: 0.6, z: 117.5 }, { x: -90, y: 0.6, z: -20 }, { x: 96, y: 0.6, z: -190 },
    { x: 240, y: 0.6, z: 186 },
  ];
  for (const s of alleySpots) packages.push(s);
  while (packages.length > 20) packages.pop();

  return {
    colliders, packages, animated, safehouse, garage, shop,
    water,
    playerStart: { x: -38, z: 132, heading: Math.PI },
    policeStation: { x: 88, z: -88 },
    hospital: { x: -88, z: 88 },
    update(dt, t) { for (const fn of animated) fn(dt, t); },
  };
}

// The safehouse interior: stucco walls with a door gap on the south side, a bed,
// a table, posters and a glowing save point. Walls join the collider list.
function buildSafehouse(scene, colliders) {
  const cx = -38, cz = 114, hw = 7, hd = 5.5, wallH = 3.4, th = 0.45;
  const b = new ColorBucket();
  const stucco = 0xf2dfba, inner = 0xe8d3ac;
  const wall = (x, z, sx, sz) => { b.box(x, wallH / 2, z, sx, wallH, sz, stucco); colliders.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 }); };
  wall(cx, cz - hd, hw * 2 + th, th);                       // north wall
  wall(cx - hw, cz, th, hd * 2);                            // west wall
  wall(cx + hw, cz, th, hd * 2);                            // east wall
  wall(cx - 4.4, cz + hd, 5.2, th);                         // south wall, west of door
  wall(cx + 4.4, cz + hd, 5.2, th);                         // south wall, east of door
  // a terracotta pergola rim instead of a full roof: the sun (and the chase
  // camera) can still see in, so the room reads as a place, not a box
  b.box(cx, wallH + 0.3, cz - hd - 0.6, hw * 2 + 2.6, 0.28, 1.5, 0xc9563c);
  b.box(cx, wallH + 0.3, cz + hd + 0.6, hw * 2 + 2.6, 0.28, 1.5, 0xc9563c);
  b.box(cx - hw - 0.6, wallH + 0.3, cz, 1.5, 0.28, hd * 2 + 2.6, 0xc9563c);
  b.box(cx + hw + 0.6, wallH + 0.3, cz, 1.5, 0.28, hd * 2 + 2.6, 0xc9563c);
  for (let s = -hw + 1.5; s < hw; s += 2.6) b.box(cx + s, wallH + 0.28, cz, 0.5, 0.2, hd * 2, 0xb34a32); // pergola slats
  b.quad(cx, cz, hw * 2, hd * 2, 0.1, 0xb98d5f);             // wooden floor
  b.quad(cx, cz + 1, 6.4, 4.2, 0.13, 0x9a3f2e);             // rug
  // bed: frame, mattress, pillow, blanket
  b.box(cx - 4.6, 0.35, cz - 3.2, 2.2, 0.5, 4.4, 0x77572f);
  b.box(cx - 4.6, 0.72, cz - 3.2, 2.0, 0.28, 4.2, 0xf7f3e8);
  b.box(cx - 4.6, 0.92, cz - 4.9, 1.7, 0.18, 0.8, 0xffffff);
  b.box(cx - 4.6, 0.9, cz - 2.2, 2.0, 0.16, 2.2, 0x2e7f86);
  // table + crates + a plant
  b.box(cx + 4.4, 0.55, cz - 3.4, 2.6, 0.14, 1.4, 0x8a6844);
  b.box(cx + 3.4, 0.27, cz - 3.4, 0.14, 0.55, 1.2, 0x77572f); b.box(cx + 5.4, 0.27, cz - 3.4, 0.14, 0.55, 1.2, 0x77572f);
  b.box(cx + 5.6, 0.45, cz + 3.6, 0.9, 0.9, 0.9, 0xa67c4e); b.box(cx + 5.6, 1.3, cz + 3.6, 0.7, 0.7, 0.7, 0xb98d5f);
  b.box(cx - 6.2, 0.3, cz + 4.2, 0.55, 0.6, 0.55, 0xc9563c); b.box(cx - 6.2, 0.95, cz + 4.2, 0.8, 0.7, 0.8, 0x3f9e4d);
  const mesh = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  // posters on the north wall, facing into the room, plus a warm lamp glow
  const posterKinds = ['surf', 'car', 'wanted'];
  posterKinds.forEach((kind, i) => {
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9),
      new THREE.MeshBasicMaterial({ map: makePosterTexture(kind) }));
    poster.position.set(cx - 3.4 + i * 3.4, 1.9, cz - hd + th / 2 + 0.04);
    scene.add(poster);
  });
  const lamp = new THREE.PointLight(0xffc98a, 12, 11, 1.6);
  lamp.position.set(cx, 2.7, cz);
  scene.add(lamp);
  return { center: { x: cx, z: cz }, door: { x: cx, z: cz + hd + 1.5 }, save: { x: cx - 4.6, z: cz - 1.2 }, inner };
}

// Tito's Garage: a drive-in repair bay on the lot at (114, 114). Stucco walls
// with a wide south door facing the z=152 road, a pergola rim like the
// safehouse, a painted repair pad, and a lift holding a customer's coupe.
// The lift is solid; the pad is paint, so a car can roll onto it.
function buildGarage(scene, colliders) {
  const cx = 114, cz = 114, hw = 8, hd = 6, wallH = 3.4, th = 0.45;
  const b = new ColorBucket();
  const stucco = 0xe9d9b8, trim = 0x2e7f86;
  const wall = (x, z, sx, sz) => { b.box(x, wallH / 2, z, sx, wallH, sz, stucco); colliders.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 }); };
  wall(cx, cz - hd, hw * 2 + th, th);                       // north wall
  wall(cx - hw, cz, th, hd * 2);                            // west wall
  wall(cx + hw, cz, th, hd * 2);                            // east wall
  wall(cx - 5.5, cz + hd, 5.5, th);                         // south wall, west of the door
  wall(cx + 5.5, cz + hd, 5.5, th);                         // south wall, east of the door (gap: 5 wide)
  b.box(cx, wallH + 0.18, cz + hd, hw * 2 + th, 0.22, 0.7, trim); // teal lintel over the door
  // pergola rim instead of a roof, same as the safehouse
  b.box(cx, wallH + 0.3, cz - hd - 0.6, hw * 2 + 2.6, 0.28, 1.5, 0xc9563c);
  b.box(cx, wallH + 0.3, cz + hd + 0.6, hw * 2 + 2.6, 0.28, 1.5, 0xc9563c);
  b.box(cx - hw - 0.6, wallH + 0.3, cz, 1.5, 0.28, hd * 2 + 2.6, 0xc9563c);
  b.box(cx + hw + 0.6, wallH + 0.3, cz, 1.5, 0.28, hd * 2 + 2.6, 0xc9563c);
  for (let s = -hw + 1.5; s < hw; s += 2.6) b.box(cx + s, wallH + 0.28, cz, 0.5, 0.2, hd * 2, 0xb34a32);
  b.quad(cx, cz, hw * 2, hd * 2, 0.1, 0x9a938a);             // concrete floor
  b.quad(cx + 3, cz, 4.6, 6.6, 0.13, 0x2e7f86);             // the painted repair pad
  b.quad(cx + 3, cz, 3.6, 5.6, 0.14, 0xd9cfbc);
  // workbench along the north wall + tool cabinet
  b.box(cx + 4.6, 0.55, cz - 5.2, 3.2, 0.14, 1.1, 0x8a6844);
  b.box(cx + 3.2, 0.27, cz - 5.2, 0.14, 0.55, 0.9, 0x77572f); b.box(cx + 6, 0.27, cz - 5.2, 0.14, 0.55, 0.9, 0x77572f);
  b.box(cx + 4.6, 1.05, cz - 5.35, 2.2, 0.5, 0.35, 0xb3231b); // red toolbox on the bench
  b.box(cx + 7.2, 1.1, cz - 5.3, 1.1, 2.2, 0.6, 0x37474f);     // tool cabinet
  b.box(cx + 7.2, 1.55, cz - 4.95, 0.9, 0.08, 0.08, 0xd8d3c3);
  // crates and tire stacks in the west corners
  b.box(cx - 6.9, 0.45, cz + 4.6, 0.9, 0.9, 0.9, 0xa67c4e); b.box(cx - 6.9, 1.3, cz + 4.6, 0.7, 0.7, 0.7, 0xb98d5f);
  for (let i = 0; i < 3; i++) b.box(cx - 6.8, 0.28 + i * 0.52, cz - 4.9, 1.05, 0.5, 1.05, 0x1c1c20);
  for (let i = 0; i < 2; i++) b.box(cx + 6.9, 0.28 + i * 0.52, cz + 4.7, 1.05, 0.5, 1.05, 0x1c1c20);
  // the lift: two posts and a platform, holding a customer's coupe mid-repair
  const liftX = cx - 4, liftZ = cz - 2;
  b.box(liftX - 1.25, 1.15, liftZ, 0.32, 2.3, 0.32, 0xe39a2d);
  b.box(liftX + 1.25, 1.15, liftZ, 0.32, 2.3, 0.32, 0xe39a2d);
  b.box(liftX, 0.95, liftZ, 2.9, 0.18, 4.9, 0x4a4a52);
  const prop = 0x3c6ec9;
  b.box(liftX, 1.55, liftZ, 1.8, 0.5, 4.3, prop);             // prop car body, up on the lift
  b.box(liftX, 1.95, liftZ - 0.25, 1.7, 0.45, 2.2, prop);
  b.box(liftX, 2.0, liftZ - 0.25, 1.5, 0.38, 2.0, 0x9fd4de);
  b.box(liftX, 2.26, liftZ - 0.25, 1.62, 0.09, 2.1, prop);
  for (const [wx, wz] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]])
    b.box(liftX + wx, 1.32, liftZ + wz, 0.28, 0.6, 0.6, 0x1c1c20);
  colliders.push({ minX: liftX - 1.45, maxX: liftX + 1.45, minZ: liftZ - 2.45, maxZ: liftZ + 2.45 });
  const mesh = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9),
    new THREE.MeshBasicMaterial({ map: makePosterTexture('car') }));
  poster.position.set(cx - 4.6, 1.9, cz - hd + th / 2 + 0.04);
  scene.add(poster);
  const lamp = new THREE.PointLight(0xffd9a0, 12, 12, 1.6);
  lamp.position.set(cx, 2.8, cz);
  scene.add(lamp);
  return { center: { x: cx, z: cz }, door: { x: cx, z: cz + hd + 1.5 }, repair: { x: cx + 3, z: cz } };
}

// Tienda Brisa: a corner shop on the reserved lot at (-114, 38), west side.
// Same construction language as the other interiors — stucco walls, a door
// gap on the south side, a pergola rim so the sun and camera can see in —
// but fitted as a shop: a counter with a till across the north side, stocked
// shelves along the west wall, crates, and a warm lamp. The counter and
// shelves are solid; the buying interaction lives in main.js (keys 1/2/3).
function buildShop(scene, colliders) {
  const cx = -114, cz = 38, hw = 7, hd = 5.5, wallH = 3.4, th = 0.45;
  const b = new ColorBucket();
  const stucco = 0xf2dfba, trim = 0x2e7f86;
  const wall = (x, z, sx, sz) => { b.box(x, wallH / 2, z, sx, wallH, sz, stucco); colliders.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 }); };
  wall(cx, cz - hd, hw * 2 + th, th);                       // north wall
  wall(cx - hw, cz, th, hd * 2);                            // west wall
  wall(cx + hw, cz, th, hd * 2);                            // east wall
  wall(cx - 4.4, cz + hd, 5.2, th);                         // south wall, west of door
  wall(cx + 4.4, cz + hd, 5.2, th);                         // south wall, east of door
  b.box(cx, wallH + 0.18, cz + hd, hw * 2 + th, 0.22, 0.7, trim); // teal lintel over the door
  // pergola rim instead of a roof, same as the safehouse and the garage
  b.box(cx, wallH + 0.3, cz - hd - 0.6, hw * 2 + 2.6, 0.28, 1.5, 0xc9563c);
  b.box(cx, wallH + 0.3, cz + hd + 0.6, hw * 2 + 2.6, 0.28, 1.5, 0xc9563c);
  b.box(cx - hw - 0.6, wallH + 0.3, cz, 1.5, 0.28, hd * 2 + 2.6, 0xc9563c);
  b.box(cx + hw + 0.6, wallH + 0.3, cz, 1.5, 0.28, hd * 2 + 2.6, 0xc9563c);
  for (let s = -hw + 1.5; s < hw; s += 2.6) b.box(cx + s, wallH + 0.28, cz, 0.5, 0.2, hd * 2, 0xb34a32);
  b.quad(cx, cz, hw * 2, hd * 2, 0.1, 0xd9cfbc);             // pale tile floor
  b.quad(cx, cz + 1.5, 7, 4.6, 0.13, 0x2e7f86);             // teal welcome mat inside the door
  // the counter across the north side, with a till on top (solid)
  b.box(cx, 0.55, cz - 4.1, 9.6, 1.1, 1.1, 0x8a6844);
  b.box(cx, 1.16, cz - 4.1, 9.8, 0.1, 1.3, 0x5d4433);
  b.box(cx + 3.4, 1.45, cz - 4.2, 0.9, 0.5, 0.7, 0x37474f);  // the till
  b.box(cx + 3.4, 1.74, cz - 4.2, 0.7, 0.1, 0.5, 0xa8f0e0);  // till display glow
  colliders.push({ minX: cx - 4.9, maxX: cx + 4.9, minZ: cz - 4.75, maxZ: cz - 3.45 });
  // stocked shelves along the west wall: three levels of bright tins and boxes
  const shelfCols = [0xe4572e, 0xe39a2d, 0x4d9a51, 0x3c6ec9, 0xc94f7c, 0xffd23a];
  for (let lvl = 0; lvl < 3; lvl++) {
    b.box(cx - 6.4, 0.5 + lvl * 0.85, cz - 0.5, 0.7, 0.08, 7.6, 0x77572f);
    for (let i = 0; i < 7; i++) b.box(cx - 6.4, 0.78 + lvl * 0.85, cz - 3.6 + i * 1.05, 0.5, 0.5, 0.62, shelfCols[(i + lvl * 2) % shelfCols.length]);
  }
  colliders.push({ minX: cx - 6.85, maxX: cx - 5.95, minZ: cz - 4.4, maxZ: cz + 3.4 });
  // a freezer chest and crates by the east wall
  b.box(cx + 6.1, 0.5, cz + 1.5, 1.3, 1.0, 3.6, 0xdfe9ec);
  b.box(cx + 6.1, 1.04, cz + 1.5, 1.34, 0.08, 3.64, 0x9fd4de);
  colliders.push({ minX: cx + 5.4, maxX: cx + 6.8, minZ: cz - 0.35, maxZ: cz + 3.35 });
  b.box(cx + 5.9, 0.45, cz - 3.9, 0.9, 0.9, 0.9, 0xa67c4e); b.box(cx + 5.9, 1.3, cz - 3.9, 0.7, 0.7, 0.7, 0xb98d5f);
  const mesh = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9),
    new THREE.MeshBasicMaterial({ map: makePosterTexture('surf') }));
  poster.position.set(cx - 3.2, 1.9, cz - hd + th / 2 + 0.04);
  scene.add(poster);
  const lamp = new THREE.PointLight(0xffc98a, 12, 11, 1.6);
  lamp.position.set(cx, 2.7, cz);
  scene.add(lamp);
  return { center: { x: cx, z: cz }, door: { x: cx, z: cz + hd + 1.5 }, counter: { x: cx, z: cz - 2.6 } };
}
