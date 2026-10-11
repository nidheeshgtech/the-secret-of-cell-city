import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createKit } from "../src/world/kit.js";
import { createPerson, animatePerson, posePerson } from "../src/world/people.js";

const NAMES = ["Dr. Maya", "Aria", "Ben", "Zoya", "Leo"];

function cast() {
  const scene = new T.Scene(),
    kit = createKit(scene),
    people = [0, 1, 2, 3, 4].map((i) => createPerson(kit, scene, i));
  return { scene, people };
}

// Every position, rotation and scale in the rig must stay finite.
function assertFinite(actor) {
  actor.root.traverse((o) => {
    for (const v of [o.position, o.rotation, o.scale])
      for (const k of ["x", "y", "z"]) assert.ok(Number.isFinite(v[k]), `${actor.name}: ${o.type} ${k} is ${v[k]}`);
  });
}

// Simulate `seconds` of frames; `speed` > 0 walks along +x.
function run(actor, i, seconds, speed, opts = {}) {
  const dt = 1 / 60;
  let t = opts.t0 ?? 0;
  for (let f = 0; f < seconds * 60; f++, t += dt) {
    const dx = speed * dt;
    actor.root.position.x += dx;
    animatePerson(actor, dx, 0, dt, t, i, !!opts.reduced);
    posePerson(actor, { lookYaw: opts.lookYaw ?? 0, nod: 0, talking: !!opts.talking, t, dt });
  }
  return t;
}

test("creates the five actors at their start positions with the expected heights and names", () => {
  const { scene, people } = cast();
  people.forEach((p, i) => {
    assert.equal(p.root.parent, scene);
    assert.equal(p.name, NAMES[i]);
    assert.ok(Math.abs(p.root.position.x) < 1e-9);
    assert.ok(Math.abs(p.root.position.y - 0.42) < 1e-9);
    assert.ok(Math.abs(p.root.position.z - (32 + i * 0.6)) < 1e-9);
    assert.ok(Math.abs(p.root.rotation.y - Math.PI) < 1e-9);
    assert.ok(p.vel instanceof T.Vector2);
    assert.equal(p.walk, 0);
    if (i === 0) assert.ok(Math.abs(p.h - 1.72) < 0.02);
    else assert.ok(p.h >= 1.33 && p.h <= 1.42, `${p.name} height ${p.h}`);
  });
});

test("walking drives walk towards 1 and turns the body towards the movement; idle settles back", () => {
  const { people } = cast();
  people.forEach((p, i) => {
    run(p, i, 3, 2);
    assert.ok(p.walk > 0.9, `${p.name} walk ${p.walk}`);
    // Moving along +x means facing yaw +PI/2.
    const diff = Math.atan2(Math.sin(p.root.rotation.y - Math.PI / 2), Math.cos(p.root.rotation.y - Math.PI / 2));
    assert.ok(Math.abs(diff) < 0.05, `${p.name} yaw ${p.root.rotation.y}`);
    assertFinite(p);
    run(p, i, 3, 0, { t0: 3 });
    assert.ok(p.walk < 0.05, `${p.name} idle walk ${p.walk}`);
    assertFinite(p);
  });
});

test("talking, looking and reduced motion keep the rig finite", () => {
  const { people } = cast();
  people.forEach((p, i) => {
    run(p, i, 3, 0, { talking: true, lookYaw: 0.8 });
    assert.ok(p.talk.w > 0.9, `${p.name} talk weight ${p.talk.w}`);
    run(p, i, 2, 0, { talking: false, lookYaw: -0.9, t0: 3 });
    run(p, i, 2, 1.5, { reduced: true, t0: 5 });
    // Paused frames: zero movement and zero dt.
    animatePerson(p, 0, 0, 0, 7, i, false);
    posePerson(p, { lookYaw: 0, nod: 0, talking: false, t: 7, dt: 0 });
    assertFinite(p);
  });
});

test("a planted foot stays on the ground while walking", () => {
  const { people } = cast();
  people.forEach((p, i) => {
    run(p, i, 1, 1.8);
    for (let k = 0; k < 12; k++) {
      run(p, i, 0.1, 1.8, { t0: 1 + k * 0.1 });
      p.root.updateMatrixWorld(true);
      const low = new T.Box3().setFromObject(p.root, true).min.y - p.root.position.y;
      assert.ok(low > -0.03 && low < 0.03, `${p.name} lowest point while walking ${low}`);
    }
  });
});

test("feet rest on the ground", () => {
  const { people } = cast();
  people.forEach((p, i) => {
    run(p, i, 2, 0);
    p.root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(p.root);
    assert.ok(Math.abs(box.min.y - p.root.position.y) <= 0.03, `${p.name} lowest point ${box.min.y - p.root.position.y}`);
    assert.ok(box.max.y - p.root.position.y > p.h * 0.95, `${p.name} top ${box.max.y - p.root.position.y}`);
  });
});

test("whole cast stays within the draw-call and triangle budget", () => {
  const { scene } = cast();
  let calls = 0,
    triangles = 0;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    calls++;
    const g = o.geometry;
    triangles += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  assert.ok(calls <= 250, `draw calls ${calls}`);
  assert.ok(triangles <= 150000, `triangles ${triangles}`);
});
