import * as tf from "@tensorflow/tfjs";
import * as nsfwjs from "nsfwjs";

let model: nsfwjs.NSFWJS | null = null;
let isLoading = false;

/**
 * MODEL URL STRATEGY (Self-hosted, per implementation guide):
 *
 * We load from the self-hosted model weights in /public/models/mobilenet_v2/.
 * The .min.js files copied from nsfwjs/dist/models/mobilenet_v2 are JSON-format
 * model descriptors. We use nsfwjs.load() with an explicit URL to the self-hosted
 * model.json so we never depend on external CDNs (unpkg, jsdelivr, etc).
 *
 * Fallback: If the self-hosted path fails (e.g., in local dev), we fall back to
 * the bundled "MobileNetV2" identifier which loads weights from nsfwjs internals.
 */
const SELF_HOSTED_MODEL_URL = "/models/mobilenet_v2/model.min.js";

async function initModel() {
  if (model || isLoading) return;
  isLoading = true;

  try {
    // Force fastest available backend: WebGL > CPU
    try {
      await tf.setBackend("webgl");
    } catch {
      await tf.setBackend("cpu");
    }
    await tf.ready();

    // Attempt to load from self-hosted path first, fall back to bundled
    try {
      model = await nsfwjs.load(SELF_HOSTED_MODEL_URL);
    } catch {
      console.warn(
        "[nsfwWorker] Self-hosted model load failed, falling back to bundled MobileNetV2."
      );
      model = await nsfwjs.load("MobileNetV2");
    }

    self.postMessage({ type: "READY" });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Failed to initialize NSFWJS in worker:", err);
    self.postMessage({
      type: "ERROR",
      error: err?.message || "Failed to load moderation model",
    });
  } finally {
    isLoading = false;
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { type, imageBitmap, frameId } = event.data || {};

  if (type === "INIT") {
    await initModel();
    return;
  }

  if (type === "CHECK_FRAME") {
    if (!imageBitmap) return;

    if (!model) {
      imageBitmap.close?.();
      return;
    }

    try {
      const predictions = await model.classify(imageBitmap);

      // Convert array of [{ className, probability }] to a flat key-value map
      // for efficient transfer across the message channel.
      const predMap: Record<string, number> = {};
      for (const p of predictions) {
        predMap[p.className] = p.probability;
      }

      self.postMessage({
        type: "PREDICTION",
        frameId,
        predictions: predMap,
      });
    } catch (err: unknown) {
      const e = err as Error;
      console.warn("NSFW classification error in worker:", e);
      self.postMessage({
        type: "ERROR",
        frameId,
        error: e?.message || "Frame classification failed",
      });
    } finally {
      // ALWAYS close the ImageBitmap after classification to prevent GPU memory leaks.
      // The ImageBitmap is transferred (zero-copy) so it must be explicitly freed.
      try {
        imageBitmap.close?.();
      } catch {
        // Ignore errors during cleanup
      }
    }
  }
};
