import test from "node:test";
import assert from "node:assert/strict";
import { cardFaces, schedule } from "./study.js";

const DAY = 86400_000;
const NOW = Date.UTC(2026, 0, 1);

test("again brings the card back in 10 minutes and counts a lapse", () => {
  const s = schedule({ ease: 2.5, intervalDays: 10, reps: 3 }, "again", NOW);
  assert.equal(s.dueAt.getTime(), NOW + 10 * 60_000);
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 1);
  assert.ok(s.ease < 2.5);
});

test("first reviews: hard 1d, good 1d then 3d, easy 4d", () => {
  assert.equal(schedule(null, "hard", NOW).intervalDays, 1);
  const g1 = schedule(null, "good", NOW);
  assert.equal(g1.intervalDays, 1);
  assert.equal(schedule(g1, "good", NOW).intervalDays, 3);
  assert.equal(schedule(null, "easy", NOW).intervalDays, 4);
});

test("hard ≤ good < easy for a mature card, and intervals grow", () => {
  const st = { ease: 2.5, intervalDays: 10, reps: 4 };
  const hard = schedule(st, "hard", NOW).intervalDays;
  const good = schedule(st, "good", NOW).intervalDays;
  const easy = schedule(st, "easy", NOW).intervalDays;
  assert.ok(hard <= good && good < easy, `${hard} ${good} ${easy}`);
  assert.ok(good > 10);
  assert.equal(schedule(st, "good", NOW).dueAt.getTime(), NOW + good * DAY);
});

test("ease never drops below 1.3 and intervals cap at a year", () => {
  let s = { ease: 1.3, intervalDays: 300, reps: 9 };
  s = schedule(s, "hard", NOW);
  assert.equal(s.ease, 1.3);
  assert.ok(schedule({ ease: 3, intervalDays: 300, reps: 9 }, "easy", NOW).intervalDays <= 365);
});

test("card faces from note formats", () => {
  assert.deepEqual(cardFaces("What is RAG? :: Retrieval + generation"), {
    front: "What is RAG?",
    back: "Retrieval + generation",
  });
  assert.deepEqual(cardFaces("Q: capital of France\nA: Paris"), {
    front: "capital of France",
    back: "Paris",
  });
  assert.deepEqual(cardFaces("Why does it overfit?\nToo many params"), {
    front: "Why does it overfit?",
    back: "Too many params",
  });
  assert.deepEqual(cardFaces("gradient descent recap"), {
    front: null,
    back: "gradient descent recap",
  });
  assert.equal(cardFaces("   "), null);
});
