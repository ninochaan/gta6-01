// geometry.js — merge many small boxes and quads into ONE BufferGeometry so the
// whole static city renders in a handful of draw calls. Two flavours:
//   ColorBucket — vertex-coloured boxes/quads (roads, props, car bodies, people)
//   UvBucket    — textured boxes whose sides sample a facade-atlas tile and whose
//                 top samples a plain roof patch of the same atlas (buildings)
// Both buckets are write-only piles of triangles; call build() once at startup.

import * as THREE from '../vendor/three.min.js';

const FACES = [
  // normal, then the four corners (counter-clockwise seen from outside)
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },   // +z
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] }, // -z
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },   // +x
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] }, // -x
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },   // +y top
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] }, // -y bottom
];

function rotateY(x, z, cos, sin) { return [x * cos - z * sin, x * sin + z * cos]; }
// Local tilt helpers for the palm fronds: a point is pitched around X and
// rolled around Z in its own frame before the Y heading is applied, so a
// length along local X can rise or droop without moving its centre.
function tiltPoint(x, y, z, cosX, sinX, cosZ, sinZ) {
  const y1 = y * cosX - z * sinX, z1 = y * sinX + z * cosX;
  return [x * cosZ - y1 * sinZ, x * sinZ + y1 * cosZ, z1];
}

export class ColorBucket {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.vert = 0; }
  // Axis-aligned or Y-rotated box. cx,cy,cz is its centre; sx,sy,sz its size.
  // rotZ/rotX tilt the box in its local frame first (for drooping fronds);
  // with both zero the output is identical to the plain Y-rotated box.
  box(cx, cy, cz, sx, sy, sz, color, rotY = 0, rotZ = 0, rotX = 0) {
    const col = new THREE.Color(color);
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);
    const tilted = rotZ !== 0 || rotX !== 0;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    for (const f of FACES) {
      for (const [lx, ly, lz] of f.c) {
        let px = lx * hx, py = ly * hy, pz = lz * hz;
        let nx = f.n[0], ny = f.n[1], nz = f.n[2];
        if (tilted) {
          [px, py, pz] = tiltPoint(px, py, pz, cosX, sinX, cosZ, sinZ);
          [nx, ny, nz] = tiltPoint(nx, ny, nz, cosX, sinX, cosZ, sinZ);
        }
        const [rx, rz] = rotY ? rotateY(px, pz, cos, sin) : [px, pz];
        const [fnx, fnz] = rotY ? rotateY(nx, nz, cos, sin) : [nx, nz];
        this.pos.push(cx + rx, cy + py, cz + rz);
        this.nor.push(fnx, ny, fnz);
        this.col.push(col.r, col.g, col.b);
      }
      const b = this.vert;
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      this.vert += 4;
    }
    return this;
  }
  // Flat quad on the ground (normal +y), handy for road paint and rugs.
  quad(cx, cz, sx, sz, y, color, rotY = 0) {
    const col = new THREE.Color(color);
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [lx, lz] of corners) {
      const [rx, rz] = rotY ? rotateY(lx * sx / 2, lz * sz / 2, cos, sin) : [lx * sx / 2, lz * sz / 2];
      this.pos.push(cx + rx, y, cz + rz);
      this.nor.push(0, 1, 0);
      this.col.push(col.r, col.g, col.b);
    }
    const b = this.vert;
    this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    this.vert += 4;
    return this;
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    const mesh = new THREE.Mesh(g, material);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

// A textured building: sides read a facade tile of the atlas, the roof reads a
// small solid patch, so one material serves every building in the city.
export class UvBucket {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; this.vert = 0; }
  // tileU/tileV: bottom-left of the facade tile in UV space; tileW/tileH its size.
  // roofU/roofV: a point inside the roof patch. tint multiplies via vertex colour.
  building(cx, cz, w, d, h, tile, roofPoint) {
    const hx = w / 2, hz = d / 2;
    const side = (corners, n, flip) => {
      for (let i = 0; i < 4; i++) {
        const [x, y, z] = corners[i];
        this.pos.push(cx + x, y, cz + z);
        this.nor.push(n[0], n[1], n[2]);
        const u = tile.u + (flip ? (i === 1 || i === 2 ? 0 : tile.w) : (i === 1 || i === 2 ? tile.w : 0));
        const v = tile.v + (i >= 2 ? tile.h : 0);
        this.uv.push(u, v);
      }
      const b = this.vert;
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      this.vert += 4;
    };
    side([[-hx, 0, hz], [hx, 0, hz], [hx, h, hz], [-hx, h, hz]], [0, 0, 1], false);
    side([[hx, 0, -hz], [-hx, 0, -hz], [-hx, h, -hz], [hx, h, -hz]], [0, 0, -1], false);
    side([[hx, 0, hz], [hx, 0, -hz], [hx, h, -hz], [hx, h, hz]], [1, 0, 0], false);
    side([[-hx, 0, -hz], [-hx, 0, hz], [-hx, h, hz], [-hx, h, -hz]], [-1, 0, 0], false);
    // roof
    const roofCorners = [[-hx, hz], [hx, hz], [hx, -hz], [-hx, -hz]];
    for (const [x, z] of roofCorners) {
      this.pos.push(cx + x, h, cz + z);
      this.nor.push(0, 1, 0);
      this.uv.push(roofPoint.u, roofPoint.v);
    }
    const b = this.vert;
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.vert += 4;
    return this;
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    const mesh = new THREE.Mesh(g, material);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

// One low-poly humanoid as a single vertex-coloured mesh: legs, torso, arms, head.
// Returns a Group whose inner mesh can bob; feet at y=0, about 1.75 tall.
export function buildPerson(THREEref, palette) {
  const b = new ColorBucket();
  const skin = palette.skin, shirt = palette.shirt, pants = palette.pants;
  b.box(-0.11, 0.42, 0, 0.16, 0.84, 0.2, pants);          // left leg
  b.box(0.11, 0.42, 0, 0.16, 0.84, 0.2, pants);           // right leg
  b.box(0, 1.12, 0, 0.52, 0.58, 0.3, shirt);              // torso
  b.box(-0.36, 1.1, 0, 0.13, 0.6, 0.16, shirt);           // left arm
  b.box(0.36, 1.1, 0, 0.13, 0.6, 0.16, shirt);            // right arm
  b.box(0, 1.58, 0, 0.3, 0.34, 0.3, skin);                // head
  if (palette.hat !== undefined) b.box(0, 1.79, 0, 0.36, 0.09, 0.36, palette.hat);
  const mat = new THREEref.MeshLambertMaterial({ vertexColors: true });
  const mesh = b.build(mat);
  mesh.castShadow = true;
  const group = new THREEref.Group();
  group.add(mesh);
  group.userData.body = mesh;
  return group;
}
