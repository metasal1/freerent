import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

export const alt = "Free Rent - Get Your Money Back";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  // Load Space Grotesk Bold font from local file (.woff - Satori doesn't support woff2)
  const fontPath = join(process.cwd(), "app/fonts/SpaceGrotesk-Bold.woff");
  const fontData = await readFile(fontPath);

  // Load mascot image
  const mascotPath = join(process.cwd(), "public/freeby.png");
  const mascotData = await readFile(mascotPath);
  const mascotBase64 = `data:image/png;base64,${mascotData.toString("base64")}`;

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
            width: "500px",
            height: "500px",
            background: "radial-gradient(circle, rgba(34, 211, 238, 0.4) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Mascot */}
        <img
          src={mascotBase64}
          alt="Freeby"
          width={180}
          height={180}
          style={{
            marginBottom: 20,
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: 100,
            fontWeight: 700,
            color: "#22d3ee",
            textShadow: "0 0 60px rgba(34, 211, 238, 0.8), 0 0 120px rgba(34, 211, 238, 0.4)",
            marginBottom: 10,
            letterSpacing: "-0.02em",
            fontFamily: "Space Grotesk",
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
            fontWeight: 500,
          }}
        >
          Get your money back
        </div>

        {/* Domain */}
        <div
          style={{
            fontSize: 28,
            color: "#22d3ee",
            fontWeight: 700,
            fontFamily: "Space Grotesk",
          }}
        >
          freerent.money
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 22,
            color: "#6b7280",
            marginTop: 30,
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
      fonts: [
        {
          name: "Space Grotesk",
          data: fontData,
          style: "normal",
          weight: 700,
        },
      ],
    }
  );
}
