// Daily Telegram broadcast for Seven Steps
// Reads today's generated clips and sends a digest to the configured chat_id.
//
// First-time setup: user must /start the bot in Telegram. Then run
//   BOT_TOKEN=... node scripts/send-telegram.cjs --capture-chat-id
// to discover the chat_id from getUpdates. Save the chat_id as the
// TELEGRAM_CHAT_ID GitHub secret.
//
// Env vars required:
//   TELEGRAM_BOT_TOKEN   — from BotFather
//   TELEGRAM_CHAT_ID     — target user/channel id (number or @channel_username)
//
// Exit codes:
//   0 — sent successfully (or --capture-chat-id found one)
//   1 — fatal error (no token, no chat_id, network failure)
//   2 — no clips to send (today.json missing)

const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

const TODAY_JSON = path.join(__dirname, '..', 'clips', 'today.json');

// --- helpers ---

function fmtSignalLine(sig) {
  if (!sig || !sig.asset || sig.asset === 'observation') return null;
  const dir = sig.direction === 'long' ? '🟢L' : sig.direction === 'short' ? '🔴S' : '⚪—';
  const conv = sig.conviction === 'high' ? '★★★' : sig.conviction === 'medium' ? '★★' : sig.conviction === 'low' ? '★' : '—';
  const target = sig.target ? ` tgt ${sig.target}` : '';
  const stop = sig.stop ? ` stop ${sig.stop}` : '';
  const tf = sig.time_horizon && sig.time_horizon !== 'none' ? ` ${sig.time_horizon}` : '';
  return `📈 ${sig.asset} ${dir} ${conv}${tf}${target}${stop}`;
}

function fmtClipLine(c, i) {
  const b1 = c.text_en_b1 || '';
  const preview = b1.length > 140 ? b1.slice(0, 137).trimEnd() + '…' : b1;
  // Tag the source so the platform is visible even if the URL is collapsed
  let sourceTag = '';
  if (c.source_url) {
    if (c.source_url.includes('4chan.org')) {
      const boardMatch = c.source_url.match(/\/([a-z]+)\/thread\//);
      sourceTag = boardMatch ? `Source: 4chan /${boardMatch[1]}/ thread` : 'Source: 4chan thread';
    } else if (c.source_url.includes('news.ycombinator.com')) {
      sourceTag = 'Source: HN discussion';
    } else if (c.source_url.includes('reddit.com')) {
      sourceTag = 'Source: Reddit thread';
    } else {
      sourceTag = 'Source: see link';
    }
  }
  const signal = fmtSignalLine(c.signal);
  const signalLine = signal ? `${signal}\n` : '';
  return `${i+1}. ${c.topic_en} · ${c.topic_zh}\n${preview}\n${sourceTag}\n${signalLine}${c.source_url || ''}`.trim();
}

function fmtMessage(clips, date) {
  const signals = clips
    .map(c => c.signal)
    .filter(s => s && s.asset && s.asset !== 'observation');
  const signalCount = signals.length;
  const signalHeadline = signalCount > 0
    ? ` · 📈 ${signalCount} signal${signalCount === 1 ? '' : 's'}`
    : '';
  const header = `📚 Seven Steps · ${date}\n${clips.length} bilingual clips from 4chan / HN${signalHeadline}.\n`;
  const body = clips.map((c, i) => fmtClipLine(c, i)).join('\n\n');
  const footer = '\n\nOpen: https://yip-lgtm.github.io/seven-steps/';
  return header + '\n' + body + footer;
}

// --- Telegram API call (no markdown parse mode — keep it safe) ---

async function sendMessage(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// --- chat_id discovery via getUpdates ---

async function captureChatId() {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=10&timeout=0`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.ok || !Array.isArray(data.result)) {
    throw new Error('Unexpected getUpdates response: ' + JSON.stringify(data).slice(0, 200));
  }
  // Find the most recent /start or any message from a real user
  const updates = data.result;
  console.log(`Found ${updates.length} update(s).`);
  for (const u of updates) {
    const msg = u.message || u.edited_message || u.channel_post;
    if (!msg) continue;
    const from = msg.from || {};
    const chat = msg.chat || {};
    const isChannel = chat.type === 'channel';
    const isPrivate = chat.type === 'private';
    const text = msg.text || '';
    console.log(`  update ${u.update_id}: chat.id=${chat.id} type=${chat.type}` +
      (from.username ? ` user=@${from.username}` : '') +
      (from.first_name ? ` name=${from.first_name}` : '') +
      (text ? ` text="${text.slice(0, 30)}"` : ''));
  }
  // Pick the most recent private chat (user) message as the default target
  for (let i = updates.length - 1; i >= 0; i--) {
    const msg = updates[i].message || updates[i].edited_message;
    if (msg && msg.chat && msg.chat.type === 'private') {
      console.log(`\n→ Recommended TELEGRAM_CHAT_ID: ${msg.chat.id} (private chat with @${msg.from?.username || '?'})`);
      return msg.chat.id;
    }
  }
  // Otherwise pick the first channel
  for (const u of updates) {
    const msg = u.message || u.channel_post;
    if (msg && msg.chat && (msg.chat.type === 'channel' || msg.chat.type === 'group' || msg.chat.type === 'supergroup')) {
      console.log(`\n→ Recommended TELEGRAM_CHAT_ID: ${msg.chat.id} (${msg.chat.type})`);
      return msg.chat.id;
    }
  }
  throw new Error('No recent messages found. User must /start the bot first.');
}

// --- main ---

(async () => {
  // Mode: --capture-chat-id
  if (process.argv.includes('--capture-chat-id')) {
    try {
      const id = await captureChatId();
      console.log('\nSave this as the TELEGRAM_CHAT_ID secret:');
      console.log(`  ${id}`);
      process.exit(0);
    } catch (e) {
      console.error('capture-chat-id failed:', e.message);
      process.exit(1);
    }
  }

  // Normal send mode
  if (!CHAT_ID) {
    console.error('TELEGRAM_CHAT_ID not set. Run with --capture-chat-id after /starting the bot.');
    process.exit(1);
  }

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

  const text = fmtMessage(clips, today.date || new Date().toISOString().slice(0, 10));
  console.log(`Sending ${clips.length}-clip digest to chat_id=${CHAT_ID}...`);
  console.log(`Message length: ${text.length} chars`);

  try {
    const r = await sendMessage(CHAT_ID, text);
    console.log('✓ Sent. message_id:', r.result?.message_id);
  } catch (e) {
    console.error('Send failed:', e.message);
    process.exit(1);
  }
})();
