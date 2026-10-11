import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { stops } from "../src/data.js";
import { createKit } from "../src/world/kit.js";
import { buildNature } from "../src/world/nature.js";
import { buildDistricts } from "../src/world/districts.js";
import { buildRoadMap, roadLines, roadCurve, roadKey } from "../src/world/roads.js";
import { findRoute, smoothRoute, isWalkable } from "../src/navigation.js";

// The real world, as scene.js builds it, minus rendering.
const scene = new T.Scene(),
  kit = createKit(scene),
  locations = stops.map((s, i) => ({ x: s.x * 2.5, z: i === 0 ? 27 : s.z * 2.5 })),
  destinations = locations.map((s, i) => ({ x: s.x, z: s.z + (i === 0 ? 3.6 : i === 8 ? 1.7 : 4.6) })),
  obstacles = [],
  roads = buildRoadMap();
buildNature(kit, { scenery: new T.Group(), cityLayer: new T.Group(), locations, roads, obstacles });
buildDistricts(kit, { cityLayer: new T.Group(), locations, stops, sign: () => new T.Mesh(), obstacles });

function walk(path, visit) {
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1],
      b = path[k],
      len = Math.hypot(b.x - a.x, b.z - a.z),
      n = Math.max(1, Math.ceil(len / 0.2));
    for (let s = 0; s < n; s++) visit(a.x + ((b.x - a.x) * (s + 0.5)) / n, a.z + ((b.z - a.z) * (s + 0.5)) / n, len / n);
  }
}

test("road centre lines are walkable: no building, tree or rock sits on a road", () => {
  for (const { points } of roadLines)
    for (const p of roadCurve(points).getSpacedPoints(400))
      assert.ok(isWalkable(p.x, p.z, obstacles, true, 0.3), `blocked at ${p.x},${p.z}`);
});

test("every leg of the trip follows the road and reaches stops in story order", () => {
  let from = { x: 0, z: 32 };
  destinations.forEach((d, i) => {
    const raw = findRoute(from, d, obstacles, i > 0, roads);
    assert.ok(raw.length, `no route to stop ${i}`);
    const path = [from, ...smoothRoute([from, ...raw], obstacles, i > 0, 5, roads).slice(1)];
    let on = 0,
      total = 0;
    walk(path, (x, z, step) => {
      total += step;
      if (roads.has(roadKey(x, z))) on += step;
      // Never detour past a stop the class has not reached yet.
      locations.forEach((l, j) => j > i && j !== 8 && assert.ok(Math.hypot(x - l.x, z - l.z) > 6, `leg ${i} passes stop ${j}`));
    });
    assert.ok(on / Math.max(total, 1e-9) >= 0.95, `leg ${i} only ${Math.round((100 * on) / total)}% on road`);
    from = d;
  });
});
