// Daily content generator for LMA Seven Steps
// Reads persona.json, fetches a few RSS feeds for fresh context, then asks
// OpenRouter to write 7 bilingual clips at 3 CEFR levels each.

const fs = require('fs');
const path = require('path');

const today = new Date().toISOString().slice(0, 10);
const PERSONA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'clips', 'persona.json'), 'utf8'));

// RSS feeds for fresh headlines. Different categories, no key needed.
const FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', topic: 'markets/trading' },
  { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', topic: 'tech/AI' },
  { url: 'https://www.scmp.com/rss/91/feed', topic: 'Hong Kong' },
  { url: 'https://www.reddit.com/r/leagueoflegends/.rss', topic: 'LoL esports' },
  { url: 'https://hnrss.org/frontpage', topic: 'tech/startups' },
];

async function fetchTitles(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'lma-seven-steps/1.0' },
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
  } catch (e) {
    return [];
  }
}

function buildPrompt(headlines) {
  const persona = PERSONA.profile;
  const mix = PERSONA.content_mix;
  const mixLine = Object.entries(mix).map(([k, n]) => `${n} ${k.replace(/_/g, '/')}`).join(', ');

  return `Generate exactly 7 short English learning clips for a ${persona.age}-year-old Hong Kong learner whose interests are below. The content should be FRESH and reflect the news headlines provided at the end of this prompt. Each clip should feel like something this person would actually read on LIHKG, watch in a YouTube short, or see on a finance app.

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

# English difficulty
The user is around IELTS 5 (CEFR B1, intermediate). For EACH clip, write the English at TWO CEFR levels so the app can adapt:
- **B1** (intermediate): 70-90 words. Simple sentences (10-14 words each), common everyday vocabulary, short news paragraph style.
- **B2** (upper-intermediate): 95-115 words. More complex sentences with subordinating conjunctions, some phrasal verbs, broader vocabulary, occasionally an idiom where natural.

The Chinese version is a single translation (used as the learner's reference). It should sound natural in Cantonese-flavored Mandarin, not formal. Aim for 80-120 Chinese characters.

# Content rules
- Aim for the upper end of each word range. If a B1 comes in under 70 words, add another sentence with a specific detail until it is in range. B2 must be noticeably longer and more complex than B1, not just synonyms.
- Use a mix of tenses across the 7 clips (don't make all of them past tense).
- Each clip must have at least one specific concrete detail (a number, a name, a place, a date) so it feels like a real news event, not a generic essay.
- Tone: factual, current, like a Bloomberg or SCMP short news brief. Not chatty, not opinionated.
- Each clip should be self-contained — a person reading just this one clip should understand what happened.
- Topics should be tied to the headlines below when possible. If a category doesn't have a matching headline, invent a plausible recent event with a specific date.
- DO NOT add motivational endings like "stay focused!" or "keep trading!" — these are news briefs, not pep talks.

# Output format
Return ONLY a JSON object in this exact shape, no markdown fences, no commentary:
{
  "level": "B1/B2 mix as specified",
  "clips": [
    {
      "id": "<short-unique-id>",
      "category": "<one-of-the-7-categories>",
      "topic_zh": "<short Chinese title, 4-8 chars>",
      "topic_en": "<short English title, 2-5 words>",
      "text_zh": "<Chinese version, 1-2 sentences, 80-120 Chinese characters>",
      "text_en_b1": "<B1 English, ~90 words target>",
      "text_en_b2": "<B2 English, ~110 words target>",
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
      'HTTP-Referer': 'https://github.com/yip-lgtm/lma-seven-steps',
      'X-Title': 'LMA Seven Steps',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
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
  // 1. Fetch fresh headlines
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
    if (!c.id || !c.topic_zh || !c.topic_en || !c.text_zh || !c.text_en_b1 || !c.text_en_b2) {
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
    const b1 = c.text_en_b1.split(' ').length;
    const b2 = c.text_en_b2.split(' ').length;
    console.log(`  ${i+1}. [${c.category}] ${c.topic_zh} / ${c.topic_en} (B1: ${b1}w / B2: ${b2}w)`);
  });
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
