"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// --- Constants (per implementation guide) ---
const WINDOW_SIZE = 5;
const SAMPLE_INTERVAL_MS = 1000; // 1 Hz — optimal rate per guide
const CANVAS_SIZE = 224; // MobileNetV2 input size
const COOLDOWN_DURATION_MS = 5 * 60 * 1000; // 5-minute cooldown on critical violation
const STORAGE_KEY_COOLDOWN = "kmegle_nsfw_cooldown_until";

export interface NsfwPrediction {
  Drawing?: number;
  Hentai?: number;
  Neutral?: number;
  Porn?: number;
  Sexy?: number;
}

export interface ModerationState {
  isReady: boolean;
  isWarning: boolean;
  strikeCount: number;
  lastPrediction: NsfwPrediction | null;
  cooldownRemaining: number; // seconds; 0 if not cooling down
}

export function useNsfwModeration({
  videoRef,
  isActive,
  onCriticalViolation,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  onCriticalViolation?: () => void;
}) {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isWarning, setIsWarning] = useState(false);
  const [strikeCount, setStrikeCount] = useState(0);
  const [lastPrediction, setLastPrediction] = useState<NsfwPrediction | null>(
    null
  );
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // Refs for values that need to be accessed inside callbacks without re-creating them
  const slidingWindowRef = useRef<boolean[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);
  const isEvaluatingRef = useRef(false);

  // Keep onCriticalViolation in a ref so the worker onmessage handler always
  // has the latest callback without needing to re-initialize the worker.
  const onCriticalViolationRef = useRef(onCriticalViolation);
  useEffect(() => {
    onCriticalViolationRef.current = onCriticalViolation;
  }, [onCriticalViolation]);

  // Keep triggerCooldown stable via ref to avoid stale closures
  const triggerCooldownRef = useRef<() => void>(() => {});

  // ----------------------------------------
  // COOLDOWN MANAGEMENT
  // ----------------------------------------

  const checkCooldown = useCallback(() => {
    if (typeof window === "undefined") return 0;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_COOLDOWN);
      if (stored) {
        const expiry = parseInt(stored, 10);
        const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
        if (remaining > 0) {
          return remaining;
        } else {
          localStorage.removeItem(STORAGE_KEY_COOLDOWN);
        }
      }
    } catch {
      // localStorage may be unavailable in some environments
    }
    return 0;
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    const remaining = checkCooldown();
    setCooldownRemaining(remaining);

    if (remaining > 0) {
      const timer = setInterval(() => {
        const rem = checkCooldown();
        setCooldownRemaining(rem);
        if (rem <= 0) {
          clearInterval(timer);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [checkCooldown]);

  const triggerCooldown = useCallback(() => {
    const expiry = Date.now() + COOLDOWN_DURATION_MS;
    try {
      localStorage.setItem(STORAGE_KEY_COOLDOWN, expiry.toString());
    } catch {
      // Ignore storage errors
    }
    setCooldownRemaining(Math.ceil(COOLDOWN_DURATION_MS / 1000));
  }, []);

  // Keep the triggerCooldown ref up-to-date
  useEffect(() => {
    triggerCooldownRef.current = triggerCooldown;
  }, [triggerCooldown]);

  // ----------------------------------------
  // SLIDING WINDOW EVALUATION
  //
  // Per the implementation guide:
  //   - Porn/Hentai > 0.70 → violating
  //   - Sexy > 0.85 (higher threshold for dorm/casual wear false positives)
  //   - 3/5 frames violating → Warning + Blur
  //   - 5/5 frames violating → Disconnect + 5-min cooldown
  // ----------------------------------------

  // Stable ref for the evaluate function so the worker onmessage can call it
  // without going stale. This avoids the classic React stale-closure bug where
  // onmessage captures the initial version of evaluatePrediction.
  const evaluatePredictionRef = useRef<(pred: NsfwPrediction) => void>(
    () => {}
  );

  const evaluatePrediction = useCallback((pred: NsfwPrediction) => {
    const porn = pred.Porn || 0;
    const hentai = pred.Hentai || 0;
    const sexy = pred.Sexy || 0;

    // Thresholds per guide: Porn/Hentai > 70%, Sexy > 85%
    const isViolating = porn > 0.7 || hentai > 0.7 || sexy > 0.85;

    const windowArr = slidingWindowRef.current;
    windowArr.push(isViolating);

    // Keep sliding window at max WINDOW_SIZE (5 frames ≈ 5 seconds at 1 Hz)
    if (windowArr.length > WINDOW_SIZE) {
      windowArr.shift();
    }

    const violations = windowArr.filter((v) => v === true).length;
    setStrikeCount(violations);

    if (violations >= 5) {
      // Strike 5 (Critical): Disconnect & apply 5-minute cooldown
      triggerCooldownRef.current();
      setIsWarning(false);
      slidingWindowRef.current = [];
      setStrikeCount(0);
      // Call via ref to always get the latest onCriticalViolation callback
      onCriticalViolationRef.current?.();
    } else if (violations >= 3) {
      // Strike 3-4 (Sustained): Warning phase — blur video + show banner
      setIsWarning(true);
    } else {
      // Strike 0-2: Safe or single-frame spike, absorbed by the window
      setIsWarning(false);
    }
  }, []); // No deps — reads everything through refs to avoid stale closures

  // Keep the evaluate ref up-to-date
  useEffect(() => {
    evaluatePredictionRef.current = evaluatePrediction;
  }, [evaluatePrediction]);

  // ----------------------------------------
  // WEB WORKER INITIALIZATION
  // The worker runs TensorFlow.js with WebGL backend on a separate thread,
  // achieving near-zero UI latency as specified in the implementation guide.
  // ----------------------------------------

  useEffect(() => {
    if (typeof window === "undefined") return;

    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../../../workers/nsfwWorker.ts", import.meta.url),
        { type: "module" }
      );
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent) => {
        const { type, predictions, error } = event.data || {};
        // Signal that the worker is ready to accept next frame
        isEvaluatingRef.current = false;

        if (type === "READY") {
          setIsReady(true);
        } else if (type === "PREDICTION" && predictions) {
          setLastPrediction(predictions);
          // Use ref to call the latest evaluatePrediction without stale closure
          evaluatePredictionRef.current(predictions);
        } else if (type === "ERROR") {
          console.warn("[nsfwModeration] Worker error:", error);
        }
      };

      worker.onerror = (e) => {
        console.error("[nsfwModeration] Worker uncaught error:", e);
      };

      worker.postMessage({ type: "INIT" });
    } catch (err) {
      console.warn("[nsfwModeration] Could not instantiate NSFW worker:", err);
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []); // Only runs once — worker lifecycle is independent of other state

  // ----------------------------------------
  // OFF-SCREEN CANVAS (224×224)
  // Per the guide: downscale to exactly 224×224 before sending to the model.
  // MobileNetV2 is trained on this size; larger images waste CPU cycles.
  // ----------------------------------------

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    canvasRef.current = canvas;
  }, []);

  // ----------------------------------------
  // FRAME CAPTURE
  // Creates an ImageBitmap from the 224×224 canvas and transfers it to the
  // worker with zero-copy semantics. The worker closes it after classification.
  // ----------------------------------------

  const captureAndCheckFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const worker = workerRef.current;

    // Skip if already processing a frame (prevents queue buildup)
    if (!video || !canvas || !worker || isEvaluatingRef.current) return;
    if (video.readyState < 2 || video.paused || video.ended) return;

    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      // Downscale the current video frame to 224×224
      // Aspect ratio distortion is fine — MobileNetV2 is resilient to it
      ctx.drawImage(video, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // createImageBitmap is highly efficient and produces a GPU-uploadable bitmap
      const imageBitmap = await createImageBitmap(canvas);

      isEvaluatingRef.current = true;
      frameCountRef.current += 1;

      // Transfer the ImageBitmap to the worker (zero-copy via Transferable)
      // The worker will call imageBitmap.close() after classification to free GPU memory
      worker.postMessage(
        {
          type: "CHECK_FRAME",
          imageBitmap,
          frameId: frameCountRef.current,
        },
        [imageBitmap] // Transfer ownership — do NOT use imageBitmap after this line
      );
    } catch (err) {
      isEvaluatingRef.current = false;
      console.warn("[nsfwModeration] Frame capture error:", err);
    }
  }, [videoRef]);

  // ----------------------------------------
  // FRAME SAMPLING LOOP (1 Hz)
  // Per the guide: 1–2 Hz is the optimal rate (1000ms–500ms intervals).
  // This avoids draining the user's battery while providing enough temporal
  // resolution for the sliding window algorithm.
  // ----------------------------------------

  useEffect(() => {
    if (!isActive || cooldownRemaining > 0) {
      // Stop sampling when inactive or during cooldown
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsWarning(false);
      slidingWindowRef.current = [];
      setStrikeCount(0);
      return;
    }

    intervalRef.current = setInterval(() => {
      captureAndCheckFrame();
    }, SAMPLE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, cooldownRemaining, captureAndCheckFrame]);

  // ----------------------------------------
  // PUBLIC API
  // ----------------------------------------

  return {
    isReady,
    isWarning,
    strikeCount,
    lastPrediction,
    cooldownRemaining,
    isCooldownActive: cooldownRemaining > 0,
  };
}
