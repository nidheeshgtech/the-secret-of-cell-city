import test from "node:test";
import assert from "node:assert/strict";
import { findRoute, smoothRoute, isWalkable } from "../src/navigation.js";

const turn = (a, b, c) => {
  const d = Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z);
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
};

test("smoothed route keeps start and end, stays walkable and has no sharp grid turns", () => {
  const blocks = [{ x: 0, z: 0, w: 8, d: 2 }],
    start = { x: 0, z: 5 },
    end = { x: 0, z: -5 },
    raw = [start, ...findRoute(start, end, blocks)],
    smooth = smoothRoute(raw, blocks);
  assert.deepEqual(smooth[0], start);
  assert.deepEqual(smooth.at(-1), end);
  assert.ok(smooth.every((p) => isWalkable(p.x, p.z, blocks, true, 0.34)));
  for (let i = 1; i < smooth.length - 1; i++) assert.ok(turn(smooth[i - 1], smooth[i], smooth[i + 1]) < Math.PI / 4 + 1e-6);
});

test("open ground collapses to a near-straight line", () => {
  const raw = [{ x: 0, z: 0 }, ...findRoute({ x: 0, z: 0 }, { x: 3, z: 1.3 }, [])],
    smooth = smoothRoute(raw, []);
  const length = smooth.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - smooth[i].x, p.z - smooth[i].z), 0);
  assert.ok(length < Math.hypot(3, 1.3) * 1.02);
});
