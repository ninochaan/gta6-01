// v3: unchanged — Tito's Garage reuses the existing poster and facade painters as they were.
// textures.js — every texture in Solmar Bay is painted on a canvas at startup:
// building facades with windows, awnings and invented shop signs, a roof patch,
// interior posters, a water shimmer sheet and the soft round blob-shadow disc.
// No image files, no network: the city paints its own skin.

import * as THREE from '../vendor/three.min.js';

export const SHOP_NAMES = [
  'CAFE SOLMAR', 'PALMA SHOES', 'HOTEL BRISA', 'TACO MAREA', 'SURF & SAND',
  'BANCO DEL SOL', 'FARMACIA LUNA', 'PIZZA FARO', 'MARINA MART', 'GELATO RIO',
  'BAR EL FARO', 'LIBROS SOL', 'GYM OLEAJE', 'FLORISTERIA', 'CINE BRISA',
  'PANADERIA SOL', 'JOYERIA MAR', 'TALLER RICO', 'PELUQUERIA', 'MERCADO 9',
];

const WALL_BASES = ['#f5ead6', '#f2d8b3', '#eec9a3', '#f7f0e4', '#e8b98d', '#dfe9ec', '#f3cfc0', '#e6ddc8'];
const TRIM_COLORS = ['#c9563c', '#2e7f86', '#e39a2d', '#7a4a8c', '#3c6ec9', '#4d9a51', '#c94f7c', '#8c6a3f'];

// The atlas: 8 facade tiles across the top (each 256x512 of a 2048x1024 canvas),
// a plain roof patch bottom-left, and a spare painted patch bottom-right.
export const ATLAS = { cols: 8, tileW: 256, tileH: 512, width: 2048, height: 1024 };
export function tileUv(index) {
  return { u: (index % ATLAS.cols) * ATLAS.tileW / ATLAS.width, v: 0.5, w: ATLAS.tileW / ATLAS.width, h: 0.5 };
}
export const ROOF_UV = { u: 40 / ATLAS.width, v: 60 / ATLAS.height };

function paintFacade(ctx, tileIndex, rng) {
  const x0 = tileIndex * ATLAS.tileW, y0 = 0, w = ATLAS.tileW, h = ATLAS.tileH;
  const base = WALL_BASES[tileIndex % WALL_BASES.length];
  const trim = TRIM_COLORS[tileIndex % TRIM_COLORS.length];
  ctx.fillStyle = base; ctx.fillRect(x0, y0, w, h);
  // gentle sun-bleach gradient, lighter at the top
  const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
  grad.addColorStop(0, 'rgba(255,240,200,0.20)'); grad.addColorStop(1, 'rgba(120,60,20,0.10)');
  ctx.fillStyle = grad; ctx.fillRect(x0, y0, w, h);
  // window grid: floors of lit and shaded windows with little shutters
  const cols = 5, floors = 9, wx = w / cols, wy = (h - 96) / floors;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng.chance(0.24);
      ctx.fillStyle = lit ? '#ffd977' : (rng.chance(0.5) ? '#7d99a8' : '#5f8296');
      const px = x0 + c * wx + 9, py = y0 + 14 + f * wy;
      ctx.fillRect(px, py, wx - 18, wy - 16);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(px, py, wx - 18, 4);
      if (rng.chance(0.4)) { ctx.fillStyle = trim; ctx.fillRect(px - 3, py, 3, wy - 16); ctx.fillRect(px + wx - 18, py, 3, wy - 16); }
      if (f % 3 === 2) { ctx.fillStyle = 'rgba(90,60,40,0.35)'; ctx.fillRect(px - 4, py + wy - 13, wx - 10, 4); } // balcony rail shadow
    }
  }
  // ground floor: a run of small shopfronts with mullioned glass and a door
  const gy = y0 + h - 92;
  ctx.fillStyle = '#7d5f45'; ctx.fillRect(x0, gy, w, 92);
  ctx.fillStyle = '#4a3828'; ctx.fillRect(x0 + 10, gy + 26, w - 20, 66);
  for (let pane = 0; pane < 5; pane++) {
    const px = x0 + 16 + pane * 47;
    ctx.fillStyle = '#a8d8e2'; ctx.fillRect(px, gy + 33, 38, 52);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(px, gy + 33, 38, 7);
    ctx.fillStyle = '#4a3828'; ctx.fillRect(px + 17, gy + 33, 4, 52);
  }
  ctx.fillStyle = '#5d4433'; ctx.fillRect(x0 + w / 2 - 13, gy + 30, 26, 62); // door
  ctx.fillStyle = '#ffd977'; ctx.fillRect(x0 + w / 2 + 5, gy + 58, 4, 4);     // door knob
  ctx.fillStyle = trim;
  for (let s = 0; s < 6; s++) ctx.fillRect(x0 + s * (w / 6), gy - 14, w / 6 - 3, 15); // awning stripes base
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let s = 0; s < 3; s++) ctx.fillRect(x0 + (2 * s + 1) * (w / 6), gy - 14, w / 6 - 3, 15);
  ctx.fillStyle = '#2d1d12'; ctx.fillRect(x0 + 8, gy - 44, w - 16, 28);
  ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 19px Verdana, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(SHOP_NAMES[tileIndex * 2 % SHOP_NAMES.length], x0 + w / 2, gy - 23, w - 20);
  // grime at the base
  ctx.fillStyle = 'rgba(80,50,25,0.18)'; ctx.fillRect(x0, y0 + h - 8, w, 8);
}

export function makeFacadeAtlas(rng) {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS.width; canvas.height = ATLAS.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b09a80'; ctx.fillRect(0, 512, 2048, 512); // lower half base
  for (let i = 0; i < ATLAS.cols; i++) paintFacade(ctx, i, rng);
  // roof patch: warm gravel with vents speckle
  ctx.fillStyle = '#a68a6d'; ctx.fillRect(0, 512, 220, 220);
  ctx.fillStyle = 'rgba(70,50,30,0.25)';
  for (let i = 0; i < 260; i++) ctx.fillRect(rng.range(0, 218), 512 + rng.range(0, 218), 2, 2);
  ctx.fillStyle = '#8a715a'; ctx.fillRect(28, 540, 34, 22); ctx.fillRect(120, 620, 26, 18);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Small painted posters for the safehouse walls.
export function makePosterTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (kind === 'surf') {
    ctx.fillStyle = '#ffd98a'; ctx.fillRect(0, 0, 128, 160);
    ctx.fillStyle = '#e4572e'; ctx.beginPath(); ctx.arc(64, 58, 26, 0, 7); ctx.fill();
    ctx.fillStyle = '#2e7f86'; ctx.fillRect(0, 96, 128, 64);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 17px Verdana'; ctx.textAlign = 'center';
    ctx.fillText('SURF', 64, 128); ctx.fillText('SOLMAR', 64, 148);
  } else if (kind === 'car') {
    ctx.fillStyle = '#26355e'; ctx.fillRect(0, 0, 128, 160);
    ctx.fillStyle = '#ffb03a'; ctx.fillRect(18, 74, 92, 22);
    ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(38, 100, 11, 0, 7); ctx.arc(92, 100, 11, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 15px Verdana'; ctx.textAlign = 'center';
    ctx.fillText('VELOZ GT', 64, 40); ctx.fillText('1978', 64, 132);
  } else {
    ctx.fillStyle = '#f3e9d2'; ctx.fillRect(0, 0, 128, 160);
    ctx.fillStyle = '#c9563c'; ctx.font = 'bold 16px Verdana'; ctx.textAlign = 'center';
    ctx.fillText('WANTED', 64, 34);
    ctx.fillStyle = '#8a715a'; ctx.fillRect(39, 48, 50, 56);
    ctx.fillStyle = '#5a4632'; ctx.fillRect(49, 62, 9, 9); ctx.fillRect(70, 62, 9, 9); ctx.fillRect(54, 88, 20, 5);
    ctx.fillStyle = '#333'; ctx.font = 'bold 12px Verdana'; ctx.fillText('REWARD $500', 64, 132);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Tileable shimmer sheet for the sea; offset scrolls each frame.
export function makeWaterTexture(rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2e7fa8'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.13)' : 'rgba(10,60,90,0.16)';
    ctx.fillRect(rng.range(0, 250), rng.range(0, 254), rng.range(8, 30), 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Soft radial disc used as a cheap blob shadow under cars and people.
export function makeBlobTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(20,10,5,0.42)'); g.addColorStop(1, 'rgba(20,10,5,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Vertical warm gradient used as the sky backdrop.
export function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#7ec3e8'); g.addColorStop(0.45, '#a8d4ec');
  g.addColorStop(0.72, '#f7d9a0'); g.addColorStop(1, '#ffc98a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
