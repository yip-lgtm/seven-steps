// Daily content generator for Seven Steps
// 5 LLM calls per day: 1 base (topics + Chinese + B1) + 3 expansions (B2/C1/C2).
// Each expansion call has a single word-count target so the model can't
// compress across levels.

const fs = require('fs');
const path = require('path');

const today = new Date().toISOString().slice(0, 10);
const PERSONA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'clips', 'persona.json'), 'utf8'));

const FEEDS = [
  // Reddit — use a browser-like User-Agent to avoid 429/403 blocks
  { url: 'https://www.reddit.com/r/wallstreetbets/top.rss', topic: 'trading/WSB', source: 'rss' },
  { url: 'https://www.reddit.com/r/anime/top.rss', topic: 'anime', source: 'rss' },
  { url: 'https://www.reddit.com/r/MMA/top.rss', topic: 'MMA', source: 'rss' },
  { url: 'https://www.reddit.com/r/Hong_Kong/top.rss', topic: 'Hong Kong', source: 'rss' },
  { url: 'https://www.reddit.com/r/leagueoflegends/top.rss', topic: 'LoL esports', source: 'rss' },
  { url: 'https://www.reddit.com/r/gaming/top.rss', topic: 'gaming', source: 'rss' },
  { url: 'https://www.reddit.com/r/funny/top.rss', topic: 'internet culture', source: 'rss' },
  { url: 'https://www.reddit.com/r/technology/top.rss', topic: 'tech/AI', source: 'rss' },
  // 4chan — SFW boards only
  { url: 'https://a.4chan.org/biz/catalog.json', topic: '4chan/biz', source: '4chan', board: 'biz' },
  { url: 'https://a.4chan.org/fit/catalog.json', topic: '4chan/fit', source: '4chan', board: 'fit' },
  { url: 'https://a.4chan.org/vg/catalog.json', topic: '4chan/vg', source: '4chan', board: 'vg' },
  { url: 'https://a.4chan.org/a/catalog.json', topic: '4chan/a', source: '4chan', board: 'a' },
];

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchTitles(feed) {
  try {
    if (feed.source === '4chan') return await fetch4chanTitles(feed);
    return await fetchRssTitles(feed);
  } catch (e) { return []; }
}

async function fetchRssTitles(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const items = [];

  // Helper: extract title and link from a block of XML
  function extractFromBlock(block) {
    // RSS 2.0 uses <title> and <link>; ATOM uses <title> and <link rel="alternate" href="..."/>
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    let linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    if (!linkMatch) {
      // ATOM alt link
      const altLink = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/);
      if (altLink) linkMatch = [null, altLink[1]];
    }
    if (!titleMatch) return null;
    let t = titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
    let u = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : '';
    if (u && !u.startsWith('http')) u = '';
    return { title: t, url: u };
  }

  // Try RSS <item> blocks first
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const extracted = extractFromBlock(m[1]);
    if (extracted && extracted.title && extracted.title.length > 8 && extracted.title.length < 200) {
      items.push(extracted);
    }
    if (items.length >= 8) break;
  }

  // Try ATOM <entry> blocks if RSS didn't yield anything
  if (items.length === 0) {
    const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
    while ((m = entryRe.exec(xml)) !== null) {
      const extracted = extractFromBlock(m[1]);
      if (extracted && extracted.title && extracted.title.length > 8 && extracted.title.length < 200) {
        items.push(extracted);
      }
      if (items.length >= 8) break;
    }
  }

  // Final fallback: just grab titles
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

  return items.map(it => `- [${feed.topic}] ${it.title}${it.url ? ` — ${it.url}` : ''}`);
}

async function fetch4chanTitles(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const pages = await res.json();
  const items = [];
  for (const page of pages) {
    for (const thread of (page.threads || [])) {
      if (thread.sticky) continue;
      const subject = (thread.sub || '').trim();
      const com = (thread.com || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
      const t = (subject || com.split('. ')[0] || '').slice(0, 150);
      const u = thread.no ? `https://boards.4chan.org/${feed.board || ''}/thread/${thread.no}` : '';
      if (t && t.length > 8 && t.length < 200) items.push({ title: t, url: u });
      if (items.length >= 8) break;
    }
    if (items.length >= 8) break;
  }
  return items.map(it => `- [${feed.topic}] ${it.title}${it.url ? ` — ${it.url}` : ''}`);
}

// Level targets — calibrated to what the LLM reliably hits in a focused
// single-level call. Tighter than this and the model starts padding.
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

function buildBasePrompt(headlines) {
  const persona = PERSONA.profile;
  const mix = PERSONA.content_mix;
  const mixLine = Object.entries(mix).map(([k, n]) => `${n} ${k.replace(/_/g, '/')}`).join(', ');

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

# Output for THIS call (BASE)
You are generating the FOUNDATION. Output 7 clips. For each clip include:
- id (short unique string)
- category (one of the 7 above)
- topic_zh (short Chinese title, 4-8 chars)
- topic_en (short English title, 2-5 words)
- text_zh (1-2 sentence Chinese, 80-120 Chinese characters, Cantonese-flavored)
- text_en_b1 (English B1 — see level spec below)
- source_url (MANDATORY. Return ONE URL only. Pick the best option: 1) the exact URL from a matching headline below, 2) a Google News search URL like https://news.google.com/search?q=US+stocks+rebound — which always returns current results, 3) a real outlet section page. NEVER empty. NEVER a list of URLs joined by '>' or commas. ONE URL string only.)
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
      "source_url": "<SINGLE URL string, never empty>",
      "source_hint": "<short>"
    }
  ]
}

# Today's headlines (use as inspiration for fresh content)
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
  // 1. Fetch fresh headlines in parallel
  console.log(`[${today}] Fetching headlines from ${FEEDS.length} feeds...`);
  const headlineArrays = await Promise.all(FEEDS.map(fetchTitles));
  const allHeadlines = headlineArrays.flat();
  console.log(`  → got ${allHeadlines.length} headlines`);

  // 2. BASE call: 7 clips with topics, Chinese, B1
  console.log('  → base call (topics + zh + B1)...');
  const basePrompt = buildBasePrompt(allHeadlines);
  const { parsed: baseParsed, usage: baseUsage } = await callOpenRouter(basePrompt);
  const baseClips = baseParsed.clips;
  console.log(`    got ${baseClips.length} clips, ${baseUsage?.total_tokens || '?'} tokens, $${baseUsage?.cost?.toFixed(6) || '?'}`);

  // Validate base
  for (const c of baseClips) {
    if (!c.id || !c.topic_zh || !c.topic_en || !c.text_zh || !c.text_en_b1) {
      throw new Error('Base clip missing field: ' + JSON.stringify(c).slice(0, 100));
    }
    // Normalize: source_url may be missing if no headline inspired the clip
    c.source_url = c.source_url || '';
    // Some LLM outputs join multiple URLs with " > " or ", " — take just the first one
    if (c.source_url.includes(' > ')) c.source_url = c.source_url.split(' > ')[0].trim();
    if (c.source_url.includes(' , ')) c.source_url = c.source_url.split(' , ')[0].trim();
    // Basic URL sanity — must start with http(s)://
    if (c.source_url && !c.source_url.match(/^https?:\/\//)) c.source_url = '';
  }

  // 3. EXPANSION calls: B2, C1, C2 in parallel
  console.log('  → expansion calls (B2, C1, C2) in parallel...');
  const [b2Res, c1Res, c2Res] = await Promise.all([
    callOpenRouter(buildExpansionPrompt(baseClips, 'b2')),
    callOpenRouter(buildExpansionPrompt(baseClips, 'c1')),
    callOpenRouter(buildExpansionPrompt(baseClips, 'c2')),
  ]);

  // Index rewrites by id
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

  // 4. Merge: take baseClips, attach b2/c1/c2 by id
  const finalClips = baseClips.map(c => ({
    ...c,
    text_en_b2: b2Map[c.id] || '',
    text_en_c1: c1Map[c.id] || '',
    text_en_c2: c2Map[c.id] || '',
  }));

  // Validate
  for (const c of finalClips) {
    if (!c.text_en_b2 || !c.text_en_c1 || !c.text_en_c2) {
      throw new Error(`Missing expansion for clip ${c.id}: b2=${!!c.text_en_b2} c1=${!!c.text_en_c1} c2=${!!c.text_en_c2}`);
    }
  }

  // 5. Write
  const out = { date: today, source: 'ai', persona: PERSONA.name, clips: finalClips };
  const outPath = path.join(__dirname, '..', 'clips', 'today.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`  → wrote ${outPath}`);

  console.log('\nTopics:');
  finalClips.forEach((c, i) => {
    const w = (s) => s.split(' ').length;
    console.log(`  ${i+1}. [${c.category}] ${c.topic_zh} / ${c.topic_en} (B1:${w(c.text_en_b1)} B2:${w(c.text_en_b2)} C1:${w(c.text_en_c1)} C2:${w(c.text_en_c2)})`);
  });
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
