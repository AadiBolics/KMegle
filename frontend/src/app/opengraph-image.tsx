import { ImageResponse } from "next/og";
export const alt = "KMegle — A little more campus.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#0a0a0f",
          color: "#f9fafb",
          padding: 90,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 100,
            fontWeight: 700,
            letterSpacing: -5,
          }}
        >
          KMegle<span style={{ color: "#818cf8" }}>.</span>
        </div>
        <div style={{ fontSize: 54, marginTop: 32 }}>A little more campus.</div>
        <div style={{ fontSize: 25, marginTop: 26, color: "#a1a1b5" }}>
          Meet a fellow IIIT Kottayam student. A fresh hello, one at a time.
        </div>
      </div>
    ),
    size,
  );
}
