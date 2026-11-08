"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import CallIcon from "./CallIcon";

const clamp = (value: number, max: number) =>
  Math.max(8, Math.min(value, Math.max(8, max)));

export default function FloatingChat({
  mobile,
  open,
  visible,
  unread,
  onOpenChange,
  onRemove,
  children,
}: {
  mobile: boolean;
  open: boolean;
  visible: boolean;
  unread: number;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    moved: boolean;
  } | null>(null);
  const removeTarget = useRef<HTMLButtonElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const [overRemove, setOverRemove] = useState(false);
  const suppressClick = useRef(false);
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setBounds({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const x =
    dragging && position
      ? position.x
      : clamp(position?.x ?? bounds.width - 68, bounds.width - 64);
  const y =
    dragging && position
      ? position.y
      : clamp(position?.y ?? 32, bounds.height - 64);
  const above = y > bounds.height / 2;
  const compact = bounds.height < 280;
  const panelWidth = Math.min(320, bounds.width - (compact ? 88 : 20));
  const panelHeight = Math.max(
    0,
    // Leave the camera preview accessible when the conversation opens upward.
    Math.min(
      520,
      compact ? bounds.height - 16 : above ? y - 96 : bounds.height - y - 72,
    ),
  );
  const removeHit = (clientX: number, clientY: number) => {
    const rect = removeTarget.current?.getBoundingClientRect();
    return (
      !!rect &&
      clientX >= rect.left - 28 &&
      clientX <= rect.right + 28 &&
      clientY >= rect.top - 28 &&
      clientY <= rect.bottom + 28
    );
  };
  const finishDrag = (cancelled: boolean, clientX: number, clientY: number) => {
    const gesture = drag.current;
    if (!gesture) return;
    suppressClick.current = gesture.moved && !cancelled;
    if (gesture.moved && !cancelled && removeHit(clientX, clientY)) onRemove();
    else if (gesture.moved)
      setPosition({
        x: x < bounds.width / 2 ? 8 : bounds.width - 64,
        y: clamp(y, bounds.height - 64),
      });
    drag.current = null;
    setDragging(false);
    setOverRemove(false);
  };
  return (
    <div
      ref={layer}
      className={`floating-chat-layer ${dragging ? "dragging-chat" : ""} ${compact ? "compact-chat" : above ? "chat-opens-above" : ""} ${x < bounds.width / 2 ? "bubble-left" : ""}`}
    >
      {open && (
        <div
          id="floating-conversation"
          className="chat-drawer"
          style={
            mobile
              ? {
                  width: panelWidth,
                  left: clamp(
                    compact
                      ? x < bounds.width / 2
                        ? x + 64
                        : x - panelWidth - 8
                      : x + 56 - panelWidth,
                    bounds.width - panelWidth - 10,
                  ),
                  top: compact ? 8 : above ? y - 8 - panelHeight : y + 64,
                  height: panelHeight,
                }
              : undefined
          }
        >
          {children}
        </div>
      )}
      {mobile && visible && (
        <>
          <button
            className="chat-head"
            style={{ left: x, top: y }}
            aria-label="Chat bubble"
            aria-expanded={open}
            aria-controls="floating-conversation"
            aria-describedby="chat-bubble-help chat-unread"
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              onOpenChange(!open);
            }}
            onKeyDown={(event) => {
              if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                onRemove();
              }
            }}
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              const rect = event.currentTarget.getBoundingClientRect();
              drag.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                dx: event.clientX - rect.left,
                dy: event.clientY - rect.top,
                moved: false,
              };
              suppressClick.current = false;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const gesture = drag.current;
              if (!gesture || gesture.id !== event.pointerId) return;
              if (
                !gesture.moved &&
                Math.hypot(
                  event.clientX - gesture.x,
                  event.clientY - gesture.y,
                ) < 6
              )
                return;
              const rect = layer.current?.getBoundingClientRect();
              if (!rect) return;
              if (!gesture.moved) onOpenChange(false);
              gesture.moved = true;
              setDragging(true);
              setPosition({
                x:
                  Math.max(
                    8,
                    Math.min(event.clientX - gesture.dx, innerWidth - 64),
                  ) - rect.left,
                y:
                  Math.max(
                    8,
                    Math.min(event.clientY - gesture.dy, innerHeight - 64),
                  ) - rect.top,
              });
              setOverRemove(removeHit(event.clientX, event.clientY));
            }}
            onPointerUp={(event) =>
              finishDrag(false, event.clientX, event.clientY)
            }
            onPointerCancel={(event) =>
              finishDrag(true, event.clientX, event.clientY)
            }
            onLostPointerCapture={(event) =>
              finishDrag(true, event.clientX, event.clientY)
            }
          >
            <CallIcon name="chat" />
            {unread > 0 && (
              <span className="unread-badge" aria-hidden="true">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
          <span id="chat-bubble-help" className="sr-only">
            Tap to open or minimize. Drag to the bottom to remove, or press
            Delete. Removing the bubble keeps your messages.
          </span>
        </>
      )}
      {dragging && (
        <button
          ref={removeTarget}
          className={`chat-remove-target ${overRemove ? "over-remove" : ""}`}
          aria-label="Remove chat bubble"
          onClick={onRemove}
        >
          ✕ <span>Remove</span>
        </button>
      )}
    </div>
  );
}
