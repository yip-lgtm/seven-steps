// Daily audio generation for Seven Steps
// Reads clips/today.json and produces an MP3 per clip (and one combined
// digest) using MiniMax TTS. Audio files are written to audio/ and
// committed by the workflow alongside today.json so the app can play
// them on load (no runtime TTS API calls needed).
//
// Env vars required:
//   MINIMAX_API_KEY — also used for LLM. TTS endpoint is /v1/t2a_v2.
//
// Output:
//   audio/{date}/clip-{id}.mp3       — per-clip audio (B1 text)
//   audio/{date}/digest.mp3          — all 7 clips concatenated with
//                                      short pauses between them
//   audio/index.json                 — { latest: date, dates: [...] }
//   audio/{date}/manifest.json       — { clips: [{id, file, duration, ...}] }
//
// Cost: 7 clips × ~50 words × 1k tokens ≈ free on MiniMax internal.
// Runtime: ~30-60 seconds for the full bundle.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TODAY_JSON = path.join(ROOT, 'clips', 'today.json');
const AUDIO_DIR = path.join(ROOT, 'audio');
const TODAY = new Date().toISOString().slice(0, 10);

const TTS_URL = 'https://api.minimax.io/v1/t2a_v2';
const TTS_MODEL = 'speech-02-hd';
const TTS_VOICE = 'alloy';          // English, clear, neutral
const TTS_SPEED = 1.0;
const TTS_FORMAT = 'mp3';

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function callMiniMaxTTS(text, opts = {}) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error('MINIMAX_API_KEY not set');
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      text,
      voice_setting: {
        voice_id: opts.voice || TTS_VOICE,
        speed: opts.speed ?? TTS_SPEED,
      },
      audio_setting: { format: TTS_FORMAT },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MiniMax TTS HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const base64 = data.data?.audio;
  if (!base64) throw new Error('No audio in MiniMax TTS response: ' + JSON.stringify(data).slice(0, 200));
  return Buffer.from(base64, 'hex');
}

(async () => {
  if (!fs.existsSync(TODAY_JSON)) {
    console.error('clips/today.json not found. Run gen-today.cjs first.');
    process.exit(2);
  }
  const today = JSON.parse(fs.readFileSync(TODAY_JSON, 'utf8'));
  const clips = today.clips || [];
  if (clips.length === 0) {
    console.error('No clips in today.json');
    process.exit(2);
  }

  const dayDir = path.join(AUDIO_DIR, TODAY);
  ensureDir(dayDir);

  const manifest = { date: TODAY, voice: TTS_VOICE, model: TTS_MODEL, clips: [] };
  let totalBytes = 0;
  let totalCost = 0;

  for (const clip of clips) {
    const text = clip.text_en_b1 || clip.text_zh;
    if (!text) {
      console.warn(`  [skip] clip ${clip.id} — no text`);
      continue;
    }
    // Strip any markdown that snuck in
    const clean = text
      .replace(/\*+/g, '')
      .replace(/_+/g, '')
      .replace(/`+/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
    if (clean.length < 4) continue;

    const file = `clip-${String(clip.id).replace(/[^a-z0-9_-]/gi, '_')}.mp3`;
    const outPath = path.join(dayDir, file);
    process.stdout.write(`  [tts] ${clip.id} (${clean.length} chars) → ${file} ... `);
    try {
      const audio = await callMiniMaxTTS(clean);
      fs.writeFileSync(outPath, audio);
      const sizeKb = (audio.length / 1024).toFixed(1);
      console.log(`${sizeKb} KB`);
      manifest.clips.push({
        id: clip.id,
        topic_en: clip.topic_en,
        topic_zh: clip.topic_zh,
        category: clip.category,
        file,
        bytes: audio.length,
        chars: clean.length,
      });
      totalBytes += audio.length;
      totalCost++;
    } catch (e) {
      console.log(`FAILED: ${e.message.slice(0, 100)}`);
      manifest.clips.push({
        id: clip.id,
        file: null,
        error: e.message.slice(0, 200),
      });
    }
  }

  // Write manifest for this day
  fs.writeFileSync(
    path.join(dayDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  // Patch clips/today.json with audio_url per clip so the app knows
  // where to fetch the pre-rendered MP3 (instead of using Web Speech
  // API at runtime). Also re-write today.json with the new field set.
  const fileToClipId = new Map();
  for (const m of manifest.clips) {
    if (m.file && m.id) fileToClipId.set(m.file, m.id);
  }
  for (const c of today.clips) {
    const safe = String(c.id).replace(/[^a-z0-9_-]/gi, '_');
    const file = `clip-${safe}.mp3`;
    if (manifest.clips.find(m => m.file === file)) {
      c.audio_url = `audio/${TODAY}/${file}`;
    }
  }
  fs.writeFileSync(TODAY_JSON, JSON.stringify(today, null, 2));
  console.log(`  → patched audio_url into ${TODAY_JSON}`);

  // Update audio/index.json with the list of available dates
  let indexFile = { latest: null, dates: [] };
  const indexPath = path.join(AUDIO_DIR, 'index.json');
  if (fs.existsSync(indexPath)) {
    try { indexFile = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch {}
  }
  if (!indexFile.dates.includes(TODAY)) indexFile.dates.push(TODAY);
  indexFile.dates.sort();
  indexFile.latest = TODAY;
  fs.writeFileSync(indexPath, JSON.stringify(indexFile, null, 2));

  const ok = manifest.clips.filter(c => c.file).length;
  console.log(`\nDone. ${ok}/${clips.length} clips rendered. Total ${(totalBytes / 1024).toFixed(1)} KB → audio/${TODAY}/`);
})().catch(e => {
  console.error('gen-audio FAILED:', e.message);
  process.exit(1);
});
