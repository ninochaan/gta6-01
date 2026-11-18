// textures.js — every texture is painted on a canvas at boot: building
// facades with invented shop signs, the city ground plan (roads, lane
// markings, sidewalks, sand), the sea, posters and interior walls.

import * as THREE from 'three';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 2;
  return t;
}

const SIGNS = [
  ['CAFE SOL', '#c95f2e'], ['TIENDA BRISA', '#2e7d6b'], ['HOTEL MAR', '#38618f'],
  ['PALMA GYM', '#7a4a8f'], ['BAR LA BRISA', '#a03a3a'], ['FOTO RUIZ', '#4a6b2f'],
  ['BANCO BAY', '#5a5f6e'], ['PIZZA ONDA', '#b8862e'], ['SURF SHACK', '#2e7d8f'],
  ['JOYAS VEGA', '#8f6a2e'],
];

export function facadeTexture(rng, tone) {
  return canvasTex(256, 512, (g, w, h) => {
    const bases = ['#d9b48c', '#c9d1d4', '#e3cfa5', '#b8c4c9', '#d4a08a', '#cbb98f'];
    g.fillStyle = tone || bases[Math.floor(rng() * bases.length)];
    g.fillRect(0, 0, w, h);
    // Shopfront and sign on the ground floor.
    const sign = SIGNS[Math.floor(rng() * SIGNS.length)];
    g.fillStyle = '#3a3f46';
    g.fillRect(0, h - 92, w, 92);
    g.fillStyle = sign[1];
    g.fillRect(8, h - 132, w - 16, 44);
    g.fillStyle = '#fff6df';
    g.font = 'bold 25px Verdana';
    g.textAlign = 'center';
    g.fillText(sign[0], w / 2, h - 101);
    g.fillStyle = '#9fd4e8';
    for (let i = 0; i < 3; i++) g.fillRect(18 + i * 80, h - 78, 62, 58);
    // Window grid above.
    for (let y = 26; y < h - 160; y += 46) {
      for (let x = 20; x < w - 30; x += 52) {
        const lit = rng() < 0.3;
        g.fillStyle = lit ? '#ffd98a' : '#5d7484';
        g.fillRect(x, y, 34, 30);
        g.fillStyle = 'rgba(255,255,255,.25)';
        g.fillRect(x, y, 34, 6);
      }
    }
    // A poster or two.
    g.fillStyle = rng() < 0.5 ? '#e8e2d2' : '#d8e4ea';
    g.fillRect(14, h - 210, 52, 66);
    g.fillStyle = '#b3502e';
    g.font = 'bold 11px Verdana';
    g.fillText('SOL', 40, h - 182);
    g.fillText('FEST', 40, h - 166);
  });
}

export function groundTexture() {
  // One big plan of the city: world -300..300 maps onto the canvas.
  const S = 2048;
  const toPx = (v) => ((v + 300) / 600) * S;
  const tex = canvasTex(S, S, (g) => {
    g.fillStyle = '#8fae6b';
    g.fillRect(0, 0, S, S);
    // South beach sand.
    g.fillStyle = '#ecd29a';
    g.fillRect(0, toPx(212), S, S - toPx(212));
    // Marina bay (north-east water inlet is a mesh; this is its shore sand).
    g.fillStyle = '#e6cd92';
    g.fillRect(toPx(92), 0, S - toPx(92), S - toPx(208));
    // Blocks: pavement slabs between the roads.
    g.fillStyle = '#b9b3a4';
    for (let bx = -280; bx < 280; bx += 56) {
      for (let bz = -280; bz < 280; bz += 56) {
        g.fillRect(toPx(bx + 8), toPx(bz + 8), toPx(bx + 48) - toPx(bx + 8), toPx(bz + 48) - toPx(bz + 8));
      }
    }
    // Roads along every grid line.
    g.fillStyle = '#454a52';
    for (let v = -280; v <= 280; v += 56) {
      g.fillRect(toPx(v - 7), 0, toPx(v + 7) - toPx(v - 7), S);
      g.fillRect(0, toPx(v - 7), S, toPx(v + 7) - toPx(v - 7));
    }
    // Sidewalk edges.
    g.strokeStyle = '#cfc9b8';
    g.lineWidth = 3;
    for (let v = -280; v <= 280; v += 56) {
      for (const off of [-8.5, 8.5]) {
        g.beginPath(); g.moveTo(toPx(v + off), 0); g.lineTo(toPx(v + off), S); g.stroke();
        g.beginPath(); g.moveTo(0, toPx(v + off)); g.lineTo(S, toPx(v + off)); g.stroke();
      }
    }
    // Lane dashes.
    g.strokeStyle = '#e8d98a';
    g.lineWidth = 3;
    g.setLineDash([16, 14]);
    for (let v = -280; v <= 280; v += 56) {
      g.beginPath(); g.moveTo(toPx(v), 0); g.lineTo(toPx(v), S); g.stroke();
      g.beginPath(); g.moveTo(0, toPx(v)); g.lineTo(S, toPx(v)); g.stroke();
    }
    g.setLineDash([]);
    // Crosswalks at intersections.
    g.fillStyle = 'rgba(240,240,235,.75)';
    for (let x = -280; x <= 280; x += 56) {
      for (let z = -280; z <= 280; z += 56) {
        for (let i = -2; i <= 2; i++) {
          g.fillRect(toPx(x + i * 2.6 - 1), toPx(z - 11), 4, 7);
          g.fillRect(toPx(x + i * 2.6 - 1), toPx(z + 4), 4, 7);
        }
      }
    }
  });
  return tex;
}

export function waterTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2e7d9b';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(180,235,250,.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const y = (i * 37) % h;
      const x = (i * 53) % w;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 14, y - 4, x + 30, y);
      g.stroke();
    }
  }, true);
}

export function posterTexture(lines, bg, fg) {
  return canvasTex(128, 160, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 17px Verdana';
    g.textAlign = 'center';
    lines.forEach((ln, i) => g.fillText(ln, w / 2, 52 + i * 26));
    g.strokeStyle = fg;
    g.strokeRect(6, 6, w - 12, h - 12);
  });
}

export function plainTexture(color) {
  return canvasTex(32, 32, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
  });
}
