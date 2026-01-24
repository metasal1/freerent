import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Free Rent - Get Your Money Back";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 64,
          background: "linear-gradient(135deg, #000000 0%, #0a0a0a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Glow effect background */}
        <div
          style={{
            position: "absolute",
            width: "500px",
            height: "500px",
            background: "radial-gradient(circle, rgba(34, 211, 238, 0.4) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            color: "#22d3ee",
            textShadow: "0 0 60px rgba(34, 211, 238, 0.8), 0 0 120px rgba(34, 211, 238, 0.4)",
            marginBottom: 20,
            letterSpacing: "-0.02em",
          }}
        >
          Free Rent
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 42,
            color: "#9ca3af",
            marginBottom: 12,
            fontWeight: 500,
          }}
        >
          Get your money back
        </div>

        {/* Domain */}
        <div
          style={{
            fontSize: 32,
            color: "#22d3ee",
            fontWeight: 700,
          }}
        >
          freerent.money
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 26,
            color: "#6b7280",
            marginTop: 50,
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          Close unused Solana token accounts and reclaim your SOL
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
