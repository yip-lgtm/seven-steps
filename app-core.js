const CLIPS = [];
const STEPS = [
  { id: 'rate',     name: 'Rate',     hint: 'Hear it. Rate how much you understood. Nothing on screen yet.' },
  { id: 'grasp',    name: 'Grasp',    hint: 'Play it again. Before the English lands, blurt (or type) the meaning in your own words.' },
  { id: 'hum',      name: 'Hum',      hint: 'Play it again. Hum the tune and the beat. No words. Just the music of it.' },
  { id: 'shadow',   name: 'Shadow',   hint: 'Play it. Speak WITH the voice, in real time. Not after. Together.' },
  { id: 'read',     name: 'Read',     hint: 'Now you see it. Play it. Read it out loud, together with the audio.' },
  { id: 'recall',   name: 'Recall',   hint: 'Hide the text. Say it from memory, fast. Then play it again and mimic what comes back.' },
  { id: 'freestyle',name: 'Freestyle',hint: 'Sixty seconds on the same topic. Five sentences or more. The one that counts.' },
];
const STORAGE = { progress: 'ss.progress.v1', settings: 'ss.settings.v1', todayLog: 'ss.todayLog.v1' };
const today = () => new Date().toISOString().slice(0, 10);
function loadProgress() { try { return JSON.parse(localStorage.getItem(STORAGE.progress)) || defaultProgress(); } catch { return defaultProgress(); } }
function saveProgress(p) { localStorage.setItem(STORAGE.progress, JSON.stringify(p)); }
function defaultProgress() { return { streak: 0, lastWinDate: null, totalClips: 0, totalWins: 0, totalSessions: 0 }; }
function loadSettings() { try { return JSON.parse(localStorage.getItem(STORAGE.settings)) || defaultSettings(); } catch { return defaultSettings(); } }
function saveSettings(s) { localStorage.setItem(STORAGE.settings, JSON.stringify(s)); }
function defaultSettings() { return { voice: '', rate: 0.85, pitch: 1.0, clipsPerSession: 10, winThreshold: 7 }; }
function loadTodayLog() {
  try {
    const log = JSON.parse(localStorage.getItem(STORAGE.todayLog) || '{}');
    if (log.date !== today()) return { date: today(), clips: 0, ratings: [] };
    return log;
  } catch { return { date: today(), clips: 0, ratings: [] }; }
}
function saveTodayLog(log) { localStorage.setItem(STORAGE.todayLog, JSON.stringify(log)); }
const state = {
  view: 'home', session: null, settings: loadSettings(), progress: loadProgress(), todayLog: loadTodayLog(),
  clips: CLIPS, dailyDate: null, currentLevel: loadLevel(), recentRatings: loadRatings(),
  history: { days: [] }, reviewDate: null, returnView: null,
};
function loadLevel() { return localStorage.getItem('ss.level') || 'B1'; }
function saveLevel(l) { localStorage.setItem('ss.level', l); state.currentLevel = l; }
function loadTheme() { return localStorage.getItem('ss.theme') || 'light'; }
function applyTheme(t) { if (t === 'dark') document.body.classList.add('dark'); else document.body.classList.remove('dark'); localStorage.setItem('ss.theme', t); }
function toggleTheme() { applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark'); }
function loadRatings() { try { return JSON.parse(localStorage.getItem('ss.ratings')) || []; } catch { return []; } }
function saveRatings() { localStorage.setItem('ss.ratings', JSON.stringify(state.recentRatings)); }
const LEVEL_RANK = { A2: 0, B1: 1, B2: 2, C1: 3, C2: 4 };
function levelFromAverage(avg, currentLevel) {
  const idx = LEVEL_RANK[currentLevel];
  if (idx === undefined) return currentLevel;
  if (avg >= 4.0 && idx < 4) return Object.keys(LEVEL_RANK).find(k => LEVEL_RANK[k] === idx + 1) || currentLevel;
  if (avg < 2.5 && idx > 0) return Object.keys(LEVEL_RANK).find(k => LEVEL_RANK[k] === idx - 1) || currentLevel;
  return currentLevel;
}
function getTextForLevel(clip) {
  if (state.currentLevel === 'C2' && clip.text_en_c2) return clip.text_en_c2;
  if (state.currentLevel === 'C1' && clip.text_en_c1) return clip.text_en_c1;
  if (state.currentLevel === 'B2' && clip.text_en_b2) return clip.text_en_b2;
  if (clip.text_en_b1) return clip.text_en_b1;
  return clip.text;
}
function audioSrcForLevel(clip) {
  if (!clip) return null;
  const lvl = String(state.currentLevel || 'B1').toLowerCase();
  const specific = clip['audio_url_' + lvl] || clip['audio_' + lvl] || null;
  if (specific) return specific;
  if (lvl === 'b1') return clip.audio_url || clip.audio || null;
  return null;
}
function getTopicForLevel(clip) { return clip.topic_en || clip.topic; }
function esc(str) {
  const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' };
  return String(str || '').replace(/[&<>"']/g, c => map[c]);
}
function sessionPool() {
  if (state.session && Array.isArray(state.session.pool) && state.session.pool.length) return state.session.pool;
  return state.clips || [];
}
function sessionClip(offset) {
  if (!state.session) return null;
  const idx = state.session.clipIdx + (offset || 0);
  const qi = state.session.clipQueue[idx];
  if (qi == null) return null;
  return sessionPool()[qi] || null;
}
function formatReviewDate(iso) {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y) return iso || '';
  return y + '年' + m + '月' + d + '日';
}
async function loadHistory() {
  const days = [];
  const seen = new Set();
  async function addPack(data) {
    if (!data || !data.date || !Array.isArray(data.clips) || !data.clips.length) return;
    if (seen.has(data.date)) return;
    seen.add(data.date);
    days.push({ date: data.date, source: data.source || 'ai', clips: data.clips });
  }
  try {
    const res = await fetch('clips/today.json', { cache: 'no-cache' });
    if (res.ok) await addPack(await res.json());
  } catch (e) {}
  for (let i = 1; i <= 10; i++) {
    const dt = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    if (seen.has(dt)) continue;
    try {
      const res = await fetch('clips/days/' + dt + '.json', { cache: 'no-cache' });
      if (res.ok) await addPack(await res.json());
    } catch (e) {}
  }
  try {
    const res = await fetch('clips/history.json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      for (const d of (data.days || [])) await addPack(d);
    }
  } catch (e) {}
  days.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  state.history = { days };
}
function startSessionWithPool(pool, opts) {
  opts = opts || {};
  const list = (pool || []).filter(Boolean);
  if (!list.length) { toast('呢日未有短文。'); return; }
  state.returnView = opts.returnView || 'home';
  state.session = { clipIdx: 0, stepIdx: 0, clipQueue: list.map((_, i) => i), pool: list, currentClipRatings: [], sessionRecordings: [], startedAt: Date.now(), fromReview: !!opts.returnView && opts.returnView !== 'home' };
  state.view = 'session';
  render();
}
function formatSourceLabel(url) {
  if (!url) return '';
  try {
    if (url.includes('news.google.com/search')) {
      const u = new URL(url);
      const q = u.searchParams.get('q') || '';
      if (q) return 'Google News: ' + decodeURIComponent(q.replace(/\+/g, ' '));
    }
  } catch (e) {}
  const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } })();
  if (host.includes('reddit.com')) { const m = url.match(/\/r\/([\w_]+)\/comments\/([a-z0-9]+)/i); return m ? ('Reddit thread · r/' + m[1]) : 'Reddit'; }
  if (host.includes('4chan.org')) { const m = url.match(/boards\.4chan\.org\/(\w+)\/thread\/(\d+)/i); return m ? ('4chan thread · /' + m[1] + '/') : '4chan'; }
  if (host.includes('9gag.com')) return '9gag post';
  if (host.includes('x.com') || host.includes('twitter.com')) { const m = url.match(/\/(\w+)\/status\/(\d+)/); return m ? ('X post · @' + m[1]) : 'X post'; }
  if (host.includes('news.ycombinator.com')) { const m = url.match(/[?&]id=(\d+)/); return m ? ('HN discussion · #' + m[1]) : 'Hacker News'; }
  let label = url.replace(/^https?:\/\/(www\.)?/, '');
  if (label.length > 60) label = label.slice(0, 60) + '…';
  return label;
}
function updateTopStats() {
  document.getElementById('stat-streak').textContent = state.progress.streak;
  document.getElementById('stat-today').textContent = state.todayLog.clips;
  document.getElementById('stat-total').textContent = state.progress.totalClips;
  const lvlEl = document.getElementById('stat-level');
  if (lvlEl) lvlEl.textContent = state.currentLevel;
}
function recordWin() {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (state.progress.lastWinDate === today()) return;
  state.progress.streak = (state.progress.lastWinDate === yesterday) ? state.progress.streak + 1 : 1;
  state.progress.lastWinDate = today();
  state.progress.totalWins += 1;
  saveProgress(state.progress);
}
let availableVoices = [];
function loadVoices() {
  availableVoices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'));
  if (!availableVoices.length) {
    speechSynthesis.onvoiceschanged = () => { availableVoices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en')); };
  }
}
loadVoices();
let ttsPrewarmed = false;
function prewarmTTS() {
  if (ttsPrewarmed) return;
  ttsPrewarmed = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
}
function speak(text, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) { toast('Your browser does not support text-to-speech.'); resolve(); return; }
    prewarmTTS();
    speechSynthesis.cancel();
    if (speechSynthesis.paused) { try { speechSynthesis.resume(); } catch (e) {} }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate != null ? opts.rate : state.settings.rate;
    u.pitch = opts.pitch != null ? opts.pitch : state.settings.pitch;
    u.lang = 'en-US';
    if (state.settings.voice) {
      const v = availableVoices.find(v => v.voiceURI === state.settings.voice || v.name === state.settings.voice);
      if (v) u.voice = v;
    } else {
      const preferred = availableVoices.find(v => v.lang === 'en-US' && /samantha|natural|google|enhanced|premium/i.test(v.name)) || availableVoices.find(v => v.lang === 'en-US') || availableVoices[0];
      if (preferred) u.voice = preferred;
    }
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };
    u.onend = done; u.onerror = done;
    const wordCount = text.split(/\s+/).length;
    setTimeout(done, Math.max(3000, (wordCount / Math.max(0.5, u.rate)) * 400 + 2500));
    try { speechSynthesis.speak(u); } catch (e) { done(); }
  });
}
let isSpeaking = false, currentAudio = null;
async function speakAndToggle(clipOrText, btn) {
  const clip = (typeof clipOrText === 'object' && clipOrText !== null) ? clipOrText : null;
  const text = clip ? getTextForLevel(clip) : clipOrText;
  const audioSrc = clip ? audioSrcForLevel(clip) : null;
  if (isSpeaking) {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    speechSynthesis.cancel(); isSpeaking = false;
    if (btn) { btn.classList.remove('playing'); btn.innerHTML = playIcon(); }
    return;
  }
  isSpeaking = true;
  if (btn) { btn.classList.add('playing'); btn.innerHTML = stopIcon(); }
  if (audioSrc) {
    currentAudio = new Audio(audioSrc);
    await new Promise((resolve) => { currentAudio.onended = resolve; currentAudio.onerror = resolve; currentAudio.play().catch(resolve); });
    currentAudio = null;
  } else {
    await speak(text);
  }
  isSpeaking = false;
  if (btn) { btn.classList.remove('playing'); btn.innerHTML = playIcon(); }
}
function playIcon() { return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; }
function stopIcon() { return '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'; }
let recorder = null, chunks = [], recStart = 0, recTimerInterval = null, lastRecordingUrl = null, lastRecordingBlob = null, lastRecordingDuration = 0;
const GITHUB_REPO = 'yip-lgtm/seven-steps';
const GH_TOKEN_KEY = 'ss.ghBackupToken.v1';
function getGhToken() { try { return localStorage.getItem(GH_TOKEN_KEY) || ''; } catch { return ''; } }
function setGhToken(t) { try { if (t) localStorage.setItem(GH_TOKEN_KEY, t); else localStorage.removeItem(GH_TOKEN_KEY); } catch (e) {} }
async function startRecording() {
  if (recorder && recorder.state === 'recording') return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl);
      lastRecordingUrl = URL.createObjectURL(blob);
      lastRecordingBlob = blob;
      lastRecordingDuration = Math.floor((Date.now() - recStart) / 1000);
      stream.getTracks().forEach(t => t.stop());
      onRecordingComplete();
    };
    recorder.start(); recStart = Date.now();
  } catch (e) { toast('Microphone access denied. Check your browser permissions.'); throw e; }
}
function stopRecording() { if (recorder && recorder.state === 'recording') recorder.stop(); }
function onRecordingComplete() { if (state.view === 'session') render(); }
let recordingDuration = 0;
function tickRecTimer(labelEl) {
  clearInterval(recTimerInterval);
  recTimerInterval = setInterval(() => {
    recordingDuration = Math.floor((Date.now() - recStart) / 1000);
    if (labelEl) labelEl.textContent = formatTime(recordingDuration);
  }, 200);
}
function formatTime(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
async function loadDailyClips() {
  try {
    const res = await fetch('clips/today.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('not ok');
    const data = await res.json();
    if (data && Array.isArray(data.clips) && data.clips.length) {
      state.clips = data.clips;
      state.dailyDate = data.date || null;
      state.settings.clipsPerSession = data.clips.length;
      state.settings.winThreshold = Math.max(3, Math.round(data.clips.length * 0.7));
      saveSettings(state.settings);
    }
  } catch (e) { state.clips = []; state.dailyDate = null; }
}
function startSession() {
  const pool = state.clips || [];
  if (!pool.length) { toast('今日未有短文。稍後再試。'); return; }
  const startIdx = state.todayLog.clips % pool.length;
  const n = Math.min(state.settings.clipsPerSession, pool.length);
  const ordered = [];
  for (let i = 0; i < n; i++) ordered.push(pool[(startIdx + i) % pool.length]);
  startSessionWithPool(ordered, { returnView: 'home' });
}
function nextStep() {
  if (!state.session) return;
  const sess = state.session;
  if (recorder && recorder.state === 'recording') { stopRecording(); clearInterval(recTimerInterval); }
  speechSynthesis.cancel(); isSpeaking = false;
  sess.stepIdx += 1;
  if (sess.stepIdx >= STEPS.length) { finishClip(); return; }
  render();
}
function finishClip() {
  const sess = state.session;
  state.todayLog.clips += 1;
  state.todayLog.ratings.push.apply(state.todayLog.ratings, sess.currentClipRatings);
  state.progress.totalClips += 1;
  saveTodayLog(state.todayLog); saveProgress(state.progress); updateTopStats();
  if (state.todayLog.clips === state.settings.winThreshold) { recordWin(); state.progress.totalSessions += 1; saveProgress(state.progress); }
  if (lastRecordingUrl) { URL.revokeObjectURL(lastRecordingUrl); lastRecordingUrl = null; }
  recordingDuration = 0;
  sess.clipIdx += 1; sess.stepIdx = 0; sess.currentClipRatings = []; sess.recallTextHidden = false;
  if (sess.clipIdx >= sess.clipQueue.length) { state.view = 'sessionComplete'; state.session = null; } else { state.view = 'clipComplete'; }
  render();
}
function continueToNextClip() { state.view = 'session'; render(); }
function endSessionEarly() {
  if (state.todayLog.clips >= state.settings.winThreshold) recordWin();
  state.progress.totalSessions += 1; saveProgress(state.progress);
  state.session = null; state.view = state.returnView || 'home'; render();
}
function resetAll() {
  if (!confirm('This will erase your streak and all history. Continue?')) return;
  state.progress = defaultProgress();
  state.todayLog = { date: today(), clips: 0, ratings: [] };
  saveProgress(state.progress); saveTodayLog(state.todayLog); updateTopStats();
  state.view = 'home'; render(); toast('Progress reset.');
}
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
