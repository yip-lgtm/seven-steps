const fs = require('fs');
const today = new Date().toISOString().slice(0, 10);

const PROMPT = `Generate exactly 7 short English listening clips for a B1-level (intermediate) language learner.

Each clip should be:
- 80 to 100 words long (count carefully)
- About a personal, everyday topic (daily life, work, family, hobbies, memories, food, travel, health, technology, plans, opinions, weather)
- Written in natural, conversational English — the way a real person would talk, not textbook-style
- Use a mix of tenses (past, present, future) across the 7 clips
- Each clip should have a clear topic and feel like a real person talking about their own life
- Topics across the 7 clips should be different from each other

Output as a JSON object in this exact shape, with no markdown fences and no commentary before or after:
{
  "clips": [
    { "id": "<short-unique-id-1>", "category": "<one-word-category>", "topic": "<short title, 2 to 5 words>", "text": "<the 80 to 100 word clip>" },
    ...6 more entries
  ]
}

Return ONLY the JSON object.`;

(async () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Set OPENROUTER_API_KEY env var first.');
    process.exit(1);
  }
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
      messages: [{ role: 'user', content: PROMPT }],
      temperature: 0.9,
      response_format: { type: 'json_object' },
    }),
  });
  const data = await res.json();
  if (data.error) { console.log('ERROR:', JSON.stringify(data.error, null, 2)); process.exit(1); }
  const content = data.choices[0].message.content;
  const parsed = JSON.parse(content);

  const out = { date: today, source: 'ai', clips: parsed.clips };
  fs.writeFileSync('clips/today.json', JSON.stringify(out, null, 2));

  console.log(`OK: ${parsed.clips.length} clips, tokens=${data.usage.total_tokens}, cost=$${data.usage.cost.toFixed(6)}`);
  console.log('\nTopics:');
  parsed.clips.forEach((c, i) => console.log(`  ${i+1}. ${c.topic} [${c.id}] (${c.text.split(' ').length} words)`));
})();
