// Solmar Bay itself: the road grid, the blocks of buildings, the beach and the
// sea, the tower landmark, palms and street props. The city is built once from
// a seeded RNG, so the same seed always grows the same streets.
import * as THREE from 'three';
import { WORLD, PALETTE } from './config.js';
import { clamp } from './rng.js';

const ROADS = [];
for (let c = -3; c <= 3; c++) ROADS.push(c * WORLD.roadGap);

// A small canvas texture painted with lit windows, reused by every building.
function makeFacadeTexture(rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8c8a8';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 248; y += 22) {
    for (let x = 10; x < 118; x += 20) {
      const lit = rng.chance(0.45);
      ctx.fillStyle = lit ? '#ffe9a0' : '#3a4a5a';
      ctx.fillRect(x, y, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng) {
  const city = {
    colliders: [],   // {minX, maxX, minZ, maxZ} boxes the player and cars bump into
    buildings: [],
    palms: [],
    towerPos: { x: 0, z: 0 },
    sea: null,
    update(dt, t) {
      if (this.sea) {
        this.sea.position.y = 0.15 + Math.sin(t * 0.6) * 0.08;
        this.sea.material.opacity = 0.92 + Math.sin(t * 0.4) * 0.03;
      }
    },
  };

  const facade = makeFacadeTexture(rng);

  // Ground: grass-green inland, fading to sand near the beach.
  const groundGeo = new THREE.PlaneGeometry(WORLD.half * 2 + 160, WORLD.half * 2 + 160, 1, 1);
  const groundMat = new THREE.MeshLambertMaterial({ color: PALETTE.ground });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  // Sand strip along the south shore.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 160, 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, WORLD.beachZ + 14);
  sand.receiveShadow = true;
  scene.add(sand);

  // The sea, south of the beach.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 160, 220),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.15, WORLD.seaZ + 110);
  scene.add(sea);
  city.sea = sea;

  // Roads: dark strips with a pale centre line, plus sidewalks at the edges.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (const c of ROADS) {
    for (const vertical of [false, true]) {
      const len = WORLD.half * 2;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? WORLD.roadHalf * 2 : len, vertical ? len : WORLD.roadHalf * 2), roadMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(vertical ? c : 0, 0.04, vertical ? 0 : c);
      strip.receiveShadow = true;
      scene.add(strip);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? 0.5 : len, vertical ? len : 0.5), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(vertical ? c : 0, 0.06, vertical ? 0 : c);
      scene.add(line);
      // Sidewalk ribbons on both sides of the road.
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? 3 : len, vertical ? len : 3), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(vertical ? c + side * (WORLD.roadHalf + 2.5) : 0, 0.05, vertical ? 0 : c + side * (WORLD.roadHalf + 2.5));
        walk.receiveShadow = true;
        scene.add(walk);
      }
    }
  }

  // Central plaza with the Solmar Tower, the landmark every road points to.
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(34, 24),
    new THREE.MeshLambertMaterial({ color: PALETTE.plaza }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(40, 0.05, 40);
  plaza.receiveShadow = true;
  scene.add(plaza);

  const towerMat = new THREE.MeshLambertMaterial({ color: PALETTE.tower, emissive: 0x0a1a2a });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(22, 110, 22), towerMat);
  tower.position.set(40, 55, 40);
  tower.castShadow = true;
  scene.add(tower);
  const towerTop = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 5, 14, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8a018, emissive: 0x6a4a00 }),
  );
  towerTop.position.set(40, 116, 40);
  scene.add(towerTop);
  // A beacon light on the tower top so it reads from anywhere in the city.
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd860 }),
  );
  beacon.position.set(40, 124, 40);
  scene.add(beacon);
  city.colliders.push({ minX: 28, maxX: 52, minZ: 28, maxZ: 52 });
  city.buildings.push({ x: 40, z: 40, h: 110, landmark: true });

  // City blocks: one to four buildings per block, kept off the roads and the
  // plaza, each with its own height, colour and roof.
  const blockMat = new THREE.MeshLambertMaterial({ map: facade });
  for (let bx = -3; bx <= 2; bx++) {
    for (let bz = -3; bz <= 2; bz++) {
      const cx = bx * WORLD.roadGap + WORLD.roadGap / 2;
      const cz = bz * WORLD.roadGap + WORLD.roadGap / 2;
      if (Math.abs(cx) < 46 && Math.abs(cz) < 46) continue; // plaza block
      if (cz > WORLD.beachZ - 40) continue; // beach stays open
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i++) {
        const w = rng.range(14, 26);
        const d = rng.range(14, 26);
        const h = rng.chance(0.12) ? rng.range(45, 70) : rng.range(8, 30);
        const ox = cx + rng.range(-14, 14);
        const oz = cz + rng.range(-14, 14);
        if (Math.abs(ox) < 30 && Math.abs(oz) < 30) continue;
        const wallColor = rng.pick(PALETTE.walls);
        const mat = new THREE.MeshLambertMaterial({ map: facade, color: wallColor });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(ox, h / 2, oz);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 1, d + 0.6),
          new THREE.MeshLambertMaterial({ color: rng.pick(PALETTE.roofs) }),
        );
        roof.position.set(ox, h + 0.5, oz);
        scene.add(roof);
        city.colliders.push({ minX: ox - w / 2, maxX: ox + w / 2, minZ: oz - d / 2, maxZ: oz + d / 2 });
        city.buildings.push({ x: ox, z: oz, h });
        void blockMat;
      }
    }
  }

  // Palms along the beachfront and scattered through the plaza district.
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  function plantPalm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 7, 6), trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = rng.range(-0.12, 0.12);
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, 7.2, Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    city.palms.push(g);
    city.colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
  }
  for (let x = -300; x <= 300; x += 28) plantPalm(x + rng.range(-6, 6), WORLD.beachZ - 8 + rng.range(-4, 4));
  for (let i = 0; i < 14; i++) plantPalm(rng.range(-220, 220), rng.range(-220, 220));

  // Street lights along the main avenues, for the sun-soaked evening feel.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  for (const c of ROADS) {
    for (let s = -280; s <= 280; s += 80) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 8, 6), poleMat);
      pole.position.set(c + WORLD.roadHalf + 4, 4, s);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
      lamp.position.set(c + WORLD.roadHalf + 4, 8.2, s);
      scene.add(lamp);
    }
  }

  return city;
}

// Is this ground point on a road (within the asphalt, not the sidewalk)?
export function isOnRoad(x, z) {
  for (const c of ROADS) {
    if (Math.abs(x - c) <= WORLD.roadHalf && Math.abs(z) <= WORLD.half) return true;
    if (Math.abs(z - c) <= WORLD.roadHalf && Math.abs(x) <= WORLD.half) return true;
  }
  return false;
}

// The nearest road centre line coordinate on one axis.
export function nearestRoadCoord(v) {
  let best = ROADS[0];
  for (const c of ROADS) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}

// Push a circle (player, car, pedestrian) out of every building it overlaps.
// Mutates pos ({x, z}) and returns true when a push happened.
export function resolveCollisions(pos, radius, colliders) {
  let hit = false;
  for (const b of cityCollidersCache(colliders)) {
    if (pos.x > b.minX - radius && pos.x < b.maxX + radius && pos.z > b.minZ - radius && pos.z < b.maxZ + radius) {
      const dxl = pos.x - (b.minX - radius);
      const dxr = (b.maxX + radius) - pos.x;
      const dzl = pos.z - (b.minZ - radius);
      const dzr = (b.maxZ + radius) - pos.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) pos.x = b.minX - radius;
      else if (m === dxr) pos.x = b.maxX + radius;
      else if (m === dzl) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
      hit = true;
    }
  }
  pos.x = clamp(pos.x, -WORLD.half, WORLD.half);
  pos.z = clamp(pos.z, -WORLD.half, WORLD.seaZ - 2);
  return hit;
}

function cityCollidersCache(colliders) { return colliders; }
