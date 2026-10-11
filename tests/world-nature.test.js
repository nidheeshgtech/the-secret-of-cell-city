import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createKit } from "../src/world/kit.js";
import { buildNature } from "../src/world/nature.js";
import { isWalkable } from "../src/navigation.js";
import { stops } from "../src/data.js";

function build(roads = new Set()) {
  const scene = new T.Scene(),
    kit = createKit(scene),
    scenery = new T.Group(),
    cityLayer = new T.Group();
  scene.add(scenery, cityLayer);
  const locations = stops.map((s, i) => ({ x: s.x * 2.5, z: i === 0 ? 27 : s.z * 2.5 }));
  const obstacles = [];
  const nature = buildNature(kit, { scenery, cityLayer, locations, roads, obstacles });
  return { scene, scenery, cityLayer, locations, obstacles, nature };
}
function stats(root) {
  let calls = 0,
    tris = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry,
      t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    calls++;
    tris += t * (o.isInstancedMesh ? o.count : 1);
  });
  return { calls, tris };
}

test("nature builds, animates and registers obstacles away from buildings and the entrance", () => {
  const { nature, obstacles, locations } = build();
  for (let i = 1; i <= 5; i++) nature.update(i * 0.016, 0.016);
  assert.ok(obstacles.length > 20);
  for (const o of obstacles) for (const l of locations) assert.ok(Math.hypot(o.x - l.x, o.z - l.z) >= 5, `obstacle at ${o.x},${o.z}`);
  for (let z = 24; z <= 34; z += 0.5) assert.ok(isWalkable(0, z, obstacles, true), `entrance blocked at z=${z}`);
});

test("nature is deterministic and stays within the draw-call and triangle budget", () => {
  const a = build(),
    b = build();
  assert.deepEqual(a.obstacles, b.obstacles);
  const { calls, tris } = stats(a.scene);
  assert.ok(calls <= 150, `draw calls ${calls}`);
  assert.ok(tris <= 400000, `triangles ${tris}`);
  // Grass tufts never cast shadows; city content lives in the city layer.
  a.cityLayer.traverse((o) => o.isInstancedMesh && o.material.side === T.DoubleSide && assert.equal(o.castShadow, false));
  assert.ok(a.cityLayer.children.length > a.scenery.children.length);
});

test("trees, rocks and tufts keep off road cells", () => {
  const roads = new Set();
  for (let z = -40; z <= 40; z++) roads.add(`0,${z}`);
  const { cityLayer, obstacles } = build(roads);
  for (const o of obstacles) assert.ok(Math.abs(o.x) > 0.8, `obstacle on road at ${o.x},${o.z}`);
  const m = new T.Matrix4(),
    p = new T.Vector3();
  cityLayer.traverse((o) => {
    if (!o.isInstancedMesh || o.castShadow) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (p.y < 0.5 && Math.abs(p.z) < 26) assert.ok(Math.round(p.x / 0.65) !== 0 || Math.abs(p.z) > 22, `tuft on road at ${p.x},${p.z}`);
    }
  });
});
