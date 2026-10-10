"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// --- Constants ---
const WINDOW_SIZE = 6;           // Sliding window of 6 frames (~1.8 s at 3.3 Hz)
const BAN_THRESHOLD = 4;         // Violations needed in window to trigger a ban (was 3/5)
const WARN_THRESHOLD = 2;        // Violations needed to show a warning blur (was 1/5)
const SAMPLE_INTERVAL_MS = 300;  // ~3.3 Hz for fast sub-second detection
const CANVAS_SIZE = 224;         // MobileNetV2 input resolution

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
  cooldownRemaining: number;
  isCooldownActive: boolean;
  isRemoteWarning: boolean;
  remoteStrikeCount: number;
}

export function useNsfwModeration({
  localVideoRef,
  remoteVideoRef,
  isActive,
  socket,
  roomId,
  onCriticalViolation,
}: {
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef?: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  socket?: any;
  roomId?: string | null;
  onCriticalViolation?: () => void;
}) {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);

  // --- Local sender state ---
  const [isWarning, setIsWarning] = useState(false);
  const [strikeCount, setStrikeCount] = useState(0);
  const [lastPrediction, setLastPrediction] = useState<NsfwPrediction | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const cooldownEndTimeRef = useRef<number>(0);

  // --- Remote receiver state ---
  const [isRemoteWarning, setIsRemoteWarning] = useState(false);
  const [remoteStrikeCount, setRemoteStrikeCount] = useState(0);

  // Sliding windows — one per feed
  const localWindowRef = useRef<boolean[]>([]);
  const remoteWindowRef = useRef<boolean[]>([]);

  // Off-screen canvases — one per feed
  const localCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);

  // Evaluation guards
  const isLocalEvaluatingRef = useRef(false);
  const isRemoteEvaluatingRef = useRef(false);

  // Stable references for socket, room and callbacks
  const socketRef = useRef(socket);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const roomIdRef = useRef(roomId);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  const onCriticalViolationRef = useRef(onCriticalViolation);
  useEffect(() => {
    onCriticalViolationRef.current = onCriticalViolation;
  }, [onCriticalViolation]);

  // Start cooldown with exact timestamp
  const startCooldown = useCallback((seconds: number) => {
    cooldownEndTimeRef.current = Date.now() + seconds * 1000;
    setCooldownRemaining(seconds);
  }, []);

  // Server-side cooldown listener
  useEffect(() => {
    if (!socket) return;

    const handleCooldown = (data: { remaining: number }) => {
      if (data?.remaining && data.remaining > 0) {
        startCooldown(data.remaining);
      }
    };

    socket.on("cooldown_active", handleCooldown);
    return () => {
      socket.off("cooldown_active", handleCooldown);
    };
  }, [socket, startCooldown]);

  // Rock-solid timestamp-based countdown timer: immune to render cycles
  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((cooldownEndTimeRef.current - now) / 1000));
      setCooldownRemaining(left);
      if (left <= 0) {
        clearInterval(timer);
      }
    }, 500);

    return () => clearInterval(timer);
  }, [cooldownRemaining > 0]); // Only re-run when cooldown status toggles

  // ----------------------------------------
  // CALIBRATED CONTENT EVALUATION
  // Eliminates false positives on ceiling fans, blank walls, & textures
  // while rapidly catching nudity on mobile screens and webcam feeds
  // ----------------------------------------

  const checkIsViolating = (pred: NsfwPrediction): boolean => {
    const porn = pred.Porn || 0;
    const sexy = pred.Sexy || 0;
    const hentai = pred.Hentai || 0;
    const neutral = pred.Neutral || 0;

    // Rule 1: A ceiling fan, blank wall, or clean room has high neutral and no explicit signals
    if (neutral >= 0.50 && porn < 0.20 && sexy < 0.30) {
      return false;
    }

    // Rule 2: In a live webcam video chat, nudity requires Porn or Sexy features.
    // Fan blades, ceiling patterns, and line geometry mistake for anime/drawing lines.
    // If both Porn and Sexy are very low, it must NEVER flag.
    if (porn < 0.18 && sexy < 0.25) {
      if (hentai > 0.85 && neutral < 0.15) {
        return true;
      }
      return false;
    }

    // Rule 3: Direct explicit nudity or sexual content (including phone screens / photos)
    if (porn > 0.35) {
      return true;
    }

    // Rule 4: Combined suggestive + porn on phone screen or webcam with reduced neutral
    if (porn + sexy > 0.45 && neutral < 0.45) {
      return true;
    }

    // Rule 5: Weighted explicit confidence
    if (porn * 1.5 + sexy > 0.55) {
      return true;
    }

    return false;
  };

  const evaluateLocal = useCallback((pred: NsfwPrediction) => {
    const isViolating = checkIsViolating(pred);

    const windowArr = localWindowRef.current;
    windowArr.push(isViolating);
    if (windowArr.length > WINDOW_SIZE) windowArr.shift();

    const violations = windowArr.filter(Boolean).length;
    setStrikeCount(violations);

    if (violations >= BAN_THRESHOLD) {
      // Sustained critical violation (4+ of last 6 frames): trigger 30s cooldown
      console.warn("🚨 Critical NSFW violation detected on local feed");
      startCooldown(30);
      setIsWarning(false);
      localWindowRef.current = [];
      setStrikeCount(0);
      socketRef.current?.emit("report_nsfw_violation", { roomId: roomIdRef.current });
      onCriticalViolationRef.current?.();
    } else if (violations >= WARN_THRESHOLD) {
      // 2+ violations in window: show warning blur (not a ban yet)
      setIsWarning(true);
    } else {
      // 0–1 violations: clear — ceiling fans, walls, textures land here
      setIsWarning(false);
    }
  }, [startCooldown]);

  const evaluateRemote = useCallback((pred: NsfwPrediction) => {
    const isViolating = checkIsViolating(pred);

    const windowArr = remoteWindowRef.current;
    windowArr.push(isViolating);
    if (windowArr.length > WINDOW_SIZE) windowArr.shift();

    const violations = windowArr.filter(Boolean).length;
    setRemoteStrikeCount(violations);

    if (violations >= 2) {
      // Sustained remote violation: disconnect and report peer to server
      console.warn("🚨 Sustained NSFW violation detected on remote feed");
      remoteWindowRef.current = [];
      setRemoteStrikeCount(0);
      setIsRemoteWarning(false);
      socketRef.current?.emit("report_peer_nsfw_violation", { roomId: roomIdRef.current });
      onCriticalViolationRef.current?.();
    } else if (violations >= 1) {
      // Instant protection: blur remote feed on first detection
      setIsRemoteWarning(true);
    } else {
      setIsRemoteWarning(false);
    }
  }, []);

  const evaluateLocalRef = useRef(evaluateLocal);
  useEffect(() => {
    evaluateLocalRef.current = evaluateLocal;
  }, [evaluateLocal]);

  const evaluateRemoteRef = useRef(evaluateRemote);
  useEffect(() => {
    evaluateRemoteRef.current = evaluateRemote;
  }, [evaluateRemote]);

  // ----------------------------------------
  // WEB WORKER INITIALIZATION
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

        if (source === "local") {
          isLocalEvaluatingRef.current = false;
        } else if (source === "remote") {
          isRemoteEvaluatingRef.current = false;
        } else {
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
  }, []);

  // ----------------------------------------
  // OFF-SCREEN CANVASES
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
  // FOCUSED 65% CENTER-CROP CAPTURE
  // Magnifies center where users hold phones/photos while maintaining natural aspect ratio
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

      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 480;
      const minDim = Math.min(vWidth, vHeight);

      // 65% center crop directly captures the user & any handheld phone/tablet/photo
      const cropSize = minDim * 0.65;
      const sx = (vWidth - cropSize) / 2;
      const sy = (vHeight - cropSize) / 2;

      ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
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
        [imageBitmap]
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

      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 480;
      const minDim = Math.min(vWidth, vHeight);

      const cropSize = minDim * 0.65;
      const sx = (vWidth - cropSize) / 2;
      const sy = (vHeight - cropSize) / 2;

      ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
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
        [imageBitmap]
      );
    } catch (err) {
      isRemoteEvaluatingRef.current = false;
      console.warn("[nsfwModeration] Remote frame capture error:", err);
    }
  }, [remoteVideoRef]);

  // ----------------------------------------
  // FRAME SAMPLING LOOP (~3.3 Hz)
  // ----------------------------------------

  useEffect(() => {
    if (!isActive || cooldownRemaining > 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

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
  }, [isActive, cooldownRemaining > 0, captureLocalFrame, captureRemoteFrame]);

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
    isRemoteWarning,
    remoteStrikeCount,
  };
}
