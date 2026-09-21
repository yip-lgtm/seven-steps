function render() {
  updateTopStats();
  const view = document.getElementById('view');
  if (state.view === 'home') view.innerHTML = renderHome();
  else if (state.view === 'session') view.innerHTML = renderSession();
  else if (state.view === 'clipComplete') view.innerHTML = renderClipComplete();
  else if (state.view === 'sessionComplete') view.innerHTML = renderSessionComplete();
  else if (state.view === 'settings') view.innerHTML = renderSettings();
  else if (state.view === 'review') view.innerHTML = renderReview();
  else if (state.view === 'reviewDay') view.innerHTML = renderReviewDay();
  attachHandlers();
}
function renderHome() {
  const log = state.todayLog;
  const winThreshold = state.settings.winThreshold;
  const total = state.settings.clipsPerSession;
  const wonToday = log.clips >= winThreshold;
  const remaining = Math.max(0, winThreshold - log.clips);
  const stepsHtml = STEPS.map((s, i) => '<li><div class="num">'+(i+1)+'</div><div class="body"><strong>'+s.name+'</strong><div class="desc">'+s.hint+'</div></div></li>').join('');
  const todayStr = new Date().toISOString().slice(0, 10);
  const isStale = state.dailyDate && state.dailyDate < todayStr;
  const dailyBanner = state.dailyDate ? (isStale ? '<div class="daily-banner stale">Showing '+state.dailyDate+'</div>' : '<div class="daily-banner">Fresh for '+state.dailyDate+' · '+state.currentLevel+'</div>') : '';
  const emptyState = (!state.dailyDate && total === 0) ? '<div class="empty-state"><p>今日短文未到。</p><button class="btn" id="btn-retry-daily">Retry fetch</button></div>' : '';
  const avg = state.recentRatings.length ? (state.recentRatings.reduce((a,b)=>a+b,0)/state.recentRatings.length).toFixed(1) : 'default';
  return '<div class="card home-hero"><h1>一劍七步。口裡要有真實英文。</h1>'+dailyBanner+emptyState+
    '<p>每次最多 '+total+' 則，走齊七步。一日 '+winThreshold+' 則算贏。'+(wonToday?'今日已經贏咗。':'再 '+remaining+' 則就贏。')+'</p>'+
    '<div class="home-grid">'+
    '<div class="home-stat"><div class="label">Level</div><div class="value">'+state.currentLevel+'</div><div class="sub">'+avg+' avg</div></div>'+
    '<div class="home-stat"><div class="label">Streak</div><div class="value">'+state.progress.streak+'</div><div class="sub">days</div></div>'+
    '<div class="home-stat"><div class="label">Today</div><div class="value">'+log.clips+'/'+total+'</div><div class="sub">'+(wonToday?'won':remaining+' to win')+'</div></div>'+
    '<div class="home-stat"><div class="label">All time</div><div class="value">'+state.progress.totalClips+'</div><div class="sub">clips</div></div></div>'+
    '<div class="btn-row"><button class="btn btn-primary btn-large" id="btn-start"'+(state.clips.length?'':' disabled')+'>'+(log.clips>0?'Continue today':'Start today')+'</button>'+
    '<button class="btn btn-ghost" id="btn-review">重溫</button><button class="btn btn-ghost" id="btn-settings">Settings</button>'+
    '<a class="btn btn-warm" href="practice.html">無限出句</a></div><ul class="steps-list">'+stepsHtml+'</ul></div>';
}
function renderSession() {
  const sess = state.session;
  const clip = sessionClip(0);
  if (!clip) { state.view = state.returnView || 'home'; state.session = null; return renderHome(); }
  const step = STEPS[sess.stepIdx];
  const dots = sess.clipQueue.map((_, i) => '<div class="dot'+(i<sess.clipIdx?' done':i===sess.clipIdx?' current':'')+'"></div>').join('');
  return '<div class="card"><div class="session-head"><div class="clip-counter">Clip <strong>'+(sess.clipIdx+1)+'</strong> / '+sess.clipQueue.length+
    '</div><div class="step-pill">Step '+(sess.stepIdx+1)+' of 7 · '+step.name+' · '+state.currentLevel+'</div></div>'+
    '<div class="topic-row">'+(clip.category?'<div class="topic-tag">'+esc(clip.category)+'</div>':'')+
    '<div class="topic-zh">'+esc(clip.topic_zh||'')+'</div><div class="topic-en">'+esc(getTopicForLevel(clip)||'')+'</div></div>'+
    '<div class="step-title">'+step.name+'</div><div class="step-instruction">'+step.hint+'</div>'+
    '<div class="step-body">'+renderStepBody(step, clip, sess)+'</div>'+
    (clip.source_url?'<div class="source-link"><a href="'+clip.source_url+'" target="_blank" rel="noopener">'+esc(formatSourceLabel(clip.source_url))+'</a></div>':'')+
    '<div class="controls"><button class="btn btn-ghost" id="btn-quit">End session</button>'+
    '<button class="btn btn-primary" id="btn-next">'+(sess.stepIdx===STEPS.length-1?'Finish clip →':'Next step →')+'</button></div>'+
    '<div class="progress">'+dots+'</div></div>';
}
function splitIntoBites(en, zh, maxWords){
  maxWords = maxWords || 8;
  function pack(text, splitRe){
    const raw = String(text||'').trim();
    if(!raw) return [];
    const sentences = raw.split(splitRe).map(s=>s.trim()).filter(Boolean);
    const out = [];
    sentences.forEach(s=>{
      const words = s.split(/\s+/).filter(Boolean);
      if(words.length <= maxWords){ out.push(s); return; }
      for(let i=0;i<words.length;i+=maxWords){
        out.push(words.slice(i, i+maxWords).join(' '));
      }
    });
    return out;
  }
  const enParts = pack(en, /(?<=[.!?])\s+/);
  const zhParts = pack(zh, /[，。；、]/);
  const n = Math.max(enParts.length, zhParts.length, 1);
  const out = [];
  for(let i=0;i<n;i++) out.push({en: enParts[i]||'', zh: zhParts[i]||''});
  return out;
}
function splitSentenceChunks(en, zh){ return splitIntoBites(en, zh, 8); }
function renderChunkedTranscript(enText, zhText){
  const sess = state.session || {};
  const chunks = splitIntoBites(enText, zhText, 8);
  if(sess.chunkIdx == null || sess.chunkIdx < 0) sess.chunkIdx = 0;
  if(sess.chunkIdx >= chunks.length) sess.chunkIdx = chunks.length - 1;
  const i = sess.chunkIdx || 0;
  const c = chunks[i] || {en: enText, zh: zhText};
  return '<div class="bite-box"><div class="bite-meta">第 '+(i+1)+' / '+chunks.length+' 句</div>'+
    '<div class="bite-en">'+esc(c.en)+'</div>'+(c.zh?'<div class="bite-zh">'+esc(c.zh)+'</div>':'')+
    '<div class="bite-nav">'+
    '<button class="btn" id="btn-prev-bite"'+(i<=0?' disabled':'')+'>上一句</button>'+
    '<button class="btn btn-warm" id="btn-play-bite">播呢句</button>'+
    '<button class="btn" id="btn-next-bite"'+(i>=chunks.length-1?' disabled':'')+'>下一句</button>'+
    '</div></div>';
}
function renderStepBody(step, clip, sess) {
  const enText = getTextForLevel(clip);
  const zhText = clip.text_zh || '';
  const play = '<div class="play-area"><button class="play-circle" id="btn-play" aria-label="Play">'+playIcon()+'</button>';
  const rec = '<div class="rec-area mt-3"><button class="rec-btn" id="btn-rec">●</button><div class="rec-indicator" id="rec-ind"><div class="rec-dot"></div><span>Recording · <span id="rec-time">0:00</span></span></div>'+
    (lastRecordingUrl?'<div class="audio-playback"><audio controls src="'+lastRecordingUrl+'"></audio><button class="btn" id="btn-again">Record again</button></div>':'')+'</div>';
  const pair = '<div class="mt-3"><span class="input-label">English ('+state.currentLevel+')</span>'+renderChunkedTranscript(enText, zhText)+'</div>';
  if (step.id==='rate') return play+'<div class="play-label">Tap to play.</div><div class="stars" id="stars">'+[1,2,3,4,5].map(n=>'<div class="star" data-n="'+n+'">★</div>').join('')+'</div><div class="play-label" id="rate-hint">How much at <strong>'+state.currentLevel+'</strong>?</div></div>';
  if (step.id==='grasp') return play+'<div class="play-label">Write the meaning in English.</div></div><div style="margin-top:18px"><textarea class="textarea" id="grasp-input" placeholder="Type the gist."></textarea></div><div class="mt-2"><button class="btn" id="btn-reveal">Reveal →</button><div id="reveal-area" class="mt-2" style="display:none">'+pair+'</div></div>';
  if (step.id==='hum') return play+'<div class="play-label">Hum the rhythm. No words.</div></div>';
  if (step.id==='shadow') return play+'<div class="play-label">Speak WITH the voice.</div></div>'+rec;
  if (step.id==='read') return play+'<div class="play-label">Read along out loud.</div></div>'+pair+rec;
  if (step.id==='recall') return play+'<div class="play-label">Hide text and say it back.</div></div><div class="mt-2"><button class="btn" id="btn-toggle-text">'+(sess.recallTextHidden?'Show text':'Hide text')+'</button><div id="recall-block"'+(sess.recallTextHidden?' style="display:none"':'')+'>'+pair+'</div></div>'+rec;
  if (step.id==='freestyle') return '<div class="play-area"><div class="play-label">Topic: <strong>'+esc(getTopicForLevel(clip)||'')+'</strong>. Sixty seconds.</div></div>'+rec;
  return '';
}
function renderClipComplete() {
  const clip = sessionClip(-1) || {};
  return '<div class="card center"><div class="big-emoji">✓</div><div class="big-headline">Clip done</div><div class="big-sub">'+esc(getTopicForLevel(clip)||'')+'</div><div class="btn-row mt-4" style="justify-content:center"><button class="btn btn-primary btn-large" id="btn-next-clip">Next clip →</button><button class="btn" id="btn-quit">End session</button></div></div>';
}
function renderSessionComplete() {
  const won = state.todayLog.clips >= state.settings.winThreshold;
  return '<div class="card center"><div class="big-emoji">'+(won?'🏆':'👍')+'</div><div class="big-headline">'+(won?'Win.':'Session done.')+'</div><div class="big-sub">'+state.todayLog.clips+' clips. Streak '+state.progress.streak+'</div><div class="btn-row mt-4" style="justify-content:center"><button class="btn btn-primary btn-large" id="btn-home">Back to home</button></div></div>';
}
function renderReview() {
  const days = (state.history && state.history.days) || [];
  const rows = days.length ? days.map(d => {
    const n = (d.clips||[]).length;
    const chips = (d.clips||[]).slice(0,4).map(c => '<span class="review-chip">'+esc(c.topic_zh||c.topic_en||'')+'</span>').join('');
    return '<button type="button" class="review-day" data-date="'+esc(d.date)+'"><div class="when">'+esc(formatReviewDate(d.date))+'</div><div class="count">'+n+' 則</div><div class="review-chips">'+chips+'</div></button>';
  }).join('') : '<div class="empty-state"><p>未有可重溫的短文。</p></div>';
  return '<div class="card"><div class="review-head"><div><h1>重溫</h1><p>以前的每日短文。</p></div></div>'+rows+'<div class="btn-row mt-4"><button class="btn btn-primary" id="btn-back">← Back</button></div></div>';
}
function renderReviewDay() {
  const day = ((state.history && state.history.days)||[]).find(d => d.date === state.reviewDate);
  if (!day) return '<div class="card"><p>撿唔到呢日。</p><button class="btn" id="btn-review-back">← 重溫</button></div>';
  const clips = day.clips || [];
  const items = clips.map((c,i) => '<div class="review-clip">'+(c.category?'<div class="topic-tag">'+esc(c.category)+'</div>':'')+'<div class="zh">'+esc(c.topic_zh||'')+'</div><div class="en">'+esc(c.topic_en||'')+'</div><div class="body">'+esc(getTextForLevel(c))+'</div>'+(c.text_zh?'<div class="body zh-txt">'+esc(c.text_zh)+'</div>':'')+'<div class="btn-row mt-2"><button class="btn" data-review-play="'+i+'">Play</button><button class="btn btn-primary" data-review-practice="'+i+'">練呢則</button></div></div>').join('');
  return '<div class="card"><div class="review-head"><div><h1>'+esc(formatReviewDate(day.date))+'</h1><p>'+clips.length+' 則</p></div></div>'+items+'<div class="btn-row mt-4"><button class="btn" id="btn-review-practice-all">練成日</button><button class="btn btn-primary" id="btn-review-back">← 重溫</button></div></div>';
}
function renderSettings() {
  const s = state.settings;
  const voiceOptions = availableVoices.length ? availableVoices.map(v => '<option value="'+v.voiceURI+'"'+(s.voice===v.voiceURI?' selected':'')+'>'+v.name+'</option>').join('') : '<option value="">Default</option>';
  return '<div class="card"><h2 style="font-size:22px;margin-bottom:8px">Settings</h2>'+
    '<div class="settings-row"><div class="label-block"><div class="label">English level</div></div><select id="set-level">'+['A2','B1','B2','C1','C2'].map(l=>'<option value="'+l+'"'+(state.currentLevel===l?' selected':'')+'>'+l+'</option>').join('')+'</select></div>'+
    '<div class="settings-row"><div class="label-block"><div class="label">Voice</div></div><select id="set-voice"><option value="">System default</option>'+voiceOptions+'</select></div>'+
    '<div class="settings-row"><div class="label-block"><div class="label">Speed</div></div><div class="range-row"><input type="range" id="set-rate" min="0.5" max="1.2" step="0.05" value="'+s.rate+'"><div class="range-val" id="rate-val">'+Number(s.rate).toFixed(2)+'x</div></div></div>'+
    '<div class="settings-row"><button class="btn" id="btn-test">Play sample</button></div>'+
    '<div class="mt-4"><button class="btn" id="btn-reset" style="color:var(--danger)">Reset all progress</button></div>'+
    '<div class="mt-4 btn-row"><button class="btn btn-primary" id="btn-back">← Back</button></div></div>';
}
function attachHandlers() {
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  on('btn-start', startSession);
  on('btn-settings', () => { state.view = 'settings'; render(); });
  on('btn-review', () => { state.view = 'review'; render(); });
  on('btn-theme', toggleTheme);
  on('btn-back', () => { state.view = 'home'; render(); });
  on('btn-review-back', () => { state.view = 'review'; render(); });
  on('btn-home', () => { state.view = state.returnView || 'home'; state.session = null; render(); });
  on('btn-next', nextStep);
  on('btn-next-clip', continueToNextClip);
  on('btn-quit', () => { if (confirm('End session now?')) endSessionEarly(); });
  on('btn-retry-daily', async () => { await loadDailyClips(); render(); });
  on('btn-test', () => speak("The morning is my favorite part of the day, because it's quiet and nobody needs anything from me yet."));
  on('btn-reset', resetAll);
  on('btn-prev-bite', () => { if(!state.session) return; state.session.chunkIdx = Math.max(0, (state.session.chunkIdx||0)-1); render(); });
  on('btn-next-bite', () => { if(!state.session) return; state.session.chunkIdx = (state.session.chunkIdx||0)+1; render(); });
  on('btn-play-bite', () => {
    const clip = sessionClip(0); if(!clip) return;
    const chunks = splitIntoBites(getTextForLevel(clip), clip.text_zh||'', 8);
    const c = chunks[state.session.chunkIdx||0];
    if(c && c.en) speak(c.en);
  });
  document.querySelectorAll('.review-day').forEach(btn => btn.addEventListener('click', () => { state.reviewDate = btn.getAttribute('data-date'); state.view = 'reviewDay'; render(); }));
  document.querySelectorAll('[data-review-play]').forEach(btn => btn.addEventListener('click', () => {
    const day = ((state.history && state.history.days)||[]).find(d => d.date === state.reviewDate);
    const clip = day && day.clips[Number(btn.getAttribute('data-review-play'))];
    if (clip) speakAndToggle(clip, btn);
  }));
  document.querySelectorAll('[data-review-practice]').forEach(btn => btn.addEventListener('click', () => {
    const day = ((state.history && state.history.days)||[]).find(d => d.date === state.reviewDate);
    const clip = day && day.clips[Number(btn.getAttribute('data-review-practice'))];
    if (clip) startSessionWithPool([clip], { returnView: 'reviewDay' });
  }));
  on('btn-review-practice-all', () => {
    const day = ((state.history && state.history.days)||[]).find(d => d.date === state.reviewDate);
    if (day && day.clips && day.clips.length) startSessionWithPool(day.clips, { returnView: 'reviewDay' });
  });
  const btnPlay = document.getElementById('btn-play');
  if (btnPlay) btnPlay.addEventListener('click', () => {
    const clip = sessionClip(0); if(!clip) return;
    const step = STEPS[state.session.stepIdx];
    if(step && (step.id==='read' || step.id==='recall' || step.id==='grasp')){
      const chunks = splitIntoBites(getTextForLevel(clip), clip.text_zh||'', 8);
      const c = chunks[state.session.chunkIdx||0];
      if(c && c.en) speak(c.en);
      return;
    }
    speakAndToggle(clip, btnPlay);
  });
  const stars = document.getElementById('stars');
  if (stars) stars.querySelectorAll('.star').forEach(s => s.addEventListener('click', () => {
    const selected = parseInt(s.dataset.n, 10);
    stars.querySelectorAll('.star').forEach((x,i) => x.classList.toggle('active', i < selected));
    const sess = state.session;
    if (sess.currentClipRatings.length < 1) sess.currentClipRatings.push(selected); else sess.currentClipRatings[0] = selected;
    state.recentRatings.push(selected); if (state.recentRatings.length > 10) state.recentRatings.shift(); saveRatings();
    const avg = state.recentRatings.reduce((a,b)=>a+b,0)/state.recentRatings.length;
    const newLevel = levelFromAverage(avg, state.currentLevel);
    if (newLevel !== state.currentLevel) { saveLevel(newLevel); updateTopStats(); toast('Level: '+newLevel); }
  }));
  const btnReveal = document.getElementById('btn-reveal');
  if (btnReveal) btnReveal.addEventListener('click', () => { const area = document.getElementById('reveal-area'); if (area) area.style.display = 'block'; btnReveal.disabled = true; btnReveal.textContent = 'Original shown'; });
  const btnToggleText = document.getElementById('btn-toggle-text');
  if (btnToggleText) btnToggleText.addEventListener('click', () => { const sess = state.session; sess.recallTextHidden = !sess.recallTextHidden; const block = document.getElementById('recall-block'); if (block) block.style.display = sess.recallTextHidden ? 'none' : 'block'; btnToggleText.textContent = sess.recallTextHidden ? 'Show text' : 'Hide text'; });
  const setLevel = document.getElementById('set-level');
  if (setLevel) setLevel.addEventListener('change', e => { saveLevel(e.target.value); updateTopStats(); render(); });
  const setVoice = document.getElementById('set-voice');
  if (setVoice) setVoice.addEventListener('change', e => { state.settings.voice = e.target.value; saveSettings(state.settings); });
  const setRate = document.getElementById('set-rate');
  const rateVal = document.getElementById('rate-val');
  if (setRate) setRate.addEventListener('input', e => { state.settings.rate = parseFloat(e.target.value); if (rateVal) rateVal.textContent = state.settings.rate.toFixed(2)+'x'; saveSettings(state.settings); });
  const btnRec = document.getElementById('btn-rec');
  if (btnRec) btnRec.addEventListener('click', async () => {
    const ind = document.getElementById('rec-ind'); const timeEl = document.getElementById('rec-time');
    if (recorder && recorder.state === 'recording') { stopRecording(); btnRec.classList.remove('recording'); if (ind) ind.classList.remove('active'); clearInterval(recTimerInterval); }
    else { try { await startRecording(); btnRec.classList.add('recording'); if (ind) ind.classList.add('active'); tickRecTimer(timeEl); } catch (e) {} }
  });
  const btnAgain = document.getElementById('btn-again');
  if (btnAgain) btnAgain.addEventListener('click', () => { if (lastRecordingUrl) { URL.revokeObjectURL(lastRecordingUrl); lastRecordingUrl = null; } recordingDuration = 0; render(); });
}
(async function init() { applyTheme(loadTheme()); await loadDailyClips(); await loadHistory(); render(); })();
