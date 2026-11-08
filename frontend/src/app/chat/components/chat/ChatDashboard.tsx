"use client";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../../context/authContext";
import { useTheme } from "../../../../context/themeContext";
import { useChatSession } from "../../hooks/useChatSession";
import { useNsfwModeration } from "../../hooks/useNsfwModeration";
import Dialog from "./Dialog";
import ChatSidebar from "./ChatSidebar";
import CallIcon from "./CallIcon";
import FloatingChat from "./FloatingChat";
import "./call.css";
function subscribeMobile(callback: () => void) {
  const query = matchMedia("(max-width: 767px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const mobileSnapshot = () => matchMedia("(max-width: 767px)").matches;
function Meter({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLMeterElement>(null);
  useEffect(() => {
    if (!stream?.getAudioTracks().length) return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const update = () => {
      analyser.getByteTimeDomainData(data);
      const level = Math.sqrt(
        data.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / data.length,
      );
      if (ref.current) ref.current.value = Math.min(1, level * 4);
      frame = requestAnimationFrame(update);
    };
    void context.resume().catch(() => {});
    update();
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
    };
  }, [stream]);
  return (
    <label className="mic-meter">
      Microphone activity{" "}
      <meter
        ref={ref}
        min={0}
        max={1}
        value={0}
        aria-label="Microphone activity"
      />
    </label>
  );
}
export default function ChatDashboard() {
  const session = useChatSession();
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const localVideoRef = useRef<HTMLVideoElement>(null),
    remoteVideoRef = useRef<HTMLVideoElement>(null),
    expandRef = useRef<HTMLButtonElement>(null);
  const modeOpener = useRef<HTMLElement | null>(null);
  const chatToggle = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<{
      mode: "normal" | "remote" | "self";
      version: number;
    }>({ mode: "normal", version: 0 }),
    [overlay, setOverlay] = useState({
      version: 0,
      open: false,
      bubble: false,
    }),
    [sheet, setSheet] = useState<"devices" | "safety" | "account" | null>(null),
    [reason, setReason] = useState("Inappropriate content"),
    [playbackBlocked, setPlaybackBlocked] = useState(false),
    [fit, setFit] = useState(false),
    [speakerError, setSpeakerError] = useState("");
  const viewVersion = session.viewVersion;
  const mobile = useSyncExternalStore(
    subscribeMobile,
    mobileSnapshot,
    () => false,
  );
  const drawer = overlay.version === viewVersion && overlay.open;
  const bubble =
    overlay.version === viewVersion && (overlay.bubble || overlay.open);
  const setDrawer = useCallback(
    (open: boolean) =>
      setOverlay((previous) => ({
        version: viewVersion,
        open,
        bubble:
          mobile &&
          (open ||
            (previous.version === viewVersion &&
              (previous.bubble || previous.open))),
      })),
    [mobile, viewVersion],
  );
  const removeBubble = () => {
    setOverlay({ version: viewVersion, open: false, bubble: false });
    chatToggle.current?.focus();
  };
  const incoming = session.messages.filter(
    (message) => message.sender === "stranger",
  );
  const latestIncoming = incoming.at(-1)?.id;
  const [read, setRead] = useState<{ version: number; id?: string }>({
    version: 0,
  });
  const readIndex =
    read.version === viewVersion
      ? incoming.findIndex((message) => message.id === read.id)
      : -1;
  const unread = incoming.length - readIndex - 1;
  const markRead = useCallback(
    () =>
      setRead((previous) =>
        previous.version === viewVersion && previous.id === latestIncoming
          ? previous
          : { version: viewVersion, id: latestIncoming },
      ),
    [viewVersion, latestIncoming, setRead],
  );
  const mode = view.version === viewVersion ? view.mode : "normal";
  const setMode = useCallback(
    (mode: "normal" | "remote" | "self") =>
      setView({ mode, version: viewVersion }),
    [viewVersion],
  );
  const stopSession = session.stop;
  const endForModeration = useCallback(
    () =>
      stopSession(
        "An automated video check ended this call. It may be mistaken. No peer penalty was applied.",
      ),
    [stopSession],
  );
  const moderation = useNsfwModeration({
    localVideoRef,
    remoteVideoRef,
    isActive: !!session.roomId,
    localEnabled: session.videoEnabled,
    socket: session.socket,
    roomId: session.roomId,
    onCriticalViolation: endForModeration,
  });
  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);
  useEffect(() => {
    const el = localVideoRef.current;
    if (el) el.srcObject = session.localStream;
  }, [session.localStream]);
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) return;
    el.srcObject = session.remoteStream;
    if (session.remoteStream)
      void el
        .play()
        .then(() => setPlaybackBlocked(false))
        .catch(() => setPlaybackBlocked(true));
  }, [session.remoteStream]);
  const exitMode = () => {
    setMode("normal");
    setDrawer(false);
    (modeOpener.current?.isConnected
      ? modeOpener.current
      : expandRef.current
    )?.focus();
  };
  useEffect(() => {
    if (mode === "normal") return;
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
        setMode("normal");
        setDrawer(false);
        (modeOpener.current?.isConnected
          ? modeOpener.current
          : expandRef.current
        )?.focus();
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [mode, setMode, setDrawer]);
  const active = session.connectionPhase !== "idle";
  const expanded = mode !== "normal" && !!session.localStream;
  const end = () => {
    session.stop(
      session.safetyPending || session.safetyRetry
        ? "Safety request closed. It may already have reached the server."
        : undefined,
    );
    exitMode();
  };
  const conversation = (
    <ChatSidebar
      messages={session.messages}
      chatInput={session.chatInput}
      setChatInput={session.setChatInput}
      onSendMessage={session.sendMessage}
      ready={session.channelReady}
      onRead={markRead}
      onRemove={mobile ? removeBubble : undefined}
      onClose={
        expanded || mobile
          ? () => {
              setDrawer(false);
              if (mobile)
                document
                  .querySelector<HTMLButtonElement>(".chat-head")
                  ?.focus();
              else chatToggle.current?.focus();
            }
          : undefined
      }
    />
  );
  if (loading || !user)
    return (
      <main className="call-app loading-screen" aria-busy="true">
        <p>Opening campus…</p>
      </main>
    );
  return (
    <main className={`call-app chat-app ${expanded ? "focus-mode" : ""}`}>
      {!expanded && (
        <header className="campus-header">
          <Link
            href="/"
            className="campus-brand"
            onClick={(e) => {
              if (active) {
                e.preventDefault();
                setSheet("account");
              }
            }}
          >
            KMegle<span>.</span>
          </Link>
          <span className="brand-caption">Campus video chat</span>
          <nav aria-label="Call settings">
            <button
              className="quiet-button"
              onClick={() => setSheet("devices")}
            >
              Devices
            </button>
            <button
              className="quiet-button"
              onClick={toggleDarkMode}
              aria-label={`Use ${isDarkMode ? "light" : "dark"} theme`}
            >
              {isDarkMode ? "Light" : "Dark"}
            </button>
            <button
              className="quiet-button"
              onClick={() => setSheet("account")}
            >
              Account
            </button>
          </nav>
        </header>
      )}
      <h1 className="sr-only">Campus video chat</h1>
      <section
        className={`call-shell ${expanded ? "expanded" : ""}`}
        aria-label="Video conversation"
      >
        <div
          className={`video-column ${(expanded && drawer) || (mobile && bubble) ? "with-chat" : ""}`}
        >
          <header className="stage-heading">
            <div>
              <span
                className={`state-dot ${session.connectionPhase === "live" ? "connected" : ""}`}
              />
              <strong>{active ? "Student" : "Camera check"}</strong>
              <span className="stage-state">
                {session.connectionPhase === "live"
                  ? "Connected"
                  : session.connectionPhase === "waiting"
                    ? "Searching"
                    : session.roomId
                      ? "Connecting"
                      : session.connectionPhase === "ended"
                        ? "Call ended"
                        : "Local preview"}
              </span>
            </div>
            <div className="stage-actions">
              {expanded && (
                <button
                  className="quiet-button"
                  onClick={() => setSheet("devices")}
                >
                  Devices
                </button>
              )}
              {session.remoteStream && (
                <button
                  className="quiet-button"
                  onClick={() => setFit((v) => !v)}
                >
                  {fit ? "Fill video" : "Fit video"}
                </button>
              )}
              <button
                ref={expandRef}
                className="quiet-button"
                disabled={!session.localStream}
                onClick={(event) => {
                  if (expanded) exitMode();
                  else {
                    modeOpener.current = event.currentTarget;
                    setMode("remote");
                    setDrawer(true);
                  }
                }}
              >
                {expanded ? "Exit fullscreen ↙" : "Fullscreen ↗"}
              </button>
            </div>
          </header>
          <div
            className={`video-stage ${fit ? "fit-video" : ""} ${session.localStream && !active ? "preview-stage" : ""}`}
          >
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`remote-video ${!session.remoteStream || mode === "self" ? "hidden-video" : ""} ${moderation.isRemoteWarning ? "privacy-blur" : ""}`}
              aria-label="Student video"
              onPlaying={(event) => {
                session.markMediaReady(event.currentTarget.srcObject);
                setPlaybackBlocked(false);
              }}
            />
            {(!session.remoteStream || mode === "self") && (
              <div className="stage-empty">
                {!session.localStream ? (
                  <>
                    <div className="campus-monogram" aria-hidden="true">
                      k.
                    </div>
                    <h2>Ready to meet someone?</h2>
                    <p>
                      Check your camera and microphone first.
                      <br />
                      Your preview stays on this device until you start
                      matching.
                    </p>
                    <button
                      className="primary-button"
                      disabled={session.isConnecting || session.cameraPending}
                      onClick={() => void session.prepareCamera()}
                    >
                      Check camera & microphone
                    </button>
                  </>
                ) : !active ? (
                  <div className="preview-caption">
                    <h2>Looking good. Sound ready?</h2>
                    <p>
                      Your preview is local. Find a student when you’re ready.
                    </p>
                    <Meter stream={session.localStream} />
                  </div>
                ) : (
                  <>
                    <span className="campus-monogram" aria-hidden="true">
                      ↗
                    </span>
                    <h2>
                      {session.connectionPhase === "waiting"
                        ? "Finding your next hello…"
                        : session.connectionPhase === "ended"
                          ? "Ready for another hello?"
                          : "Bringing you together…"}
                    </h2>
                    <p>You can cancel any time with End.</p>
                  </>
                )}
              </div>
            )}
            <div
              className={`self-preview ${!session.localStream ? "no-preview" : ""} ${mode === "self" || !active ? "large-preview" : ""}`}
            >
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                aria-label="Your camera preview"
                className={
                  !session.videoEnabled
                    ? "hidden-video"
                    : moderation.isWarning
                      ? "privacy-blur"
                      : ""
                }
              />
              {!session.videoEnabled && (
                <div className="camera-off">Camera off</div>
              )}
              <div className="preview-label">
                <span>You · {session.audioEnabled ? "Mic on" : "Muted"}</span>
                <button
                  className="preview-expand"
                  aria-label={
                    mode === "self"
                      ? "Restore self preview"
                      : "Expand self preview"
                  }
                  onClick={(event) => {
                    modeOpener.current = event.currentTarget;
                    setMode(mode === "self" ? "normal" : "self");
                    setDrawer(mode !== "self");
                  }}
                >
                  ↗
                </button>
              </div>
            </div>
            {playbackBlocked && (
              <button
                className="playback-button primary-button"
                onClick={() =>
                  void remoteVideoRef.current
                    ?.play()
                    .then(() => setPlaybackBlocked(false))
                    .catch(() => {
                      setSpeakerError(
                        "Playback is still blocked. Check this tab’s sound permissions.",
                      );
                    })
                }
              >
                Play student audio & video
              </button>
            )}
          </div>
          {(expanded || mobile) && (
            <FloatingChat
              key={viewVersion}
              mobile={mobile}
              open={drawer}
              visible={bubble}
              unread={unread}
              onOpenChange={setDrawer}
              onRemove={removeBubble}
            >
              {conversation}
            </FloatingChat>
          )}
          <div
            className={`connection-notice ${session.isError ? "error-notice" : ""}`}
            role="status"
          >
            <span>{session.status}</span>
            {session.safetyRetry && (
              <button
                className="quiet-button"
                disabled={session.safetyPending}
                onClick={() => void session.retrySafety()}
              >
                Retry saving
              </button>
            )}
          </div>
          <div className="call-controls" aria-label="Call controls">
            <button
              className="control-button"
              aria-label={session.audioEnabled ? "Mute mic" : "Unmute mic"}
              title={session.audioEnabled ? "Mute mic" : "Unmute mic"}
              disabled={!session.localStream}
              aria-pressed={!session.audioEnabled}
              onClick={() => session.toggleTrack("audio")}
            >
              <CallIcon name="mic" off={!session.audioEnabled} />
              <span className="control-label">
                {session.audioEnabled ? "Mute mic" : "Unmute mic"}
              </span>
            </button>
            <button
              className="control-button"
              aria-label={session.videoEnabled ? "Camera off" : "Camera on"}
              title={session.videoEnabled ? "Camera off" : "Camera on"}
              disabled={!session.localStream}
              aria-pressed={!session.videoEnabled}
              onClick={() => session.toggleTrack("video")}
            >
              <CallIcon name="camera" off={!session.videoEnabled} />
              <span className="control-label">
                {session.videoEnabled ? "Camera off" : "Camera on"}
              </span>
            </button>
            {active ? (
              <button
                className="primary-button next-button"
                disabled={
                  !session.signalingReady ||
                  session.isConnecting ||
                  session.safetyPending ||
                  session.safetyRetry
                }
                onClick={session.next}
              >
                Next student →
              </button>
            ) : (
              <button
                className="primary-button next-button"
                disabled={
                  session.safetyPending ||
                  session.safetyRetry ||
                  moderation.isCooldownActive
                }
                onClick={() => void session.start()}
              >
                Find a student →
              </button>
            )}
            {(expanded || mobile) && (
              <button
                className="control-button"
                aria-expanded={drawer}
                aria-label={drawer ? "Hide chat" : "Show chat"}
                title={drawer ? "Hide chat" : "Show chat"}
                aria-describedby="chat-unread"
                ref={chatToggle}
                onClick={() => {
                  setDrawer(!drawer);
                  if (!drawer)
                    requestAnimationFrame(() =>
                      document
                        .getElementById("chat-message")
                        ?.focus({ preventScroll: true }),
                    );
                }}
              >
                <CallIcon name="chat" />
                {unread > 0 && (
                  <span className="unread-badge" aria-hidden="true">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
                <span className="control-label">
                  {drawer ? "Hide chat" : "Show chat"}
                </span>
              </button>
            )}
            <button
              className="control-button end-button"
              aria-label={
                session.safetyPending || session.safetyRetry
                  ? "Close request"
                  : active
                    ? "End"
                    : "Turn devices off"
              }
              title={
                session.safetyPending || session.safetyRetry
                  ? "Close request"
                  : active
                    ? "End"
                    : "Turn devices off"
              }
              disabled={
                !active &&
                !session.localStream &&
                !session.isConnecting &&
                !session.cameraPending &&
                !session.safetyPending &&
                !session.safetyRetry
              }
              onClick={end}
            >
              <CallIcon name="end" />
              <span className="control-label">
                {session.safetyPending || session.safetyRetry
                  ? "Close request"
                  : active
                    ? "End"
                    : "Turn devices off"}
              </span>
            </button>
            <button
              className="control-button"
              aria-label="Safety"
              title="Safety"
              disabled={
                !session.hasSafetyTarget ||
                !session.signalingReady ||
                session.safetyPending
              }
              onClick={() => setSheet("safety")}
            >
              <CallIcon name="safety" />
              <span className="control-label">Safety</span>
            </button>
          </div>
          <span id="chat-unread" className="sr-only" role="status">
            {unread > 0
              ? `${unread} unread ${unread === 1 ? "message" : "messages"}`
              : "No unread messages"}
          </span>
          <footer className="call-notes">
            <span>
              {moderation.moderationStatus === "inactive"
                ? "Video checks start during a call"
                : moderation.moderationStatus === "loading"
                  ? "Loading local video checks…"
                  : moderation.moderationStatus === "unavailable"
                    ? "Automated checks unavailable · use Safety to report"
                    : session.videoEnabled
                      ? "Local automated checks · can make mistakes"
                      : "Camera off · local checks paused"}
            </span>
            <a href="/policies" target="_blank" rel="noreferrer">
              Community & privacy ↗
            </a>
          </footer>
        </div>
        {!expanded && !mobile && (
          <div className="chat-slot">{conversation}</div>
        )}
      </section>
      {sheet === "devices" && (
        <Dialog title="Your devices" onClose={() => setSheet(null)}>
          <p className="dialog-copy">
            Your camera check is local until you find a student. Changing
            devices during a call updates what you share.
          </p>
          {!session.localStream && (
            <button
              className="primary-button"
              onClick={() => void session.prepareCamera()}
            >
              Start camera check
            </button>
          )}
          {(["video", "audio"] as const).map((kind) => (
            <div className="device-field" key={kind}>
              <label htmlFor={`device-${kind}`}>
                {kind === "video" ? "Camera" : "Microphone"}
              </label>
              <select
                id={`device-${kind}`}
                disabled={!session.localStream || session.devicePending}
                value={
                  session.localStream
                    ?.getTracks()
                    .find((t) => t.kind === kind)
                    ?.getSettings().deviceId || ""
                }
                onChange={(e) =>
                  void session.selectDevice(kind, e.target.value)
                }
              >
                <option value="" disabled>
                  Select a device
                </option>
                {session.devices
                  .filter(
                    (d) =>
                      d.kind ===
                      (kind === "video" ? "videoinput" : "audioinput"),
                  )
                  .map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label ||
                        `${kind === "video" ? "Camera" : "Microphone"} ${i + 1}`}
                    </option>
                  ))}
              </select>
            </div>
          ))}
          {typeof HTMLMediaElement !== "undefined" &&
            "setSinkId" in HTMLMediaElement.prototype && (
              <label className="device-field">
                Speaker
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const el = remoteVideoRef.current as HTMLVideoElement & {
                      setSinkId: (id: string) => Promise<void>;
                    };
                    void el
                      ?.setSinkId(e.target.value)
                      .then(() => setSpeakerError(""))
                      .catch(() =>
                        setSpeakerError(
                          "Unable to use this speaker. Check browser permissions.",
                        ),
                      );
                  }}
                >
                  <option value="">System default</option>
                  {session.devices
                    .filter((d) => d.kind === "audiooutput")
                    .map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Speaker ${i + 1}`}
                      </option>
                    ))}
                </select>
              </label>
            )}
          <Meter stream={session.localStream} />
          <p role="status">{speakerError || session.status}</p>
          <div className="dialog-actions">
            {session.diagnosticsEnabled && session.roomId && (
              <button
                className="control-button"
                onClick={() => void session.downloadDiagnostics()}
              >
                Save network snapshot
              </button>
            )}
            <button className="primary-button" onClick={() => setSheet(null)}>
              Done
            </button>
          </div>
        </Dialog>
      )}
      {sheet === "safety" && (
        <Dialog title="You’re in control." onClose={() => setSheet(null)}>
          <p className="dialog-copy">
            Report sends a concern for review and ends this call. Block prevents
            future matches with this account. Neither action automatically
            suspends a student.
          </p>
          <label className="device-field">
            Reason for report
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {[
                "Inappropriate content",
                "Harassment or hate",
                "Personal information shared",
                "Spam or other concern",
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <div className="safety-options">
            <button
              className="primary-button"
              onClick={() => {
                setSheet(null);
                session.reportUser(reason);
              }}
            >
              Report & end call
            </button>
            <button
              className="control-button"
              onClick={() => {
                setSheet(null);
                session.block();
              }}
            >
              Block student & end
            </button>
            <button
              className="quiet-button"
              onClick={() => {
                setSheet(null);
                end();
              }}
            >
              Just end the call
            </button>
          </div>
        </Dialog>
      )}
      {sheet === "account" && (
        <Dialog title="Account settings" onClose={() => setSheet(null)}>
          <p className="dialog-copy">
            Opening account settings turns off your devices and leaves any
            current call.
          </p>
          <div className="dialog-actions">
            <button className="quiet-button" onClick={() => setSheet(null)}>
              Stay here
            </button>
            <button
              className="primary-button"
              onClick={() => {
                session.cleanupConnection();
                router.push("/settings");
              }}
            >
              Open account settings
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
