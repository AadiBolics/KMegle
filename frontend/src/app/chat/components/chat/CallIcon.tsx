export default function CallIcon({
  name,
  off = false,
}: {
  name: "mic" | "camera" | "chat" | "end" | "safety";
  off?: boolean;
}) {
  const paths = {
    mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6",
    camera:
      "M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM16 10l6-4v12l-6-4",
    chat: "M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6 4V4a1 1 0 0 1 1-1Z",
    end: "M3 13c5-5 13-5 18 0l-2 4-5-2v-3h-4v3l-5 2-2-4Z",
    safety: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4ZM12 8v5M12 17h.01",
  };
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
      {off && <path d="m3 3 18 18" />}
    </svg>
  );
}
