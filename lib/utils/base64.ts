/** Browser-safe base64 helpers (no Node Buffer required in client). */

type BufferLike = {
  from(data: Uint8Array | string, encoding?: string): { toString(enc: string): string; };
};

function nodeBuffer(): BufferLike | null {
  const g = globalThis as typeof globalThis & { Buffer?: BufferLike };
  return g.Buffer ?? null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const Buf = nodeBuffer();
  if (Buf) return Buf.from(bytes).toString("base64");
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const Buf = nodeBuffer();
  if (Buf) {
    // Buffer.from returns Uint8Array-compatible in Node
    const buf = Buf.from(base64, "base64") as unknown as Uint8Array;
    return new Uint8Array(buf);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
