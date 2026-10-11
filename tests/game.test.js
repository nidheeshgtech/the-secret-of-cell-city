import test from "node:test";
import assert from "node:assert/strict";
import { shuffle, buildRounds, readingDelay, loadState, formatDuration } from "../src/game.js";
import { stops, emergencies } from "../src/data.js";

test("shuffle keeps every item exactly once", () => {
  const out = shuffle([1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5, 6]);
});

test("rounds contain the answer and two distinct distractors", () => {
  for (let run = 0; run < 50; run++) {
    const rounds = buildRounds(
      emergencies.map((e) => e.answer),
      9,
    );
    assert.equal(rounds.length, emergencies.length);
    assert.deepEqual(rounds.map((r) => r.answer).sort(), emergencies.map((e) => e.answer).sort());
    for (const r of rounds) {
      assert.equal(r.options.length, 3);
      assert.equal(new Set(r.options).size, 3);
      assert.ok(r.options.includes(r.answer));
      assert.ok(r.options.every((i) => i >= 0 && i < 9));
    }
  }
});

test("rounds are not always in the same order", () => {
  const orders = new Set(
    Array.from({ length: 30 }, () =>
      buildRounds([0, 1, 2, 3, 4, 5, 6, 7, 8], 9)
        .map((r) => r.answer)
        .join(),
    ),
  );
  assert.ok(orders.size > 1);
});

test("reading delay gives young readers time", () => {
  assert.equal(readingDelay("Hi"), 2600);
  assert.ok(readingDelay("x".repeat(100)) >= 7000);
});

test("old saved progress still loads", () => {
  const state = loadState({ done: 4, stars: 80, rescued: false });
  assert.equal(state.done, 4);
  assert.equal(state.mistakes.length, 9);
  assert.ok(state.mistakes.every((m) => m === 0));
  assert.equal(loadState(null).done, 0);
  assert.equal(loadState({ done: 99 }).done, 9);
});

test("every stop and emergency has a hint", () => {
  assert.ok(stops.every((s) => s.hint && s.hint.length > 20));
  assert.ok(emergencies.every((e) => e.hint && stops[e.answer]));
});

test("duration format", () => {
  assert.equal(formatDuration(0), "—");
  assert.equal(formatDuration(25 * 60000), "25 min");
});
