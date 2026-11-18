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
  else if (state.view === 'recordings') view.innerHTML = renderRecordings();
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
    '<a class="btn btn-warm" href="practice.html">無限出句</a><a class="btn btn-ghost" href="gbro.html">詞學 gbro</a><a class="btn btn-ghost" href="radio.html">24/7 電台</a><a class="btn btn-ghost" href="article.html">文章學</a><button class="btn btn-ghost" id="btn-recs">我的錄音</button></div><ul class="steps-list">'+stepsHtml+'</ul></div>';
}
