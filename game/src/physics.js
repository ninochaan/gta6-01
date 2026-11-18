// physics.js — collision helpers against the city's box colliders.
// A collider is { x, z, hw, hd } : centre plus half-width and half-depth.

export function collideCircle(x, z, r, colliders) {
  let nx = x;
  let nz = z;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const dx = nx - c.x;
    const dz = nz - c.z;
    const px = c.hw + r - Math.abs(dx);
    if (px <= 0) continue;
    const pz = c.hd + r - Math.abs(dz);
    if (pz <= 0) continue;
    if (px < pz) nx += dx >= 0 ? px : -px;
    else nz += dz >= 0 ? pz : -pz;
  }
  return { x: nx, z: nz };
}

export function insideAny(x, z, colliders, pad) {
  const p = pad || 0;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (Math.abs(x - c.x) < c.hw + p && Math.abs(z - c.z) < c.hd + p) return true;
  }
  return false;
}

// True when the straight segment a->b crosses any collider box.
export function lineBlocked(ax, az, bx, bz, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    if (segmentHitsBox(ax, az, bx, bz, colliders[i])) return true;
  }
  return false;
}

export function segmentHitsBox(ax, az, bx, bz, c) {
  const minX = c.x - c.hw;
  const maxX = c.x + c.hw;
  const minZ = c.z - c.hd;
  const maxZ = c.z + c.hd;
  if (ax >= minX && ax <= maxX && az >= minZ && az <= maxZ) return true;
  if (bx >= minX && bx <= maxX && bz >= minZ && bz <= maxZ) return true;
  return (
    segmentsCross(ax, az, bx, bz, minX, minZ, maxX, minZ) ||
    segmentsCross(ax, az, bx, bz, maxX, minZ, maxX, maxZ) ||
    segmentsCross(ax, az, bx, bz, maxX, maxZ, minX, maxZ) ||
    segmentsCross(ax, az, bx, bz, minX, maxZ, minX, minZ)
  );
}

function orient(ax, az, bx, bz, cx, cz) {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

function segmentsCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const o1 = orient(ax, az, bx, bz, cx, cz);
  const o2 = orient(ax, az, bx, bz, dx, dz);
  const o3 = orient(cx, cz, dx, dz, ax, az);
  const o4 = orient(cx, cz, dx, dz, bx, bz);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

// The marina shoreline rule: open water blocks movement, except the pier
// strip (x 145..171) which stays walkable all the way out to z 284, and
// except the south beach shallows which simply clamp at the sand.
export function applyShore(x, z, prevX, prevZ) {
  let nx = x;
  let nz = z;
  const onPier = nx >= 145 && nx <= 171 && nz >= 196;
  if (!onPier) {
    // Marina bay water: east side, north of the bay line.
    if (nz > 208 && nx > 96) nz = prevZ > 208 && prevX > 96 ? nz : Math.min(nz, 208);
    if (nz > 208 && nx > 96) nz = 208;
    // Open sea east of the coast road.
    if (nx > 252 && nz <= 208) nx = Math.min(nx, 252);
  }
  // South beach: the sand ends and the surf begins.
  if (nz < -248) nz = -248;
  return { x: nx, z: nz };
}

export function clampWorld(x, z) {
  return {
    x: Math.max(-284, Math.min(284, x)),
    z: Math.max(-284, Math.min(284, z)),
  };
}
