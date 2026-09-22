import test from "node:test";
import assert from "node:assert/strict";
import { extractTopics, isGoodUserLabel } from "./extractTopics";
import { snapTopicTimes } from "./snapTopicTimes";
import { isBoilerplate, afterCue } from "./lexicon";
import { tokenize, titleCase } from "./phraseLabel";
import {
  BRANDY_REVIEW,
  HINGLISH_LECTURE,
  ML_LECTURE,
  toChunks,
  withEmbeddings,
} from "./fixtures";

const labels = (chunks: Parameters<typeof extractTopics>[0]) =>
  extractTopics(chunks).map((t) => t.label);

const hasLabel = (ls: string[], want: string) =>
  ls.some((l) => l.toLowerCase().includes(want.toLowerCase()));

// ── Label quality ──────────────────────────────────────────────────────────

test("names the real subjects of an ML lecture", () => {
  const ls = labels(ML_LECTURE);
  assert.ok(hasLabel(ls, "gradient descent"), `missing gradient descent: ${ls}`);
  assert.ok(
    hasLabel(ls, "batch normalization"),
    `missing batch normalization: ${ls}`
  );
  assert.ok(
    hasLabel(ls, "propagation") || hasLabel(ls, "backprop"),
    `missing backpropagation: ${ls}`
  );
  assert.ok(hasLabel(ls, "activation"), `missing activation: ${ls}`);
});

test("labels are phrases the speaker actually said, not reassembled words", () => {
  // Each label must appear verbatim (token-wise, in order) in some caption.
  const corpus = ML_LECTURE.map((c) => tokenize(c.text).join(" "));
  for (const label of labels(ML_LECTURE)) {
    const phrase = tokenize(label).join(" ");
    assert.ok(
      corpus.some((text) => text.includes(phrase)),
      `"${label}" is not a contiguous phrase from the captions`
    );
  }
});

test("works on romanized Hindi and keeps its function words out", () => {
  const ls = labels(HINGLISH_LECTURE);
  assert.ok(ls.length >= 5, `too few Hinglish topics: ${ls}`);
  assert.ok(
    hasLabel(ls, "calvin cycle") ||
      hasLabel(ls, "thylakoid") ||
      hasLabel(ls, "dark reaction"),
    `missing a real photosynthesis subject: ${ls}`
  );
  // Hindi grammar words must never surface as a topic
  for (const junk of ["hota", "karte", "jisme", "chahiye", "kehte", "poocha"]) {
    assert.ok(
      !ls.some((l) => tokenize(l).includes(junk)),
      `Hindi function word "${junk}" leaked into: ${ls}`
    );
  }
});

test("Devanagari captions survive tokenizing", () => {
  // The old [a-z] tokenizer dropped these entirely.
  assert.deepEqual(tokenize("प्रकाश संश्लेषण क्या है"), [
    "प्रकाश",
    "संश्लेषण",
    "क्या",
    "है",
  ]);
  assert.equal(titleCase("प्रकाश संश्लेषण"), "प्रकाश संश्लेषण");
});

test("drops sponsor reads, intros and sign-offs", () => {
  const ls = labels(BRANDY_REVIEW);
  for (const junk of ["squarespace", "subscribe", "sponsored", "watching"]) {
    assert.ok(
      !ls.some((l) => l.toLowerCase().includes(junk)),
      `boilerplate "${junk}" became a topic: ${ls}`
    );
  }
  // …while still finding what the review is about
  assert.ok(hasLabel(ls, "battery life"), `missing battery life: ${ls}`);
});

test("no label is a repeated word or pure filler", () => {
  for (const chunks of [ML_LECTURE, HINGLISH_LECTURE, BRANDY_REVIEW]) {
    for (const label of labels(chunks)) {
      const words = tokenize(label);
      assert.ok(words.length >= 2, `single-word label: ${label}`);
      assert.equal(
        new Set(words).size,
        words.length,
        `repeated word in label: ${label}`
      );
    }
  }
});

// ── Structure ──────────────────────────────────────────────────────────────

test("topics are chronological and distinct in time", () => {
  for (const chunks of [ML_LECTURE, HINGLISH_LECTURE, BRANDY_REVIEW]) {
    const topics = extractTopics(chunks);
    for (let i = 1; i < topics.length; i++) {
      assert.ok(
        topics[i].startTime > topics[i - 1].startTime,
        `topic ${i} starts at ${topics[i].startTime}, not after ${topics[i - 1].startTime}`
      );
    }
  }
});

test("runs the embedding path when vectors are present", () => {
  const embedded = withEmbeddings(ML_LECTURE);
  const topics = extractTopics(embedded);
  assert.ok(topics.length >= 6, `too few topics: ${topics.length}`);
  assert.ok(hasLabel(topics.map((t) => t.label), "gradient descent"));
  for (let i = 1; i < topics.length; i++) {
    assert.ok(topics[i].startTime > topics[i - 1].startTime);
  }
});

test("every topic starts inside the video", () => {
  const end = Math.max(...ML_LECTURE.map((c) => c.endTime));
  for (const t of extractTopics(ML_LECTURE)) {
    assert.ok(t.startTime >= 0 && t.startTime <= end, `out of range: ${t.startTime}`);
  }
});

test("handles empty and tiny inputs without throwing", () => {
  assert.deepEqual(extractTopics([]), []);
  assert.ok(Array.isArray(extractTopics(toChunks(["hello there"]))));
});

// ── snapTopicTimes ─────────────────────────────────────────────────────────

test("snapping keeps topics ordered and never stacks two on one second", () => {
  const chunks = ML_LECTURE;
  // Deliberately out of order with colliding hints.
  const topics = [
    { label: "Batch Normalization", query: "batch normalization", startTime: 900, kind: "section" as const, score: 1 },
    { label: "Gradient Descent", query: "gradient descent", startTime: 0, kind: "section" as const, score: 1 },
    { label: "Relu Activation", query: "relu activation", startTime: 0, kind: "section" as const, score: 1 },
  ];
  const snapped = snapTopicTimes(topics, chunks);
  for (let i = 1; i < snapped.length; i++) {
    assert.ok(
      snapped[i].startTime > snapped[i - 1].startTime,
      `not strictly increasing: ${snapped.map((s) => s.startTime)}`
    );
  }
});

// ── Gates and cues ─────────────────────────────────────────────────────────

test("isGoodUserLabel rejects the junk the old model produced", () => {
  for (const bad of [
    "Youtube Youtube Youtube",
    "Youtube 9.99 10.25",
    "Zero Point",
    "the and or",
    "visit example.com",
    "Applied Recursively",
  ]) {
    assert.equal(isGoodUserLabel(bad), false, `should reject: ${bad}`);
  }
  for (const good of [
    "Gradient Descent",
    "Batch Normalization",
    "Calvin Cycle",
    "Fourteen Inch OLED Panel",
  ]) {
    assert.equal(isGoodUserLabel(good), true, `should accept: ${good}`);
  }
});

test("detects boilerplate and topic cues", () => {
  assert.ok(isBoilerplate("this video is sponsored by squarespace"));
  assert.ok(isBoilerplate("thanks for watching and i will see you next time"));
  assert.ok(!isBoilerplate("the learning rate controls the step size"));

  assert.match(
    String(afterCue("ok so now let us talk about backpropagation because")),
    /^backpropagation/
  );
  assert.equal(afterCue("the chassis is machined aluminium"), null);
});
