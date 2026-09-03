// Telegram-driven cron trigger
// Polls Telegram getUpdates for /cron commands from the configured
// chat_id, then dispatches the GitHub Actions workflow via the
// Contents API. The user can run this script on any always-on host
// (VPS, NAS, old laptop) or trigger it manually once per day.
//
// Usage: BOT_TOKEN=... GH_TOKEN=... CHAT_ID=... node telegram-cron.cjs
//
// Modes:
//   --once   : single poll + dispatch + exit
//   (default): long-poll loop with 30s interval

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GH_TOKEN = process.env.GH_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const REPO = 'yip-lgtm/seven-steps';
const WORKFLOW = 'daily-content.yml';

if (!BOT_TOKEN) { console.error('TELEGRAM_BOT_TOKEN not set'); process.exit(1); }
if (!GH_TOKEN) { console.error('GH_TOKEN not set'); process.exit(1); }
if (!CHAT_ID) { console.error('TELEGRAM_CHAT_ID not set'); process.exit(1); }

const ONCE = process.argv.includes('--once');

let lastUpdateId = 0;

async function tgApi(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const e = await res.text();
    throw new Error(`Telegram ${method} ${res.status}: ${e.slice(0, 200)}`);
  }
  return res.json();
}

async function dispatchWorkflow() {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (res.status !== 204) {
    const e = await res.text();
    throw new Error(`GitHub dispatch ${res.status}: ${e.slice(0, 200)}`);
  }
  return true;
}

async function poll() {
  try {
    const data = await tgApi('getUpdates', {
      offset: lastUpdateId + 1,
      timeout: 25,
      allowed_updates: ['message'],
    });
    const updates = data.result || [];
    for (const u of updates) {
      lastUpdateId = u.update_id;
      const msg = u.message || u.edited_message;
      if (!msg) continue;
      if (String(msg.chat.id) !== String(CHAT_ID)) continue;  // only listen to configured chat
      const text = (msg.text || '').trim().toLowerCase();
      if (text === '/cron' || text === 'cron' || text === '/refresh' || text === '/today') {
        try {
          await tgApi('sendMessage', {
            chat_id: CHAT_ID,
            text: '⏳ Dispatching GitHub workflow…',
          });
        } catch {}
        try {
          await dispatchWorkflow();
          await tgApi('sendMessage', {
            chat_id: CHAT_ID,
            text: '✓ Cron triggered. today.json will refresh in ~60s. Tap Retry fetch in the app when ready.',
          });
        } catch (e) {
          await tgApi('sendMessage', {
            chat_id: CHAT_ID,
            text: '✗ Dispatch failed: ' + e.message,
          });
        }
      }
    }
  } catch (e) {
    console.warn('poll error:', e.message);
  }
}

(async () => {
  console.log(`[telegram-cron] listening for /cron in chat ${CHAT_ID}, repo ${REPO}`);
  if (ONCE) {
    await poll();
    console.log('[telegram-cron] --once done, exiting');
    process.exit(0);
  }
  while (true) {
    await poll();
    // Telegram getUpdates with long-poll already blocks 25s; one poll = one cycle
  }
})();
