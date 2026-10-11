import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createKit } from "../src/world/kit.js";
import { buildDistricts } from "../src/world/districts.js";
import { isWalkable } from "../src/navigation.js";
import { stops } from "../src/data.js";

const expectedObstacles = [
  { x: -17.5, z: 10, w: 6.5, d: 4.8 },
  { x: -20, z: -5, w: 5.6, d: 4.3 },
  { x: -7.5, z: -12.5, w: 5.2, d: 2.1 },
  { x: 7.5, z: -15, w: 4.8, d: 4.9 },
  { x: 20, z: -7.5, w: 5.4, d: 4.1 },
  { x: 17.5, z: 10, w: 5.5, d: 5.5 },
  { x: 7.5, z: 15, w: 4, d: 4.6 },
  { x: -3, z: 27, w: 1.1, d: 1.6 },
  { x: 3, z: 27, w: 1.1, d: 1.6 },
  { x: -3.3, z: 0, w: 1.5, d: 7.4 },
  { x: 3.3, z: 0, w: 1.5, d: 7.4 },
  { x: 0, z: -3.4, w: 7, d: 1.5 },
];

function setup() {
  const scene = new T.Scene(),
    kit = createKit(scene),
    cityLayer = new T.Group();
  scene.add(cityLayer);
  const locations = stops.map((s, i) => ({ x: s.x * 2.5, z: i === 0 ? 27 : s.z * 2.5 })),
    obstacles = [],
    sign = (text, x, y, z, width = 3.2, color = "#1E2440", parent = cityLayer) => {
      const board = new T.Mesh(new T.PlaneGeometry(width, width / 6), new T.MeshBasicMaterial({ color }));
      board.position.set(x, y, z);
      board.userData.text = text;
      parent.add(board);
      return board;
    };
  const districts = buildDistricts(kit, { cityLayer, locations, stops, sign, obstacles });
  return { scene, cityLayer, locations, obstacles, districts };
}

test("districts build, animate through every state and demonstrate without throwing", () => {
  const { scene, districts } = setup();
  const states = [
    { done: 0, broken: new Set(), story: false, active: 0, speaker: 0, mode: "follow", leaderPos: new T.Vector3(0, 0, 30) },
    {
      done: 9,
      broken: new Set([5, 2, 4, 0, 7, 1]),
      story: true,
      active: 5,
      speaker: 5,
      mode: "follow",
      leaderPos: new T.Vector3(20, 0, -3),
    },
    { done: 9, broken: new Set([6]), story: true, active: 8, speaker: 5, mode: "follow", leaderPos: new T.Vector3(0, 0, 1.7) },
    { done: 9, broken: new Set(), story: false, active: 8, speaker: 0, mode: "reveal", leaderPos: new T.Vector3(0, 0, 1.7) },
  ];
  for (const reduced of [false, true])
    for (const s of states) for (let t = 0; t < 40; t += 0.37) districts.update(t, 1 / 60, { ...s, reduced });
  districts.demonstrate(6, 2);
  districts.demonstrate(1);
  districts.update(41, 1 / 60, { ...states[0], reduced: false });
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (o.isMesh) for (const v of o.matrixWorld.elements) assert.ok(Number.isFinite(v), `non-finite matrix on ${o.type}`);
  });
});

test("roof hides near the nucleus and in the reveal; walls fade only while talking inside", () => {
  const { districts, cityLayer } = setup();
  const base = { done: 9, broken: new Set(), reduced: false, story: false, active: 0, speaker: 0, mode: "follow" };
  const nucleus = cityLayer.children.find((c) => c.isGroup && c.position.x === 0 && c.position.z === 0),
    hidden = () => nucleus.children.filter((c) => c.isGroup && !c.visible).length,
    faded = () => nucleus.children.filter((c) => c.isMesh && c.material.opacity === 0.6).length;
  districts.update(1, 0.016, { ...base, leaderPos: new T.Vector3(0, 0, 20) });
  assert.equal(hidden(), 0);
  districts.update(1, 0.016, { ...base, leaderPos: new T.Vector3(0, 0, 1.7) });
  assert.equal(hidden(), 1);
  assert.equal(faded(), 0);
  districts.update(1, 0.016, { ...base, story: true, active: 8, leaderPos: new T.Vector3(0, 0, 1.7) });
  assert.equal(faded(), 1);
  districts.update(1, 0.016, { ...base, mode: "reveal", leaderPos: new T.Vector3(0, 0, 20) });
  assert.equal(hidden(), 1);
});

test("obstacle footprint is unchanged", () => {
  const { obstacles } = setup();
  assert.deepEqual(obstacles, expectedObstacles);
});

test("draw calls and triangles stay within budget", () => {
  const { cityLayer } = setup();
  let calls = 0,
    tris = 0;
  cityLayer.traverse((o) => {
    if (!o.isMesh) return;
    calls++;
    const g = o.geometry,
      n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    tris += n * (o.isInstancedMesh ? o.count : 1);
  });
  assert.ok(calls <= 450, `draw calls ${calls}`);
  assert.ok(tris <= 500000, `triangles ${tris}`);
});

test("every class stop stays walkable with the gate open", () => {
  const { locations, obstacles } = setup();
  locations.forEach((l, i) => {
    const d = { x: l.x, z: l.z + (i === 0 ? 3.6 : i === 8 ? 1.7 : 4.6) };
    assert.ok(isWalkable(d.x, d.z, obstacles, true), `stop ${i} at ${d.x},${d.z}`);
  });
});
