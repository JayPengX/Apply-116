/* 考古題: 大考中心 past papers (學測、分科 111–115) as practice quizzes or timed mock exams.
 * Papers are loaded on demand from exams/<id>.js (window.examLoaded), so the main page stays small. */
window.ExamUI = function (ctx) {
  'use strict';
  const { $, esc, icon, toast, copyText, getState, save } = ctx;
  const INDEX = window.EXAM_INDEX || [];
  const KIND = { gsat: '學測', ast: '分科' };
  const SUBJ_ORDER = ['國綜', '英文', '數學A', '數學B', '社會', '自然', '數學甲', '數學乙', '歷史', '地理', '公民與社會', '物理', '化學', '生物'];
  const TYPE = { single: '單選', multi: '多選', fill: '選填', open: '非選' };
  const cache = {}, waiting = {};
  const ui = { view: 'home', cell: 0, zoom: null };

  // ---------------------------------------------------------------- state (inside the app's saved state)
  function ex() {
    const st = getState();
    if (!st.ex || typeof st.ex !== 'object') st.ex = {};
    const e = st.ex;
    if (!Array.isArray(e.wrong)) e.wrong = [];
    if (!e.hist || typeof e.hist !== 'object') e.hist = {};
    if (typeof e.open !== 'boolean') e.open = false;
    return e;
  }
  const sess = () => ex().s || null;

  // ---------------------------------------------------------------- loading papers (script files, so it also works offline from a saved copy)
  window.examLoaded = d => { cache[d.id] = prep(d); (waiting[d.id] || []).forEach(f => f(cache[d.id])); delete waiting[d.id]; };
  function load(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    return new Promise((res, rej) => {
      const first = !waiting[id];
      (waiting[id] = waiting[id] || []).push(res);
      if (!first) return;
      const s = document.createElement('script');
      s.src = 'exams/' + id + '.js';
      s.onerror = () => { delete waiting[id]; s.remove(); rej(new Error('load')); };
      document.head.appendChild(s);
    });
  }
  /** Points, option labels and the passage of every question. */
  function prep(d) {
    const qs = d.items.filter(x => x.k === 'q');
    d.items.forEach((x, i) => { x.i = i; });
    for (const q of qs) {
      const sec = d.secs[q.sec] || {};
      if (!q.pts) {
        const m = /每題\s*(\d+(?:\.\d+)?)\s*分/.exec(sec.note || '');
        if (m) q.pts = +m[1];
        else if (sec.pts) { const n = qs.filter(x => x.sec === q.sec).length; q.pts = Math.round((sec.pts / n) * 100) / 100; }
        else q.pts = 0;
      }
      // the passage: the 題組 that covers this number, or the passage right before it in the same section
      let g = null;
      for (let i = q.i - 1; i >= 0; i--) {
        const x = d.items[i];
        if (x.k !== 'g') continue;
        if (x.sec !== q.sec && !(x.to && q.n <= x.to)) break;
        if (!x.to || (typeof q.n === 'number' && q.n >= (x.from || 0) && q.n <= x.to)) { g = x; break; }
      }
      if (q.shared != null) g = d.items[q.shared];
      q.g = g ? g.i : null;
      const opts = q.opts || (g && q.blank && g.opts) || null;
      q.optList = opts;
      q.labels = opts ? opts.map(o => o[0]) : q.labels || defaultLabels(q, d);
    }
    d.qs = qs;
    return d;
  }
  function defaultLabels(q, d) {
    if (q.type !== 'single' && q.type !== 'multi') return null;
    const a = q.ans || '';
    if (/^[1-9]+$/.test(a)) return ['1', '2', '3', '4', '5'];
    // options only in a picture: up to the last answer letter, at least A–D (英文) or A–E; a 多選 picking stores A–F
    let last = d.subj === '英文' && q.type === 'single' ? 'D' : q.type === 'multi' && !q.img ? 'F' : 'E';
    for (const c of a) if (c > last && c <= 'L') last = c;
    const out = [];
    for (let c = 65; c <= last.charCodeAt(0); c++) out.push(String.fromCharCode(c));
    return out;
  }
  const qKey = (d, q) => d.id + '#' + q.n;

  // ---------------------------------------------------------------- scoring (大考中心 rules)
  function score(q, a) {
    if (q.type === 'open') return a && a.ai != null ? Math.max(0, Math.min(q.pts, +a.ai)) : null;
    if (q.ans === '＊') return q.pts; // 大考中心 voided this question: everyone got its points
    if (!q.ans || a == null || a === '' || (Array.isArray(a) && !a.some(x => x))) return 0;
    if (q.type === 'single') return a === q.ans ? q.pts : 0;
    if (q.type === 'multi') {
      // each option judged on its own: k options, w of them wrong → (k − 2w)/k of the points, never below 0
      const k = q.labels ? q.labels.length : 5, sel = new Set(a), right = new Set(q.ans.split(''));
      let w = 0;
      for (const l of q.labels || []) if (sel.has(l) !== right.has(l)) w++;
      return Math.max(0, Math.round(((q.pts * (k - 2 * w)) / k) * 100) / 100);
    }
    if (q.type === 'fill') return q.ans.every((x, i) => String(a[i] || '') === x) ? q.pts : 0;
    return 0;
  }
  const isRight = (q, a) => q.type !== 'open' && score(q, a) === q.pts && q.pts > 0;
  const answered = a => a != null && a !== '' && !(Array.isArray(a) && !a.some(x => x)) && !(typeof a === 'object' && !Array.isArray(a) && !(a.text || a.ai != null));

  // ---------------------------------------------------------------- sessions
  /** A session: which questions, in which mode, your answers, crossed-out options, flags and the clock. */
  async function startPaper(id, mode) {
    const d = await load(id);
    const withOpen = ex().open;
    const qs = d.qs.filter(q => withOpen || q.type !== 'open').map(q => [id, q.n]);
    begin({ mode, title: `${d.y} ${KIND[d.kind]}${d.subj}`, pid: id, qs, dur: mode === 'full' && d.min ? d.min * 60 : null });
  }
  function begin(s) {
    Object.assign(s, { i: 0, a: {}, x: {}, f: [], shown: [], t0: Date.now(), paused: 0, pauseAt: null, done: false });
    ex().s = s;
    ui.view = 'run'; ui.cell = 0;
    save();
    draw();
  }
  const elapsed = s => Math.floor(((s.done ? s.end : s.pauseAt || Date.now()) - s.t0 - s.paused) / 1000);
  async function quick(subj, n, onlyWrong, cat) {
    let pool = [];
    if (onlyWrong) {
      const ids = [...new Set(ex().wrong.map(k => k.split('#')[0]))];
      await Promise.all(ids.map(id => load(id).catch(() => null)));
      pool = ex().wrong.map(k => { const [id, nn] = k.split('#'); return [id, isNaN(+nn) ? nn : +nn]; }).filter(([id]) => cache[id]);
    } else {
      const ids = INDEX.filter(p => p.subj === subj).map(p => p.id);
      await Promise.all(ids.map(id => load(id).catch(() => null)));
      for (const id of ids) if (cache[id]) for (const q of cache[id].qs) if (q.type !== 'open' && q.ans && (!cat || q.topic === cat)) pool.push([id, q.n]);
    }
    if (!pool.length) { toast(onlyWrong ? '錯題本是空的' : '沒有可以出的題目'); return; }
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    begin({ mode: 'practice', title: onlyWrong ? '錯題本' : `${subj}${cat ? '・' + cat : ''}・隨機 ${Math.min(n, pool.length)} 題`, qs: onlyWrong ? pool : pool.slice(0, n), dur: null });
  }
  const qOf = ([id, n]) => { const d = cache[id]; return d ? [d, d.qs.find(q => q.n === n)] : [null, null]; };

  function submit() {
    const s = sess();
    if (!s || s.done) return;
    s.done = true; s.end = Date.now();
    if (s.pauseAt) { s.paused += s.end - s.pauseAt; s.pauseAt = null; }
    const e = ex();
    let got = 0, max = 0;
    for (const k of s.qs) {
      const [d, q] = qOf(k);
      if (!q || q.type === 'open' && !(s.a[k.join('#')] && s.a[k.join('#')].ai != null)) continue;
      const v = score(q, s.a[k.join('#')]);
      if (v != null) { got += v; max += q.pts; }
      const key = qKey(d, q), i = e.wrong.indexOf(key);
      if (q.type !== 'open') {
        if (!isRight(q, s.a[k.join('#')])) { if (i < 0 && answered(s.a[k.join('#')]) || i < 0 && s.mode === 'full') e.wrong.push(key); }
        else if (i >= 0) e.wrong.splice(i, 1);
      }
    }
    s.got = Math.round(got * 100) / 100; s.max = Math.round(max * 100) / 100;
    if (s.pid && s.mode === 'full') {
      const h = (e.hist[s.pid] = e.hist[s.pid] || []);
      h.unshift({ d: new Date().toISOString().slice(0, 10), g: s.got, m: s.max, t: elapsed(s) });
      h.length = Math.min(h.length, 5);
    }
    e.wrong = e.wrong.slice(-400);
    ui.view = 'result';
    save();
    draw();
  }

  // ---------------------------------------------------------------- views
  const fmtT = sec => { const m = Math.floor(Math.abs(sec) / 60), s = Math.abs(sec) % 60; return `${sec < 0 ? '-' : ''}${m}:${String(s).padStart(2, '0')}`; };
  function el() { return $('#exam'); }
  function draw() {
    const root = el();
    if (!root) return;
    const s = sess();
    if (ui.view === 'run' && s && !s.done) return drawRun(root, s);
    if (ui.view === 'review' && s) return drawRun(root, s, true);
    if (ui.view === 'result' && s && s.done) return drawResult(root, s);
    ui.view = 'home';
    drawHome(root);
  }

  function drawHome(root) {
    const e = ex(), s = sess();
    const subs = [...new Set(INDEX.map(p => p.subj))].sort((a, b) => SUBJ_ORDER.indexOf(a) - SUBJ_ORDER.indexOf(b));
    const row = (kind, subj) => {
      const ps = INDEX.filter(p => p.kind === kind && p.subj === subj);
      if (!ps.length) return '';
      return `<li class="xp-row"><b>${esc(subj)}</b><span class="xp-ys">${ps.map(p => { const h = e.hist[p.id] && e.hist[p.id][0]; return `<button type="button" class="xp-y" data-xpaper="${p.id}">${p.y}${h ? `<small>${Math.round((h.g / (h.m || 1)) * 100)}%</small>` : ''}</button>`; }).join('')}</span></li>`;
    };
    const kinds = ['gsat', 'ast'].map(k => {
      const rows = subs.map(sj => row(k, sj)).join('');
      return rows ? `<section class="sec">${ctx.hIcon(k === 'gsat' ? 'doc' : 'book', `${KIND[k]}歷屆試題`)}<p class="sub">${k === 'gsat' ? '學科能力測驗' : '分科測驗'} 111–115 學年度（108 課綱）。按年份開始。</p><ul class="xp-list">${rows}</ul></section>` : '';
    }).join('');
    const resume = s && !s.done ? `<section class="sec xr-card"><div><b>${esc(s.title)}</b><small>${s.mode === 'full' ? '模擬考' : '練習'}・第 ${s.i + 1}／${s.qs.length} 題${s.dur ? `・剩 ${fmtT(s.dur - elapsed(s))}` : ''}</small></div><div class="xr-act"><button class="btn primary sm" type="button" data-xact="resume">繼續</button><button class="btn sm" type="button" data-xact="quit">放棄</button></div></section>` : s && s.done ? `<section class="sec xr-card"><div><b>${esc(s.title)}</b><small>上次結果：${s.got}／${s.max} 分</small></div><div class="xr-act"><button class="btn sm" type="button" data-xact="result">看結果</button></div></section>` : '';
    root.innerHTML = `<header class="page-h"><div><h1 class="hi">${icon('doc')}<span>考古題</span></h1><p>大考中心公布的學測、分科歷屆試題。練習模式每題對答案；模擬考照正式時間計時，交卷才看答案。</p></div></header>
      ${resume}
      <section class="sec"><div class="xq-quick">${ctx.hIcon('boost', '小測驗')}<p class="sub">從同一科 111–115 年的選擇（填）題隨機出題。</p>
        <div class="xq-row"><span class="selectbox"><select id="xqSubj" aria-label="科目">${subs.map(sj => `<option ${sj === ui.qs ? 'selected' : ''}>${esc(sj)}</option>`).join('')}</select>${icon('chevD', 'sm')}</span>
        <div class="segctl" role="group" aria-label="題數">${[10, 20, 40].map(n => `<button type="button" data-xqn="${n}" aria-pressed="${(ui.qn || 10) === n}">${n} 題</button>`).join('')}</div>
        <button class="btn primary sm" type="button" data-xact="quick">開始</button></div>
        ${catChips(ui.qs || subs[0])}
        <div class="xq-row"><button class="btn sm" type="button" data-xact="wrong" ${e.wrong.length ? '' : 'disabled'}>${icon('reset', 'sm')}錯題本（${e.wrong.length} 題）</button>
        <label class="fcheck"><input type="checkbox" id="xOpen" ${e.open ? 'checked' : ''}> 模擬考包含非選擇題（自己用 AI 批改）</label></div></div></section>
      ${kinds || '<p class="hint">考古題資料還沒有放上來。</p>'}
      <p class="hint xp-src">試題、答案和評分原則：財團法人大學入學考試中心基金會（ceec.edu.tw），著作權屬大考中心，本站非營利使用並註明出處。圖表較多的題目直接用官方試卷的截圖。非選擇題沒有自動批改。</p>`;
  }

  /** Categories of a subject's questions (社會 → 歷史／地理／公民, 自然 → 物理…, 數學 → 單元, 英文 → 題型), from the index. */
  function catChips(subj) {
    const c = {};
    INDEX.filter(p => p.subj === subj).forEach(p => Object.entries(p.cats || {}).forEach(([k, n]) => { c[k] = (c[k] || 0) + n; }));
    const ks = Object.keys(c).sort((a, b) => c[b] - c[a]);
    if (!ks.length) return '';
    if (ui.cat && !c[ui.cat]) ui.cat = '';
    return `<div class="chips xq-cats" role="group" aria-label="範圍"><button type="button" class="chip" data-xcat="" aria-pressed="${!ui.cat}">全部</button>${ks.map(k => `<button type="button" class="chip" data-xcat="${esc(k)}" aria-pressed="${ui.cat === k}">${esc(k)}<span class="n">${c[k]}</span></button>`).join('')}</div>${/社會|自然|數學/.test(subj) ? '<p class="hint">分類是照題目關鍵字大致判斷的，可能不準。</p>' : ''}`;
  }
  function passageHTML(d, q, review) {
    if (q.g == null) return '';
    const g = d.items[q.g];
    const body = g.img ? g.img.map(src => `<img class="crop" src="exams/${src}" alt="" loading="lazy">`).join('') : g.html || '';
    const opts = g.opts && !q.optList ? `<ol class="xg-opts">${g.opts.map(([l, h]) => `<li><b>(${esc(l)})</b> ${h}</li>`).join('')}</ol>` : '';
    // the blank this question fills, marked in the passage
    const mark = typeof q.n === 'number' ? fixSrc(body).replace(new RegExp(`<u>(\\s*)${q.n}(\\s*)</u>`), '<u class="cur">$1' + q.n + '$2</u>') : fixSrc(body);
    return `<details class="xg" ${ui.gClosed === g.i ? '' : 'open'} data-xg="${g.i}"><summary>${icon('chevR', 'sm')}${g.head ? esc(g.head) : `第 ${g.from}${g.to ? '–' + g.to : ''} 題的文章`}</summary><div class="xg-b">${mark}${opts}</div></details>`;
  }
  const fixSrc = h => String(h).replace(/src="img\//g, 'src="exams/img/');

  function optionsHTML(q, a, x, show) {
    const sel = q.type === 'multi' ? new Set(a || []) : new Set(a ? [a] : []);
    const right = new Set((q.ans || '').split(''));
    const cross = new Set(x || []);
    const body = l => { const o = q.optList && q.optList.find(z => z[0] === l); return o ? fixSrc(o[1]) : ''; };
    return `<div class="xo-list${q.optList ? '' : ' compact'}" role="group" aria-label="選項">${q.labels.map(l => {
      const st = show ? (right.has(l) ? ' ok' : sel.has(l) ? ' bad' : '') : '';
      return `<div class="xo${cross.has(l) ? ' crossed' : ''}${st}"><button type="button" class="xo-b" data-xa="${esc(l)}" aria-pressed="${sel.has(l)}" ${show ? 'disabled' : ''}><b class="xo-l">${esc(l)}</b><span class="xo-t">${body(l)}</span></button>${show ? '' : `<button type="button" class="xo-x" data-xx="${esc(l)}" aria-label="刪去 ${esc(l)}" aria-pressed="${cross.has(l)}" title="刪去">${icon('x', 'sm')}</button>`}</div>`;
    }).join('')}</div>`;
  }

  function fillHTML(q, a, show) {
    const v = Array.isArray(a) ? a : [];
    const cells = q.cells.map((c, i) => `<button type="button" class="xc${ui.cell === i && !show ? ' on' : ''}${show ? (String(v[i] || '') === q.ans[i] ? ' ok' : ' bad') : ''}" data-xcell="${i}"><small>${esc(c)}</small><b>${esc(v[i] || '')}</b>${show && String(v[i] || '') !== q.ans[i] ? `<i>${esc(q.ans[i])}</i>` : ''}</button>`).join('');
    const pad = show ? '' : `<div class="xk" role="group" aria-label="填答鍵盤">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', '±'].map(k => `<button type="button" data-xkey="${k}">${k}</button>`).join('')}<button type="button" data-xkey="del" aria-label="刪除">⌫</button></div>`;
    return `<div class="xcells">${cells}</div>${pad}<p class="hint">每一格填一個數字或符號（－、±），格子的位置看題目裡的方框。</p>`;
  }

  function openHTML(d, q, a, show) {
    const v = a && typeof a === 'object' ? a : {};
    return `<div class="xopen"><label class="xo-in"><span>你的作答（可以先寫在紙上，這裡只是方便貼給 AI）</span><textarea id="xText" rows="5" ${show ? 'readonly' : ''}>${esc(v.text || '')}</textarea></label>
      <div class="mv-act"><button class="btn sm primary" type="button" data-xact="ai">${icon('copy', 'sm')}複製題目、評分原則和作答給 AI</button></div>
      <label class="xo-in sm"><span>AI 給的分數（0–${q.pts} 分，可以不填）</span><input id="xAi" type="number" inputmode="decimal" min="0" max="${q.pts}" step="0.5" value="${v.ai != null ? esc(v.ai) : ''}" ${show ? 'readonly' : ''}></label>
      <p class="hint">貼到 ChatGPT、Claude、Gemini 等，請它照大考中心的評分原則打分數，再把分數填回來。不想做非選擇題可以直接跳過。</p>
      ${show && q.rubric ? `<details class="fold"><summary>${icon('chevR', 'sm')}評分原則</summary><div class="long">${esc(q.rubric)}</div></details>` : ''}</div>`;
  }

  function drawRun(root, s, review) {
    const k = s.qs[s.i];
    const [d, q] = qOf(k);
    if (!d) { root.innerHTML = '<p class="hint">載入中…</p>'; Promise.all([...new Set(s.qs.map(x => x[0]))].map(id => load(id).catch(() => null))).then(draw); return; }
    const key = k.join('#'), a = s.a[key], show = review || s.shown.includes(key);
    const left = s.dur ? s.dur - elapsed(s) : null;
    const flagged = s.f.includes(key);
    const head = `<div class="xr-bar"><button class="icon-btn" type="button" data-xact="${review ? 'result' : 'home'}" aria-label="離開">${icon('x')}</button>
      <div class="xr-t"><b>${esc(s.title)}</b><small>${s.qs.length > 1 ? `第 ${s.i + 1}／${s.qs.length} 題` : ''}${s.pid ? '' : `・${d.y} ${KIND[d.kind]}${d.subj}`}</small></div>
      ${review ? '<span class="xr-tag">檢討</span>' : `<span class="xr-time${left != null && left < 300 ? ' low' : ''}" id="xTime">${left != null ? fmtT(left) : fmtT(elapsed(s))}</span>`}
      <button class="icon-btn" type="button" data-xact="grid" aria-label="題號列表">${icon('plan')}</button></div>`;
    const grid = ui.grid ? `<div class="xgrid">${s.qs.map((x, i) => { const kk = x.join('#'), [, qq] = qOf(x); const done = answered(s.a[kk]); const st = review || s.shown.includes(kk) ? (qq && qq.type !== 'open' ? (isRight(qq, s.a[kk]) ? ' ok' : ' bad') : '') : ''; return `<button type="button" data-xgo="${i}" class="${done ? 'done' : ''}${s.f.includes(kk) ? ' flag' : ''}${i === s.i ? ' cur' : ''}${st}">${qq ? esc(qq.n) : '?'}</button>`; }).join('')}</div>` : '';
    const sec = d.secs[q.sec];
    const tag = `<div class="xq-h"><span class="xq-n">${typeof q.n === 'number' ? q.n + '.' : esc(q.n)}</span><span class="xq-type">${TYPE[q.type] || ''}・${q.pts} 分</span>${q.topic && !(sec && sec.name.includes(q.topic)) ? `<span class="xq-cat">${esc(q.topic)}</span>` : sec ? `<span class="muted">${esc(sec.name.replace(/^[一二三四五六七八九十]+、/, ''))}</span>` : ''}${review ? '' : `<button type="button" class="xq-flag" data-xact="flag" aria-pressed="${flagged}">${icon('flag', 'sm')}${flagged ? '已標記' : '標記'}</button>`}</div>`;
    const stem = q.img ? q.img.map(src => `<img class="crop" src="exams/${src}" alt="第 ${q.n} 題" loading="lazy">`).join('') : q.html ? fixSrc(q.html) : q.blank ? `<p class="muted">${q.type === 'open' || q.g != null && d.items[q.g].img ? `第 ${q.n} 題的題目在上面的題組裡` : `文章裡的第 ${q.n} 格`}</p>` : '';
    let ansArea = '';
    if (q.type === 'single' || q.type === 'multi') ansArea = optionsHTML(q, a, s.x[key], show);
    else if (q.type === 'fill') ansArea = fillHTML(q, a, show);
    else ansArea = openHTML(d, q, a, show);
    let verdict = '';
    if (show && q.type !== 'open') {
      const ok = isRight(q, a), got = score(q, a);
      verdict = q.ans === '＊' ? `<p class="xv ok">${icon('info', 'sm')}這題大考中心公布「無答案」，每個人都得分。</p>` : `<p class="xv ${ok ? 'ok' : 'bad'}">${ok ? `${icon('check', 'sm')}答對` : `${icon('x', 'sm')}${answered(a) ? '答錯' : '沒作答'}${got > 0 ? `（得 ${got} 分）` : ''}`}・正確答案 <b>${q.type === 'fill' ? q.ans.map((v, i) => `${q.cells[i]}：${v}`).join('、') : esc(q.ans || '—')}</b></p>`;
    }
    const last = s.i === s.qs.length - 1;
    const practiceCheck = s.mode === 'practice' && !review && !show && q.type !== 'open';
    const foot = `<div class="xr-foot"><button class="btn" type="button" data-xact="prev" ${s.i ? '' : 'disabled'}>上一題</button>
      ${practiceCheck ? `<button class="btn primary" type="button" data-xact="check" ${answered(a) ? '' : 'disabled'}>對答案</button>` : ''}
      ${last ? (review ? '' : `<button class="btn ${practiceCheck ? '' : 'primary'}" type="button" data-xact="submit">${s.mode === 'full' ? '交卷' : '結束'}</button>`) : `<button class="btn ${practiceCheck ? '' : 'primary'}" type="button" data-xact="next">下一題</button>`}</div>`;
    root.innerHTML = `${head}${grid}<div class="xr-body${q.g != null ? ' two' : ''}">${passageHTML(d, q, review)}<div class="xq">${tag}<div class="xq-stem">${stem}</div>${ansArea}${verdict}</div></div>${foot}
      ${d.ref ? `<details class="fold xref"><summary>${icon('chevR', 'sm')}參考公式和數值</summary><div class="xg-b">${fixSrc(d.ref)}</div></details>` : ''}`;
    tick();
  }

  function drawResult(root, s) {
    const rows = s.qs.map((k, i) => {
      const [d, q] = qOf(k);
      if (!q) return '';
      const a = s.a[k.join('#')];
      const v = score(q, a);
      const ok = q.type === 'open' ? null : isRight(q, a);
      const mine = q.type === 'fill' ? (Array.isArray(a) ? a.map(x => x || '·').join(' ') : '—') : q.type === 'multi' ? (a && a.length ? a.join('') : '—') : q.type === 'open' ? (a && a.text ? '有作答' : '—') : a || '—';
      return `<tr class="${ok === true ? 'ok' : ok === false ? 'bad' : ''}"><td><button type="button" class="textbtn" data-xrev="${i}">${s.pid ? '' : esc(`${d.y}${KIND[d.kind]} `)}${esc(q.n)}</button></td><td>${TYPE[q.type] || ''}</td><td>${esc(mine)}</td><td>${q.type === 'fill' ? esc(q.ans.join(' ')) : q.type === 'open' ? '—' : esc(q.ans || '—')}</td><td class="num">${v == null ? '—' : v}／${q.pts}</td></tr>`;
    }).join('');
    const nOpen = s.qs.filter(k => { const [, q] = qOf(k); return q && q.type === 'open'; }).length;
    const pct = s.max ? Math.round((s.got / s.max) * 100) : 0;
    root.innerHTML = `<header class="page-h"><div><h1 class="hi">${icon('check')}<span>${esc(s.title)}</span></h1><p>${s.mode === 'full' ? '模擬考' : '練習'}・用時 ${fmtT(elapsed(s))}${s.dur ? `（限時 ${Math.round(s.dur / 60)} 分）` : ''}</p></div></header>
      <section class="sec xres"><div class="xres-big"><b class="num">${s.got}</b><span>／${s.max} 分</span><small>${pct}%</small></div>
        <p class="sub">${nOpen ? `另有 ${nOpen} 題非選擇題${s.qs.some(k => { const [, q] = qOf(k); const a = s.a[k.join('#')]; return q && q.type === 'open' && a && a.ai != null; }) ? '，有填 AI 分數的已算進去' : '沒有算分'}。` : ''}答錯的題目會放進錯題本。這是原始分數，不是級分。</p>
        <div class="mv-act"><button class="btn primary sm" type="button" data-xrev="0">${icon('search', 'sm')}逐題檢討</button><button class="btn sm" type="button" data-xact="wrong" ${ex().wrong.length ? '' : 'disabled'}>錯題本（${ex().wrong.length}）</button><button class="btn sm" type="button" data-xact="home">回考古題</button></div></section>
      <section class="sec"><div class="tablewrap"><table class="xrt"><thead><tr><th>題</th><th>題型</th><th>你的答案</th><th>正確答案</th><th>得分</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  // ---------------------------------------------------------------- the clock
  let timer = null;
  function tick() {
    clearInterval(timer);
    timer = setInterval(() => {
      const s = sess(), t = document.getElementById('xTime');
      if (!s || s.done || !t || ui.view !== 'run') { clearInterval(timer); return; }
      if (s.dur) {
        const left = s.dur - elapsed(s);
        t.textContent = fmtT(Math.max(0, left));
        t.classList.toggle('low', left < 300);
        if (left <= 0) { toast('時間到，自動交卷'); submit(); }
      } else t.textContent = fmtT(elapsed(s));
    }, 1000);
  }

  // ---------------------------------------------------------------- the AI prompt for a 非選擇題
  const plainOf = h => String(h || '').replace(/<math[\s\S]*?<\/math>/g, m => m.replace(/<[^>]+>/g, '')).replace(/<br\s*\/?>|<\/p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
  function aiPrompt(d, q, text) {
    const g = q.g != null ? d.items[q.g] : null;
    const qText = q.html ? plainOf(q.html) : q.text || '';
    const gText = g ? (g.html ? plainOf(g.html) : g.text || '') : '';
    return `你是大學入學考試中心的閱卷老師。請依照下面的「評分原則」批改這位考生的作答：給一個分數（0–${q.pts} 分），說明哪裡得分、哪裡扣分，再告訴他怎麼改進。請用繁體中文（台灣用語）。

【考科】${d.y} 學年度${d.kind === 'gsat' ? '學科能力測驗' : '分科測驗'} ${d.subj}，第 ${q.n} 題（${q.pts} 分）
${gText ? `\n【題組文章／資料】\n${gText}\n` : ''}
【題目】
${qText || '（這題有圖，題目請看附上的截圖或原試卷）'}

【評分原則／參考答案（大考中心公布）】
${q.rubric || d.rubric || '（沒有取得評分原則，請依一般閱卷標準）'}

【考生作答】
${text || '（還沒作答）'}

請在最後一行只寫：得分：X 分`;
  }

  // ---------------------------------------------------------------- events
  function onClick(ev) {
    const b = ev.target.closest('button, summary');
    if (!b || !(el() && el().contains(b) || b.closest('#xMode'))) return false;
    const ds = b.dataset, s = sess();
    if (ds.xpaper) { ui.pick = ds.xpaper; pickMode(ds.xpaper); return true; }
    if (ds.xqn) { ui.qn = +ds.xqn; draw(); return true; }
    if (ds.xcat != null) { ui.cat = ds.xcat; draw(); return true; }
    if (ds.xgo != null && s) { s.i = +ds.xgo; ui.grid = false; ui.cell = 0; save(); draw(); window.scrollTo(0, 0); return true; }
    if (ds.xrev != null && s) { s.i = +ds.xrev; ui.view = 'review'; draw(); window.scrollTo(0, 0); return true; }
    if (ds.xa && s) {
      const k = s.qs[s.i].join('#'), [, q] = qOf(s.qs[s.i]);
      if (q.type === 'multi') { const a = new Set(s.a[k] || []); a.has(ds.xa) ? a.delete(ds.xa) : a.add(ds.xa); s.a[k] = q.labels.filter(l => a.has(l)); }
      else s.a[k] = s.a[k] === ds.xa ? '' : ds.xa;
      // choosing an option you had crossed out brings it back
      if (s.x[k]) s.x[k] = s.x[k].filter(l => l !== ds.xa);
      save(); draw(); return true;
    }
    if (ds.xx && s) {
      const k = s.qs[s.i].join('#'), x = new Set(s.x[k] || []);
      x.has(ds.xx) ? x.delete(ds.xx) : x.add(ds.xx);
      s.x[k] = [...x];
      // a crossed-out option is no longer chosen
      if (x.has(ds.xx)) { if (Array.isArray(s.a[k])) s.a[k] = s.a[k].filter(l => l !== ds.xx); else if (s.a[k] === ds.xx) s.a[k] = ''; }
      save(); draw(); return true;
    }
    if (ds.xcell != null) { ui.cell = +ds.xcell; draw(); return true; }
    if (ds.xkey && s) {
      const k = s.qs[s.i].join('#'), [, q] = qOf(s.qs[s.i]);
      const a = Array.isArray(s.a[k]) ? s.a[k].slice() : q.cells.map(() => '');
      if (ds.xkey === 'del') { a[ui.cell] = ''; ui.cell = Math.max(0, ui.cell - (a[ui.cell] ? 0 : 1)); }
      else { a[ui.cell] = ds.xkey; ui.cell = Math.min(q.cells.length - 1, ui.cell + 1); }
      s.a[k] = a; save(); draw(); return true;
    }
    const act = ds.xact;
    if (!act) return false;
    if (act === 'home') { ui.view = 'home'; ui.grid = false; draw(); window.scrollTo(0, 0); return true; }
    if (act === 'resume') { ui.view = 'run'; if (s && s.pauseAt) { s.paused += Date.now() - s.pauseAt; s.pauseAt = null; } draw(); return true; }
    if (act === 'quit') { ex().s = null; save(); draw(); return true; }
    if (act === 'result') { ui.view = 'result'; draw(); return true; }
    if (act === 'grid') { ui.grid = !ui.grid; draw(); return true; }
    if (act === 'flag' && s) { const k = s.qs[s.i].join('#'), i = s.f.indexOf(k); i >= 0 ? s.f.splice(i, 1) : s.f.push(k); save(); draw(); return true; }
    if (act === 'prev' && s) { s.i = Math.max(0, s.i - 1); ui.cell = 0; save(); draw(); window.scrollTo(0, 0); return true; }
    if (act === 'next' && s) { s.i = Math.min(s.qs.length - 1, s.i + 1); ui.cell = 0; save(); draw(); window.scrollTo(0, 0); return true; }
    if (act === 'check' && s) { const k = s.qs[s.i].join('#'); if (!s.shown.includes(k)) s.shown.push(k); const [d, q] = qOf(s.qs[s.i]); const e = ex(), key = qKey(d, q), i = e.wrong.indexOf(key); if (isRight(q, s.a[k])) { if (i >= 0) e.wrong.splice(i, 1); } else if (i < 0) e.wrong.push(key); save(); draw(); return true; }
    if (act === 'submit') {
      const left = s.qs.filter(k => !answered(s.a[k.join('#')])).length;
      if (s.mode === 'full' && left && !confirm(`還有 ${left} 題沒作答，確定交卷？`)) return true;
      submit(); window.scrollTo(0, 0); return true;
    }
    if (act === 'quick') { const sel = $('#xqSubj'); ui.qs = sel ? sel.value : ''; quick(ui.qs, ui.qn || 10, false, ui.cat).catch(() => toast('題目載入失敗，請確認網路連線')); return true; }
    if (act === 'wrong') { quick(null, 0, true).catch(() => toast('題目載入失敗，請確認網路連線')); return true; }
    if (act === 'ai' && s) {
      const [d, q] = qOf(s.qs[s.i]);
      const t = $('#xText') ? $('#xText').value : '';
      copyText(aiPrompt(d, q, t), '已複製：貼給 AI，再把分數填回來');
      return true;
    }
    if (act === 'full' || act === 'practice') { const id = ui.pick; ui.pick = null; $('#xMode') && $('#xMode').close(); startPaper(id, act).catch(() => toast('題目載入失敗，請確認網路連線')); return true; }
    if (act === 'modeClose') { $('#xMode').close(); return true; }
    return false;
  }
  function pickMode(id) {
    const p = INDEX.find(x => x.id === id);
    const dlg = $('#xMode');
    $('#xmBody').innerHTML = `<p class="mv-q">${p.y} 學年度${KIND[p.kind]}${esc(p.subj)}</p><p class="sub">${p.n} 題${p.open ? `（其中 ${p.open} 題非選擇題，${ex().open ? '會出現，自己用 AI 批改' : '預設跳過，可在考古題首頁打開'}）` : ''}・正式考試 ${p.min || '—'} 分鐘</p>
      <div class="xm-opts"><button class="xm-o" type="button" data-xact="full"><b>${icon('cal', 'sm')}模擬考</b><span>照正式時間倒數計時，交卷後才看答案和分數。</span></button>
      <button class="xm-o" type="button" data-xact="practice"><b>${icon('check', 'sm')}練習</b><span>不限時，每題作答後可以馬上對答案。</span></button></div>`;
    if (!dlg.open) dlg.showModal();
  }
  function onInput(ev) {
    const t = ev.target, s = sess();
    if (!s) return false;
    if (t.id === 'xText' || t.id === 'xAi') {
      const k = s.qs[s.i].join('#'), v = s.a[k] && typeof s.a[k] === 'object' && !Array.isArray(s.a[k]) ? s.a[k] : {};
      if (t.id === 'xText') v.text = t.value; else v.ai = t.value === '' ? null : +t.value;
      s.a[k] = v; save(); return true;
    }
    return false;
  }
  function onChange(ev) {
    const t = ev.target;
    if (t.id === 'xOpen') { ex().open = t.checked; save(); return true; }
    if (t.id === 'xqSubj') { ui.qs = t.value; ui.cat = ''; draw(); return true; }
    return false;
  }
  function onToggle(ev) {
    const t = ev.target;
    if (t.dataset && t.dataset.xg != null) { ui.gClosed = t.open ? null : +t.dataset.xg; return true; }
    return false;
  }
  // leaving the tab pauses a practice clock; a mock exam keeps running, like the real one
  function leave() { const s = sess(); if (s && !s.done && !s.dur && !s.pauseAt) { s.pauseAt = Date.now(); save(); } clearInterval(timer); }
  function enter() { const s = sess(); if (s && !s.done && s.pauseAt && ui.view === 'run') { s.paused += Date.now() - s.pauseAt; s.pauseAt = null; } draw(); }
  return { draw, enter, leave, onClick, onInput, onChange, onToggle, has: () => INDEX.length > 0 };
};
