// Daily content generator for Seven Steps
// 5 LLM calls per day: 1 base (topics + Chinese + B1) + 3 expansions (B2/C1/C2).
// Each expansion call has a single word-count target so the model can't
// compress across levels.

const fs = require('fs');
const path = require('path');

const today = new Date().toISOString().slice(0, 10);
const PERSONA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'clips', 'persona.json'), 'utf8'));

const FEEDS = [
  { url: 'https://www.reddit.com/r/wallstreetbets/.rss', topic: 'trading/WSB', source: 'rss' },
  { url: 'https://www.reddit.com/r/anime/.rss', topic: 'anime', source: 'rss' },
  { url: 'https://www.reddit.com/r/MMA/.rss', topic: 'MMA', source: 'rss' },
  { url: 'https://www.reddit.com/r/Hong_Kong/.rss', topic: 'Hong Kong', source: 'rss' },
  { url: 'https://www.reddit.com/r/leagueoflegends/.rss', topic: 'LoL esports', source: 'rss' },
  { url: 'https://www.reddit.com/r/gaming/.rss', topic: 'gaming', source: 'rss' },
  { url: 'https://www.reddit.com/r/funny/.rss', topic: 'internet culture', source: 'rss' },
  { url: 'https://www.reddit.com/r/technology/.rss', topic: 'tech/AI', source: 'rss' },
  { url: 'https://a.4chan.org/biz/catalog.json', topic: '4chan/biz', source: '4chan' },
  { url: 'https://a.4chan.org/fit/catalog.json', topic: '4chan/fit', source: '4chan' },
  { url: 'https://a.4chan.org/vg/catalog.json', topic: '4chan/vg', source: '4chan' },
  { url: 'https://a.4chan.org/a/catalog.json', topic: '4chan/a', source: '4chan' },
];

async function fetchTitles(feed) {
  try {
    if (feed.source === '4chan') return await fetch4chanTitles(feed);
    return await fetchRssTitles(feed);
  } catch (e) { return []; }
}

async function fetchRssTitles(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': 'seven-steps/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const titles = [];
  const re = /<title[^>]*>([\s\S]*?)<\/title>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    let t = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
    if (t && t.length > 8 && t.length < 200 && !t.toLowerCase().includes('rss')) titles.push(t);
  }
  return titles.slice(0, 6).map(t => `- [${feed.topic}] ${t}`);
}

async function fetch4chanTitles(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': 'seven-steps/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const pages = await res.json();
  const titles = [];
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
      if (t && t.length > 8 && t.length < 200) titles.push(t);
      if (titles.length >= 6) break;
    }
    if (titles.length >= 6) break;
  }
  return titles.slice(0, 6).map(t => `- [${feed.topic}] ${t}`);
}

// Level targets — each is hit in its own dedicated LLM call
const LEVELS = {
  b1: { min: 55, max: 70, name: 'B1 (intermediate, IELTS 5)',
        desc: 'Simple sentences (10-14 words each), common everyday vocabulary, short news paragraph style. The default.' },
  b2: { min: 75, max: 90, name: 'B2 (upper-intermediate, IELTS 6.5)',
        desc: 'More complex sentences with subordinating conjunctions (although/because/while), some phrasal verbs, broader vocabulary, occasionally an idiom where natural.' },
  c1: { min: 95, max: 115, name: 'C1 (advanced, IELTS 7.5)',
        desc: 'Sophisticated structure, varied sentence types including conditionals and relative clauses, natural idioms, formal-to-neutral register.' },
  c2: { min: 115, max: 140, name: 'C2 (proficient, IELTS 9)',
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
- source_hint (one short sentence about the real event)

# B1 spec (target for text_en_b1 in this call)
${LEVELS.b1.name}: ${LEVELS.b1.min}-${LEVELS.b1.max} words. ${LEVELS.b1.desc}
- HIT THE WORD COUNT. Before returning, count each B1. If any is below ${LEVELS.b1.min}, add another sentence with a specific detail (number, name, date) until it is in range.
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
- Each rewritten clip MUST be between ${spec.min} and ${spec.max} words. Count carefully. Do not under-deliver.
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
