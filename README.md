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

The app pulls a fresh set of 7 clips every day from `clips/today.json`. A GitHub Action (`.github/workflows/daily-clips.yml`) regenerates that file at **00:00 UTC = 08:00 Asia/Hong_Kong** by picking 7 clips from `clips/pool.json` using a date-based hash. When the pool size is 100, the cycle is about 14 days before any clip repeats.

- **To expand the pool:** add more entries to `clips/pool.json` (any text editor; keep the same `{ id, category, topic, text }` shape). The action will pick from the bigger pool automatically.
- **To trigger a refresh manually:** repo → Actions → Daily Clips → Run workflow.
- **To change the daily count or run time:** edit `.github/workflows/daily-clips.yml` (look for `N = 7` and the `cron` line).
- **If the fetch fails** (no network, `file://` protocol, etc.), the app silently falls back to the 10 baseline clips hardcoded in `index.html`.

No API keys. No external services. Just a static JSON file in the repo.

## Customizing

Everything lives in `index.html`. A few things you might want to change:

- **Add more clips** — append to the `CLIPS` array near the top of the script (baseline fallback) **or** add entries to `clips/pool.json` (daily pipeline). Aim for 80–100 words each, B1-level vocabulary, varied tenses.
- **Swap in real audio (recommended)** — TTS is fine, but real human audio is what you actually want for shadowing. For each clip, set `audio: "audio/clip-0.mp3"` and drop the file into `audio/`. The app will play that file instead of TTS. Sources: [BBC Learning English](https://www.bbc.co.uk/learningenglish/), [ELLLO](https://www.elllo.org/), [VOA Learning English](https://learningenglish.voanews.com/), or record your own.
- **Change voices / speed** — in the app, hit the Settings button. The voices list comes from your browser/OS.
- **Win threshold** — also in Settings. Defaults to 70% of the session size, in the spirit of the original "7 of 10" rule.

Progress (streak, today's count, total clips) is saved in your browser's `localStorage` under the `lma.*` keys. It stays on your device. Nothing is uploaded anywhere.

## License

MIT. See [LICENSE](./LICENSE).
