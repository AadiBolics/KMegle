import * as tf from "@tensorflow/tfjs";
import * as nsfwjs from "nsfwjs";
let model: nsfwjs.NSFWJS | null = null;
self.onmessage = async ({ data }: MessageEvent) => {
  const { type, source, frameId, generation, imageBitmap } = data || {};
  if (type === "INIT") {
    try {
      try {
        if (!(await tf.setBackend("webgl"))) await tf.setBackend("cpu");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      model = await nsfwjs.load("MobileNetV2");
      self.postMessage({ type: "READY" });
    } catch {
      self.postMessage({
        type: "ERROR",
        error: "Automated checks unavailable",
      });
    }
    return;
  }
  if (type !== "CHECK_FRAME") return;
  try {
    if (!model || !imageBitmap) throw new Error("Model not ready");
    const predictions = await model.classify(imageBitmap);
    self.postMessage({
      type: "PREDICTION",
      source,
      frameId,
      generation,
      predictions: Object.fromEntries(
        predictions.map((p) => [p.className, p.probability]),
      ),
    });
  } catch {
    self.postMessage({ type: "ERROR", source, frameId, generation });
  } finally {
    imageBitmap?.close();
  }
};
