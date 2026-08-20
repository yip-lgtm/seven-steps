import { createServerFn } from "@tanstack/react-start";

export const checkGist = createServerFn({ method: "POST" })
  .validator((input: { gist: string; original: string; lang: "zh" | "en" }) => ({
    gist: String(input.gist ?? "").slice(0, 1200),
    original: String(input.original ?? "").slice(0, 1800),
    lang: input.lang === "en" ? ("en" as const) : ("zh" as const),
  }))
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "unavailable" };
    const bilingual =
      data.lang === "zh"
        ? "Reply in Traditional Chinese first, then a short English recap. Keep it under 120 words total."
        : "Reply in English, under 120 words. Optionally add one short Chinese line.";
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          max_tokens: 280,
          temperature: 0.4,
          messages: [
            {
              role: "system",
              content:
                "You are a concise English listening coach for Cantonese-speaking adults in Hong Kong. Compare the learner's English gist to the original clip. Praise what they caught. Name 1–2 missed ideas. Give one natural phrase to steal. Do not grade grammar harshly. " +
                bilingual,
            },
            {
              role: "user",
              content: `ORIGINAL:\n${data.original}\n\nLEARNER GIST:\n${data.gist || "(empty)"}`,
            },
          ],
        }),
      });
      if (!res.ok) return { ok: false as const, error: `api ${res.status}` };
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = body.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) return { ok: false as const, error: "empty" };
      return { ok: true as const, text };
    } catch {
      return { ok: false as const, error: "failed" };
    }
  });
