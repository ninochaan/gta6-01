// geometry.js — low-poly builders. Most props are boxes merged into a
// single vertex-coloured BufferGeometry, so one mesh equals one draw call.
// Buildings ride on InstancedMesh with canvas facades; palms are instanced
// with fronds built from two chained drooping segments.

import * as THREE from 'three';

// A box part: centre, size, hex colour, optional euler rotation.
export function box(x, y, z, w, h, d, color, rx, ry, rz) {
  return { x, y, z, w, h, d, color, rx: rx || 0, ry: ry || 0, rz: rz || 0 };
}

const FACES = [
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];
const UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];

export function mergeBoxes(parts) {
  const pos = [];
  const nor = [];
  const col = [];
  const uv = [];
  const idx = [];
  const c = new THREE.Color();
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  let base = 0;
  for (const p of parts) {
    c.set(p.color);
    e.set(p.rx, p.ry, p.rz);
    m.makeRotationFromEuler(e);
    for (const f of FACES) {
      n.set(f.n[0], f.n[1], f.n[2]).transformDirection(m);
      for (let k = 0; k < 4; k++) {
        const cc = f.c[k];
        v.set(cc[0] * p.w / 2, cc[1] * p.h / 2, cc[2] * p.d / 2).applyMatrix4(m);
        pos.push(v.x + p.x, v.y + p.y, v.z + p.z);
        nor.push(n.x, n.y, n.z);
        col.push(c.r, c.g, c.b);
        uv.push(UVS[k][0], UVS[k][1]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export const colourMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

export function meshOf(parts, shadows) {
  const mesh = new THREE.Mesh(mergeBoxes(parts), colourMaterial);
  if (shadows) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  return mesh;
}

// A car: body, cabin, wheels, lights. Brake lights are a separate small
// mesh so traffic can flash them. Police cars get a light bar.
export function buildCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const paint = isPolice ? 0xf2f4f6 : color;
  const parts = [
    box(0, 0.52, 0, 1.8, 0.55, 4.1, paint),
    box(0, 0.92, -0.2, 1.6, 0.5, 2.0, isPolice ? 0x22304a : 0x2c3844),
    box(0, 0.3, 1.95, 1.7, 0.28, 0.25, 0x333a42),
    box(0, 0.3, -1.95, 1.7, 0.28, 0.25, 0x333a42),
  ];
  if (isPolice) {
    parts.push(box(0, 0.62, 0, 1.84, 0.18, 1.1, 0x22304a));
    parts.push(box(0, 1.24, -0.2, 1.0, 0.14, 0.4, 0x222222));
  }
  const wheelG = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 8);
  wheelG.rotateZ(Math.PI / 2);
  const wheelM = new THREE.MeshLambertMaterial({ color: 0x181a1c });
  const body = meshOf(parts, true);
  group.add(body);
  for (const [wx, wz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
    const w = new THREE.Mesh(wheelG, wheelM);
    w.position.set(wx, 0.34, wz);
    group.add(w);
  }
  const head = new THREE.Mesh(
    mergeBoxes([box(-0.55, 0.55, 2.06, 0.4, 0.16, 0.05, 0xfff2b0), box(0.55, 0.55, 2.06, 0.4, 0.16, 0.05, 0xfff2b0)]),
    new THREE.MeshBasicMaterial({ vertexColors: true })
  );
  group.add(head);
  const brakeMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x661111 });
  const brake = new THREE.Mesh(
    mergeBoxes([box(-0.55, 0.58, -2.06, 0.42, 0.15, 0.05, 0xff2a1a), box(0.55, 0.58, -2.06, 0.42, 0.15, 0.05, 0xff2a1a)]),
    brakeMat
  );
  group.add(brake);
  let bar = null;
  let barMat = null;
  if (isPolice) {
    barMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.3), barMat);
    bar.position.set(0, 1.36, -0.2);
    group.add(bar);
  }
  group.userData = { brakeMat, barMat };
  return group;
}

// A person: legs, torso, arms, head — one merged mesh, origin at feet.
export function buildPersonMesh(shirt, pants, skin) {
  return meshOf([
    box(-0.14, 0.42, 0, 0.2, 0.84, 0.22, pants),
    box(0.14, 0.42, 0, 0.2, 0.84, 0.22, pants),
    box(0, 1.08, 0, 0.52, 0.55, 0.28, shirt),
    box(-0.36, 1.05, 0, 0.14, 0.6, 0.16, shirt),
    box(0.36, 1.05, 0, 0.14, 0.6, 0.16, shirt),
    box(0, 1.55, 0, 0.3, 0.34, 0.3, skin),
    box(0, 1.76, 0, 0.32, 0.08, 0.32, 0x2c2620),
  ], true);
}

// Palm frond crown: six fronds, each two chained segments — the first
// reaches out and slightly up, the second hangs from its tip, drooping.
export function palmCrownGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const tipX = dx * 1.5;
    const tipZ = dz * 1.5;
    parts.push(box(dx * 0.75, 0.22, dz * 0.75, 1.6, 0.07, 0.34, 0x3f7d3a, dz * 0.35, 0, -dx * 0.35));
    parts.push(box(tipX + dx * 0.65, -0.28, tipZ + dz * 0.65, 1.4, 0.06, 0.28, 0x4c8f43, dz * 0.95, 0, -dx * 0.95));
  }
  parts.push(box(0, -0.1, 0, 0.34, 0.3, 0.34, 0x6e5136));
  return mergeBoxes(parts);
}

export function lampGeometry() {
  return mergeBoxes([
    box(0, 2.6, 0, 0.16, 5.2, 0.16, 0x3c4148),
    box(0, 5.2, 0.55, 0.14, 0.14, 1.3, 0x3c4148),
    box(0, 5.05, 1.15, 0.34, 0.16, 0.5, 0xffe9a8),
  ]);
}

export function boatMesh(color) {
  return meshOf([
    box(0, 0.5, 0, 2.2, 0.8, 6.4, color),
    box(0, 1.1, -0.6, 1.7, 0.6, 2.6, 0xf0ece2),
    box(0, 2.2, -0.6, 0.12, 1.8, 0.12, 0x8a6f4d),
    box(0, 2.6, 0.4, 0.08, 0.9, 2.2, 0xf6f2e6, 0.35, 0, 0),
  ]);
}

export function markerMesh(color) {
  const g = new THREE.CylinderGeometry(2.2, 2.2, 9, 12, 1, true);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = 4.5;
  const group = new THREE.Group();
  group.add(mesh);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.06;
  group.add(disc);
  return group;
}
