// Daily content generator for Seven Steps
// Reads persona.json, fetches Reddit/4chan for fresh context, then asks
// OpenRouter to write 7 bilingual clips at 4 CEFR levels each (B1/B2/C1/C2).

const fs = require('fs');
const path = require('path');

const today = new Date().toISOString().slice(0, 10);
const PERSONA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'clips', 'persona.json'), 'utf8'));

// Feeds: Reddit (RSS) + 4chan (JSON). No API keys. SFW boards only.
const FEEDS = [
  // Reddit — the colorful stuff
  { url: 'https://www.reddit.com/r/wallstreetbets/.rss', topic: 'trading/WSB', source: 'rss' },
  { url: 'https://www.reddit.com/r/anime/.rss', topic: 'anime', source: 'rss' },
  { url: 'https://www.reddit.com/r/MMA/.rss', topic: 'MMA', source: 'rss' },
  { url: 'https://www.reddit.com/r/Hong_Kong/.rss', topic: 'Hong Kong', source: 'rss' },
  { url: 'https://www.reddit.com/r/leagueoflegends/.rss', topic: 'LoL esports', source: 'rss' },
  { url: 'https://www.reddit.com/r/gaming/.rss', topic: 'gaming', source: 'rss' },
  { url: 'https://www.reddit.com/r/funny/.rss', topic: 'internet culture', source: 'rss' },
  { url: 'https://www.reddit.com/r/technology/.rss', topic: 'tech/AI', source: 'rss' },
  // 4chan — SFW boards only
  { url: 'https://a.4chan.org/biz/catalog.json', topic: '4chan/biz', source: '4chan' },
  { url: 'https://a.4chan.org/fit/catalog.json', topic: '4chan/fit', source: '4chan' },
  { url: 'https://a.4chan.org/vg/catalog.json', topic: '4chan/vg', source: '4chan' },
  { url: 'https://a.4chan.org/a/catalog.json', topic: '4chan/a', source: '4chan' },
];

async function fetchTitles(feed) {
  try {
    if (feed.source === '4chan') return await fetch4chanTitles(feed);
    return await fetchRssTitles(feed);
  } catch (e) {
    return [];
  }
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
    let t = m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (t && t.length > 8 && t.length < 200 && !t.toLowerCase().includes('rss')) {
      titles.push(t);
    }
  }
  return titles.slice(0, 6).map(t => `- [${feed.topic}] ${t}`);
}

async function fetch4chanTitles(feed) {
  // 4chan catalog.json: array of pages, each with a .threads array.
  // Threads have .sub (subject) and .com (OP body in HTML/greentext).
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
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
      const t = (subject || com.split('. ')[0] || '').slice(0, 150);
      if (t && t.length > 8 && t.length < 200) {
        titles.push(t);
      }
      if (titles.length >= 6) break;
    }
    if (titles.length >= 6) break;
  }
  return titles.slice(0, 6).map(t => `- [${feed.topic}] ${t}`);
}

function buildPrompt(headlines) {
  const persona = PERSONA.profile;
  const mix = PERSONA.content_mix;
  const mixLine = Object.entries(mix).map(([k, n]) => `${n} ${k.replace(/_/g, '/')}`).join(', ');

  return `Generate exactly 7 short English learning clips for a ${persona.age}-year-old Hong Kong learner whose interests are below. The content should be FRESH and reflect the news headlines provided at the end of this prompt. Each clip should feel like something this person would actually read on LIHKG, watch in a YouTube short, see on a finance app, or scroll past on Reddit.

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

# Vibe — IMPORTANT
The content should be INTERESTING, EDGY, and FRESH. Not bland corporate news. Draw from what people actually talk about on Reddit, 4chan, LIHKG, and finance Twitter. The user explicitly said the previous content was too boring — write stuff people would actually share in a group chat. Drama, controversy, unexpected turns, internet culture references, vivid numbers, named characters. Still factual, still news-shaped, but with a pulse.

# English difficulty
The user is around IELTS 5 (CEFR B1, intermediate) but the app supports FIVE levels so the learner can grow into harder content. For EACH clip, write the English at FOUR CEFR levels:
- **B1** (intermediate, IELTS 5): 50-65 words. Simple sentences (10-14 words each), common everyday vocabulary, short news paragraph style.
- **B2** (upper-intermediate, IELTS 6.5): 70-85 words. More complex sentences with subordinating conjunctions, some phrasal verbs, broader vocabulary.
- **C1** (advanced, IELTS 7.5): 85-100 words. Sophisticated structure, varied sentence types including conditionals, natural idioms, formal-to-neutral register.
- **C2** (proficient, IELTS 9): 100-120 words. Near-native, dense and elegant, complex idioms, abstract as well as concrete.

The Chinese version is a single translation (used as the learner's reference). It should sound natural in Cantonese-flavored Mandarin, not formal. Aim for 80-120 Chinese characters.

# Content rules
- Each higher level must be NOTICEABLY more complex than the previous — not just synonyms, but new sentence structures, idioms, and richer detail. C2 should feel like a different paragraph, not a longer B1.
- Use a mix of tenses across the 7 clips (don't make all of them past tense).
- Each clip must have at least one specific concrete detail (a number, a name, a place, a date) so it feels like a real news event, not a generic essay.
- Use real numbers from the headlines below when possible. If a headline mentions a specific figure, use that figure. Do not invent large dollar amounts.
- Tone: factual but with personality. Like a Bloomberg brief written by someone who also browses Reddit.
- Each clip should be self-contained — a person reading just this one clip should understand what happened.
- Topics should be tied to the headlines below when possible. If a category doesn't have a matching headline, invent a plausible recent event with a specific date.
- DO NOT add motivational endings like "stay focused!" or "keep trading!" — these are news briefs, not pep talks.

# Output format
Return ONLY a JSON object in this exact shape, no markdown fences, no commentary:
{
  "level": "B1/B2/C1/C2 mix as specified",
  "clips": [
    {
      "id": "<short-unique-id>",
      "category": "<one-of-the-7-categories>",
      "topic_zh": "<short Chinese title, 4-8 chars>",
      "topic_en": "<short English title, 2-5 words>",
      "text_zh": "<Chinese version, 1-2 sentences, 80-120 Chinese characters>",
      "text_en_b1": "<B1 English, ~80 words target>",
      "text_en_b2": "<B2 English, ~110 words target>",
      "text_en_c1": "<C1 English, ~135 words target>",
      "text_en_c2": "<C2 English, ~160 words target>",
      "source_hint": "<what real event or trend this is about, 1 short sentence>"
    }
  ]
}

# Today's headlines (use as inspiration for fresh content)
${headlines.length ? headlines.join('\n') : '(no headlines available — invent plausible recent events based on the interests above)'}

Today is ${today}. Return ONLY the JSON object.`;
}

async function callOpenRouter(prompt) {
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
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
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

  // 2. Build prompt
  const prompt = buildPrompt(allHeadlines);
  console.log(`  → prompt is ~${prompt.length} chars`);

  // 3. Call LLM
  console.log('  → calling OpenRouter (gpt-4o-mini)...');
  const { parsed, usage } = await callOpenRouter(prompt);
  console.log(`  → got ${parsed.clips.length} clips, ${usage?.total_tokens || '?'} tokens, $${usage?.cost?.toFixed(6) || '?'}`);

  // 4. Validate
  for (const c of parsed.clips) {
    if (!c.id || !c.topic_zh || !c.topic_en || !c.text_zh || !c.text_en_b1 || !c.text_en_b2 || !c.text_en_c1 || !c.text_en_c2) {
      throw new Error('Clip missing required field: ' + JSON.stringify(c).slice(0, 100));
    }
  }

  // 5. Write
  const out = { date: today, source: 'ai', persona: PERSONA.name, clips: parsed.clips };
  const outPath = path.join(__dirname, '..', 'clips', 'today.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`  → wrote ${outPath}`);

  console.log('\nTopics:');
  parsed.clips.forEach((c, i) => {
    const w = (s) => s.split(' ').length;
    console.log(`  ${i+1}. [${c.category}] ${c.topic_zh} / ${c.topic_en} (B1:${w(c.text_en_b1)} B2:${w(c.text_en_b2)} C1:${w(c.text_en_c1)} C2:${w(c.text_en_c2)})`);
  });
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
