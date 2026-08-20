export type ClipCategory =
  | "trading"
  | "tech/ai"
  | "hk/news"
  | "lol/esports"
  | "mma/fitness"
  | "anime/culture";

export type PoolPost = {
  source: "4chan";
  title: string;
  url: string;
  board: string;
  no: number;
  replies: number;
  time: number;
  snippet: string;
  category: ClipCategory;
  score: number;
  transcript?: { sub: string; com: string; full: string; from: string };
};

export type FeedStats = {
  fourchan: number;
  hn: number;
  headlines: number;
  transcripts: number;
};

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BOARD_SPECS: {
  board: string;
  category: ClipCategory;
  take: number;
}[] = [
  { board: "biz", category: "trading", take: 10 },
  { board: "g", category: "tech/ai", take: 6 },
  { board: "int", category: "hk/news", take: 6 },
  { board: "pol", category: "hk/news", take: 4 },
  { board: "v", category: "lol/esports", take: 8 },
  { board: "fit", category: "mma/fitness", take: 6 },
  { board: "a", category: "anime/culture", take: 6 },
];

const KEYWORDS: Record<ClipCategory, string[]> = {
  trading: [
    "gold", "xau", "spy", "nasdaq", "cfd", "prop", "futures", "forex", "btc",
    "bitcoin", "oil", "fed", "yield", "option", "nvda", "earnings", "pnl",
    "leverage", "short", "long", "chart", "ath", "dump", "pump", "usd",
    "silver", "bond", "cpi", "rate cut", "trading",
  ],
  "tech/ai": [
    "ai", "llm", "gpt", "grok", "nvidia", "gpu", "automat", "openai",
    "claude", "model", "layoff", "replace", "white.?collar", "cursor",
    "coding", "engineer", "job",
  ],
  "hk/news": [
    "hong kong", "hongkong", "hk ", "hkg", "cantonese", "kowloon", "mtr",
    "hku", "legco", "ccp", "china", "taiwan", "asia", "hkd", "typhoon",
  ],
  "lol/esports": [
    "league", "lol", "faker", "worlds", "lck", "lpl", "lcs", "t1", "skt",
    "gwen", "yasuo", "ranked", "elo", "riot", "arcane", "wild rift",
  ],
  "mma/fitness": [
    "ufc", "mma", "gym", "lift", "deadlift", "bulk", "cut", "protein",
    "bjj", "boxing", "spar", "natty", " squat", "bench", "cardio", "fat",
  ],
  "anime/culture": [
    "anime", "manga", "gundam", "titan", "demon slayer", "waifu", "season",
    "shonen", "mecha", "aot", "kimetsu", "mal ", "ln ",
  ],
};

function cleanHtml(s: string): string {
  if (!s) return "";
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/>/g, ">")
    .replace(/</g, "<")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreText(text: string, category: ClipCategory): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of KEYWORDS[category]) {
    const re = new RegExp(kw, "i");
    if (re.test(lower)) score += 3;
  }
  return score;
}

type ChanThread = {
  no?: number;
  sub?: string;
  com?: string;
  replies?: number;
  last_modified?: number;
  time?: number;
};

async function fetchBoardCatalog(
  board: string,
  category: ClipCategory,
): Promise<PoolPost[]> {
  try {
    const res = await fetch(`https://a.4cdn.org/${board}/catalog.json`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ClipBot/1.0)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const pages = (await res.json()) as { threads?: ChanThread[] }[];
    const results: PoolPost[] = [];
    for (const page of pages) {
      for (const t of page.threads ?? []) {
        if ((t.replies || 0) < 4) continue;
        const sub = cleanHtml(t.sub || "");
        const com = cleanHtml(t.com || "");
        const title = (sub || com.slice(0, 120) || `/${board}/ thread`).slice(0, 140);
        if (!t.no || !title) continue;
        const lower = title.toLowerCase();
        if (
          /(\bgen(eral)?\b|\bdaily\b|\bmegathread\b|\bsticky\b|index\b|\/smg\/|previous\s*>>)/.test(
            lower,
          )
        ) {
          continue;
        }
        if (com.length < 40) continue;
        const hay = `${sub} ${com}`;
        const kw = scoreText(hay, category);
        const score = kw * 10 + Math.min(t.replies || 0, 80);
        results.push({
          source: "4chan",
          board,
          category,
          title,
          no: t.no,
          url: `https://boards.4chan.org/${board}/thread/${t.no}`,
          replies: t.replies || 0,
          time: t.last_modified || t.time || 0,
          snippet: com.slice(0, 220),
          score,
        });
      }
    }
    results.sort((a, b) => b.score - a.score || b.replies - a.replies);
    return results;
  } catch {
    return [];
  }
}

type ChanPost = { sub?: string; com?: string };

function threadToTranscript(
  posts: ChanPost[],
  maxChars = 480,
): PoolPost["transcript"] | null {
  if (!posts.length) return null;
  const op = posts[0];
  const sub = cleanHtml(op.sub || "");
  let com = cleanHtml(op.com || "");
  const isWrapper =
    com.length < 50 ||
    /previous\s*>>/i.test(com) ||
    /(https?:\/\/\S+\s+){3,}/.test(com) ||
    /^educational\s|sites:|links:|streams?:/i.test(com);
  let from = "op";
  if (isWrapper) {
    for (let i = 1; i < posts.length; i++) {
      const rCom = cleanHtml(posts[i].com || "");
      if (rCom.length < 60) continue;
      if (/^>>\d+/.test(rCom)) continue;
      com = rCom;
      from = `reply ${i}`;
      break;
    }
  }
  if (com.length > maxChars) com = `${com.slice(0, maxChars).trim()}…`;
  return { sub, com, full: (sub ? `${sub}. ` : "") + com, from };
}

async function fetch4chanThread(board: string, no: number): Promise<ChanPost[]> {
  try {
    const res = await fetch(`https://a.4cdn.org/${board}/thread/${no}.json`, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: ChanPost[] };
    return data.posts ?? [];
  } catch {
    return [];
  }
}

async function enrichFourchan(pool: PoolPost[]): Promise<PoolPost[]> {
  const batches: PoolPost[][] = [];
  for (let i = 0; i < pool.length; i += 8) batches.push(pool.slice(i, i + 8));
  const enriched: PoolPost[] = [];
  for (const batch of batches) {
    const rows = await Promise.all(
      batch.map(async (p) => {
        const posts = await fetch4chanThread(p.board, p.no);
        if (!posts.length) return p;
        const transcript = threadToTranscript(posts, 480);
        if (!transcript) return p;
        const extra = scoreText(transcript.full, p.category);
        return { ...p, transcript, score: p.score + extra * 4 };
      }),
    );
    enriched.push(...rows);
  }
  return enriched;
}

function pickForMix(pool: PoolPost[]): PoolPost[] {
  const mix: [ClipCategory, number][] = [
    ["trading", 4],
    ["tech/ai", 3],
    ["hk/news", 3],
    ["lol/esports", 3],
    ["mma/fitness", 3],
    ["anime/culture", 3],
  ];
  const used = new Set<string>();
  const picked: PoolPost[] = [];
  for (const [cat, n] of mix) {
    const ranked = pool
      .filter((p) => p.category === cat && p.transcript?.full)
      .sort((a, b) => b.score - a.score);
    const withKw = ranked.filter(
      (p) => scoreText(`${p.title} ${p.transcript?.full || p.snippet}`, cat) > 0,
    );
    const ordered = withKw.length ? withKw : ranked;
    let added = 0;
    for (const p of ordered) {
      const id = `${p.board}/${p.no}`;
      if (used.has(id)) continue;
      used.add(id);
      picked.push(p);
      added += 1;
      if (added >= n) break;
    }
  }
  return picked;
}

export async function gatherSources(): Promise<{
  headlines: { title: string; url: string }[];
  pool: PoolPost[];
  stats: FeedStats;
}> {
  const catalogs: PoolPost[] = [];
  for (const spec of BOARD_SPECS) {
    const rows = await fetchBoardCatalog(spec.board, spec.category);
    catalogs.push(...rows.slice(0, spec.take));
    await new Promise((r) => setTimeout(r, 350));
  }
  const enriched = await enrichFourchan(catalogs);
  const pool = pickForMix(enriched);
  const fallback = enriched
    .filter((p) => p.transcript?.full)
    .sort((a, b) => b.score - a.score);
  const used = new Set(pool.map((p) => `${p.board}/${p.no}`));
  for (const p of fallback) {
    if (pool.length >= 19) break;
    const id = `${p.board}/${p.no}`;
    if (used.has(id)) continue;
    used.add(id);
    pool.push(p);
  }
  return {
    headlines: [],
    pool,
    stats: {
      fourchan: catalogs.length,
      hn: 0,
      headlines: 0,
      transcripts: pool.filter((p) => p.transcript).length,
    },
  };
}
