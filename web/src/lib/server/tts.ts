import { createServerFn } from "@tanstack/react-start";

const cache = new Map<string, { mime: string; audio: string }>();

function toBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}

async function callTts(
  apiKey: string,
  text: string,
): Promise<{ mime: string; audio: string } | null> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const primary = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers,
    body: JSON.stringify({ text, voice_id: "eve" }),
  });
  if (primary.ok) {
    const buf = await primary.arrayBuffer();
    if (buf.byteLength > 200) {
      return {
        mime: primary.headers.get("content-type") || "audio/mpeg",
        audio: toBase64(buf),
      };
    }
  }

  const fallback = await fetch("https://api.x.ai/v1/audio/speech", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "grok-tts",
      input: text,
      voice: "eve",
    }),
  });
  if (fallback.ok) {
    const buf = await fallback.arrayBuffer();
    if (buf.byteLength > 200) {
      return {
        mime: fallback.headers.get("content-type") || "audio/mpeg",
        audio: toBase64(buf),
      };
    }
  }
  return null;
}

export const synthesizeSpeech = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => ({
    text: String(input.text ?? "").slice(0, 1800),
  }))
  .handler(async ({ data }) => {
    const text = data.text.trim();
    if (!text) return { ok: false as const, error: "empty" };
    const hit = cache.get(text);
    if (hit) return { ok: true as const, ...hit };
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "unavailable" };
    try {
      const out = await callTts(apiKey, text);
      if (!out) return { ok: false as const, error: "tts failed" };
      if (cache.size > 40) cache.clear();
      cache.set(text, out);
      return { ok: true as const, ...out };
    } catch {
      return { ok: false as const, error: "tts failed" };
    }
  });
