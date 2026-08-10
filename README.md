# LMA — The Seven Steps

A single-file self-study program for English listening and speaking. Built around the LMA method: one short clip, run through seven reps, real English in your mouth.

No build step. No dependencies. One HTML file + a daily content pipeline that hands you fresh clips every morning.

## The seven steps

Each clip goes through all seven, in order. No skipping back — the momentum is the point.

| # | Step | What you do |
|---|---|---|
| 1 | **Rate** | Hear it. Rate how much you caught. Nothing on screen yet. |
| 2 | **Grasp** | Hear it again. Blurt (or type) the meaning before the English lands. |
| 3 | **Hum** | Catch the tune and the beat, not the words. |
| 4 | **Shadow** | Say it WITH the voice, in real time. Not after. |
| 5 | **Read** | Now you see it. Read along, out loud. |
| 6 | **Recall** | Hide the text. English in, English out, fast. Then mimic. |
| 7 | **Freestyle** | Sixty seconds on the same topic. Five sentences or more. This is the one that counts. |

Seven out of ten is a win, every time.

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

That's it. The microphone works because the page is served over HTTPS.

## Daily content pipeline

The app pulls a fresh set of 7 clips every day from `clips/today.json`. A GitHub Action (`.github/workflows/daily-content.yml`) regenerates that file at **00:00 UTC = 08:00 Asia/Hong_Kong** by calling an LLM via [OpenRouter](https://openrouter.ai/) to write 7 brand-new B1-level clips. If the API call fails for any reason, the action falls back to a date-based pick from `clips/pool.json` (100 hand-written clips) so the app never goes a day without fresh content.

- **To enable AI generation:** add an OpenRouter key as a repo secret named `OPENROUTER_API_KEY` (Settings → Secrets and variables → Actions → New repository secret). The action picks it up automatically. Without the secret, the static pool is used.
- **To change the model:** edit `.github/workflows/daily-content.yml` (the `model:` line). `openai/gpt-4o-mini` is the default — fast, cheap, good B1 output. Any OpenRouter model works.
- **To expand the static fallback pool:** add more entries to `clips/pool.json` (any text editor; keep the same `{ id, category, topic, text }` shape).
- **To trigger a refresh manually:** repo → Actions → Daily Content → Run workflow.
- **If the fetch fails** (no network, `file://` protocol, etc.), the app silently falls back to the 10 baseline clips hardcoded in `index.html`.

Cost at the default model: ~$0.0006/day, so a $1 OpenRouter credit covers about 4 years of daily content.

## Customizing

Everything lives in `index.html`. A few things you might want to change:

- **Add more clips** — append to the `CLIPS` array near the top of the script (baseline fallback) **or** add entries to `clips/pool.json` (daily pipeline). Aim for 80–100 words each, B1-level vocabulary, varied tenses.
- **Swap in real audio (recommended)** — TTS is fine, but real human audio is what you actually want for shadowing. For each clip, set `audio: "audio/clip-0.mp3"` and drop the file into `audio/`. The app will play that file instead of TTS. Sources: [BBC Learning English](https://www.bbc.co.uk/learningenglish/), [ELLLO](https://www.elllo.org/), [VOA Learning English](https://learningenglish.voanews.com/), or record your own.
- **Change voices / speed** — in the app, hit the Settings button. The voices list comes from your browser/OS.
- **Win threshold** — also in Settings. Defaults to 70% of the session size, in the spirit of the original "7 of 10" rule.

Progress (streak, today's count, total clips) is saved in your browser's `localStorage` under the `lma.*` keys. It stays on your device. Nothing is uploaded anywhere.

## License

MIT. See [LICENSE](./LICENSE).
