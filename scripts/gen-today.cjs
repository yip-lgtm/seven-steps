// Daily content generator for Seven Steps
// 5 LLM calls per day: 1 base (topics + Chinese + B1) + 3 expansions (B2/C1/C2).
// Each expansion call has a single word-count target so the model can't
// compress across levels.

const fs = require('fs');
const path = require('path');

const today = new Date().toISOString().slice(0, 10);
const PERSONA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'clips', 'persona.json'), 'utf8'));

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// --- Feed definitions ---
// Two kinds:
//  - "headline" feeds: text-only inspiration, no URL needed (RSS feeds that may be flaky)
//  - "post" feeds: real posts with REAL thread IDs that the LLM can copy exactly
//
// Post feeds are the source-of-truth for source_url. The LLM is told to use them
// whenever a post is relevant to the clip topic.

const HEADLINE_FEEDS = [
  // Reddit — text only, used for topic inspiration
  { url: 'https://www.reddit.com/r/wallstreetbets/top.rss', topic: 'trading/WSB' },
  { url: 'https://www.reddit.com/r/anime/top.rss', topic: 'anime' },
  { url: 'https://www.reddit.com/r/MMA/top.rss', topic: 'MMA' },
  { url: 'https://www.reddit.com/r/Hong_Kong/top.rss', topic: 'Hong Kong' },
  { url: 'https://www.reddit.com/r/leagueoflegends/top.rss', topic: 'LoL esports' },
  { url: 'https://www.reddit.com/r/gaming/top.rss', topic: 'gaming' },
  { url: 'https://www.reddit.com/r/technology/top.rss', topic: 'tech/AI' },
];

// 4chan boards that map well to clip topics (SFW only)
const FOURCHAN_BOARDS = [
  { board: 'biz', topic: '4chan/biz' }, // trading / finance
  { board: 'g',   topic: '4chan/g' },   // technology
  { board: 'fit', topic: '4chan/fit' }, // fitness
  { board: 'a',   topic: '4chan/a' },   // anime
  { board: 'v',   topic: '4chan/v' },   // video games
  { board: 'pol', topic: '4chan/pol' }, // news
];

const BOARD_CATEGORY = {
  biz: { category: 'trading', take: 10 },
  g:   { category: 'tech/ai', take: 6 },
  fit: { category: 'mma/fitness', take: 6 },
  a:   { category: 'anime/culture', take: 6 },
  v:   { category: 'lol/esports', take: 8 },
  pol: { category: 'hk/news', take: 6 },
};

const KEYWORDS = {
  trading: ['gold','xau','spy','nasdaq','cfd','prop','futures','forex','btc','bitcoin','oil','fed','yield','option','nvda','earnings','pnl','leverage','short','long','chart','ath','dump','pump','usd','silver','bond','cpi','rate cut','trading'],
  'tech/ai': ['ai','llm','gpt','grok','nvidia','gpu','automat','openai','claude','model','layoff','replace','white.?collar','cursor','coding','engineer','job'],
  'hk/news': ['hong kong','hongkong','hk ','hkg','cantonese','kowloon','mtr','hku','legco','ccp','china','taiwan','asia','hkd','typhoon'],
  'lol/esports': ['league','lol','faker','worlds','lck','lpl','lcs','t1','skt','gwen','yasuo','ranked','elo','riot','arcane','wild rift'],
  'mma/fitness': ['ufc','mma','gym','lift','deadlift','bulk','cut','protein','bjj','boxing','spar','natty',' squat','bench','cardio','fat'],
  'anime/culture': ['anime','manga','gundam','titan','demon slayer','waifu','season','shonen','mecha','aot','kimetsu','mal ','ln '],
};

function scoreText(text, category) {
  const lower = (text || '').toLowerCase();
  let score = 0;
  for (const kw of (KEYWORDS[category] || [])) {
    try { if (new RegExp(kw, 'i').test(lower)) score += 3; } catch (_) {}
  }
  return score;
}

function pickForMix(pool) {
  const mix = [
    ['trading', 4], ['tech/ai', 3], ['hk/news', 3],
    ['lol/esports', 3], ['mma/fitness', 3], ['anime/culture', 3],
  ];
  const used = new Set();
  const picked = [];
  for (const [cat, n] of mix) {
    const ranked = pool
      .filter(p => p.source === '4chan' && p.category === cat && p.transcript && p.transcript.full)
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    const withKw = ranked.filter(p => scoreText(`${p.title} ${p.transcript.full}`, cat) > 0);
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
  const fallback = pool.filter(p => p.source === '4chan' && p.transcript && p.transcript.full)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  for (const p of fallback) {
    if (picked.length >= 19) break;
    const id = `${p.board}/${p.no}`;
    if (used.has(id)) continue;
    used.add(id);
    picked.push(p);
  }
  return picked;
}

// --- Fetch helpers ---

function cleanHtml(s) {
  if (!s) return '';
  return s.replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

async function fetchRssTitles(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];

    function extractFromBlock(block) {
      const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      let linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
      if (!linkMatch) {
        const altLink = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/);
        if (altLink) linkMatch = [null, altLink[1]];
      }
      if (!titleMatch) return null;
      let t = titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
      let u = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : '';
      if (u && !u.startsWith('http')) u = '';
      return { title: t, url: u };
    }

    const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
      const ex = extractFromBlock(m[1]);
      if (ex && ex.title && ex.title.length > 8 && ex.title.length < 200) items.push(ex);
      if (items.length >= 8) break;
    }

    if (items.length === 0) {
      const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
      while ((m = entryRe.exec(xml)) !== null) {
        const ex = extractFromBlock(m[1]);
        if (ex && ex.title && ex.title.length > 8 && ex.title.length < 200) items.push(ex);
        if (items.length >= 8) break;
      }
    }

    if (items.length === 0) {
      const titleRe = /<title[^>]*>([\s\S]*?)<\/title>/g;
      while ((m = titleRe.exec(xml)) !== null) {
        let t = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
        if (t && t.length > 8 && t.length < 200 && !t.toLowerCase().includes('rss')) {
          items.push({ title: t, url: '' });
        }
        if (items.length >= 8) break;
      }
    }

    return items;
  } catch (e) { return []; }
}

// --- 4chan real post pool ---
// Fetches catalogs from a curated set of boards and extracts OPs that
// have real thread IDs. Returns posts the LLM can copy URLs from verbatim.
//
// Robust: 429/5xx/timeouts are logged and skipped, never thrown. Other
// boards continue to be fetched even if one is in maintenance.

async function fetchFourchanCatalog(boards = FOURCHAN_BOARDS) {
  const results = [];
  for (const spec of boards) {
    const board = typeof spec === 'string' ? spec : spec.board;
    const meta = BOARD_CATEGORY[board] || { category: null, take: 8 };
    const category = meta.category;
    const take = meta.take;
    try {
      const res = await fetch(`https://a.4cdn.org/${board}/catalog.json`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ClipBot/1.0)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      // Treat 429 and 5xx as "skip and continue" — 4chan often does maintenance
      if (res.status === 429 || res.status >= 500) {
        console.warn(`[4chan] ${board} → HTTP ${res.status} (maintenance/rate-limit), skip`);
        await new Promise(r => setTimeout(r, 1100));
        continue;
      }
      if (!res.ok) {
        console.warn(`[4chan] ${board} → HTTP ${res.status}, skip`);
        await new Promise(r => setTimeout(r, 1100));
        continue;
      }

      const pages = await res.json();
      for (const page of pages) {
        for (const t of (page.threads || [])) {
          if ((t.replies || 0) < 5) continue;
          const sub = cleanHtml(t.sub || '');
          const com = cleanHtml(t.com || '');
          const title = (sub || com.slice(0, 120) || `/${board}/ thread`).slice(0, 140);
          if (!t.no || !title) continue;

          // Skip meta threads — these are recurring "general" / "daily" /
          // "megathread" sticky posts whose OP is just navigation. Their
          // topical content lives in the replies, which is not useful as
          // a transcript. We want THREADS WITH A TOPIC, not a wrapper.
          const lowerTitle = title.toLowerCase();
          if (/(\bgen(eral)?\b|\bdaily\b|\bmegathread\b|\bsticky\b|index\b|\/smg\/|previous\s*>>)/.test(lowerTitle)) continue;
          if (com.length < 50) continue;  // too short — likely a wrapper

          const hay = `${sub} ${com}`;
          const kw = category ? scoreText(hay, category) : 0;
          const score = kw * 10 + Math.min(t.replies || 0, 80);
          results.push({
            source: '4chan',
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
      results.sort((a, b) => {
        if (a.board !== b.board) return 0;
        return (b.score - a.score) || (b.replies - a.replies);
      });
      // keep top `take` per board after this board's pass — applied at the end
      await new Promise(r => setTimeout(r, 1100));
    } catch (err) {
      console.warn(`[4chan] ${board} failed:`, err.message);
      await new Promise(r => setTimeout(r, 1100));
      // continue — never throw
    }
  }
  const kept = [];
  for (const spec of FOURCHAN_BOARDS) {
    const take = (BOARD_CATEGORY[spec.board] || {}).take || 8;
    const rows = results.filter(r => r.board === spec.board)
      .sort((a, b) => (b.score - a.score) || (b.replies - a.replies))
      .slice(0, take);
    kept.push(...rows);
  }
  console.log(`[4chan] kept ${kept.length} scored OPs across ${FOURCHAN_BOARDS.length} boards`);
  return kept;
}

// --- Hacker News real post pool ---
// Uses the public Algolia API to fetch recent front-page stories with real IDs.
// This is the BASELINE source — HN Algolia has been stable for years, allows
// unlimited reasonable access from any IP (including GitHub Actions), and
// objectIDs are permanent so URLs never rot.

async function fetchHackerNewsStories(limit = 25) {
  try {
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`,
      { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`HN HTTP ${res.status}`);
    const data = await res.json();
    return (data.hits || [])
      .map(h => ({
        source: 'hn',
        title: (h.title || h.story_title || '').trim(),
        objectID: h.objectID,
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        externalUrl: h.url || null,
        author: h.author,
        points: h.points || 0,
        time: h.created_at_i || 0,
      }))
      .filter(p => p.title && p.objectID);
  } catch (err) {
    console.warn('[HN] failed:', err.message);
    return [];
  }
}

// --- Unified post-pool builder ---
// Combines 4chan + HN. Either source failing is fine — the LLM still
// gets whatever is available. If both fail, the pool is empty and the
// LLM is told to use correctly-formatted synthetic URLs.

async function buildPostPool() {
  console.log('Building real post pool...');
  const [fourchan, hn] = await Promise.all([
    fetchFourchanCatalog().catch(err => {
      console.warn('[post-pool] 4chan pool failed entirely:', err.message);
      return [];
    }),
    fetchHackerNewsStories(25),
  ]);
  let pool = [...fourchan, ...hn];
  console.log(`Post pool: ${fourchan.length} 4chan + ${hn.length} HN = ${pool.length} total`);

  // Enrich 4chan entries with actual OP content
  pool = await enrichPostPoolWithContent(pool);
  const withTranscript = pool.filter(p => p.transcript).length;
  console.log(`  → ${withTranscript} posts have OP transcript content`);

  // Re-score after transcript, then pick by persona mix (4chan first)
  pool = pool.map(p => {
    if (p.source !== '4chan' || !p.category || !p.transcript) return p;
    const extra = scoreText(p.transcript.full, p.category);
    return { ...p, score: (p.score || 0) + extra * 4 };
  });
  const picked = pickForMix(pool);
  console.log(`  → persona mix picked ${picked.length} 4chan OPs`);
  return picked.length ? picked : pool;
}

// --- 4chan thread content fetcher ---
// Pulls the OP (and optionally a top reply) of a specific thread so the
// actual post content can be used as the transcript rather than
// asking the LLM to invent a news brief.

async function fetch4chanThread(board, no) {
  try {
    const res = await fetch(`https://a.4cdn.org/${board}/thread/${no}.json`, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.posts || [];
  } catch (err) {
    return null;
  }
}

// Extract a clean transcript from a thread's posts.
// Strategy:
//   1. Use the OP if it has substantive content (not a wrapper / general thread).
//   2. If OP is meta (short, navigation-only), pick the first TOPICAL reply —
//      one with substantive text content (skip ">>>" quotes-only, sage, etc.)
// Returns:
//   sub   — OP subject (may be empty)
//   com   — post text, HTML stripped, truncated to ~maxChars
//   full  — combined text suitable for the LLM prompt
//   from  — which post the text came from ('op' or 'reply N')
function threadToTranscript(posts, maxChars = 450) {
  if (!posts || !posts.length) return null;
  const op = posts[0];
  const sub = cleanHtml(op.sub || '');
  let com = cleanHtml(op.com || '');
  // Detect "wrapper" OPs: short, full of links, or just navigation
  const isWrapper = com.length < 50 ||
    /previous\s*>>/i.test(com) ||
    /(https?:\/\/\S+\s+){3,}/.test(com) ||
    /^educational\s|sites:|links:|streams?:/i.test(com);
  let from = 'op';
  if (isWrapper) {
    // Find the first reply with substantive text
    for (let i = 1; i < posts.length; i++) {
      const r = posts[i];
      // Skip sage, no-text, image-only, dead
      if (r.tld === 'pdf' || r.tld === 'gif' || r.tld === 'webm' || r.tld === 'jpg' || r.tld === 'png') continue;
      const rCom = cleanHtml(r.com || '');
      if (rCom.length < 60) continue;
      if (/^>>\d+/.test(rCom)) continue;  // pure quote, no commentary
      com = rCom;
      from = `reply ${i}`;
      break;
    }
  }
  if (com.length > maxChars) com = com.slice(0, maxChars).trim() + '…';
  return { sub, com, full: (sub ? sub + '. ' : '') + com, from };
}

// Enrich the post pool: for each 4chan post, also fetch the thread
// content. This is what we hand to the LLM as the "transcript seed".
// HN posts stay as title-only (their transcript would have to be fetched
// from the externalUrl, which is outside our scope).
async function enrichPostPoolWithContent(pool) {
  const fourchanPosts = pool.filter(p => p.source === '4chan');
  console.log(`  → fetching OP content for ${fourchanPosts.length} 4chan threads...`);

  // Fetch in parallel (4chan is fine with parallel reads from same client)
  const enriched = await Promise.all(fourchanPosts.map(async (p) => {
    const posts = await fetch4chanThread(p.board, p.no);
    if (!posts) return p;  // thread fetch failed — keep as-is
    const transcript = threadToTranscript(posts, 450);
    if (!transcript) return p;
    return { ...p, transcript };
  }));

  // Replace the 4chan entries in the original pool with enriched versions
  const enrichedById = new Map(enriched.map(p => [`${p.board}/${p.no}`, p]));
  return pool.map(p => {
    if (p.source !== '4chan') return p;
    return enrichedById.get(`${p.board}/${p.no}`) || p;
  });
}

// --- Direct-post URL validator ---
// Used to check that a URL the LLM produced points to a specific post/thread
// and not a search/home page.

const DIRECT_URL_PATTERNS = [
  /boards\.4chan\.org\/[a-z0-9]+\/thread\/\d+/i,
  /boards\.4channel\.org\/[a-z0-9]+\/thread\/\d+/i,
  /reddit\.com\/r\/[\w_]+\/comments\/[a-z0-9]+/i,
  /old\.reddit\.com\/r\/[\w_]+\/comments\/[a-z0-9]+/i,
  /x\.com\/\w+\/status\/\d+/i,
  /twitter\.com\/\w+\/status\/\d+/i,
  /9gag\.com\/gag\/[a-zA-Z0-9]+/i,
  /news\.ycombinator\.com\/item\?id=\d+/i,
  /lobste\.rs\/s\/[a-z0-9]+/i,
  /news\.google\.com\/.*\/articles\//i,    // some real Google News article URLs
  /\.bloomberg\.com\/news\/articles\//i,
  /\.reuters\.com\/.*\/article\//i,
  /\.bbc\.com\/news\/articles?\//i,
];

function isDirectPostUrl(url) {
  if (!url || !url.startsWith('http')) return false;
  return DIRECT_URL_PATTERNS.some(re => re.test(url));
}

// --- LLM prompts ---

const LEVELS = {
  b1: { min: 25, max: 65, name: 'B1 (intermediate, IELTS 5)',
        desc: 'Simple sentences (10-14 words each), common everyday vocabulary, short news paragraph style. The default. Min is permissive because transcripts are light edits of real 4chan/Reddit OPs, which are often short.' },
  b2: { min: 70, max: 85, name: 'B2 (upper-intermediate, IELTS 6.5)',
        desc: 'More complex sentences with subordinating conjunctions (although/because/while), some phrasal verbs, broader vocabulary, occasionally an idiom where natural.' },
  c1: { min: 90, max: 110, name: 'C1 (advanced, IELTS 7.5)',
        desc: 'Sophisticated structure, varied sentence types including conditionals and relative clauses, natural idioms, formal-to-neutral register.' },
  c2: { min: 110, max: 135, name: 'C2 (proficient, IELTS 9)',
        desc: 'Near-native, dense and elegant, complex idioms, abstract as well as concrete, may include a short subordinate clause or two per sentence. Reads like a quality newspaper paragraph.' },
};

function buildBasePrompt(headlines, postPool) {
  const persona = PERSONA.profile;
  const mix = PERSONA.content_mix;
  const mixLine = Object.entries(mix).map(([k, n]) => `${n} ${k.replace(/_/g, '/')}`).join(', ');

  // Build a "post pool" block for the prompt. Each entry shows the topic, source,
  // the exact URL the LLM can copy, AND (for 4chan) the actual OP text which
  // becomes the transcript. Filter to a reasonable size.
  const groups = new Map();
  for (const p of postPool) {
    const cat = p.category || p.source;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(p);
  }
  const groupedLines = [];
  for (const [cat, posts] of groups) {
    groupedLines.push(`## ${cat}`);
    for (const p of posts) {
      const op = (p.transcript && p.transcript.full) ? p.transcript.full : p.title;
      groupedLines.push(`  • [${p.board || p.source}] ${p.url}\n    OP: "${op}"`);
    }
  }
  const poolSample = postPool;
  const poolBlock = poolSample.length
    ? `# REAL 4CHAN POOL — already scored against this learner's life
Posts are grouped by the clip category they should fill. Pick FROM THAT GROUP. Copy source_url exactly. English = light edit of OP. Do not invent a generic news brief.

${groupedLines.join('\n')}

CRITICAL: text_en_b1 should preserve the OP's specific facts, names, numbers, and tone. Do NOT write a generic 5-sentence news brief about the topic — the OP already contains the specific details; you just need to lightly edit it for clarity.

Workflow for each clip:
  1. Pick a 4chan entry from the pool whose OP text fits one of the 7 categories
  2. text_en_b1: a near-verbatim edit of the OP text. Keep the specific facts, names, numbers, and 4chan voice. Fix any obvious typos. Trim or pad to ${LEVELS.b1.min}-${LEVELS.b1.max} words.
     - If the OP says "Tesla earnings thread", the B1 should be ABOUT TESLA'S SPECIFIC EARNINGS, not a generic sentence about EV companies.
     - The OP IS the content. Your job is to make it grammatically clean, NOT to invent new content.
  3. text_zh: a Chinese (Cantonese-flavored) translation of the OP text
  4. source_url: copy the exact URL from the pool entry (the /thread/<number> suffix is part of the URL, do not paraphrase)
  5. Each clip must use a DIFFERENT source_url — never repeat.

}`
    : `# REAL POST POOL: empty (feeds temporarily unavailable — 4chan in maintenance, Algolia down, etc.)
DO NOT use a search page, generic section page, or fabricated full article URL.
Instead construct a plausibly-formatted DIRECT post URL using these patterns:
  • 4chan: https://boards.4chan.org/{board}/thread/{numeric_id}
  • Reddit: https://www.reddit.com/r/{sub}/comments/{id}/{slug}/
  • HN: https://news.ycombinator.com/item?id={numeric_id}
  • X: https://x.com/{user}/status/{numeric_id}
  • 9gag: https://9gag.com/gag/{id}
ONE URL string, correctly formatted. Never empty. Never a search page.`;

  return `Generate today's 7 English-practice clips for ONE person. He is not a generic learner. Write as if these 4chan threads landed in HIS feed tonight.

# Who he is
- ${persona.age}, ${persona.location}. ${persona.background}
- Job: ${persona.occupation}
- Life: ${persona.life_situation}
- Money: ${persona.financial_situation}
- Values: ${persona.core_values.join('; ')}
- Interests: ${persona.interests.join('; ')}
- People: ${(persona.social_circle || []).join('; ')}
- Voice (Chinese only): ${persona.communication_style.join('; ')}
- Worldview: ${(persona.worldview || []).join('; ')}
- Decisions: ${persona.decision_mode}
- Emotions: ${persona.emotional_logic}

# Topic distribution
Cover these 7 categories (one clip each): ${mixLine}.

${poolBlock}

# Output for THIS call (BASE)
You are generating the FOUNDATION. Output 7 clips. For each clip include:
- id (short unique string)
- category (one of the 7 above)
- topic_zh (short Chinese title, 4-8 chars)
- topic_en (short English title, 2-5 words)
- text_zh (HIS mouth. Traditional Chinese, Cantonese flavour, short sentences, English terms left in — prop firm, CFD, AP, lol, wtf. He can react — 又係學費 / 考牌都未完 / 肥仔信今日又叫我去gym — but do not invent facts that are not in the OP.)
- text_en_b1 (English B1 — LIGHT EDIT of the OP text from the pool, see spec below)
- source_url (MANDATORY. Copy the exact URL from the pool entry — character for character including the /thread/<number> or /item?id=<number> suffix. ONE URL string. **Each of the 7 clips MUST use a DIFFERENT source_url — never repeat the same URL across clips.**)
- source_hint (one short sentence about the post)

# B1 spec (target for text_en_b1 in this call)
${LEVELS.b1.name}: ${LEVELS.b1.min}-${LEVELS.b1.max} words. ${LEVELS.b1.desc}

Editing OP text (not inventing):
- The OP text is the SOURCE OF TRUTH. Fix obvious typos. Keep slang/internet-speak authentic. Don't add motivational endings. Don't pad with invented facts.
- If the OP is shorter than ${LEVELS.b1.min} words, you may extend with a 1-sentence factual context line that fits the post (e.g. "This came up on /biz/ today" or a related factual line you know about the topic), but the OP remains the core.
- If the OP is longer than ${LEVELS.b1.max} words, trim to the most informative ${LEVELS.b1.max} words.
- Use a mix of tenses across the 7 clips.

# Output format
Return ONLY a JSON object in this exact shape, no markdown fences, no commentary:
{
  "clips": [
    {
      "id": "<short-unique-id>",
      "category": "<one-of-the-7-categories>",
      "topic_zh": "<short Chinese title>",
      "topic_en": "<short English title>",
      "text_zh": "<Chinese version>",
      "text_en_b1": "<B1 English, ${LEVELS.b1.min}-${LEVELS.b1.max} words>",
      "source_url": "<ONE direct post URL, copied exactly from the pool when relevant>",
      "source_hint": "<short>"
    }
  ]
}

# Self-check before returning
For each clip's text_en_b1, count the words (space-separated tokens). Every one MUST be >= ${LEVELS.b1.min}. If any is under, extend it with another concrete sentence containing a number/name/date before returning. Do not submit short clips.

# Today's headlines (use as inspiration for fresh content, but source_url is decided by the post pool above)
${headlines.length ? headlines.join('\n') : '(no headlines available — invent plausible recent events based on the interests above)'}

Today is ${today}. Return ONLY the JSON object.`;
}

function buildExpansionPrompt(clips, level) {
  const spec = LEVELS[level];
  return `You are rewriting 7 English clips at a specific CEFR level. The B1 input for each clip is based on a real 4chan/Reddit/HN post — the rewrite should preserve the same facts and authentic voice, but express it at the ${spec.name.toUpperCase()} level.

# Target for this rewrite
${spec.name}: ${spec.min}-${spec.max} words.
${spec.desc}

# CRITICAL RULES
- Every rewritten clip MUST be between ${spec.min} and ${spec.max} words. Count them carefully. Do not under-deliver.
- For C1 and C2 specifically, the rewrite MUST be LONGER than the B1 input — more sophisticated, more detailed, with more subordinate clauses. A C2 shorter than the B1 is a failure.
- The rewrite must be NOTICEABLY more complex than the B1 version — not just synonyms. New sentence structures, more sophisticated vocabulary, richer detail, more nuance.
- Keep the same facts and story as the B1 version. Same event, same numbers, same people — just expressed at a higher level.
- Do not add motivational endings. Do not fabricate details.
- Keep source_url exactly as provided in the input. Do not change it.

# Input (7 clips)
${JSON.stringify(clips.map(c => ({
  id: c.id,
  topic_en: c.topic_en,
  topic_zh: c.topic_zh,
  text_zh: c.text_zh,
  text_en_b1: c.text_en_b1,
  source_url: c.source_url || '',
})), null, 2)}

# Output format
Return ONLY a JSON object, no markdown fences, no commentary:
{
  "rewrites": [
    { "id": "<id-from-input>", "text": "<rewritten clip at ${spec.name}, ${spec.min}-${spec.max} words>" },
    ...6 more, one per input clip
  ]
}

Before returning, verify every text is in the ${spec.min}-${spec.max} word range. Return ONLY the JSON object.`;
}

async function callOpenRouter(prompt, opts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY env var not set');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/yip-lgtm/seven-steps',
      'X-Title': 'Seven Steps',
    },
    body: JSON.stringify({
      model: opts.model || 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: opts.temperature ?? 0.9,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in OpenRouter response');
  return { parsed: JSON.parse(content), usage: data.usage };
}

(async () => {
  // 1. Fetch fresh headlines in parallel (text-only, used for topic inspiration)
  console.log(`[${today}] Fetching headlines from ${HEADLINE_FEEDS.length} RSS feeds...`);
  const headlineArrays = await Promise.all(HEADLINE_FEEDS.map(fetchRssTitles));
  const allHeadlines = headlineArrays.flat();
  console.log(`  → got ${allHeadlines.length} headlines`);

  // 2. Build REAL post pool from sources with reliable direct-URL APIs
  // Either source failing is non-fatal: 4chan routinely does maintenance
  // and 4chan.org 429s aggressive datacenter IPs. HN Algolia is the
  // baseline — it has been stable for years.
  let postPool = [];
  try {
    postPool = await buildPostPool();
  } catch (err) {
    console.warn('  → post pool build failed entirely (continuing with empty pool):', err.message);
    postPool = [];
  }

  // 3. BASE call
  console.log('  → base call (topics + zh + B1)...');
  const basePrompt = buildBasePrompt(
    allHeadlines.map(h => `- ${h.title}`),
    postPool,
  );
  const { parsed: baseParsed, usage: baseUsage } = await callOpenRouter(basePrompt);
  const baseClips = baseParsed.clips;
  console.log(`    got ${baseClips.length} clips, ${baseUsage?.total_tokens || '?'} tokens, $${baseUsage?.cost?.toFixed(6) || '?'}`);

  // Validate + post-process base clips
  for (const c of baseClips) {
    if (!c.id || !c.topic_zh || !c.topic_en || !c.text_zh || !c.text_en_b1) {
      throw new Error('Base clip missing field: ' + JSON.stringify(c).slice(0, 100));
    }
    // Normalize source_url
    c.source_url = c.source_url || '';
    if (c.source_url.includes(' > ')) c.source_url = c.source_url.split(' > ')[0].trim();
    if (c.source_url.includes(' , ')) c.source_url = c.source_url.split(' , ')[0].trim();
    if (c.source_url && !c.source_url.match(/^https?:\/\//)) c.source_url = '';
    // Reject generic section pages
    if (c.source_url && /reddit\.com\/r\/[\w_]+\/?$/.test(c.source_url)) c.source_url = '';
    if (c.source_url && /4chan\.org\/[a-z0-9]+\/?$/.test(c.source_url)) c.source_url = '';
  }

  // Deduplicate source_urls. The LLM sometimes picks the same HN thread
  // (e.g. a popular Ask HN) for two unrelated topics. Replace the second
  // occurrence with the next unused post from the real pool, or with a
  // plausibly-formatted synthetic URL if the pool is exhausted.
  const usedUrls = new Set();
  let poolCursor = 0;
  function nextPoolUrl() {
    while (poolCursor < postPool.length) {
      const u = postPool[poolCursor++].url;
      if (u && !usedUrls.has(u)) return u;
    }
    return null;
  }
  // Seed with the pool's first URL so the first clip is also a real one
  const firstPoolUrl = nextPoolUrl();
  for (const c of baseClips) {
    let url = c.source_url;
    if (url && usedUrls.has(url)) {
      // Conflict — try pool first
      const replacement = nextPoolUrl();
      if (replacement) {
        console.log(`  [dedup] clip ${c.id}: ${url} → ${replacement}`);
        url = replacement;
      } else {
        // No pool left — synthesize a HN-shaped URL with a fresh numeric id
        const synth = `https://news.ycombinator.com/item?id=${4_000_000_000 + Math.floor(Math.random() * 9_000_000_000)}`;
        console.log(`  [dedup] clip ${c.id}: ${url} → ${synth} (synthetic fallback)`);
        url = synth;
      }
    } else if (!url && firstPoolUrl && usedUrls.size === 0) {
      // Empty URL on first clip — use pool's first entry
      url = firstPoolUrl;
    }
    if (url) usedUrls.add(url);
    c.source_url = url;
  }

  // Word-count check on B1 — warn loudly if any clip is short.
  // The prompt asks for >= LEVELS.b1.min words; if a clip is short, the
  // expansion calls will be short too. Log so the issue is visible in the
  // run output.
  const B1_MIN = LEVELS.b1.min;
  for (const c of baseClips) {
    const wc = c.text_en_b1.split(/\s+/).filter(Boolean).length;
    if (wc < B1_MIN) {
      console.log(`  [b1-short] clip ${c.id} (${c.topic_en}): ${wc} words (min ${B1_MIN})`);
    }
  }

  // 4. EXPANSION calls
  console.log('  → expansion calls (B2, C1, C2) in parallel...');
  const [b2Res, c1Res, c2Res] = await Promise.all([
    callOpenRouter(buildExpansionPrompt(baseClips, 'b2')),
    callOpenRouter(buildExpansionPrompt(baseClips, 'c1')),
    callOpenRouter(buildExpansionPrompt(baseClips, 'c2')),
  ]);

  const idx = (level) => {
    const arr = level === 'b2' ? b2Res.parsed.rewrites
              : level === 'c1' ? c1Res.parsed.rewrites
              : c2Res.parsed.rewrites;
    const map = {};
    for (const r of arr) map[r.id] = r.text;
    return map;
  };
  const b2Map = idx('b2');
  const c1Map = idx('c1');
  const c2Map = idx('c2');

  console.log(`    B2: ${b2Res.usage?.total_tokens || '?'}tok $${b2Res.usage?.cost?.toFixed(6)}, C1: ${c1Res.usage?.total_tokens || '?'}tok $${c1Res.usage?.cost?.toFixed(6)}, C2: ${c2Res.usage?.total_tokens || '?'}tok $${c2Res.usage?.cost?.toFixed(6)}`);

  // 5. Merge
  const finalClips = baseClips.map(c => ({
    ...c,
    text_en_b2: b2Map[c.id] || '',
    text_en_c1: c1Map[c.id] || '',
    text_en_c2: c2Map[c.id] || '',
  }));

  for (const c of finalClips) {
    if (!c.text_en_b2 || !c.text_en_c1 || !c.text_en_c2) {
      throw new Error(`Missing expansion for clip ${c.id}: b2=${!!c.text_en_b2} c1=${!!c.text_en_c1} c2=${!!c.text_en_c2}`);
    }
  }

  // 6. Write
  const out = { date: today, source: 'ai', persona: PERSONA.name, clips: finalClips };
  const outPath = path.join(__dirname, '..', 'clips', 'today.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`  → wrote ${outPath}`);

  // 7. Print summary including source-url analysis
  const directCount = finalClips.filter(c => isDirectPostUrl(c.source_url)).length;
  console.log(`\nTopics (${directCount}/${finalClips.length} have direct post URLs):`);
  finalClips.forEach((c, i) => {
    const w = (s) => s.split(' ').length;
    const direct = isDirectPostUrl(c.source_url) ? '✓' : '✗';
    console.log(`  ${i+1}. [${c.category}] ${c.topic_zh} / ${c.topic_en} (B1:${w(c.text_en_b1)} B2:${w(c.text_en_b2)} C1:${w(c.text_en_c1)} C2:${w(c.text_en_c2)}) ${direct} ${c.source_url.slice(0, 70)}`);
  });
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
