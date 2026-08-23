import type { Cefr, Clip } from "./types";

const LEVEL_KEYS: { level: Cefr; key: keyof Clip }[] = [
  { level: "C2", key: "text_en_c2" },
  { level: "C1", key: "text_en_c1" },
  { level: "B2", key: "text_en_b2" },
  { level: "B1", key: "text_en_b1" },
  { level: "A2", key: "text_en_a2" },
];

export function textForLevel(clip: Clip, level: Cefr): string {
  const start = LEVEL_KEYS.findIndex((x) => x.level === level);
  const order = start >= 0 ? LEVEL_KEYS.slice(start) : LEVEL_KEYS;
  for (const { key } of order) {
    const v = clip[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  for (const { key } of LEVEL_KEYS) {
    const v = clip[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return clip.text;
}

export function topicForClip(clip: Clip): string {
  return clip.topic_en || clip.topic;
}

export function formatSourceLabel(url: string): string {
  try {
    if (url.includes("news.google.com/search")) {
      const u = new URL(url);
      const q = u.searchParams.get("q") || "";
      if (q) return `Google News: ${decodeURIComponent(q.replace(/\+/g, " "))}`;
    }
  } catch {
    /* fall through */
  }
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (host.includes("reddit.com")) {
    const m = url.match(/\/r\/([\w_]+)\/comments\/([a-z0-9]+)/i);
    if (m) return `Reddit · r/${m[1]}`;
    return "Reddit";
  }
  if (host.includes("4chan.org") || host.includes("4channel.org")) {
    const m = url.match(/\/(\w+)\/thread\/(\d+)/i);
    if (m) return `4chan · /${m[1]}/`;
    return "4chan";
  }
  if (host.includes("news.ycombinator.com")) return "Hacker News";
  if (host.includes("x.com") || host.includes("twitter.com")) {
    const m = url.match(/\/(\w+)\/status\/(\d+)/);
    if (m) return `X · @${m[1]}`;
    return "X";
  }
  let label = url.replace(/^https?:\/\/(www\.)?/, "");
  if (label.length > 56) label = `${label.slice(0, 56)}…`;
  return label;
}

export function normalizeClip(raw: Record<string, unknown>, idx: number): Clip {
  const str = (k: string) =>
    typeof raw[k] === "string" ? (raw[k] as string) : undefined;
  const topic = str("topic_en") || str("topic") || `Clip ${idx + 1}`;
  const text =
    str("text") ||
    str("text_en_b1") ||
    str("text_en_b2") ||
    str("text_en_c1") ||
    str("text_en_c2") ||
    str("text_en_a2") ||
    "";
  return {
    id: str("id") || `clip-${idx}`,
    category: str("category"),
    topic,
    topic_zh: str("topic_zh"),
    topic_en: str("topic_en") || topic,
    text,
    text_zh: str("text_zh"),
    text_en_a2: str("text_en_a2"),
    text_en_b1: str("text_en_b1") || str("text"),
    text_en_b2: str("text_en_b2"),
    text_en_c1: str("text_en_c1"),
    text_en_c2: str("text_en_c2"),
    source_url: str("source_url"),
    source_hint: str("source_hint"),
    audio: str("audio") ?? null,
  };
}

export function winThresholdFor(n: number): number {
  return Math.max(3, Math.round(n * 0.7));
}
