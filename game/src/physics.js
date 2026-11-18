// v3: unchanged — circle-vs-AABB collision and lineBlocked already serve the officers and the gang cover search.
// physics.js — deliberately simple collision: circles against axis-aligned
// boxes (buildings, walls) with push-out resolution, plus world-edge clamping.
// Fast enough for every car and pedestrian every frame, and stable at 60 fps.

export function collideCircle(colliders, x, z, radius) {
  let hit = false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.roofOnly) continue;
    if (x < c.minX - radius || x > c.maxX + radius || z < c.minZ - radius || z > c.maxZ + radius) continue;
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    let dx = x - nx, dz = z - nz;
    let d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    hit = true;
    if (d2 < 1e-6) {
      // centre inside the box: push out along the smallest penetration axis
      const left = x - c.minX, right = c.maxX - x, top = z - c.minZ, bot = c.maxZ - z;
      const m = Math.min(left, right, top, bot);
      if (m === left) x = c.minX - radius; else if (m === right) x = c.maxX + radius;
      else if (m === top) z = c.minZ - radius; else z = c.maxZ + radius;
      continue;
    }
    const d = Math.sqrt(d2);
    x = nx + (dx / d) * radius;
    z = nz + (dz / d) * radius;
  }
  return { x, z, hit };
}

export function clampToWorld(pos, edge) {
  pos.x = Math.max(-edge, Math.min(edge, pos.x));
  pos.z = Math.max(-edge, Math.min(edge, pos.z));
}

// Is the straight line a→b blocked by any collider? Cheap wanted/visibility test.
export function lineBlocked(colliders, ax, az, bx, bz) {
  const steps = 8;
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (let j = 0; j < colliders.length; j++) {
      const c = colliders[j];
      if (!c.roofOnly && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
  }
  return false;
}
