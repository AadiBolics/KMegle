"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// --- Constants ---
const WINDOW_SIZE = 5;
const SAMPLE_INTERVAL_MS = 500; // 2 Hz — bumped from 1 Hz for faster detection
const CANVAS_SIZE = 224; // MobileNetV2 input size
const COOLDOWN_DURATION_MS = .5 * 60 * 1000; // 5-minute cooldown on critical violation
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
  isRemoteWarning: boolean;
  remoteStrikeCount: number;
}

export function useNsfwModeration({
  localVideoRef,
  remoteVideoRef,
  isActive,
  onCriticalViolation,
}: {
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef?: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  onCriticalViolation?: () => void;
}) {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);

  // --- Local sender state ---
  const [isWarning, setIsWarning] = useState(false);
  const [strikeCount, setStrikeCount] = useState(0);
  const [lastPrediction, setLastPrediction] = useState<NsfwPrediction | null>(
    null
  );
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // --- Remote receiver state ---
  const [isRemoteWarning, setIsRemoteWarning] = useState(false);
  const [remoteStrikeCount, setRemoteStrikeCount] = useState(0);

  // Independent sliding windows — one per feed
  const localWindowRef = useRef<boolean[]>([]);
  const remoteWindowRef = useRef<boolean[]>([]);

  // Off-screen canvases — one per feed to prevent ctx.drawImage racing
  const localCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);

  // Independent evaluating guards — local and remote frames are queued separately
  const isLocalEvaluatingRef = useRef(false);
  const isRemoteEvaluatingRef = useRef(false);

  // Keep callbacks in refs to avoid stale closures in worker onmessage
  const onCriticalViolationRef = useRef(onCriticalViolation);
  useEffect(() => {
    onCriticalViolationRef.current = onCriticalViolation;
  }, [onCriticalViolation]);

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

  useEffect(() => {
    triggerCooldownRef.current = triggerCooldown;
  }, [triggerCooldown]);

  // ----------------------------------------
  // SLIDING WINDOW EVALUATION
  //
  // LOCAL (sender enforcement):
  //   - Porn/Hentai > 0.70 → violating; Sexy > 0.85
  //   - 3/5 frames violating → Warning + blur local preview
  //   - 5/5 frames violating → Disconnect + 5-min cooldown
  //
  // REMOTE (receiver protection):
  //   - 1/5 violating frames → Immediate remote video blur (instant protection)
  //   - 3/5 violating frames → Disconnect (sustained confirmed violation)
  // ----------------------------------------

  // Stable refs so worker onmessage never captures a stale closure
  const evaluateLocalRef = useRef<(pred: NsfwPrediction) => void>(() => {});
  const evaluateRemoteRef = useRef<(pred: NsfwPrediction) => void>(() => {});

  const evaluateLocal = useCallback((pred: NsfwPrediction) => {
    const porn = pred.Porn || 0;
    const hentai = pred.Hentai || 0;
    const sexy = pred.Sexy || 0;

    const isViolating = porn > 0.7 || hentai > 0.7 || sexy > 0.85;

    const windowArr = localWindowRef.current;
    windowArr.push(isViolating);
    if (windowArr.length > WINDOW_SIZE) windowArr.shift();

    const violations = windowArr.filter(Boolean).length;
    setStrikeCount(violations);

    if (violations >= 5) {
      // Critical: disconnect + 5-min cooldown
      triggerCooldownRef.current();
      setIsWarning(false);
      localWindowRef.current = [];
      setStrikeCount(0);
      onCriticalViolationRef.current?.();
    } else if (violations >= 3) {
      // Sustained: blur local preview + show warning banner
      setIsWarning(true);
    } else {
      // Safe or single-frame spike — absorbed by the window
      setIsWarning(false);
    }
  }, []); // No deps — reads everything via refs

  const evaluateRemote = useCallback((pred: NsfwPrediction) => {
    const porn = pred.Porn || 0;
    const hentai = pred.Hentai || 0;
    const sexy = pred.Sexy || 0;

    const isViolating = porn > 0.7 || hentai > 0.7 || sexy > 0.85;

    const windowArr = remoteWindowRef.current;
    windowArr.push(isViolating);
    if (windowArr.length > WINDOW_SIZE) windowArr.shift();

    const violations = windowArr.filter(Boolean).length;
    setRemoteStrikeCount(violations);

    if (violations >= 3) {
      // Sustained remote violation — disconnect immediately
      remoteWindowRef.current = [];
      setRemoteStrikeCount(0);
      setIsRemoteWarning(false);
      onCriticalViolationRef.current?.();
    } else if (violations >= 1) {
      // First spike — immediately blur the remote feed to protect the viewer
      setIsRemoteWarning(true);
    } else {
      // Back to clean — remove blur (handles false positives gracefully)
      setIsRemoteWarning(false);
    }
  }, []); // No deps — reads everything via refs

  // Keep evaluate refs up-to-date
  useEffect(() => {
    evaluateLocalRef.current = evaluateLocal;
  }, [evaluateLocal]);

  useEffect(() => {
    evaluateRemoteRef.current = evaluateRemote;
  }, [evaluateRemote]);

  // ----------------------------------------
  // WEB WORKER INITIALIZATION
  // A single shared worker instance handles both local and remote frames.
  // Each CHECK_FRAME message carries a `source` tag ("local" | "remote") so
  // responses are routed to the correct sliding window. This avoids loading
  // the MobileNetV2 model into GPU memory twice.
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
        const { type, source, predictions, error } = event.data || {};

        // Release the per-source evaluating lock
        if (source === "local") {
          isLocalEvaluatingRef.current = false;
        } else if (source === "remote") {
          isRemoteEvaluatingRef.current = false;
        } else {
          // READY / ERROR — no source tag
          isLocalEvaluatingRef.current = false;
          isRemoteEvaluatingRef.current = false;
        }

        if (type === "READY") {
          setIsReady(true);
        } else if (type === "PREDICTION" && predictions) {
          if (source === "local") {
            setLastPrediction(predictions);
            evaluateLocalRef.current(predictions);
          } else if (source === "remote") {
            evaluateRemoteRef.current(predictions);
          }
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
  // OFF-SCREEN CANVASES (224×224)
  // One canvas per feed — prevents ctx.drawImage from racing when both local
  // and remote captures fire on the same interval tick.
  // ----------------------------------------

  useEffect(() => {
    if (typeof window === "undefined") return;

    const localCanvas = document.createElement("canvas");
    localCanvas.width = CANVAS_SIZE;
    localCanvas.height = CANVAS_SIZE;
    localCanvasRef.current = localCanvas;

    const remoteCanvas = document.createElement("canvas");
    remoteCanvas.width = CANVAS_SIZE;
    remoteCanvas.height = CANVAS_SIZE;
    remoteCanvasRef.current = remoteCanvas;
  }, []);

  // ----------------------------------------
  // FRAME CAPTURE HELPERS
  // Each helper is independent — a slow GPU inference on one feed will not
  // block the other feed from submitting its next frame.
  // ----------------------------------------

  const captureLocalFrame = useCallback(async () => {
    const video = localVideoRef.current;
    const canvas = localCanvasRef.current;
    const worker = workerRef.current;

    if (!video || !canvas || !worker || isLocalEvaluatingRef.current) return;
    if (video.readyState < 2 || video.paused || video.ended) return;

    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const imageBitmap = await createImageBitmap(canvas);

      isLocalEvaluatingRef.current = true;
      frameCountRef.current += 1;

      worker.postMessage(
        {
          type: "CHECK_FRAME",
          source: "local",
          imageBitmap,
          frameId: frameCountRef.current,
        },
        [imageBitmap] // Zero-copy transfer — do NOT use imageBitmap after this
      );
    } catch (err) {
      isLocalEvaluatingRef.current = false;
      console.warn("[nsfwModeration] Local frame capture error:", err);
    }
  }, [localVideoRef]);

  const captureRemoteFrame = useCallback(async () => {
    const video = remoteVideoRef?.current;
    const canvas = remoteCanvasRef.current;
    const worker = workerRef.current;

    if (!video || !canvas || !worker || isRemoteEvaluatingRef.current) return;
    if (video.readyState < 2 || video.paused || video.ended) return;

    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const imageBitmap = await createImageBitmap(canvas);

      isRemoteEvaluatingRef.current = true;
      frameCountRef.current += 1;

      worker.postMessage(
        {
          type: "CHECK_FRAME",
          source: "remote",
          imageBitmap,
          frameId: frameCountRef.current,
        },
        [imageBitmap] // Zero-copy transfer — do NOT use imageBitmap after this
      );
    } catch (err) {
      isRemoteEvaluatingRef.current = false;
      console.warn("[nsfwModeration] Remote frame capture error:", err);
    }
  }, [remoteVideoRef]);

  // ----------------------------------------
  // FRAME SAMPLING LOOP (2 Hz)
  // Both local and remote frames are captured on the same tick. The worker
  // processes them sequentially on the GPU — the per-source guard flags ensure
  // that if a frame takes longer than 500ms, the next tick simply skips that
  // source rather than stacking up a backlog.
  // ----------------------------------------

  useEffect(() => {
    if (!isActive || cooldownRemaining > 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Reset all state on deactivation
      setIsWarning(false);
      setIsRemoteWarning(false);
      localWindowRef.current = [];
      remoteWindowRef.current = [];
      setStrikeCount(0);
      setRemoteStrikeCount(0);
      return;
    }

    intervalRef.current = setInterval(() => {
      captureLocalFrame();
      captureRemoteFrame();
    }, SAMPLE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, cooldownRemaining, captureLocalFrame, captureRemoteFrame]);

  // ----------------------------------------
  // PUBLIC API
  // ----------------------------------------

  return {
    isReady,
    // Local sender moderation
    isWarning,
    strikeCount,
    lastPrediction,
    cooldownRemaining,
    isCooldownActive: cooldownRemaining > 0,
    // Remote receiver protection
    isRemoteWarning,
    remoteStrikeCount,
  };
}
