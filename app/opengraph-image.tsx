import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "FreeRent - Get your money back!";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: 150, marginBottom: 20 }}>💸</div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 900,
            color: "white",
            textShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          FreeRent
        </div>
        <div
          style={{
            fontSize: 36,
            color: "rgba(255,255,255,0.8)",
            marginTop: 20,
          }}
        >
          Get your money back!
        </div>
        <div
          style={{
            fontSize: 24,
            color: "rgba(255,255,255,0.6)",
            marginTop: 40,
          }}
        >
          Reclaim SOL from unused token accounts • Free gas
        </div>
      </div>
    ),
    { ...size }
  );
}
