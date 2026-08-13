# The Seven Steps

A single-file self-study program for English listening and speaking. One short clip, run through seven reps, real English in your mouth.

No build step. No dependencies. One HTML file + a daily content pipeline that hands you fresh bilingual clips every morning, with an English level that auto-adjusts to how well you're doing.

## The seven steps

Each clip goes through all seven, in order. No skipping back — the momentum is the point.

| # | Step | What you do |
|---|---|---|
| 1 | **Rate** | Hear it. Rate how much you caught. Nothing on screen yet. |
| 2 | **Grasp** | Hear it again. Blurt (or type) the meaning in English before the original lands. |
| 3 | **Hum** | Catch the tune and the beat, not the words. |
| 4 | **Shadow** | Say it WITH the voice, in real time. Not after. |
| 5 | **Read** | Now you see it. Read along, out loud. |
| 6 | **Recall** | Hide the text. English in, English out, fast. Then mimic. |
| 7 | **Freestyle** | Sixty seconds on the same topic. Five sentences or more. This is the one that counts. |

70% of clips in a day = a win. The threshold auto-adjusts to your session size.

## Features

- **Bilingual content** (中英對照) — every clip has a Chinese version as the learner's reference, plus English at your current level
- **5 CEFR levels** — A2, B1 (default), B2, C1, C2
- **Auto-leveling** — your last 10 ratings set the level. Rate 4+ stars consistently and you get promoted to the next level. Drop below 2.5 and you go back down. Manual override in Settings.
- **Dark mode** — tap the sun/moon icon in the top bar. Persists across reloads.
- **No build, no backend** — pure static site, runs anywhere

## Run locally

The file uses your browser's text-to-speech and microphone. Both work on `http://localhost` or `https://`, but recording is blocked on `file://`.

```bash
# from this directory
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works — `npx serve`, `caddy file-server`, whatever you've got.

## Deploy to GitHub Pages (free HTTPS, works on phone)

1. Push this repo to GitHub
2. Repo → **Settings** → **Pages**
3. Source: **Deploy from a branch** → `main` / `(root)`
4. Wait a minute. Your site is live at `https://<user>.github.io/<repo>/`

The microphone works because the page is served over HTTPS. Open it on your phone for mobile practice.

> **Heads up on scheduled workflows:** GitHub auto-disables scheduled Actions after ~60 days of no activity. If the daily content stops appearing, repo → **Actions** tab → click **Enable** on the disabled workflow.

## Daily content pipeline

A GitHub Action (`.github/workflows/daily-content.yml`) regenerates `clips/today.json` at **00:00 UTC = 08:00 Asia/Hong_Kong** with 7 fresh bilingual clips. Three-tier fallback so the app never goes a day empty:

1. **AI generation** (OpenRouter, `openai/gpt-4o-mini`) — persona-driven content from fresh Reddit + 4chan headlines
2. **Static pool** (`clips/pool.json`, 100 hand-written clips) — kicks in if the API call fails
3. **Baseline 10** hardcoded in `index.html` — kicks in if the app's daily fetch fails (offline, `file://`, etc.)

### How generation works (5 LLM calls per run)

To keep word counts accurate, the generation is split into focused calls:

1. **Base call** — gets 7 topics + Chinese translations + B1 English
2. **B2 expansion** — rewrites the B1s at B2 level
3. **C1 expansion** — rewrites at C1 level
4. **C2 expansion** — rewrites at C2 level

Each call has a single word-count target so the LLM can't be clever and compress across levels.

### Content sources

- **Reddit (RSS, no key):** r/wallstreetbets, r/anime, r/MMA, r/Hong_Kong, r/leagueoflegends, r/gaming, r/funny, r/technology
- **4chan (JSON, no key, SFW boards only):** /biz/, /fit/, /vg/, /a/
- **RSS (no key):** removed BBC/SCMP/HN in favor of the more colorful sources above

The LLM is told to write "INTERESTING, EDGY, FRESH" content — drawing from what people actually talk about on those platforms. Not bland corporate news.

### Setup

1. **Add OpenRouter key** as a repo secret named `OPENROUTER_API_KEY` (Settings → Secrets and variables → Actions → New repository secret). Without it, the static pool is used.
2. **Customize the persona** by editing `clips/persona.json` — drives what the LLM writes about. Drop in your own details and the content mix shifts.
3. **Change the model** in `scripts/gen-today.cjs` (the `model:` line). `openai/gpt-4o-mini` is the default — ~$0.003/day.
4. **Trigger manually:** repo → Actions → Daily Content → Run workflow.

## Customizing

- **Add real audio (recommended)** — TTS is fine, but real human audio is what you actually want for shadowing. For each clip, set `audio: "audio/clip-0.mp3"` and drop the file into `audio/`. The app will play that file instead of TTS. Sources: [BBC Learning English](https://www.bbc.co.uk/learningenglish/), [ELLLO](https://www.elllo.org/), [VOA Learning English](https://learningenglish.voanews.com/), or record your own.
- **Swap the persona** — edit `clips/persona.json` to drive different content categories, interests, and tone.
- **Add to the static pool** — append `{ id, category, topic, text }` entries to `clips/pool.json` (used as fallback if AI generation fails).
- **Settings** — voice, speed, clips per session, win threshold, manual level override, theme toggle.

## File layout

```
.
├── index.html                  # the entire app, single file
├── clips/
│   ├── today.json             # daily content, regenerated by the action
│   ├── pool.json              # 100-clip static fallback
│   └── persona.json           # drives the LLM's content generation
├── scripts/
│   └── gen-today.cjs          # the 5-call generation script
├── .github/
│   └── workflows/
│       └── daily-content.yml   # cron + manual dispatch
├── lma-practice-reminder.ics  # optional calendar alarm at 19:00 HKT
├── LICENSE
└── README.md
```

Progress (streak, today's count, level, theme) is saved in your browser's `localStorage` under the `ss.*` keys. It stays on your device. Nothing is uploaded anywhere.

## License

MIT. See [LICENSE](./LICENSE).
