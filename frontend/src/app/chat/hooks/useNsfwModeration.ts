"use client";
import { useEffect, useState, useRef } from "react";
import type { Socket } from "socket.io-client";
// These are local hints, never evidence for automatically penalizing another account.
export function useNsfwModeration({
  localVideoRef,
  remoteVideoRef,
  isActive,
  localEnabled = true,
  roomId,
  onCriticalViolation,
}: {
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef?: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  localEnabled?: boolean;
  socket?: Socket | null;
  roomId?: string | null;
  onCriticalViolation?: () => void;
}) {
  const [isReady, setReady] = useState(false),
    [isWarning, setWarning] = useState(false),
    [isRemoteWarning, setRemoteWarning] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const enabled = useRef(localEnabled);
  useEffect(() => {
    enabled.current = localEnabled;
  }, [localEnabled]);
  useEffect(() => {
    if (!isActive || !roomId) return;
    let alive = true,
      worker: Worker | null = null,
      ready = false,
      nextFrame = 0;
    const pending = new Map<string, number>(),
      submitted = new Map<string, number>();
    const windows: { local: boolean[]; remote: boolean[] } = {
      local: [],
      remote: [],
    };
    const canvas = document.createElement("canvas");
    canvas.width = 224;
    canvas.height = 224;
    const generation = crypto.randomUUID();
    const reset = () => {
      if (alive) {
        setReady(false);
        setWarning(false);
        setRemoteWarning(false);
      }
    };
    queueMicrotask(() => {
      reset();
      if (alive) setUnavailable(false);
    });
    const fail = () => {
      if (!alive) return;
      ready = false;
      pending.clear();
      worker?.terminate();
      reset();
      setUnavailable(true);
    };
    const deadline = setTimeout(() => {
      if (!ready) fail();
    }, 15000);
    try {
      worker = new Worker(
        new URL("../../../workers/nsfwWorker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = ({ data }) => {
        if (!alive) return;
        if (data.type === "READY") {
          clearTimeout(deadline);
          ready = true;
          setReady(true);
          return;
        }
        if (data.type === "ERROR" && !data.source) {
          fail();
          return;
        }
        if (data.generation !== generation) return;
        const source = data.source as "local" | "remote";
        if (pending.get(source) !== data.frameId) return;
        pending.delete(source);
        if (data.type === "ERROR") {
          fail();
          return;
        }
        if (data.type !== "PREDICTION" || !data.predictions) return;
        const p = data.predictions;
        const flagged =
          (p.Neutral || 0) + (p.Drawing || 0) < 0.55 &&
          ((p.Porn || 0) > 0.45 ||
            ((p.Porn || 0) > 0.25 &&
              (p.Sexy || 0) > 0.25 &&
              (p.Neutral || 0) < 0.4));
        const history = windows[source];
        history.push(flagged);
        if (history.length > 6) history.shift();
        const count = history.filter(Boolean).length;
        if (source === "local") setWarning(count >= 2);
        else setRemoteWarning(count >= 1);
        if (count >= 4) {
          ready = false;
          onCriticalViolation?.();
        }
      };
      worker.onerror = fail;
      worker.postMessage({ type: "INIT" });
    } catch {
      queueMicrotask(fail);
    }
    const sample = async (
      source: "local" | "remote",
      video: HTMLVideoElement | null | undefined,
    ) => {
      if (
        !ready ||
        !worker ||
        pending.has(source) ||
        !video ||
        video.readyState < 2 ||
        video.paused
      )
        return;
      const frameId = ++nextFrame;
      pending.set(source, frameId);
      submitted.set(source, Date.now());
      try {
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          pending.delete(source);
          return;
        }
        ctx.drawImage(video, 0, 0, 224, 224);
        const bitmap = await createImageBitmap(canvas);
        if (!alive || !ready) {
          bitmap.close();
          return;
        }
        worker.postMessage(
          {
            type: "CHECK_FRAME",
            source,
            frameId,
            generation,
            imageBitmap: bitmap,
          },
          [bitmap],
        );
      } catch {
        pending.delete(source);
      }
    };
    const interval = setInterval(() => {
      for (const source of pending.keys())
        if (Date.now() - (submitted.get(source) || 0) > 10000) {
          fail();
          return;
        }
      if (enabled.current) void sample("local", localVideoRef.current);
      else {
        windows.local = [];
        setWarning(false);
      }
      void sample("remote", remoteVideoRef?.current);
    }, 500);
    return () => {
      alive = false;
      clearTimeout(deadline);
      clearInterval(interval);
      worker?.terminate();
      pending.clear();
    };
  }, [isActive, roomId, localVideoRef, remoteVideoRef, onCriticalViolation]);
  return {
    moderationStatus: !isActive
      ? "inactive"
      : isReady
        ? "ready"
        : unavailable
          ? "unavailable"
          : "loading",
    isReady: isActive && isReady,
    isWarning: isActive && localEnabled && isWarning,
    isRemoteWarning: isActive && isRemoteWarning,
    isCooldownActive: false,
    cooldownRemaining: 0,
  };
}
