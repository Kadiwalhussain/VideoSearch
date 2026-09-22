/**
 * Caption fixtures for topic-quality tests.
 *
 * Written the way real ASR output looks: lowercase, filler words, no reliable
 * punctuation, and the occasional sponsor read. Timings are ~25s chunks, which
 * is what chunkTranscript produces.
 */

import type { EmbeddedChunk, TranscriptChunk } from "../types/schema";

export function toChunks(lines: string[], step = 25): TranscriptChunk[] {
  return lines.map((text, i) => ({
    chunkId: `c${i}`,
    startTime: i * step,
    endTime: (i + 1) * step,
    text,
  }));
}

/** A machine-learning lecture — the core use case. */
export const ML_LECTURE = toChunks([
  "hey everyone welcome back to the course so today we are going to talk about gradient descent and how it actually works under the hood",
  "before we start make sure you watched the previous lecture on the chain rule because we are going to use it a lot in this one",
  "so what is gradient descent basically it is an optimization algorithm that we use to minimize the loss function of our model",
  "the key intuition here is that the gradient points uphill so if we want to go down we step in the opposite direction of the gradient",
  "and the size of that step is controlled by the learning rate which is probably the most important hyperparameter you will tune",
  "if the learning rate is too large the loss will bounce around and diverge and if it is too small training takes forever",
  "ok so now let us talk about backpropagation because that is how we actually compute those gradients in a neural network",
  "backpropagation is really just the chain rule applied recursively from the output layer back to the input layer",
  "we compute the local gradient at each node and multiply it by the gradient flowing in from the layer above",
  "this is why it is called backward propagation the gradients flow backwards through the computation graph",
  "now a very common problem that people hit is the vanishing gradient problem especially in deep networks",
  "when you use a sigmoid activation the derivative is at most zero point two five so gradients shrink at every layer",
  "after ten layers that is zero point two five to the power ten which is basically zero so the early layers stop learning",
  "the fix that most people use today is the relu activation function because its derivative is exactly one for positive inputs",
  "relu solved a huge part of the vanishing gradient problem and that is a big reason deep networks became trainable",
  "another technique that helps a lot is batch normalization which normalizes the activations inside each mini batch",
  "batch normalization makes the loss surface smoother so you can use a larger learning rate and converge much faster",
  "in the demo you can see the loss plateaus for a while and then drops sharply once batch norm kicks in",
  "let us also talk about momentum because plain gradient descent can get stuck oscillating in narrow valleys",
  "momentum accumulates a running average of past gradients so the updates keep moving in a consistent direction",
  "adam combines momentum with an adaptive per parameter learning rate and it is the default optimizer most people reach for",
  "ok for the exam you should be able to derive the gradient descent update rule by hand so please practice that",
  "also make sure you understand why the learning rate schedule matters we will cover cosine annealing next week",
  "that is it for today thanks for watching and i will see you in the next lecture take care",
]);

/**
 * Hinglish lecture — Roman-script Hindi mixed with English technical terms.
 * Extremely common on Indian education channels.
 */
export const HINGLISH_LECTURE = toChunks([
  "namaste doston aaj hum log photosynthesis ke baare mein detail mein baat karenge",
  "sabse pehle ye samajhna zaroori hai ki photosynthesis kya hota hai aur plants ise kyun karte hain",
  "photosynthesis ek process hai jisme plant sunlight ko chemical energy mein convert karta hai",
  "iske liye plant ko teen cheezein chahiye sunlight carbon dioxide aur paani",
  "ye poora reaction chloroplast ke andar hota hai jisme chlorophyll naam ka pigment hota hai",
  "chlorophyll green colour ka hota hai isliye patte hare dikhte hain ye light ko absorb karta hai",
  "ab hum light reaction ke baare mein padhenge jo thylakoid membrane par hoti hai",
  "light reaction mein paani todta hai aur oxygen gas release hoti hai jise hum saans lete hain",
  "is process ko photolysis kehte hain aur ye bahut important hai exam ke point of view se",
  "light reaction se humein atp aur nadph milta hai jo energy carriers hote hain",
  "ab baat karte hain dark reaction ki jise calvin cycle bhi kehte hain",
  "calvin cycle stroma mein hota hai aur isme sunlight ki direct zaroorat nahi hoti",
  "yahan carbon dioxide fix hoti hai aur glucose banta hai jo plant ka food hai",
  "calvin cycle ke teen steps hote hain carboxylation reduction aur regeneration",
  "board exam mein ye diagram bahut baar poocha gaya hai to ise achhe se practice karna",
  "chaliye ab hum factors dekhte hain jo photosynthesis ki rate ko affect karte hain",
  "light intensity temperature aur carbon dioxide concentration ye teen main factors hain",
  "agar light intensity badhayenge to rate badhegi lekin ek point ke baad saturate ho jayegi",
  "aaj ke liye bas itna hi agle video mein hum respiration padhenge dhanyawaad",
]);

/** Sponsor-heavy tech review — the "Youtube Youtube Gmail" brand-spam case. */
export const BRANDY_REVIEW = toChunks([
  "what is up guys welcome back to the channel today we are reviewing the new laptop",
  "but first this video is sponsored by squarespace go to squarespace dot com slash channel for ten percent off",
  "you can also follow me on instagram and twitter and subscribe on youtube and hit the bell icon",
  "ok so the build quality on this thing is genuinely excellent the chassis is machined aluminium",
  "the keyboard has one point five millimetres of travel and it is honestly a joy to type on",
  "the display is a fourteen inch oled panel running at ninety hertz and the colours are stunning",
  "battery life is where this laptop really surprised me i got about eleven hours of real usage",
  "under load the fans do spin up but the thermals stay under eighty degrees which is respectable",
  "the port selection is good you get two thunderbolt ports hdmi and a full size sd card reader",
  "performance wise it handles video editing in premiere and davinci resolve without dropping frames",
  "the webcam is still only seven twenty p in twenty twenty four which is honestly disappointing",
  "at nine ninety nine dollars i think it is a good value compared to the macbook air",
  "so should you buy it if you need portability and battery life then yes absolutely",
  "thanks for watching guys hit like and subscribe on youtube and i will see you next time",
]);

/**
 * Synthetic embeddings so tests can exercise the production path (MiniLM
 * vectors drive the section cuts). A hashed bag-of-words vector puts chunks
 * that share vocabulary close together, which is the property segmentation
 * actually depends on.
 */
export function withEmbeddings(
  chunks: TranscriptChunk[],
  dims = 64
): EmbeddedChunk[] {
  return chunks.map((c) => {
    const v = new Float32Array(dims);
    for (const w of c.text.toLowerCase().split(/\s+/)) {
      if (w.length < 4) continue;
      let h = 0;
      for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
      v[h % dims] += 1;
    }
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dims; i++) v[i] /= norm;
    return { ...c, embedding: v };
  });
}
