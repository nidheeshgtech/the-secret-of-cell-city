// Shared walkable map for keyboard movement, route finding and follower collision.
export const CITY_RX = 31;
export const CITY_RZ = 26.5;
export function isWalkable(x, z, obstacles, gateOpen = true, radius = 0.34) {
  const entrance = Math.abs(x) < 2.5 - radius && z >= 23 && z < 35;
  if (!entrance && (x / (CITY_RX - radius)) ** 2 + (z / (CITY_RZ - radius)) ** 2 > 1) return false;
  if (!gateOpen && z < 28.2) return false;
  return !obstacles.some(
    (o) => x > o.x - o.w / 2 - radius && x < o.x + o.w / 2 + radius && z > o.z - o.d / 2 - radius && z < o.z + o.d / 2 + radius,
  );
}
export function moveWithCollision(position, dx, dz, obstacles, gateOpen = true, radius = 0.34) {
  const slices = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
  for (let i = 0; i < slices; i++) {
    if (isWalkable(position.x + dx / slices, position.z, obstacles, gateOpen, radius)) position.x += dx / slices;
    if (isWalkable(position.x, position.z + dz / slices, obstacles, gateOpen, radius)) position.z += dz / slices;
  }
  return position;
}
// Grass is ten times the effort of a road, so walkers only leave the road when they must.
// `roads` is a Map of cell → cost (1 at the centre line) or, for older callers, a Set of road cells.
export const GRASS_COST = 10;
function stepCost(roads, key) {
  if (!roads) return 1;
  if (roads instanceof Map) return roads.get(key) ?? GRASS_COST;
  return roads.has(key) ? 1 : 2.8;
}
export function findRoute(start, end, obstacles, gateOpen = true, roads = null) {
  const size = 0.65,
    key = (x, z) => `${x},${z}`,
    grid = (p) => [Math.round(p.x / size), Math.round(p.z / size)];
  const [sx, sz] = grid(start),
    [ex, ez] = grid(end),
    startKey = key(sx, sz);
  const open = [{ x: sx, z: sz, g: 0, f: 0, k: startKey }],
    cost = new Map([[startKey, 0]]),
    parents = new Map(),
    closed = new Set();
  let found;
  for (let count = 0; open.length && count < 22000; count++) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const n = open.splice(best, 1)[0];
    if (closed.has(n.k)) continue;
    closed.add(n.k);
    if (n.x === ex && n.z === ez) {
      found = n;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const x = n.x + dx,
        z = n.z + dz,
        k = key(x, z);
      if (closed.has(k) || !isWalkable(x * size, z * size, obstacles, gateOpen, 0.48)) continue;
      if (
        dx &&
        dz &&
        (!isWalkable(n.x * size, z * size, obstacles, gateOpen, 0.48) || !isWalkable(x * size, n.z * size, obstacles, gateOpen, 0.48))
      )
        continue;
      const g = n.g + Math.hypot(dx, dz) * stepCost(roads, k);
      if (g >= (cost.get(k) ?? Infinity)) continue;
      cost.set(k, g);
      parents.set(k, n);
      open.push({ x, z, k, g, f: g + Math.hypot(ex - x, ez - z) });
    }
  }
  if (!found) return [];
  const path = [{ x: end.x, z: end.z }];
  let n = found;
  while (n.k !== startKey) {
    path.push({ x: n.x * size, z: n.z * size });
    n = parents.get(n.k);
  }
  return path.reverse();
}
// True when a straight walk from a to b stays clear of obstacles and the city edge.
export function hasClearance(a, b, obstacles, gateOpen = true, radius = 0.48) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!isWalkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, obstacles, gateOpen, radius)) return false;
  }
  return true;
}
// Turns a grid route into a natural walking line: skip zig-zag cells, then round the corners.
// With `roads`, a shortcut must stay on the road (short hops of up to 1.5 units excepted).
function staysOnRoad(a, b, roads) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (!roads || length <= 1.5) return true;
  const steps = Math.ceil(length / 0.25);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!roads.has(`${Math.round((a.x + (b.x - a.x) * t) / 0.65)},${Math.round((a.z + (b.z - a.z) * t) / 0.65)}`)) return false;
  }
  return true;
}
export function smoothRoute(path, obstacles, gateOpen = true, maxSkip = 5, roads = null) {
  if (path.length < 3) return path.map((p) => ({ x: p.x, z: p.z }));
  const pulled = [path[0]];
  for (let i = 0; i < path.length - 1; ) {
    let j = path.length - 1;
    while (
      j > i + 1 &&
      (Math.hypot(path[j].x - path[i].x, path[j].z - path[i].z) > maxSkip ||
        !hasClearance(path[i], path[j], obstacles, gateOpen) ||
        !staysOnRoad(path[i], path[j], roads))
    )
      j--;
    pulled.push(path[j]);
    i = j;
  }
  // Drop tiny jogs left by the grid so corners round off evenly.
  let points = pulled.filter(
    (p, i) => i === 0 || i === pulled.length - 1 || Math.hypot(p.x - pulled[i - 1].x, p.z - pulled[i - 1].z) > 0.6,
  );
  for (let pass = 0; pass < 3; pass++) {
    const out = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out.push(points.at(-1));
    points = out;
  }
  return points.map((p) => ({ x: p.x, z: p.z }));
}
