"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ChatMessage } from "../../types/chat";
export default function ChatSidebar({
  messages,
  chatInput,
  setChatInput,
  onSendMessage,
  ready,
  onClose,
}: {
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (s: string) => void;
  onSendMessage: (e: FormEvent) => void;
  ready: boolean;
  onClose?: () => void;
}) {
  const log = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true);
  const [unread, setUnread] = useState(false);
  const scroll = () => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
    nearBottom.current = true;
    setUnread(false);
  };
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    if (nearBottom.current) el.scrollTop = el.scrollHeight;
    else if (messages.length) queueMicrotask(() => setUnread(true));
  }, [messages]);
  return (
    <aside className="call-chat" aria-label="Conversation">
      <header>
        <div>
          <h2>Say hello.</h2>
          <p>
            {ready
              ? "Text goes directly to this student."
              : "Text opens when your channel connects."}
          </p>
        </div>
        {onClose && (
          <button
            className="quiet-button"
            onClick={onClose}
            aria-label="Close chat"
          >
            ✕
          </button>
        )}
      </header>
      <div
        ref={log}
        className="message-log"
        role="log"
        aria-label="Messages"
        aria-live="polite"
        aria-relevant="additions text"
        onScroll={() => {
          const el = log.current;
          if (el) {
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 64;
            if (nearBottom.current) setUnread(false);
          }
        }}
      >
        {!messages.length && (
          <div className="chat-empty">
            <span aria-hidden="true">↗</span>
            <h3>A small hello goes a long way.</h3>
            <p>
              Ask about their day, their course, or the best snack on campus.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div className={`message ${m.sender}`} key={m.id || i}>
            {m.sender !== "system" && (
              <span>{m.sender === "me" ? "You" : "Student"}</span>
            )}
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      {unread && (
        <button className="new-messages" onClick={scroll}>
          New messages ↓
        </button>
      )}
      <form className="message-composer" onSubmit={onSendMessage}>
        <label className="sr-only" htmlFor="chat-message">
          Message student
        </label>
        <input
          id="chat-message"
          maxLength={1000}
          placeholder={
            ready ? "Write a message…" : "Waiting for text connection…"
          }
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          disabled={!ready}
        />
        <button
          className="primary-button"
          type="submit"
          disabled={!ready || !chatInput.trim()}
          aria-label="Send message"
        >
          ↑
        </button>
      </form>
      <p className="chat-footnote">Be kind. Keep personal details private.</p>
    </aside>
  );
}
