import { createServerFn } from "@tanstack/react-start";
import { PERSONA } from "@/data/persona";
import { normalizeClip } from "@/lib/clips";
import { gatherSources, type PoolPost } from "@/lib/server/feeds";
import { setLivePack } from "@/lib/server/live-pack";
import type { Clip, PipelineStats } from "@/lib/types";
import { todayIso } from "@/lib/utils";

const LEVELS = {
  b1: {
    min: 25,
    max: 65,
    name: "B1 (intermediate, IELTS 5)",
    desc: "Simple sentences (10-14 words each), common everyday vocabulary. Light edit of a real 4chan OP.",
  },
  b2: {
    min: 70,
    max: 85,
    name: "B2 (upper-intermediate, IELTS 6.5)",
    desc: "More complex sentences with subordinating conjunctions, some phrasal verbs, broader vocabulary.",
  },
  c1: {
    min: 90,
    max: 110,
    name: "C1 (advanced, IELTS 7.5)",
    desc: "Sophisticated structure, varied sentence types, natural idioms, formal-to-neutral register.",
  },
  c2: {
    min: 110,
    max: 135,
    name: "C2 (proficient, IELTS 9)",
    desc: "Near-native, dense and elegant. Reads like a sharp newspaper paragraph, still the same facts.",
  },
} as const;

type ExpandLevel = "b2" | "c1" | "c2";

type BaseClip = {
  id: string;
  category?: string;
  topic_zh?: string;
  topic_en?: string;
  text_zh?: string;
  text_en_b1?: string;
  source_url?: string;
  source_hint?: string;
};

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced?.[1] ?? raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callXai(prompt: string, maxTokens: number): Promise<unknown> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("unavailable");
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      max_tokens: maxTokens,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            "You write spoken-English practice clips from real 4chan OPs, for ONE specific Hong Kong learner. Return ONLY JSON. No markdown.",
        },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = body.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(raw);
  if (!parsed) throw new Error("parse");
  return parsed;
}

function poolBlock(postPool: PoolPost[]): string {
  if (!postPool.length) {
    return `# REAL 4CHAN POOL: empty
If empty, still output 7 clips from this learner's life (trading losses, HKIE exam, surveying work, LoL, gym/MMA, Gundam/AOT, AI-job anxiety) and use a correctly formatted 4chan thread URL.`;
  }
  const groups = new Map<string, PoolPost[]>();
  for (const p of postPool) {
    const list = groups.get(p.category) ?? [];
    list.push(p);
    groups.set(p.category, list);
  }
  const lines: string[] = [
    "# REAL 4CHAN POOL — already scored against this learner's life",
    "Posts are grouped by the clip category they should fill. Pick FROM THAT GROUP. Copy source_url exactly. English = light edit of OP. Do not invent a generic news brief.",
  ];
  for (const [cat, posts] of groups) {
    lines.push(`\n## ${cat}`);
    for (const p of posts) {
      const op = p.transcript?.full || p.snippet || p.title;
      lines.push(`  • [${p.board}] ${p.url}\n    OP: "${op}"`);
    }
  }
  return lines.join("\n");
}

function buildBasePrompt(postPool: PoolPost[], today: string): string {
  const p = PERSONA.profile;
  const mix = PERSONA.content_mix;
  const mixLine = Object.entries(mix)
    .map(([k, n]) => `${n}× ${k.replace(/_/g, "/")}`)
    .join(", ");

  return `Generate today's 7 English-practice clips for ONE person. He is not a generic learner. Write as if these 4chan threads landed in HIS feed tonight.

# Who he is
- ${p.age}, ${p.location}. ${p.background}
- Job: ${p.occupation}
- Life: ${p.life_situation}
- Money: ${p.financial_situation}
- Values: ${p.core_values.join("; ")}
- Interests: ${p.interests.join("; ")}
- People: ${p.social_circle.join("; ")}
- Voice (Chinese only): ${p.communication_style.join("; ")}
- Worldview: ${p.worldview.join("; ")}
- Decisions: ${p.decision_mode}
- Emotions: ${p.emotional_logic}

# Mix (exactly 7 clips)
${mixLine}
trading = /biz/ (gold, CFD, prop firm, futures, his losses-as-tuition)
tech/ai = /g/ (AI taking jobs — he is anxious, surveying + exam)
hk/news = /int/ or /pol/ that actually touches HK/China/Asia — his cramped HK vs US
lol/esports = /v/ League of Legends only (S15, T1, ranked) — not random games
mma/fitness = /fit/ lifting / UFC — gym with 肥仔信
anime/culture = /a/ Gundam 00, Demon Slayer, Attack on Titan if present, else today's anime OP

# How to write each clip
- text_en_b1: LIGHT EDIT of the OP. Keep names, numbers, tickers, specific claims. Fix typos. ${LEVELS.b1.min}-${LEVELS.b1.max} words. Natural spoken English, not Chinglish. Not a corporate summary.
- text_zh: HIS mouth. Traditional Chinese, Cantonese flavour, short sentences, English terms left in (prop firm, CFD, AP, lol, wtf). He can react — "又係學費", "考牌都未完", "肥仔信今日又叫我去gym" — but do not invent facts that are not in the OP.
- topic_zh 4–8 chars, topic_en 2–5 words, concrete (e.g. 「黃金又插」 not 「金價波動」).
- source_url: copy the 4chan /thread/<id> URL from the pool, unique per clip.
- source_hint: one line on why this OP hits his life.

${poolBlock(postPool)}

# Output JSON only
{
  "clips": [
    {
      "id": "c1",
      "category": "trading",
      "topic_zh": "…",
      "topic_en": "…",
      "text_zh": "…",
      "text_en_b1": "…",
      "source_url": "https://boards.4chan.org/biz/thread/…",
      "source_hint": "…"
    }
  ]
}

Today is ${today}. Seven clips. Different URLs. Return ONLY the JSON object.`;
}

function buildExpansionPrompt(clips: BaseClip[], level: ExpandLevel): string {
  const spec = LEVELS[level];
  return `Rewrite 7 English clips at ${spec.name}. Each B1 is a light edit of a real 4chan OP about this HK learner's world (trading, AI jobs, HK, LoL, gym, anime). Keep the same facts, names, numbers. No motivational endings.

# Target
${spec.min}-${spec.max} words. ${spec.desc}
C1/C2 must be LONGER and more complex than B1. Keep source_url unchanged.

# Input
${JSON.stringify(
  clips.map((c) => ({
    id: c.id,
    topic_en: c.topic_en,
    text_en_b1: c.text_en_b1,
    source_url: c.source_url || "",
  })),
  null,
  2,
)}

Return ONLY:
{ "rewrites": [ { "id": "<id>", "text": "<${spec.min}-${spec.max} words>" } ] }`;
}

function dedupUrls(clips: BaseClip[], pool: PoolPost[]): void {
  const used = new Set<string>();
  let cursor = 0;
  const nextPoolUrl = () => {
    while (cursor < pool.length) {
      const u = pool[cursor++]?.url;
      if (u && !used.has(u)) return u;
    }
    return null;
  };
  for (const c of clips) {
    let url = (c.source_url || "").trim();
    if (url.includes(" > ")) url = url.split(" > ")[0]!.trim();
    if (url && !/^https?:\/\//.test(url)) url = "";
    if (/4chan\.org\/[a-z0-9]+\/?$/.test(url)) url = "";
    if (url && used.has(url)) url = nextPoolUrl() ?? url;
    else if (!url) url = nextPoolUrl() ?? url;
    if (url) used.add(url);
    c.source_url = url;
  }
}

function rewriteMap(parsed: unknown): Record<string, string> {
  const obj = parsed as { rewrites?: { id?: string; text?: string }[] };
  const map: Record<string, string> = {};
  for (const r of obj.rewrites ?? []) {
    if (r.id && r.text) map[r.id] = r.text;
  }
  return map;
}

export const generateClips = createServerFn({ method: "POST" }).handler(
  async (): Promise<
    | { ok: true; date: string; clips: Clip[]; stats: PipelineStats }
    | { ok: false; error: string }
  > => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "unavailable" };
    const date = todayIso();
    try {
      const { pool, stats } = await gatherSources();
      const baseParsed = (await callXai(
        buildBasePrompt(pool, date),
        2800,
      )) as { clips?: BaseClip[] };
      const baseClips = (baseParsed.clips ?? []).filter(
        (c) => c.id && c.topic_en && c.text_en_b1,
      );
      if (baseClips.length < 5) return { ok: false, error: "parse" };
      dedupUrls(baseClips, pool);

      const [b2Raw, c1Raw, c2Raw] = await Promise.all([
        callXai(buildExpansionPrompt(baseClips, "b2"), 2200),
        callXai(buildExpansionPrompt(baseClips, "c1"), 2400),
        callXai(buildExpansionPrompt(baseClips, "c2"), 2600),
      ]);
      const b2 = rewriteMap(b2Raw);
      const c1 = rewriteMap(c1Raw);
      const c2 = rewriteMap(c2Raw);

      const clips: Clip[] = baseClips.map((c, i) =>
        normalizeClip(
          {
            ...c,
            text_en_b2: b2[c.id] || "",
            text_en_c1: c1[c.id] || "",
            text_en_c2: c2[c.id] || "",
          },
          i,
        ),
      );

      const pack = { date, source: "ai" as const, clips };
      setLivePack(pack);

      return {
        ok: true,
        date,
        clips,
        stats: { ...stats, generatedAt: new Date().toISOString() },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "failed";
      return { ok: false, error: msg };
    }
  },
);
