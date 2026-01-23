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
        }}
      >
        {/* Glow effect background */}
        <div
          style={{
            position: "absolute",
            width: "400px",
            height: "400px",
            background: "radial-gradient(circle, rgba(34, 211, 238, 0.3) 0%, transparent 70%)",
            borderRadius: "50%",
            filter: "blur(60px)",
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            color: "#22d3ee",
            textShadow: "0 0 40px rgba(34, 211, 238, 0.5)",
            marginBottom: 16,
            fontFamily: "monospace",
          }}
        >
          Free Rent
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 36,
            color: "#9ca3af",
            marginBottom: 8,
          }}
        >
          Get your money back
        </div>

        {/* Domain */}
        <div
          style={{
            fontSize: 28,
            color: "#22d3ee",
            fontWeight: 600,
          }}
        >
          freerent.money
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 24,
            color: "#6b7280",
            marginTop: 40,
            textAlign: "center",
            maxWidth: 800,
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
