/**
 * Local sentence embeddings via transformers.js + ONNX Runtime Web.
 * Model: Xenova/all-MiniLM-L6-v2 (384-dim) — runs fully in-browser.
 *
 * First load downloads model weights once (browser-cached afterward).
 * Transcripts and queries never leave the machine.
 */

import { env, pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import type { EmbeddedChunk, TranscriptChunk } from "../types/schema";

/** Quantized MiniLM — small enough for WASM, strong enough for semantic search */
export const EMBEDDING_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

// Configure once for Chrome extension content-script environment
env.allowLocalModels = false;
env.useBrowserCache = true;
// Workers/proxy are flaky inside content scripts
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.numThreads = 1;

type ProgressCallback = (message: string, ratio?: number) => void;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Lazy-load the feature-extraction pipeline once per page session.
 */
export async function loadEmbeddingModel(
  onProgress?: ProgressCallback
): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      onProgress?.("Downloading embedding model (first time only)…", 0.05);
      const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL_ID, {
        quantized: true,
        progress_callback: (p: {
          status?: string;
          progress?: number;
          file?: string;
        }) => {
          if (p.status === "progress" && typeof p.progress === "number") {
            onProgress?.(
              `Loading model${p.file ? ` (${p.file})` : ""}…`,
              Math.min(0.95, p.progress / 100)
            );
          } else if (p.status === "ready" || p.status === "done") {
            onProgress?.("Model ready", 1);
          }
        },
      });
      onProgress?.("Model ready", 1);
      return extractor as FeatureExtractionPipeline;
    })().catch((err) => {
      // Allow retry after failure
      extractorPromise = null;
      throw err;
    });
  }
  return extractorPromise;
}

/**
 * Embed a single query string (must use same model as chunks).
 */
export async function embedQuery(
  text: string,
  onProgress?: ProgressCallback
): Promise<Float32Array> {
  const extractor = await loadEmbeddingModel(onProgress);
  return embedOne(extractor, text);
}

/**
 * Batch-embed all transcript chunks. Yields to the event loop between items
 * so the YouTube page stays responsive.
 */
export async function embedChunks(
  chunks: TranscriptChunk[],
  onProgress?: ProgressCallback
): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0) return [];

  const extractor = await loadEmbeddingModel(onProgress);
  const embedded: EmbeddedChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await embedOne(extractor, chunk.text);
    embedded.push({ ...chunk, embedding });

    if (onProgress) {
      onProgress(
        `Embedding chunks ${i + 1}/${chunks.length}…`,
        (i + 1) / chunks.length
      );
    }

    // Keep UI responsive during long videos
    if (i % 3 === 2) {
      await yieldToMain();
    }
  }

  return embedded;
}

async function embedOne(
  extractor: FeatureExtractionPipeline,
  text: string
): Promise<Float32Array> {
  const input = text.trim() || " ";
  const output = await extractor(input, {
    pooling: "mean",
    normalize: true,
  });

  // transformers.js returns Tensor-like with .data
  const data = (output as { data: ArrayLike<number> }).data;
  return float32From(data);
}

function float32From(data: ArrayLike<number>): Float32Array {
  if (data instanceof Float32Array) return data;
  return Float32Array.from(data as ArrayLike<number>);
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 50 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}
