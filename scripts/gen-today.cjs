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
  { board: 'biz', topic: '4chan/biz' },     // trading / finance
  { board: 'g',   topic: '4chan/g' },        // technology
  { board: 'fit', topic: '4chan/fit' },      // fitness
  { board: 'a',   topic: '4chan/a' },        // anime
  { board: 'v',   topic: '4chan/v' },        // video games
  { board: 'pol', topic: '4chan/pol' },      // news
];

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

async function fetch4chanCatalog(board) {
  try {
    const res = await fetch(`https://a.4cdn.org/${board}/catalog.json`, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const pages = await res.json();
    const threads = [];
    for (const page of pages) {
      for (const t of (page.threads || [])) threads.push(t);
    }
    return threads;
  } catch (e) { return []; }
}

async function buildFourchanPool(maxPerBoard = 6, minReplies = 5) {
  const pool = [];
  for (const { board, topic } of FOURCHAN_BOARDS) {
    const threads = await fetch4chanCatalog(board);
    if (!threads.length) continue;
    // Filter sticky + closed + too few replies
    const usable = threads.filter(t =>
      !t.sticky && !t.closed && (t.replies || 0) >= minReplies
    );
    // Sort by replies (active threads first)
    usable.sort((a, b) => (b.replies || 0) - (a.replies || 0));
    for (const t of usable.slice(0, maxPerBoard)) {
      const sub = cleanHtml(t.sub || '');
      const com = cleanHtml(t.com || '');
      const title = (sub || (com.slice(0, 120) || `/${board}/ thread`)).slice(0, 140);
      if (!t.no || !title) continue;
      pool.push({
        source: '4chan',
        board,
        topic,
        title,
        no: t.no,
        url: `https://boards.4chan.org/${board}/thread/${t.no}`,
        replies: t.replies || 0,
        snippet: com.slice(0, 220),
      });
    }
  }
  return pool;
}

// --- Hacker News real post pool ---
// Uses the public Algolia API to fetch recent front-page stories with real IDs.

async function buildHackerNewsPool(maxStories = 10) {
  try {
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${maxStories}`,
      { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const pool = [];
    for (const hit of (data.hits || [])) {
      if (!hit.objectID) continue;
      const title = (hit.title || '').trim();
      if (!title) continue;
      pool.push({
        source: 'hn',
        title,
        objectID: hit.objectID,
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        author: hit.author,
        points: hit.points || 0,
        snippet: (hit._highlightResult?.commentText?.value || '').replace(/<[^>]+>/g, '').slice(0, 220),
      });
    }
    return pool;
  } catch (e) { return []; }
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
  b1: { min: 45, max: 65, name: 'B1 (intermediate, IELTS 5)',
        desc: 'Simple sentences (10-14 words each), common everyday vocabulary, short news paragraph style. The default.' },
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
  // and the exact URL the LLM can copy. Filter to a reasonable size.
  const poolSample = postPool.slice(0, 40);
  const poolBlock = poolSample.length
    ? `# REAL POST POOL (HIGHEST PRIORITY for source_url)
The following are real posts currently live on 4chan and Hacker News, with real thread IDs. If any of these posts is reasonably related to a clip topic, COPY THE EXACT URL — character for character, including the /thread/<number> or /item?id=<number> suffix. Do not invent or paraphrase.

${poolSample.map(p => `  • [${p.source}/${p.board || ''}] ${p.title.slice(0, 100)} — ${p.url}`).join('\n')}`
    : `# NO REAL POSTS available right now. If no headline below matches, construct a plausible but correctly formatted direct post URL using these patterns:
  • Reddit: https://www.reddit.com/r/{sub}/comments/{id}/{slug}/
  • 4chan: https://boards.4chan.org/{board}/thread/{id}
  • 9gag: https://9gag.com/gag/{id}
  • X: https://x.com/{user}/status/{id}
  • HN: https://news.ycombinator.com/item?id={id}`;

  return `You are generating daily English learning content for a ${persona.age}-year-old Hong Kong learner whose interests are below. The content should be FRESH, INTERESTING, and EDGY — drawing from what people actually talk about on Reddit, 4chan, LIHKG, and finance Twitter. Not bland corporate news.

# Learner profile
- Background: ${persona.background}
- Occupation: ${persona.occupation}
- Values: ${persona.core_values.join('; ')}
- Life situation: ${persona.life_situation}
- Financial situation: ${persona.financial_situation}
- Interests: ${persona.interests.join('; ')}
- Communication style: ${persona.communication_style.join('; ')}
- Decision mode: ${persona.decision_mode}
- Emotional logic: ${persona.emotional_logic}

# Topic distribution
Cover these 7 categories (one clip each): ${mixLine}.

${poolBlock}

# Output for THIS call (BASE)
You are generating the FOUNDATION. Output 7 clips. For each clip include:
- id (short unique string)
- category (one of the 7 above)
- topic_zh (short Chinese title, 4-8 chars)
- topic_en (short English title, 2-5 words)
- text_zh (1-2 sentence Chinese, 80-120 Chinese characters, Cantonese-flavored)
- text_en_b1 (English B1 — see level spec below)
- source_url (MANDATORY. ONE direct link to a specific post/thread/article. NOT a search page, NOT a section/home page. If a real post from the pool above is relevant, COPY ITS URL EXACTLY. Otherwise construct a plausibly-formatted direct post URL using the patterns given. ONE URL string, no lists.)
- source_hint (one short sentence about the real event)

# B1 spec (target for text_en_b1 in this call)
${LEVELS.b1.name}: ${LEVELS.b1.min}-${LEVELS.b1.max} words. ${LEVELS.b1.desc}
- HARD WORD COUNT: every text_en_b1 must be at least ${LEVELS.b1.min} words. Count them. If any is short, add another concrete sentence with a number, name, or date until it is in range.
- A short B1 is a failure. Do not produce 20-word summaries.
- Use a mix of tenses across the 7 clips.
- Each clip must have at least one specific concrete detail (a number, a name, a place, a date) so it feels like a real news event.
- Tone: factual but with personality, like a Bloomberg brief written by someone who browses Reddit.
- DO NOT add motivational endings like "stay focused!" or "keep trading!" — these are news briefs, not pep talks.

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

# Today's headlines (use as inspiration for fresh content, but source_url is decided by the post pool above)
${headlines.length ? headlines.join('\n') : '(no headlines available — invent plausible recent events based on the interests above)'}

Today is ${today}. Return ONLY the JSON object.`;
}

function buildExpansionPrompt(clips, level) {
  const spec = LEVELS[level];
  return `You are rewriting 7 English news clips at a specific CEFR level. You will be given the B1 version of each clip plus its Chinese translation and topic. Your job: rewrite each clip at the ${spec.name.toUpperCase()} level.

# Target for this rewrite
${spec.name}: ${spec.min}-${spec.max} words.
${spec.desc}

# CRITICAL RULES
- Every rewritten clip MUST be between ${spec.min} and ${spec.max} words. Count them carefully. Do not under-deliver.
- For C1 and C2 specifically, the rewrite MUST be LONGER than the B1 input — more sophisticated, more detailed, with more subordinate clauses. A C2 shorter than the B1 is a failure.
- The rewrite must be NOTICEABLY more complex than the B1 version — not just synonyms. New sentence structures, more sophisticated vocabulary, richer detail, more nuance.
- Keep the same facts and story as the B1 version. Same event, same numbers, same people — just expressed at a higher level.
- Do not add motivational endings.
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
  console.log('  → building real post pool (4chan + Hacker News)...');
  const [fourchanPool, hnPool] = await Promise.all([
    buildFourchanPool(6, 5),
    buildHackerNewsPool(12),
  ]);
  const postPool = [...fourchanPool, ...hnPool];
  console.log(`    4chan: ${fourchanPool.length} threads, HN: ${hnPool.length} stories`);

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
