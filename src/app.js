/* 116 申請入學選系: interface. Depends on window.Logic (src/logic.js, the pure scoring rules) and the embedded #app-data JSON. */
(function () {
  'use strict';
  const L = window.Logic;
  const D = JSON.parse(document.getElementById('app-data').textContent);
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = n => Number(n).toLocaleString('en-US');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const isNarrow = () => window.matchMedia('(max-width: 959px)').matches;

  // ------------------------------------------------------------------ reference data
  const SCHOOL = Object.fromEntries(D.schools.map(s => [s.id, s]));
  const BY_CODE = Object.fromEntries(D.depts.map(d => [d.c, d]));
  const GROUPS = ['資訊', '工程', '數理化', '醫藥衛生', '生命科學', '生物資源', '地球環境', '建築設計', '藝術', '社會心理', '大眾傳播', '外語', '文史哲', '教育', '法政', '管理', '財經', '遊憩運動', '其他'];
  const REGIONS = Object.keys(D.regions);
  const regionLabel = r => (r === '離島' ? r : r + '部');
  const CITY_REGION = {};
  for (const [r, cs] of Object.entries(D.regions)) cs.forEach(c => { CITY_REGION[c] = r; });
  const CATS = [['一般', '一般組'], ['公費', '公費生'], ['APCS', 'APCS 組'], ['術科', '術科（音樂、美術、體育）'], ['扶弱', '扶弱專組'], ['青儲', '青年儲蓄帳戶組']];
  const DEFAULT_CATS = ['一般', '公費', 'APCS'];
  const DEFAULT_TIERS = ['穩', '適中', '衝', '難', '無資料'];
  // 第二階段 filters: the 甄試 chips combine; the 學測 share is one choice (none picked = any share).
  const ST2 = [['noInterview', '不用面試'], ['noWritten', '不用筆試'], ['noVisit', '不用到校甄試']];
  const SAT = [['none', '不計學測', '二階不計學測', d => !d.sp], ['light', '20% 以下', '學測佔二階 20% 以下', d => (d.sp || 0) <= 20], ['heavy', '50% 以上', '學測佔二階 50% 以上', d => (d.sp || 0) >= 50]];
  const SAT_BY = Object.fromEntries(SAT.map(x => [x[0], x]));
  const ST2_TEST = { noInterview: d => !L.hasInterview(d), noWritten: d => !L.hasWritten(d), noVisit: L.noVisit };
  const SORTS = ['chance', 'select', 'sat', 'satLow', 'date', 'quota', 'code'];
  const TIERS = L.TIERS;
  const TC = { 穩: 't1', 適中: 't2', 衝: 't3', 難: 't4', 不符: 't5', 無資料: 't6' };
  const TIER_HELP = {
    穩: '每一關都高出 115 最低，就算門檻漲 1 級分也還會過',
    適中: '達到 115 的每一關，但差距小，或 116 規則有變',
    衝: '剛好等於 115 最後一關（要看超額篩選），或略低於 115 門檻',
    難: '明顯低於 115 門檻',
    不符: '檢定沒過，或沒考 116 要篩選的科目：一定進不了一階',
    無資料: '116 新設或改名、沒有 115 資料，或只用術科篩選（都會寫原因）',
  };
  const REVIEW = { A: '修課紀錄', B: '書面報告', C: '實作作品', D: '自然科學探究與實作成果', E: '社會領域探究活動成果', F: '自主學習計畫與成果', G: '社團活動經驗', H: '擔任幹部經驗', I: '服務學習經驗', J: '競賽表現', K: '非修課紀錄之成果作品', L: '檢定證照', M: '特殊優良表現證明', N: '多元表現綜整心得', O: '高中學習歷程反思', P: '就讀動機', Q: '未來學習計畫與生涯規劃' };
  const SCORE_KEYS = ['國', '英', '數A', '數B', '社', '自'];
  const ABBR = { 國: '國', 英: '英', 數A: '數A', 數B: '數B', 社: '社', 自: '自', 識: 'APCS觀念', 實: 'APCS實作' };
  const LV_SHORT = { 頂標: '頂', 前標: '前', 均標: '均', 後標: '後', 底標: '底' };
  const LS = 'apply116-v1';
  const PAGE = 50;
  const NAV = [['explore', '找校系', '找校系', 'search'], ['plan', '我的志願', '我的志願', 'plan'], ['boost', '怎麼進步', '怎麼進步', 'boost'], ['guide', '時程與規則', '時程規則', 'guide']];

  const ICON = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plan: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4 6.5h1.5M4 12h1.5M4 17.5h1.5"/>',
    boost: '<path d="M3 17.5 9.5 11l4 4L21 7.5"/><path d="M15 7.5h6v6"/>',
    guide: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>',
    star: '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.3v.1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.7v.1"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 18.5v.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-.5"/>',
    upload: '<path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 18.5v.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-.5"/>',
    print: '<path d="M7 9V4h10v5"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7"/><path d="M4 4v4.7h4.7"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
  };
  const icon = (n, cls) => `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

  // ------------------------------------------------------------------ state (same storage key and shape as v3, so saved scores and plans carry over)
  const DEFAULT = () => ({
    v: 1,
    scores: { 國: '', 英: '', 數A: '', 數B: '', 社: '', 自: '', 聽: '', 識: '', 實: '' },
    stdYear: '115',
    f: { q: '', groups: [], regions: [], own: 'all', tiers: DEFAULT_TIERS.slice(), cats: DEFAULT_CATS.slice(), st2: [], sat: 'all', sort: 'chance' },
    fav: [], plan: [], theme: '',
  });
  function sanitize(s) {
    const d = DEFAULT();
    if (!s || typeof s !== 'object' || s.v !== 1) return d;
    const arr = (x, ok) => (Array.isArray(x) ? x.filter(ok) : []);
    const f = { ...d.f, ...(s.f && typeof s.f === 'object' ? s.f : {}) };
    const out = { ...d, theme: ['light', 'dark'].includes(s.theme) ? s.theme : '', stdYear: D.std[s.stdYear] ? String(s.stdYear) : d.stdYear, f };
    for (const k of Object.keys(d.scores)) {
      const v = s.scores ? s.scores[k] : '';
      if (k === '聽') out.scores[k] = ['A', 'B', 'C', 'F'].includes(String(v).toUpperCase()) ? String(v).toUpperCase() : '';
      else { const n = Number(v); out.scores[k] = v !== '' && v != null && Number.isInteger(n) && n > 0 && n <= (k === '識' || k === '實' ? 5 : 15) ? String(n) : ''; }
    }
    f.q = typeof f.q === 'string' ? f.q : '';
    f.groups = arr(f.groups, g => GROUPS.includes(g));
    f.regions = arr(f.regions, r => REGIONS.includes(r));
    f.tiers = Array.isArray(f.tiers) ? f.tiers.filter(t => TIERS.includes(t)) : d.f.tiers;
    f.cats = Array.isArray(f.cats) ? f.cats.filter(c => CATS.some(x => x[0] === c)) : d.f.cats;
    // v3 kept「學測佔 50% 以上」among the 第二階段 chips; it is now one of the 學測-share choices.
    if (Array.isArray(f.st2) && f.st2.includes('satHeavy') && !(s.f && s.f.sat)) f.sat = 'heavy';
    f.st2 = arr(f.st2, k => ST2.some(x => x[0] === k));
    if (!SAT_BY[f.sat]) f.sat = 'all';
    if (!['all', 'pub', 'pri'].includes(f.own)) f.own = 'all';
    if (!SORTS.includes(f.sort)) f.sort = 'chance';
    out.fav = [...new Set(arr(s.fav, c => BY_CODE[c]))];
    out.plan = [...new Set(arr(s.plan, c => BY_CODE[c]))].slice(0, 6);
    return out;
  }
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(LS)); } catch (e) { /* storage unavailable: start fresh */ }
    return sanitize(s);
  }
  let st = load();
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) { /* storage blocked: keep working in memory */ } }, 150);
  }
  const ui = { tab: 'explore', scoreOpen: false, more: false, catsOpen: false, helpOpen: false, shown: PAGE, visible: 0, tryS: null, sheet: false };

  // ------------------------------------------------------------------ evaluation (cached until scores or 五標 year change)
  let EV = new Map(), evSig = null;
  const hasScores = S => SCORE_KEYS.some(k => L.val(S || st.scores, k) != null);
  const opts = () => ({ std: D.std[st.stdYear], stdByYear: D.std, stdYear: st.stdYear, pct: D.pct });
  function ensureEval() {
    const sig = JSON.stringify(st.scores) + '|' + st.stdYear;
    if (sig === evSig) return;
    evSig = sig;
    EV = new Map();
    if (!hasScores()) return;
    const o = opts();
    for (const d of D.depts) EV.set(d.c, L.evaluate(d, st.scores, o));
  }
  const tierOf = d => { const e = EV.get(d.c); return e ? e.tier : null; };

  // ------------------------------------------------------------------ formatting helpers
  const sch = d => SCHOOL[d.sid].n;
  const isPub = d => SCHOOL[d.sid].pub;
  const catOf = d => (d.cats.length ? d.cats : ['一般']);
  const subj = k => L.SUBJ_NAME[k] || k;
  const partsLabel = ps => (ps.length === 1 ? subj(ps[0]) : ps.length === 2 ? ps.map(subj).join('+') : ps.map(p => ABBR[p] || p).join('+'));
  const stageName = s => (s.arts || !s.s ? s.raw : s.apcs ? subj(s.s[0]) : partsLabel(s.s));
  const cutLabel = c => (!c.s ? c.raw : stageName(c) + ' ' + c.v + (c.apcs ? ' 級' : ''));
  function fmtTop(x) {
    if (x == null) return '';
    if (x < 1) return '前 ' + x.toFixed(2) + '%';
    if (x < 10) return '前 ' + x.toFixed(1) + '%';
    return '前 ' + Math.round(x) + '%';
  }
  function levelOf(k, v, year) {
    const s = D.std[year || st.stdYear] && D.std[year || st.stdYear][k];
    if (!s || !v) return '';
    for (const l of L.LEVELS) if (v >= s[l]) return l;
    return '未達底標';
  }
  const mdOf = s => { const m = /116\.(\d+)\.(\d+)/.exec(s || ''); return m ? String(m[1]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0') : null; };
  const rocDate = s => { const md = mdOf(s); return md ? L.fmtDay(md) : (s && s !== '--' ? s : '—'); };
  const rocText = s => String(s || '—').replace(/116\.(\d+)\.(\d+)/g, '$1/$2');
  function consecutive(days) {
    for (let i = 1; i < days.length; i++) {
      const a = new Date(2027, +days[i - 1].slice(0, 2) - 1, +days[i - 1].slice(3));
      const b = new Date(2027, +days[i].slice(0, 2) - 1, +days[i].slice(3));
      if (Math.round((b - a) / 864e5) !== 1) return false;
    }
    return true;
  }
  function daysText(d, bare) {
    const ds = d.idays.slice().sort();
    // 分則 shows "--" when there is no 指定項目甄試 at all (every such 系 is review-only).
    if (!ds.length) return '不用到校甄試';
    const t = ds.length > 1 && consecutive(ds) ? L.fmtDay(ds[0]) + '–' + L.fmtDay(ds[ds.length - 1]) : ds.map(L.fmtDay).join('、');
    return bare ? t : '甄試 ' + t;
  }
  const shortItem = n => (n === '審查資料' ? '審查' : n);
  /** One line for lists, e.g. "學測 40% · 審查 30% · 面試 30%"; leads with 不計學測 when the 二階 total leaves 學測 out. */
  const partsLine = (d, full) => [d.sp ? '' : '不計學測', ...L.stage2(d).map(x => `${full ? x.n : shortItem(x.n)} ${x.p}%`)].filter(Boolean).join(full ? '・' : ' · ');
  function thList(d) {
    const items = d.sub.filter(s => s.t);
    const math = items.filter(s => (s.k === '數A' || s.k === '數B') && !s.apcs);
    const out = [];
    for (const s of items) {
      if (s.k === '聽') out.push('英聽' + s.t);
      else if (s.apcs) out.push(subj(s.p[0]) + ' ' + s.t + ' 級');
      else if (math.length === 2 && (s.k === '數A' || s.k === '數B')) { if (s.k === '數A') out.push(math[0].t === math[1].t ? `數A或數B${math[0].t}` : `數A${math[0].t}或數B${math[1].t}`); }
      else out.push((ABBR[s.k] || s.k) + s.t);
    }
    return out;
  }
  function requirementLine(d) {
    const th = d.sub.filter(s => s.t).map(s => (s.k === '聽' ? '英聽' + s.t : s.apcs ? subj(s.p[0]) + s.t + '級' : subj(s.k).replace('數學', '數') + s.t));
    const cut = d.r115 ? (d.r115.cut.length ? d.r115.cut.map(c => c.raw).join(' → ') : '115 沒篩人') : '無 115 資料（' + (d.why || '116 新設或改名') + '）';
    return (th.length ? '檢定 ' + th.join('、') : '無檢定') + '　|　115 一階 ' + cut;
  }
  const hayCache = new Map();
  function hay(d) {
    let h = hayCache.get(d.c);
    if (!h) { h = [sch(d), d.n, d.c, d.g.join(' '), d.rv || '', d.rn || '', d.iv || '', d.notes || '', d.city, d.st2.map(x => x.i).join(' ')].join(' ').toLowerCase(); hayCache.set(d.c, h); }
    return h;
  }
  const todayISO = () => { const t = new Date(); return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const daysUntil = iso => Math.round((new Date(iso + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 864e5);

  // ------------------------------------------------------------------ filtering
  let qTerms = [];
  const catsChanged = () => st.f.cats.length !== DEFAULT_CATS.length || DEFAULT_CATS.some(c => !st.f.cats.includes(c));
  function passes(d, skip) {
    const f = st.f;
    if (skip !== 'groups' && f.groups.length && !d.g.some(g => f.groups.includes(g))) return false;
    if (skip !== 'regions' && f.regions.length && !f.regions.includes(CITY_REGION[d.city])) return false;
    if (skip !== 'own' && f.own !== 'all' && (isPub(d) ? 'pub' : 'pri') !== f.own) return false;
    if (skip !== 'cats') {
      if (!catOf(d).some(c => f.cats.includes(c))) return false;
      if (d.cats.includes('青儲') && !f.cats.includes('青儲')) return false;
      if (d.cats.includes('扶弱') && !f.cats.includes('扶弱')) return false;
    }
    if (skip !== 'sat' && f.sat !== 'all' && !SAT_BY[f.sat][3](d)) return false;
    if (skip !== 'st2' && f.st2.some(k => !ST2_TEST[k](d))) return false;
    if (qTerms.length) { const h = hay(d); if (!qTerms.every(t => h.includes(t))) return false; }
    return true;
  }
  const baseFiltered = skip => D.depts.filter(d => passes(d, skip));
  const filterCount = () => st.f.groups.length + st.f.regions.length + (st.f.own !== 'all' ? 1 : 0) + (st.f.sat !== 'all' ? 1 : 0) + st.f.st2.length + (catsChanged() ? 1 : 0);
  function scopeLabel() {
    const f = st.f, p = [];
    if (f.groups.length) p.push(f.groups.join('、'));
    if (f.regions.length) p.push(f.regions.map(regionLabel).join('、'));
    if (f.own !== 'all') p.push(f.own === 'pub' ? '公立' : '私立');
    if (f.sat !== 'all') p.push(SAT_BY[f.sat][2]);
    f.st2.forEach(k => p.push(ST2.find(x => x[0] === k)[1]));
    if (f.q.trim()) p.push('「' + f.q.trim() + '」');
    return p.join(' · ');
  }
  function sorted(list) {
    const k = st.f.sort;
    const ti = d => { const t = tierOf(d); return t ? TIERS.indexOf(t) : 9; };
    const by = {
      chance: (a, b) => (ti(a) - ti(b)) || ((L.selectivity(b) || 0) - (L.selectivity(a) || 0)),
      select: (a, b) => (L.selectivity(b) || 0) - (L.selectivity(a) || 0),
      sat: (a, b) => (b.sp || 0) - (a.sp || 0),
      satLow: (a, b) => (a.sp || 0) - (b.sp || 0),
      date: (a, b) => ((a.idays[0] || '99') < (b.idays[0] || '99') ? -1 : (a.idays[0] || '99') > (b.idays[0] || '99') ? 1 : 0),
      quota: (a, b) => b.q - a.q,
      code: () => 0,
    }[k] || (() => 0);
    return list.slice().sort((a, b) => by(a, b) || (a.c < b.c ? -1 : 1));
  }

  // ------------------------------------------------------------------ small components
  const pillHTML = (t, cls) => `<span class="pill ${t ? TC[t] : 't0'}${cls ? ' ' + cls : ''}">${t || '—'}</span>`;
  function deltaHTML(diff, last) {
    if (diff == null) return '';
    if (diff > 0) return `<span class="delta up">+${diff}</span>`;
    if (diff === 0) return last ? '<span class="delta eq">同分，看超篩</span>' : '<span class="delta up">剛好</span>';
    return `<span class="delta down">${diff}</span>`;
  }
  const noteHTML = (kind, html) => `<div class="note ${kind}">${icon(kind === 'warn' ? 'alert' : 'info')}<div>${html}</div></div>`;
  function focusKey(el) {
    if (!el || !el.dataset) return null;
    for (const a of ['slider', 'try', 'focus', 'tier', 'group', 'region', 'own', 'cat', 'sat', 'st2', 'listen', 'fav', 'plan', 'up', 'down', 'act', 'open']) {
      if (el.dataset[a] != null) return `[data-${a}="${CSS.escape(el.dataset[a])}"]`;
    }
    return el.id ? '#' + CSS.escape(el.id) : null;
  }
  function keepFocus(root, fn) {
    const a = document.activeElement;
    const key = a && a !== document.body && root.contains(a) ? focusKey(a) : null;
    fn();
    if (key) { const n = root.querySelector(key); if (n && n !== document.activeElement) n.focus({ preventScroll: true }); }
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    const host = $('dialog[open]') || document.body;
    if (t.parentNode !== host) host.appendChild(t);
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ------------------------------------------------------------------ score sheet
  function valueHTML(k, v, max) {
    if (!v) return '<span class="none">沒考</span>';
    if (max !== 15) return `<b>${v}</b><span>級</span>`;
    const lv = levelOf(k, v);
    const p = L.topPercent(D.pct, [k], v);
    return `<b>${v}</b><span>級分</span>${lv ? `<span class="lv">${lv}</span>` : ''}${p != null ? `<span>115 ${fmtTop(p)}</span>` : ''}`;
  }
  const valueText = (k, v, max) => (!v ? '沒考' : max === 15 ? `${v} 級分${levelOf(k, v) ? '，' + levelOf(k, v) : ''}` : `${v} 級`);
  function marksHTML(k, max, v) {
    const std = max === 15 && D.std[st.stdYear] ? D.std[st.stdYear][k] : null;
    if (!std) return '';
    const lv = v ? levelOf(k, v) : '';
    const byV = new Map();
    for (const l of L.LEVELS) { if (!byV.has(std[l])) byV.set(std[l], []); byV.get(std[l]).push(l); }
    return `<div class="marks" aria-hidden="true">${[...byV].map(([x, ls]) => `<span class="${ls.includes(lv) ? 'hit' : ''}" style="left:${(((x - 0.5) / max) * 100).toFixed(2)}%">${ls.map(l => LV_SHORT[l]).join('')}</span>`).join('')}</div>`;
  }
  function sliderHTML(kind, k, label, v, max) {
    const id = `lab-${kind}-${k}`;
    let cells = '';
    for (let i = 1; i <= max; i++) cells += `<span class="c${i <= v ? ' on' : ''}" style="--i:${i}"></span>`;
    return `<div class="srow">
      <div class="srow-h"><span class="srow-l" id="${id}">${esc(label)}</span><span class="srow-v">${valueHTML(k, v, max)}</span><button class="textbtn srow-x" type="button" data-clear="${kind}:${k}" aria-label="${esc(label)}設為沒考" ${v ? '' : 'hidden'}>設為沒考</button></div>
      <div class="track" role="slider" tabindex="0" data-${kind}="${k}" data-max="${max}" data-v="${v}" aria-labelledby="${id}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${v}" aria-valuetext="${esc(valueText(k, v, max))}" style="--n:${max}">${cells}</div>
      ${marksHTML(k, max, v)}
    </div>`;
  }
  function paintSlider(t, v) {
    const k = t.dataset.slider || t.dataset.try;
    const max = +t.dataset.max;
    t.dataset.v = v;
    $$('.c', t).forEach((c, i) => c.classList.toggle('on', i < v));
    t.setAttribute('aria-valuenow', v);
    t.setAttribute('aria-valuetext', valueText(k, v, max));
    const row = t.closest('.srow');
    row.querySelector('.srow-v').innerHTML = valueHTML(k, v, max);
    const x = row.querySelector('.srow-x');
    if (x) x.hidden = !v;
    const m = row.querySelector('.marks');
    if (m) m.outerHTML = marksHTML(k, max, v);
  }
  function listenHTML(v, kind) {
    return `<div class="segctl" role="group" aria-labelledby="lab-listen">${[['', '沒考'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['F', 'F']].map(([x, l]) => `<button type="button" data-listen="${x || 'none'}" aria-pressed="${(v || '') === x}">${l}</button>`).join('')}</div>`;
  }
  function scoreSummary() {
    const s = st.scores;
    const tiles = SCORE_KEYS.map(k => {
      const v = L.val(s, k);
      const p = v != null ? L.topPercent(D.pct, [k], v) : null;
      return `<button class="tile${v == null ? ' none' : ''}" type="button" data-act="editScores" data-focus="${k}" aria-label="${subj(k)} ${v == null ? '沒考' : v + ' 級分'}，按一下修改"><span class="k">${subj(k)}</span><span class="v">${v == null ? '—' : v}</span><span class="p">${v == null ? '沒考' : p != null ? fmtTop(p) : ''}</span></button>`;
    });
    tiles.push(`<button class="tile${s.聽 ? '' : ' none'}" type="button" data-act="editScores" data-focus="listen" aria-label="英聽 ${s.聽 || '沒考'}，按一下修改"><span class="k">英聽</span><span class="v">${s.聽 || '—'}</span><span class="p">${s.聽 ? '級' : '沒考'}</span></button>`);
    tiles.push(`<button class="tile edit" type="button" data-act="editScores">${icon('edit', 'sm')}<span>修改</span></button>`);
    return `<div class="panel-h"><h2>我的學測級分</h2><span class="hint">百分比是 115 考生排名</span></div><div class="tiles">${tiles.join('')}</div>`;
  }
  function scoreEditor() {
    const s = st.scores, any = hasScores();
    const years = Object.keys(D.std).sort().reverse().map(y => `<option value="${y}" ${y === st.stdYear ? 'selected' : ''}>${y} 學年度學測五標</option>`).join('');
    return `<div class="panel-h"><h2>我的學測級分</h2>${any || s.聽 ? '<button class="textbtn" type="button" data-act="clearScores">全部清除</button>' : ''}</div>
      <p class="panel-note">${any ? '點或拖曳格子改級分（鍵盤用方向鍵）。' : '還沒考也可以先填模考或目標分數，點格子就好。'}格子下方是 ${st.stdYear} 學年度五標。成績只存在這台裝置。</p>
      <div class="sliders">${SCORE_KEYS.map(k => sliderHTML('slider', k, subj(k), L.val(s, k) || 0, 15)).join('')}
        <div class="srow listen-row"><span class="srow-l" id="lab-listen">英聽</span>${listenHTML(s.聽)}</div>
      </div>
      <details class="more" id="moreScores" ${ui.more ? 'open' : ''}><summary>${icon('chevR', 'sm')}APCS、檢定用五標年份</summary><div class="more-b">
        ${sliderHTML('slider', '識', 'APCS 觀念', L.val(s, '識') || 0, 5)}
        ${sliderHTML('slider', '實', 'APCS 實作', L.val(s, '實') || 0, 5)}
        <label class="field">檢定用五標<span class="selectbox"><select id="stdYear">${years}</select>${icon('chevD', 'sm')}</span></label>
        <p class="hint">116 學測五標 2027/2/25 才公布，先用 ${st.stdYear} 年的。數學 A、B 都列為檢定時，過一科就好（甄選會規定）。</p>
      </div></details>
      ${any ? `<div class="panel-f"><button class="btn primary" type="button" data-act="doneScores">${icon('check', 'sm')}完成，看落點</button></div>` : ''}`;
  }
  function renderScorePanel() {
    const el = $('#scorePanel');
    const open = ui.scoreOpen || !hasScores();
    el.classList.toggle('editing', open);
    keepFocus(el, () => { el.innerHTML = open ? scoreEditor() : scoreSummary(); });
  }

  // ------------------------------------------------------------------ filters
  function chip(label, pressed, attr, n) {
    return `<button type="button" class="chip${n === 0 ? ' zero' : ''}" aria-pressed="${pressed}" ${attr}>${esc(label)}${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
  }
  function facet(skip, keys) {
    const c = {};
    for (const d of baseFiltered(skip)) for (const k of keys(d)) c[k] = (c[k] || 0) + 1;
    return c;
  }
  function renderFilterPanel() {
    const el = $('#filterPanel'), f = st.f;
    const gc = facet('groups', d => d.g);
    const rc = facet('regions', d => [CITY_REGION[d.city]]);
    const oc = facet('own', d => [isPub(d) ? 'pub' : 'pri']);
    const sc = facet('sat', d => SAT.filter(x => x[3](d)).map(x => x[0]));
    // 甄試 chips combine, so each count is what the list would show with that chip on.
    const pool = baseFiltered('st2'), xc = {};
    for (const [k] of ST2) xc[k] = pool.filter(d => ST2_TEST[k](d) && f.st2.every(x => x === k || ST2_TEST[x](d))).length;
    const n = filterCount();
    const h = `<div class="filter-h"><h2>篩選</h2><button class="textbtn" type="button" data-act="resetFilters" ${n ? '' : 'hidden'}>${icon('reset', 'sm')}重設</button></div>
      <div class="fsec"><h3>學群${f.groups.length ? '<button class="textbtn" type="button" data-act="groupsAll">全部學群</button>' : ''}</h3><div class="chips">${GROUPS.map(g => chip(g, f.groups.includes(g), `data-group="${g}"`, gc[g] || 0)).join('')}</div></div>
      <div class="fsec"><h3>地區</h3><div class="chips">${REGIONS.map(r => chip(regionLabel(r), f.regions.includes(r), `data-region="${r}"`, rc[r] || 0)).join('')}</div></div>
      <div class="fsec"><h3>公私立</h3><div class="segctl" role="group" aria-label="公私立">${[['all', '全部'], ['pub', '公立'], ['pri', '私立']].map(([k, l]) => `<button type="button" data-own="${k}" aria-pressed="${f.own === k}">${l}${k !== 'all' ? `<span class="muted num"> ${oc[k] || 0}</span>` : ''}</button>`).join('')}</div></div>
      <div class="fsec"><h3>第二階段</h3>
        <p class="fsub" id="satLab">學測佔二階總成績</p><div class="chips" role="group" aria-labelledby="satLab">${SAT.map(([k, l]) => chip(l, f.sat === k, `data-sat="${k}"`, sc[k] || 0)).join('')}</div>
        <p class="fsub" id="ivLab">甄試</p><div class="chips" role="group" aria-labelledby="ivLab">${ST2.map(([k, l]) => chip(l, f.st2.includes(k), `data-st2="${k}"`, xc[k] || 0)).join('')}</div></div>
      <div class="fsec"><details id="catsBox" ${ui.catsOpen || catsChanged() ? 'open' : ''}><summary>${icon('chevR', 'sm')}特殊組別${catsChanged() ? '（已變更）' : ''}</summary><div class="chips">${CATS.map(([k, l]) => chip(l, f.cats.includes(k), `data-cat="${k}"`)).join('')}</div><p class="hint">扶弱專組、青年儲蓄帳戶組和術科組別預設隱藏，多數限特定身分或要考術科。</p></details></div>`;
    keepFocus(el, () => { el.innerHTML = h; });
    const fc = $('#filterCount');
    fc.textContent = n ? String(n) : '';
  }
  function renderActive() {
    const f = st.f, out = [];
    const af = (label, attr) => `<button type="button" class="afchip" ${attr} aria-label="移除篩選：${esc(label)}">${esc(label)}${icon('x')}</button>`;
    if (f.q.trim()) out.push(af('「' + f.q.trim() + '」', 'data-act="clearQ"'));
    f.groups.forEach(g => out.push(af(g, `data-group="${g}"`)));
    f.regions.forEach(r => out.push(af(regionLabel(r), `data-region="${r}"`)));
    if (f.own !== 'all') out.push(af(f.own === 'pub' ? '公立' : '私立', 'data-own="all"'));
    if (f.sat !== 'all') out.push(af(SAT_BY[f.sat][2], 'data-sat="all"'));
    f.st2.forEach(k => out.push(af(ST2.find(x => x[0] === k)[1], `data-st2="${k}"`)));
    if (catsChanged()) out.push(af('特殊組別已變更', 'data-act="resetCats"'));
    if (out.length > 1) out.push('<button class="textbtn" type="button" data-act="resetAll">全部清除</button>');
    $('#activeFilters').innerHTML = out.join('');
  }

  // ------------------------------------------------------------------ overview (落點分布)
  function tierBarHTML(c, total, opts) {
    const W = (opts && opts.width) || 600;
    return `<div class="tierbar${opts && opts.small ? ' sm' : ''}" role="img" aria-label="${esc((opts && opts.label ? opts.label + '：' : '') + TIERS.map(t => `${t} ${c[t] || 0} 個`).join('，'))}">${TIERS.filter(t => c[t]).map(t => {
      const share = c[t] / (total || 1);
      const fits = !(opts && opts.small) && share * W >= String(c[t]).length * 8 + 16;
      const off = opts && opts.tiers ? !opts.tiers.includes(t) : false;
      return `<span class="tb-s ${TC[t]}${off ? ' off' : ''}" style="flex-grow:${c[t]}" title="${t} ${c[t]} 個（${Math.round(share * 100)}%）">${fits ? c[t] : ''}</span>`;
    }).join('')}</div>`;
  }
  function renderOverview(base) {
    const el = $('#overview');
    const scope = scopeLabel();
    const outCats = baseFiltered('cats').length - base.length;
    const head = `<div class="ov-t"><h2><b class="num">${fmtN(base.length)}</b> 個校系${scope ? ' · ' + esc(scope) : ''}</h2>${outCats > 0 ? `<button class="textbtn ov-note" type="button" data-act="showCats">另有 ${fmtN(outCats)} 個特殊組別沒列出</button>` : ''}</div>`;
    if (!hasScores()) {
      el.innerHTML = `<div class="ov-h">${head}</div><div class="cta">${icon('target')}<div><b>先輸入學測級分</b>（還沒考可以填模考或目標分數）。這裡會畫出你在這些校系的落點：哪些穩、哪些要衝、哪些被檢定擋住。現在每個校系下面先列出檢定和 115 一階最低級分。${isNarrow() ? '' : '成績在左邊輸入。'}</div></div>`;
      return;
    }
    const c = {};
    base.forEach(d => { const t = tierOf(d); c[t] = (c[t] || 0) + 1; });
    const good = (c['穩'] || 0) + (c['適中'] || 0);
    const W = el.clientWidth || 600;
    el.innerHTML = `<div class="ov-h">${head}<p>你有 <b>${good}</b> 個「穩」或「適中」${c['不符'] ? `，<b>${c['不符']}</b> 個一定進不了一階` : ''}</p></div>
      ${tierBarHTML(c, base.length, { width: W, tiers: st.f.tiers, label: '落點分布' })}
      <div class="legend" role="group" aria-label="要顯示哪些落點">${TIERS.map(t => `<button type="button" class="lg" data-tier="${t}" aria-pressed="${st.f.tiers.includes(t)}" title="${esc(TIER_HELP[t])}"><span class="sw ${TC[t]}"></span>${t}<b>${c[t] || 0}</b></button>`).join('')}</div>
      <details class="tierhelp" id="tierHelp" ${ui.helpOpen ? 'open' : ''}><summary>${icon('info', 'sm')}落點怎麼判斷？按標籤可以隱藏或顯示</summary><ul class="tierdefs">${TIERS.map(t => `<li>${pillHTML(t)}<span>${esc(TIER_HELP[t])}</span></li>`).join('')}</ul></details>`;
  }

  // ------------------------------------------------------------------ result rows
  function thFailParts(th) {
    const out = [];
    const either = th.items.filter(i => i.either);
    if (either.length && !either[0].groupOk) {
      const same = either.every(i => i.label === either[0].label);
      const taken = either.filter(i => i.mine != null);
      out.push({
        what: same ? `數A或數B ${either[0].label}` : either.map(i => `${ABBR[i.k]} ${i.label}`).join(' 或 '),
        need: either.map(i => `${ABBR[i.k]} ${i.need ?? '?'}`).join(' 或 '),
        mine: taken.length ? taken.map(i => `${ABBR[i.k]} ${i.mine}`).join('、') : '都沒考',
      });
    }
    th.items.filter(i => !i.either && !i.ok).forEach(i => out.push({
      what: `${subj(i.k)} ${i.label}`,
      need: i.k === '聽' ? i.need + ' 級' : String(i.need ?? '?'),
      mine: i.mine == null ? '沒考' : String(i.mine),
    }));
    return out;
  }
  function cmpHTML(d, e) {
    if (e.tier === '不符' && !e.th.ok) {
      return '<span class="lab">檢定沒過</span>' + thFailParts(e.th).map(x => `<span class="val">${esc(x.what)}</span><span class="lab">要 ${esc(x.need)}，你 ${esc(x.mine)}</span>`).join('<span class="sep">｜</span>');
    }
    const c = e.cmp;
    if (e.tier !== '不符' && e.tier !== '無資料' && c && c.stages && c.stages.length && !['none', 'arts'].includes(c.status)) {
      let s = null;
      if (c.status === 'fail') s = c.stages.filter(x => x.diff != null).sort((a, b) => a.diff - b.diff)[0];
      else if (c.status === 'edge') s = c.stages.find(x => x.last);
      else s = c.binding;
      if (s && s.mine != null) {
        const n = c.stages.filter(x => !x.arts).length;
        return `<span class="lab">115 最低</span><span class="val">${esc(cutLabel(s))}</span><span class="lab">你</span><span class="val">${s.mine}</span>${deltaHTML(s.diff, s.last)}${n > 1 ? `<span class="lab">共 ${n} 關，這是${s.last ? '最後一關' : c.status === 'fail' ? '差最多的一關' : '最接近門檻的一關'}</span>` : ''}`;
      }
    }
    return `<span>${esc(e.reasons[0] || '')}</span>`;
  }
  function reqHTML(d) {
    const th = thList(d);
    const r = d.r115;
    const cut = r ? (r.cut.length ? r.cut.map(cutLabel).join(' → ') : '沒有篩掉人') : '';
    return `<span class="lab">檢定</span><span class="val">${th.length ? esc(th.join('、')) : '不設'}</span><span class="sep">｜</span>` +
      (r ? `<span class="lab">115 一階最低</span><span class="val">${esc(cut)}</span>` : `<span class="lab">${esc(d.why || '116 新設或改名，115 沒有可對應的校系')}</span>`);
  }
  function metaHTML(d) {
    const parts = partsLine(d);
    return [`<span>名額 ${d.q}</span>`, `<span>${esc(daysText(d))}</span>`, `<span>${esc(d.city)}</span>`, parts ? `<span class="parts">${esc(parts)}</span>` : ''].join('');
  }
  function rowHTML(d) {
    const e = EV.get(d.c), t = e ? e.tier : null;
    const fav = st.fav.includes(d.c), pi = st.plan.indexOf(d.c);
    const name = sch(d) + ' ' + d.n;
    const warn = e && e.warnings.length ? `<div class="r-warn">${icon('alert')}<span>${esc(e.warnings[0])}</span></div>` : '';
    return `<li class="row" data-code="${d.c}" data-open="${d.c}">
      ${pillHTML(t)}
      <button class="r-title" type="button" data-open="${d.c}"><span class="sch">${esc(sch(d))}</span>${esc(d.n)}</button>
      <div class="r-act">${pi >= 0 ? `<span class="inplan">第 ${pi + 1} 志願</span>` : ''}<button class="star" type="button" data-fav="${d.c}" aria-pressed="${fav}" aria-label="${fav ? '取消收藏' : '收藏'}：${esc(name)}" title="${fav ? '取消收藏' : '收藏'}">${icon('star')}</button></div>
      <div class="r-cmp">${e ? cmpHTML(d, e) : reqHTML(d)}</div>
      ${warn}
      <div class="r-meta">${metaHTML(d)}</div>
    </li>`;
  }
  function renderList(base) {
    const has = hasScores();
    const list = has ? base.filter(d => st.f.tiers.includes(tierOf(d))) : base;
    const s = sorted(list);
    ui.visible = s.length;
    const group = has && st.f.sort === 'chance';
    const counts = {};
    if (group) s.forEach(d => { const t = tierOf(d); counts[t] = (counts[t] || 0) + 1; });
    let h = '', prev = null;
    for (const d of s.slice(0, ui.shown)) {
      const t = tierOf(d);
      if (group && t !== prev) { h += `<li class="ghead" aria-hidden="true">${pillHTML(t)}<span><b>${counts[t]}</b> 個 · ${esc(TIER_HELP[t])}</span></li>`; prev = t; }
      h += rowHTML(d);
    }
    if (!h) {
      const hiddenTiers = has && base.length > 0;
      h = `<li class="empty"><b>沒有符合的校系</b><span>${hiddenTiers ? '目前的落點標籤都被隱藏了，或篩選太嚴。' : '試著放寬篩選或換個關鍵字。'}</span><button class="btn sm" type="button" data-act="${hiddenTiers ? 'showTiers' : 'resetAll'}">${hiddenTiers ? '顯示所有落點' : '清除所有篩選'}</button></li>`;
    }
    $('#list').innerHTML = h;
    const sortName = $('#sort').selectedOptions[0] ? $('#sort').selectedOptions[0].textContent : '';
    const hidden = has ? TIERS.filter(t => !st.f.tiers.includes(t)) : [];
    $('#listbar').innerHTML = `<span>顯示 <b class="num">${fmtN(s.length)}</b> 個${hidden.length ? `（隱藏了${hidden.join('、')}）` : ''}</span><span>${esc(sortName)}</span>`;
    $('#more').innerHTML = s.length > ui.shown ? `<button class="btn" type="button" data-act="more">再顯示 ${Math.min(PAGE, s.length - ui.shown)} 個（還有 ${fmtN(s.length - ui.shown)} 個）</button>` : '';
    if (ui.sheet) $('#sheetDone').textContent = `看 ${fmtN(s.length)} 個結果`;
  }
  function renderExplore() {
    const q = st.f.q.trim().toLowerCase();
    qTerms = q ? q.split(/[\s,，、]+/).filter(Boolean) : [];
    if ($('#q').value !== st.f.q && document.activeElement !== $('#q')) $('#q').value = st.f.q;
    $('#clearQ').hidden = !st.f.q;
    $('#sort').value = st.f.sort;
    renderScorePanel();
    const base = baseFiltered();
    renderFilterPanel();
    renderActive();
    renderOverview(base);
    renderList(base);
  }

  // ------------------------------------------------------------------ department detail
  function reqRow(what, need, you, ok, extra) {
    return `<div class="req"><span class="what">${esc(what)}</span><span class="need">${esc(need)}</span>${extra ? `<span class="muted">${esc(extra)}</span>` : ''}${ok == null ? '' : `<span class="you">你 ${esc(you)}</span><span class="delta ${ok ? 'up' : 'down'}">${ok ? '過' : '沒過'}</span>`}</div>`;
  }
  function stepHTML(cls, mark, title, body) {
    return `<li class="step"><span class="dot ${cls}">${mark}</span><div><div class="step-t">${title}</div>${body}</div></li>`;
  }
  function thresholdStep(d, e) {
    const th = L.checkThreshold(d, st.scores, D.std[st.stdYear]);
    if (!th.items.length) return stepHTML('', '檢', '檢定', '<p class="step-d">不設檢定。</p>');
    const has = hasScores() || !!st.scores.聽;
    const rows = [];
    const either = th.items.filter(i => i.either);
    if (either.length) {
      const taken = either.filter(i => i.mine != null);
      rows.push(reqRow(either.map(i => `${subj(i.k)} ${i.label}`).join(' 或 '), either.map(i => `${ABBR[i.k]} ${i.need ?? '?'}`).join(' 或 ') + ' 級分以上', taken.length ? taken.map(i => `${ABBR[i.k]} ${i.mine}`).join('、') : '都沒考', has ? either[0].groupOk : null, '過一科就好'));
    }
    th.items.filter(i => !i.either).forEach(i => {
      const need = i.k === '聽' ? `${i.need} 級以上` : i.need == null ? '—' : /級$/.test(String(i.label)) ? `${i.need} 級以上` : `${i.need} 級分以上`;
      rows.push(reqRow(`${subj(i.k)} ${i.label}`, need, i.mine == null ? '沒考' : String(i.mine), has ? i.ok : null));
    });
    const cls = has ? (th.ok ? 'ok' : 'bad') : '';
    const risk = e && e.thRisk ? `<p class="step-d" style="color:var(--warn)">${esc(e.warnings.find(w => w.startsWith('檢定邊緣')) || '')}</p>` : '';
    return stepHTML(cls, has ? icon(th.ok ? 'check' : 'x') : '檢', `檢定<small>用 ${st.stdYear} 學年度五標換算</small>`, `<div class="reqs">${rows.join('')}</div>${risk}`);
  }
  function stageSteps(d, e) {
    const r = d.r115;
    if (!r || !r.cut.length) return '';
    const has = hasScores();
    const cmp = e && e.cmp ? e.cmp : L.compareCuts(r.cut, st.scores, D.pct);
    return cmp.stages.map((s, i) => {
      const title = `${s.last ? '最後一關' : `第 ${i + 1} 關`}<small>${esc(stageName(s))}</small>`;
      if (s.arts) return stepHTML('', i + 1, title, `<p class="step-d">115 最低 ${esc(s.raw)}：看術科成績，這個工具沒有術科資料。</p>`);
      const unit = s.apcs ? ' 級' : '';
      let cls = '', you = '';
      if (has) {
        if (s.mine == null) { cls = 'bad'; you = `<span class="you">你沒考${esc((s.missing || []).map(subj).join('、'))}</span><span class="delta down">沒過</span>`; }
        else { cls = s.diff > 0 ? 'ok' : s.diff === 0 ? (s.last ? 'eq' : 'ok') : 'bad'; you = `<span class="you">你 ${s.mine}${unit}</span>${deltaHTML(s.diff, s.last)}`; }
      }
      const notes = [];
      if (!s.apcs) notes.push(s.last ? `剛好 ${s.v} 要比同級分超額篩選，${s.v + 1} 以上直接過` : `${s.v} 以上進下一關，同分的人一起過`);
      if (has && s.topCut != null) notes.push(`你在 115 考生${fmtTop(s.topMine)}，門檻是${fmtTop(s.topCut)}`);
      else if (!s.apcs) { const p = L.topPercent(D.pct, s.s, s.v); if (p != null) notes.push(`門檻是 115 考生${fmtTop(p)}`); }
      return stepHTML(cls, i + 1, title, `<div class="reqs"><div class="req"><span class="what">115 最低 ${s.v}${unit}</span>${you}</div></div><p class="step-d">${esc(notes.join('。'))}</p>`);
    }).join('');
  }
  function stage1HTML(d, e) {
    const r = d.r115;
    const plan = L.screenPlan(d);
    let h = '<section class="d-sec"><h3>第一階段：一階篩選<small>檢定 → 倍率篩選 → 同級分超額篩選</small></h3>';
    const arts = d.arts ? d.arts.items.filter(i => i.i && i.i !== '--').map(i => `<span class="tagc">${esc(i.i)}${i.t ? ' 檢定' + esc(i.t) : ''}${i.m != null ? ' 倍率' + esc(i.m) : ''}</span>`).join('') : '';
    h += `<div class="plan116"><span>116 倍率篩選</span>${plan.length ? plan.map((p, i) => `<span class="tagc">${i + 1}. ${esc(partsLabel(p.parts))} × ${p.m}</span>`).join('') : '<span class="tagc">不篩學測</span>'}${arts}</div>`;
    if (r && r.chg) h += noteHTML('warn', `116 的篩選倍率或科目跟 115 不同（115 是 ${esc(Object.entries(r.mult || {}).map(([k, v]) => `${k} ${v} 倍`).join('、'))}），下面 115 的門檻只能粗略參考。`);
    if (r && r.via) h += noteHTML('warn', `這裡用的是${esc(r.via)}的 115 資料，不是同一個系組。`);
    if (!r) h += noteHTML('info', `沒有 115 資料：${esc(d.why || '116 新設或改名，115 沒有可對應的校系')}。${d.near ? `名稱相近的 115 校系：${esc(d.near.join('、'))}（沒有拿來算落點，請自己判斷）。` : ''}`);
    else if (!r.cut.length) h += noteHTML('info', '115 一階沒有篩掉人：通過檢定的人都進了二階。');
    h += `<ol class="steps" style="margin-top:16px">${thresholdStep(d, e)}${stageSteps(d, e)}${r && r.cut.length ? stepHTML('', '=', '同級分超額篩選<small>最後一關同分時，116 依序比</small>', `<p class="step-d">${esc(d.tbS || '—')}</p>`) : ''}</ol>`;
    if (r && r.majors) h += `<p class="hint" style="margin-top:10px">115 各主修最低：${esc(r.majors.map(m => m.major + ' ' + m.cut.map(c => c.raw).join('→')).join('；'))}</p>`;
    const e115 = r ? L.expected115(r) : null;
    h += `<dl class="kv" style="margin-top:18px"><dt>招生名額</dt><dd>${d.q}${d.gen !== '無' ? '（' + esc(d.gen) + '）' : ''}</dd><dt>預計甄試人數</dt><dd>${d.ei}${e115 ? `（115 約 ${e115}）` : ''}</dd>${r ? `<dt>115 對照</dt><dd>${esc(r.name)}（${r.code}）· 名額 ${r.q}</dd>` : ''}</dl></section>`;
    return h;
  }
  const joinAnd = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join('、') + '和' + a[a.length - 1]);
  const fmtPct = p => String(Math.round(p * 10) / 10);
  /** The 二階 total in one sentence (HTML), plus how many people the 系 expects to see per seat.
   *  Each number stays on one line with its words, so a phone never strands "1。" or splits 招生名額. */
  function stage2Lead(d) {
    const rest = L.stage2(d).filter(x => x.kind !== 'sat');
    const names = esc(joinAnd([...new Set(rest.map(x => x.n))]));
    const nw = t => `<span class="nw">${t}</span>`;
    let s = !rest.length ? '二階總成績全看學測。'
      : d.sp ? `學測佔二階總成績 ${nw(fmtPct(d.sp) + '%')}，${nw(`另外 ${fmtPct(100 - d.sp)}%`)} 看${names}。`
      : `二階總成績不計學測：學測只用在一階篩選，過了一階就看${names}。`;
    if (d.ei && d.q) { const r = d.ei / d.q; s += `${nw(`預計 ${d.ei} 人`)}參加二階，${nw(`招生名額 ${d.q} 人`)}，${nw(`約 ${r >= 10 ? Math.round(r) : fmtPct(r)} 取 1`)}。`; }
    return s;
  }
  // How each kind of 審查資料 is handed in (116 簡章總則：審查資料上傳).
  const REVIEW_HOW = {
    修課紀錄: '學習歷程資料庫提供',
    課程學習成果: '從學習歷程資料庫勾選，最多 3 件',
    多元表現: '從學習歷程資料庫勾選，最多 10 件，另寫綜整心得（800 字、3 張圖以內）',
    學習歷程自述: '自己寫，做成一個 PDF 上傳',
    其他: '自己做成一個 PDF，內容依各系規定',
  };
  const codeChip = (c, t) => `<span class="code">${c ? `<b>${esc(c)}</b>` : ''}${esc(t)}</span>`;
  function reviewHTML(d) {
    const gs = L.reviewGroups(d.rv);
    if (!gs.length) return '';
    return `<h4 class="d-h4">要交的審查資料</h4><div class="rgs">${gs.map(g => `<div class="rg"><p class="rg-h"><b>${esc(g.g)}</b>${REVIEW_HOW[g.g] ? `<span>${esc(REVIEW_HOW[g.g])}</span>` : ''}</p><div class="codes">${(g.g === '其他' ? g.items.map(it => codeChip(it.c, it.t)) : g.codes.map(c => codeChip(c, REVIEW[c] || ''))).join('')}</div></div>`).join('')}</div>`;
  }
  const foldHTML = (title, text) => `<details class="fold"><summary>${icon('chevR', 'sm')}${esc(title)}</summary><div class="long">${esc(text)}</div></details>`;
  function stage2HTML(d) {
    const parts = L.stage2(d);
    const sat = hasScores() ? L.satShare(d, st.scores) : null;
    let h = `<section class="d-sec"><h3>第二階段：總成績怎麼算<small>116 校系分則</small></h3><p class="s2lead">${stage2Lead(d)}</p>`;
    if (parts.length) {
      h += `<div class="wbars">${parts.map(x => `<div class="wbar"><span class="wl">${esc(x.n)}${x.t ? `<span class="muted">（${esc(x.t)}以上）</span>` : ''}</span><span class="wt"><i style="width:${x.p}%"></i>${x.kind === 'sat' && sat ? `<i class="mine" style="width:${sat.points.toFixed(1)}%"></i>` : ''}</span><b>${x.p}%</b></div>`).join('')}</div>`;
      if (sat) h += `<p class="hint">深色是你的學測部分：約 ${sat.points.toFixed(1)} / ${sat.of} 分（${Math.round(sat.pct * 100)}%）。依多數學校「級分 × 權重」換算的估計${sat.missing ? '，沒考的科目以 0 計' : ''}。</p>`;
    }
    const w = d.sub.filter(s => s.w != null).map(s => `${subj(s.k)} × ${s.w}`).join('、');
    h += `<dl class="kv" style="margin-top:14px"><dt>學測採計</dt><dd>${esc(w || '—')}</dd>
      <dt>甄試日期</dt><dd>${d.idays.length ? esc(rocText(d.idate)) : '不用到校甄試'}</dd><dt>審查資料截止</dt><dd>${esc(rocDate(d.dd))}</dd><dt>放榜</dt><dd>${esc(rocDate(d.rd))}</dd>
      <dt>甄試費</dt><dd>${d.fee ? fmtN(d.fee) + ' 元' : '—'}</dd><dt>總成績同分</dt><dd>${esc(d.tbT || '—')}</dd></dl>`;
    h += reviewHTML(d);
    if (d.rn) h += foldHTML('審查資料說明', d.rn);
    if (d.iv) h += foldHTML('甄試說明', d.iv);
    return h + '</section>';
  }
  function entranceText(r) {
    if (!r || !r.entr || !r.entr.length) return null;
    return r.entr.map(x => {
      const who = [x.g !== '無' ? x.g : '', x.a !== '--' ? x.a : ''].filter(Boolean).join(' ');
      const s = x.s === '正取' ? '只分發到正取（備取沒有遞補）' : x.s === '無' ? '沒有人分發入學' : `遞補到備取第 ${x.s.replace('備', '')} 名`;
      return (who ? who + '：' : '') + s;
    }).join('；');
  }
  function detailBody(d) {
    const e = EV.get(d.c);
    let h = '';
    if (e) {
      h += `<div class="verdict ${TC[e.tier]}">${pillHTML(e.tier, 'lg2')}<div><p class="v-t">${esc(TIER_HELP[e.tier])}</p>${e.reasons.length ? `<ul>${e.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${e.warnings.length ? `<ul class="warns">${e.warnings.map(x => `<li>${icon('alert')}<span>${esc(x)}</span></li>`).join('')}</ul>` : ''}</div></div>`;
    } else {
      h += `<div style="margin-top:18px">${noteHTML('info', '輸入學測級分後，這裡會逐關比較你和 115 的門檻，判斷落點。 <button class="textbtn" type="button" data-act="goScores">去輸入成績</button>')}</div>`;
    }
    h += stage1HTML(d, e) + stage2HTML(d);
    const et = entranceText(d.r115);
    if (et) h += `<section class="d-sec"><h3>115 錄取後統一分發<small>參考</small></h3><p style="font-size:14.5px">${esc(et)}。</p><p class="hint" style="margin-top:6px">遞補越深，代表越多錄取的人最後選了別的系，備取比較有機會。</p></section>`;
    const ex = Object.entries(d.extra || {}).map(([k, v]) => ({ indigenous_extra: '原住民外加', offshore_extra: '離島外加', vision_extra: '願景計畫外加' }[k] + ' ' + v));
    h += `<section class="d-sec"><h3>備註</h3><div class="long">${esc(d.notes || '—')}</div>
      <p class="src">${[...ex, d.vul ? '列在甄選會「116 訂有扶助弱勢招生措施校系一覽表」' : '', '學群：' + d.g.join('、')].filter(Boolean).map(esc).join(' · ')}<br>資料：甄選會 116 校系分則（${esc(D.fetched116)} 擷取）。以官方網站最新公告為準。</p></section>`;
    return h;
  }
  function detailFoot(d) {
    const fav = st.fav.includes(d.c), pi = st.plan.indexOf(d.c);
    return `<button class="btn" type="button" data-fav="${d.c}" aria-pressed="${fav}" aria-label="收藏" title="${fav ? '已收藏，按一下取消' : '收藏'}">${icon('star')}<span class="lbl">${fav ? '已收藏' : '收藏'}</span></button>
      <button class="btn main${pi >= 0 ? '' : ' primary'}" type="button" data-plan="${d.c}">${pi >= 0 ? `${icon('minus')}移出第 ${pi + 1} 志願` : `${icon('plus')}排入志願（${st.plan.length}/6）`}</button>
      <a class="btn ghost" href="${esc(d.url)}" target="_blank" rel="noopener">官方分則${icon('ext', 'sm')}</a>`;
  }
  let detailCode = null, detailPushed = false;
  function fillDetail(code, keepScroll) {
    const d = BY_CODE[code];
    ensureEval();
    const body = $('#dBody');
    const top = body.scrollTop;
    $('#dSchool').textContent = sch(d);
    $('#dTitle').textContent = d.n;
    $('#dMeta').textContent = [d.c, d.city, isPub(d) ? '公立' : '私立', d.g.join('、')].join(' · ');
    body.innerHTML = detailBody(d);
    $('#dFoot').innerHTML = detailFoot(d);
    body.scrollTop = keepScroll ? top : 0;
  }
  function openDetail(code, fromRoute) {
    if (!BY_CODE[code]) return;
    detailCode = code;
    fillDetail(code);
    const dlg = $('#detail');
    if (!dlg.open) dlg.showModal();
    $('#dBody').scrollTop = 0;
    $('#dClose').focus({ preventScroll: true });
    if (!fromRoute && location.hash !== '#d=' + code) { history.pushState(null, '', '#d=' + code); detailPushed = true; }
  }
  const refreshDetail = () => { if ($('#detail').open && detailCode) fillDetail(detailCode, true); };
  function onDetailClosed() {
    detailCode = null;
    if (/^#d=/.test(location.hash)) {
      if (detailPushed) { detailPushed = false; history.back(); }
      else history.replaceState(null, '', tabHash(ui.tab));
    } else detailPushed = false;
  }

  // ------------------------------------------------------------------ favourites and plan
  function toggleFav(code) {
    const i = st.fav.indexOf(code);
    if (i >= 0) { st.fav.splice(i, 1); toast('已取消收藏'); } else { st.fav.push(code); toast('已收藏'); }
    render();
    refreshDetail();
  }
  function togglePlan(code) {
    const i = st.plan.indexOf(code);
    if (i >= 0) { st.plan.splice(i, 1); toast('已移出志願'); }
    else {
      if (st.plan.length >= 6) { toast('已經有 6 個志願了，先移出一個'); return; }
      st.plan.push(code);
      if (!st.fav.includes(code)) st.fav.push(code);
      toast(`已排入第 ${st.plan.length} 志願`);
    }
    render();
    refreshDetail();
  }
  const planDepts = () => st.plan.map(c => BY_CODE[c]).filter(Boolean);
  function planChecks(P) {
    const out = [];
    const tiers = P.map(tierOf);
    const c = t => tiers.filter(x => x === t).length;
    const ck = (state, title, body) => out.push({ state, title, body });
    if (!P.length) return out;
    if (hasScores()) {
      if (c('不符')) ck('bad', `${c('不符')} 個志願一定進不了一階`, '檢定沒過或沒考篩選科目，等於浪費一個志願和報名費，建議換掉。');
      else ck('ok', '沒有一定進不了的志願', '每個志願都通過檢定、也考了要篩選的科目。');
      if (!c('穩') && !c('適中')) ck('bad', '沒有「穩」或「適中」', '如果一階全部沒過，就只剩分科測驗。建議至少放 1–2 個穩的。');
      else if (!c('穩')) ck('warn', '沒有「穩」的志願', '很多學長姐會留 1 個保底，避免一階全落。');
      else ck('ok', `有 ${c('穩')} 個「穩」保底`, '');
      if (c('衝') + c('難') >= 4) ck('warn', `${c('衝') + c('難')} 個是「衝」或「難」`, '如果申請是主要管道，2 衝 2 適中 2 穩左右比較安全；打算考分科當後路就可以接受。');
      if (c('穩') >= 4) ck('warn', `${c('穩')} 個都是「穩」`, '可能浪費機會。考慮把 1–2 個換成更想讀、但要衝一下的系。');
      if (c('無資料')) ck('info', `${c('無資料')} 個沒有 115 資料`, '新設、改名或只看術科，無法估計落點。');
    } else ck('info', '輸入成績才能檢查穩衝搭配', '在「找校系」輸入學測級分（或模考、目標分數）。');
    const cf = L.conflicts(P);
    if (cf.length) {
      const sure = cf.some(x => x.sure);
      ck(sure ? 'bad' : 'warn', sure ? '甄試撞期' : '甄試可能撞期', `<ul>${cf.map(x => `<li>${esc(sch(BY_CODE[x.a]) + BY_CODE[x.a].n)} 和 ${esc(sch(BY_CODE[x.b]) + BY_CODE[x.b].n)}：${x.days.map(L.fmtDay).join('、')}${x.sure ? '，兩系都只有這一天' : '，有一系是多天，通常可以選時段'}</li>`).join('')}</ul><p>一階如果都過，同一天只能去一個。現在就想好哪個比較重要。</p>`);
    } else ck('ok', '甄試日期沒有撞期', '');
    const bySchool = {};
    P.forEach(d => { (bySchool[d.sid] = bySchool[d.sid] || []).push(d); });
    const pick = Object.values(bySchool).filter(a => a.length > 1 && a.some(d => /擇一/.test((d.notes || '') + (d.rn || ''))));
    if (pick.length) ck('warn', '同校有「擇一報名」規定', '請看備註：' + pick.map(a => a.map(d => esc(sch(d) + d.n)).join('、')).join('；'));
    const fee2 = P.reduce((a, d) => a + (d.fee || 0), 0);
    ck('info', `費用約 ${fmtN(P.length * 100 + fee2)} 元`, `一階報名費 ${P.length} × 100 = ${P.length * 100} 元（115 簡章，低收入戶免繳、中低收入戶減免，以 116 簡章為準）；全部進二階的甄試費共 ${fmtN(fee2)} 元（116 校系分則）。`);
    return out;
  }
  function calendarHTML(P) {
    const ev = [];
    P.forEach(d => {
      const n = sch(d).replace(/^國立/, '') + ' ' + d.n;
      const dd = mdOf(d.dd), rd = mdOf(d.rd);
      if (dd) ev.push({ md: dd, kind: '截止', cls: '', t: n + '：審查資料上傳截止' });
      d.idays.forEach(x => ev.push({ md: x, kind: '甄試', cls: 'iv', t: n }));
      if (rd) ev.push({ md: rd, kind: '放榜', cls: '', t: n });
    });
    ev.push({ md: '03-30', kind: '甄選會', cls: 'sys', t: '一階篩選結果公布（9:00）' }, { md: '06-03', kind: '甄選會', cls: 'sys', t: '登記就讀志願序（6/3–6/4），正取、備取都要登記' }, { md: '06-10', kind: '甄選會', cls: 'sys', t: '統一分發結果' });
    const by = new Map();
    ev.sort((a, b) => (a.md < b.md ? -1 : a.md > b.md ? 1 : 0)).forEach(x => { if (!by.has(x.md)) by.set(x.md, []); by.get(x.md).push(x); });
    const today = todayISO();
    return `<ol class="cal">${[...by].map(([md, xs]) => {
      const clash = xs.filter(x => x.kind === '甄試').length > 1;
      const [m, d] = md.split('-').map(Number);
      const wd = '日一二三四五六'[new Date(2027, m - 1, d).getDay()];
      const past = '2027-' + md < today;
      return `<li class="${clash ? 'clash' : ''}${past ? ' past' : ''}"><div class="d">${m}/${d}<small>星期${wd}${clash ? ' · 撞期' : ''}</small></div><div class="evs">${xs.map(x => `<div class="ev"><span class="tag ${x.cls}">${x.kind}</span><span>${esc(x.t)}</span></div>`).join('')}</div></li>`;
    }).join('')}</ol>`;
  }
  // ------------------------------------------------------------------ 二階準備 (plan page)
  const kindCls = k => (k === 'sat' ? 'k-sat' : k === 'review' ? 'k-rev' : 'k-exam');
  const compBar = d => `<div class="cbar" aria-hidden="true">${L.stage2(d).map(x => `<span class="${kindCls(x.kind)}" style="flex-grow:${x.p}"></span>`).join('')}</div>`;
  const compCap = d => (d.sp ? '' : '<span class="nosat">不計學測</span>') + L.stage2(d).map(x => `<span><i class="sw ${kindCls(x.kind)}"></i>${esc(x.n)} ${x.p}%</span>`).join('');
  const REVIEW_ORDER = ['修課紀錄', '課程學習成果', '多元表現', '學習歷程自述'];
  function prepHTML(P) {
    if (!P.length) return '';
    const sps = P.map(d => d.sp || 0), lo = Math.min(...sps), hi = Math.max(...sps);
    const nIv = P.filter(L.hasInterview).length, nWr = P.filter(L.hasWritten).length, nNo = P.filter(L.noVisit).length;
    const facts = [`學測佔二階 ${lo === hi ? lo : lo + '–' + hi}%`, nIv ? `${nIv} 個要面試` : '都不用面試', nWr ? `${nWr} 個要筆試` : '', nNo ? `${nNo} 個不用到校甄試` : ''].filter(Boolean);
    const bars = P.map((d, i) => `<li><div class="cb-h"><span class="no">${i + 1}</span><button class="cb-name" type="button" data-open="${d.c}"><span class="sch">${esc(sch(d))}</span>${esc(d.n)}</button></div>${compBar(d)}<div class="cb-cap">${compCap(d)}</div></li>`).join('');
    const G = P.map(d => L.reviewGroups(d.rv));
    const codesOf = (gs, g) => (gs.find(x => x.g === g) || { codes: [] }).codes;
    const cells = has => has.map(x => `<td>${x ? '<span class="dot"></span><span class="sr">要</span>' : '<span class="nil"></span><span class="sr">不用</span>'}</td>`).join('');
    const groupRow = g => `<tr class="gh"><th scope="colgroup" colspan="${P.length + 2}">${esc(g)}<small>${esc(REVIEW_HOW[g])}</small></th></tr>`;
    let rows = '';
    for (const g of REVIEW_ORDER) {
      const codes = [...new Set(G.flatMap(gs => codesOf(gs, g)))].sort();
      if (!codes.length) continue;
      rows += groupRow(g);
      for (const c of codes) {
        const has = G.map(gs => codesOf(gs, g).includes(c)), n = has.filter(Boolean).length;
        rows += `<tr${n === P.length && P.length > 1 ? ' class="all"' : ''}><th scope="row"><b class="cd">${c}</b>${esc(REVIEW[c])}</th>${cells(has)}<td class="cnt">${n}</td></tr>`;
      }
    }
    // 其他: each 系 defines its own R, S, T, so rows are the items themselves.
    const others = new Map();
    G.forEach((gs, i) => (gs.find(x => x.g === '其他') || { items: [] }).items.forEach(it => { if (!others.has(it.t)) others.set(it.t, new Set()); others.get(it.t).add(i); }));
    if (others.size) {
      rows += groupRow('其他');
      for (const [t, set] of others) rows += `<tr><th scope="row">${esc(t)}</th>${cells(P.map((_, i) => set.has(i)))}<td class="cnt">${set.size}</td></tr>`;
    }
    const used = new Set(G.flatMap(gs => gs.flatMap(x => x.codes)));
    const unused = Object.keys(REVIEW).filter(c => !used.has(c));
    const head = `<tr><th scope="col"><span class="sr">審查資料</span></th>${P.map((d, i) => `<th scope="col" title="${esc(sch(d) + ' ' + d.n)}"><span aria-hidden="true">${i + 1}</span><span class="sr">第 ${i + 1} 志願 ${esc(sch(d) + ' ' + d.n)}</span></th>`).join('')}<th scope="col" class="cnt">幾個要</th></tr>`;
    const notes = P.map((d, i) => (d.rn || d.iv ? `<details class="fold"><summary>${icon('chevR', 'sm')}${i + 1}. ${esc(sch(d) + ' ' + d.n)}</summary>${d.rn ? `<div class="long"><b>審查資料說明</b>\n${esc(d.rn)}</div>` : ''}${d.iv ? `<div class="long"><b>甄試說明</b>\n${esc(d.iv)}</div>` : ''}</details>` : '')).join('');
    return `<section class="sec prep" id="prep"><h2>二階要準備什麼</h2><p class="sub">過了一階以後，你的志願怎麼算總成績、要交哪些審查資料（116 校系分則）</p>
      <ul class="facts">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <h3 class="sec-h3">二階總成績怎麼組成</h3><ol class="cbars">${bars}</ol>
      <h3 class="sec-h3">審查資料：哪幾個志願要</h3>
      <div class="tablewrap"><table class="rmx"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
      ${unused.length ? `<p class="hint" style="margin-top:10px">你的志願都沒列出：${esc(unused.map(c => c + ' ' + REVIEW[c]).join('、'))}。</p>` : ''}
      <div style="margin-top:14px">${noteHTML('info', '招聯會的審查原則「三重二不」：不是學系列的每一項都要具備，也不是以量取勝（116 學生手冊）。各系的必備、選備和字數限制，看下面每個志願的說明。')}</div>
      ${notes ? `<div class="prep-notes">${notes}</div>` : ''}
    </section>`;
  }
  function renderPlan() {
    const P = planDepts();
    const favs = st.fav.map(c => BY_CODE[c]).filter(Boolean);
    let slots = '';
    for (let i = 0; i < 6; i++) {
      const d = P[i];
      if (!d) { slots += `<li class="slot empty"><span class="no">${i + 1}</span><span>${i === P.length ? (favs.some(f => !st.plan.includes(f.c)) ? '空位：從下面的收藏按「排入志願」' : '空位：到「找校系」收藏後排進來') : '空位'}</span></li>`; continue; }
      slots += `<li class="slot" data-code="${d.c}"><span class="no">${i + 1}</span>${pillHTML(tierOf(d))}
        <div class="s-main" data-open="${d.c}" role="button" tabindex="0"><div class="s-t"><span class="sch">${esc(sch(d))}</span>${esc(d.n)}</div><div class="s-d"><span>${esc(daysText(d))}</span><span>資料截止 ${esc(rocDate(d.dd))}</span><span>放榜 ${esc(rocDate(d.rd))}</span></div></div>
        <div class="ctrl"><button type="button" data-up="${d.c}" aria-label="上移" title="上移" ${i === 0 ? 'disabled' : ''}>${icon('up', 'sm')}</button><button type="button" data-down="${d.c}" aria-label="下移" title="下移" ${i === P.length - 1 ? 'disabled' : ''}>${icon('down', 'sm')}</button><button type="button" data-plan="${d.c}" aria-label="移出志願" title="移出志願">${icon('x', 'sm')}</button></div></li>`;
    }
    const mix = Array.from({ length: 6 }, (_, i) => { const d = P[i]; if (!d) return '<span class="e">空</span>'; const t = tierOf(d); return `<span class="${t ? TC[t] : 't0'}">${t || '—'}</span>`; }).join('');
    const checks = planChecks(P);
    const IC = { ok: 'check', warn: 'alert', bad: 'x', info: 'info' };
    const favRows = favs.map(d => {
      const pi = st.plan.indexOf(d.c);
      return `<li class="fav">${pillHTML(tierOf(d))}<div class="s-main" data-open="${d.c}" role="button" tabindex="0"><div class="s-t"><span class="sch">${esc(sch(d))}</span>${esc(d.n)}</div><div class="s-d"><span>${esc(daysText(d))}</span><span>${esc(partsLine(d))}</span></div></div>
        <div class="fav-act"><button class="btn sm${pi >= 0 ? '' : ' primary'}" type="button" data-plan="${d.c}">${pi >= 0 ? `移出第 ${pi + 1} 志願` : `${icon('plus', 'sm')}排入志願`}</button><button class="star" type="button" data-fav="${d.c}" aria-pressed="true" aria-label="取消收藏：${esc(sch(d) + d.n)}" title="取消收藏">${icon('star')}</button></div></li>`;
    }).join('');
    const h = `<header class="page-h"><div><h1>我的志願</h1><p>申請入學最多報 6 個校系。報名時沒有順序；這裡的順序是你的偏好，放榜後「登記就讀志願序」時會用到。</p></div>
      <div class="page-actions">${P.length || favs.length ? `<button class="btn sm" type="button" data-act="copyPlan">${icon('copy', 'sm')}複製文字</button><button class="btn sm" type="button" data-act="csvPlan">${icon('download', 'sm')}下載 CSV</button><button class="btn sm" type="button" data-act="printPlan">${icon('print', 'sm')}列印</button>` : ''}</div></header>
      <div class="plan-grid">
        <section class="sec"><h2>六個志願</h2><p class="sub">已排 ${P.length}/6</p><ol class="slots" id="planList">${slots}</ol></section>
        <section class="sec"><h2>檢查</h2><p class="sub">落點搭配、撞期、同校規定和費用</p><div class="mix" aria-label="六個志願的落點">${mix}</div>
          ${checks.length ? `<ul class="checks">${checks.map(x => `<li class="check ${x.state}"><span class="ic">${icon(IC[x.state])}</span><div><b>${esc(x.title)}</b>${x.body ? (x.body.startsWith('<') ? x.body : `<p>${x.body}</p>`) : ''}</div></li>`).join('')}</ul>` : '<p class="hint" style="margin-top:14px">排入志願後，這裡會檢查穩衝搭配、甄試撞期和同校擇一報名。</p>'}
        </section>
      </div>
      <section class="sec"><h2>收藏</h2><p class="sub">${favs.length ? `${favs.length} 個 · 從這裡排進志願` : '在「找校系」按星號收藏想考慮的校系'}</p>${favs.length ? `<ol class="favs" id="favList">${favRows}</ol>` : `<div style="margin-top:14px"><button class="btn primary" type="button" data-tab="explore">${icon('search', 'sm')}去找校系</button></div>`}</section>
      ${prepHTML(P)}
      ${P.length ? `<section class="sec"><h2>二階行事曆</h2><p class="sub">你的志願的審查資料截止、甄試和放榜日期（116 校系分則），加上甄選會的統一日期</p>${calendarHTML(P)}</section>` : ''}
      <section class="sec no-print"><h2>備份與換裝置</h2><p class="sub">成績、收藏和志願只存在這台裝置的瀏覽器裡，不會上傳。換手機或電腦前先備份。</p>
        <div class="page-actions" style="margin-top:14px"><button class="btn sm" type="button" data-act="exportState">${icon('download', 'sm')}備份我的資料</button><label class="btn sm">${icon('upload', 'sm')}還原備份<input type="file" id="importState" accept="application/json,.json"></label></div></section>`;
    keepFocus($('#plan'), () => { $('#plan').innerHTML = h; });
  }
  function planText() {
    const P = planDepts(), s = st.scores;
    const lines = [`116 申請入學志願（${new Date().toLocaleDateString('zh-TW')}）`,
      `學測：${SCORE_KEYS.map(k => `${subj(k)}${L.val(s, k) ?? '沒考'}`).join(' ')} 英聽${s.聽 || '沒考'}（檢定用 ${st.stdYear} 五標）`, ''];
    const row = (d, i) => {
      const e = EV.get(d.c);
      return `${i != null ? i + 1 + '. ' : '- '}${sch(d)} ${d.n}（${d.c}）【${e ? e.tier : '—'}】${e ? e.reasons.join('；') : ''}${e && e.warnings.length ? '；' + e.warnings.join('；') : ''}\n   ${requirementLine(d)}\n   二階：${partsLine(d, true)}；甄試 ${d.idays.length ? rocText(d.idate) : '不用到校'}；資料截止 ${rocDate(d.dd)}${d.rv ? `\n   審查資料：${d.rv}` : ''}`;
    };
    lines.push('【六個志願】');
    P.forEach((d, i) => lines.push(row(d, i)));
    const others = st.fav.filter(c => !st.plan.includes(c)).map(c => BY_CODE[c]).filter(Boolean);
    if (others.length) { lines.push('', '【其他收藏】'); others.forEach(d => lines.push(row(d))); }
    lines.push('', '說明：落點用 115 一階篩選結果推估（不是保證），116 五標 2027/2/25 公布。');
    return lines.join('\n');
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function csv() {
    const rows = [['志願', '校系代碼', '學校', '校系', '落點', '理由', '檢定', '115一階', '二階', '審查資料', '審查資料截止', '甄試日期', '放榜', '甄試費', '官方網址']];
    [...st.plan, ...st.fav.filter(c => !st.plan.includes(c))].forEach(c => {
      const d = BY_CODE[c];
      if (!d) return;
      const e = EV.get(c), i = st.plan.indexOf(c);
      const req = requirementLine(d).split('　|　');
      rows.push([i >= 0 ? i + 1 : '收藏', d.c, sch(d), d.n, e ? e.tier : '', e ? e.reasons.join('；') : '', req[0], req[1].replace('115 一階 ', ''), partsLine(d, true), d.rv || '', rocDate(d.dd), d.idays.length ? rocText(d.idate) : '不用到校甄試', rocDate(d.rd), d.fee || '', d.url]);
    });
    return '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }

  // ------------------------------------------------------------------ boost (what to improve)
  let boostCache = { sig: null, data: null };
  function boostData(scope) {
    const sig = evSig + '#' + scope.map(d => d.c).join('');
    if (boostCache.sig === sig) return boostCache.data;
    const o = opts();
    const rows = SCORE_KEYS.map(k => {
      const cur = L.val(st.scores, k) || 0;
      const cells = [1, 2, 3, 4, 5].map(inc => {
        const to = cur + inc;
        if (to > 15) return null;
        const S2 = { ...st.scores, [k]: String(to) };
        let up = 0, unlock = 0;
        for (const d of scope) {
          const t0 = tierOf(d), t1 = L.evaluate(d, S2, o).tier;
          if (TIERS.indexOf(t1) < TIERS.indexOf(t0) && t1 !== '無資料') up++;
          if (t0 === '不符' && t1 !== '不符') unlock++;
        }
        return { to, up, unlock };
      });
      return { k, cur, cells };
    });
    const block = {};
    for (const d of scope) {
      const e = EV.get(d.c);
      if (!e || e.tier !== '不符') continue;
      if (!e.th.ok) thFailParts(e.th).forEach(x => { block[x.what] = (block[x.what] || 0) + 1; });
      else block[e.reasons[0]] = (block[e.reasons[0]] || 0) + 1;
    }
    const data = { rows, blockers: Object.entries(block).sort((a, b) => b[1] - a[1]).slice(0, 8) };
    boostCache = { sig, data };
    return data;
  }
  function renderBoost() {
    const el = $('#boost');
    const head = `<header class="page-h"><div><h1>怎麼進步</h1><p>還有時間準備的話，哪一科多考幾級分最划算？用你現在的成績和「找校系」的篩選範圍來算。</p></div></header>`;
    if (!hasScores()) {
      el.innerHTML = head + `<div class="cta">${icon('target')}<div><b>先輸入學測級分</b>（還沒考可以填模考或目標分數），這裡才能算每一科多考幾級分會多出哪些機會。</div><button class="btn primary" type="button" data-act="goScores">輸入成績</button></div>`;
      return;
    }
    const scope = baseFiltered();
    const sl = scopeLabel();
    el.innerHTML = head + '<div class="sec"><p class="hint">計算中…</p></div>';
    clearTimeout(renderBoost.t);
    renderBoost.t = setTimeout(() => {
      if (ui.tab !== 'boost') return;
      const { rows, blockers } = boostData(scope);
      const all = rows.flatMap(r => r.cells.filter(Boolean).map(c => ({ ...c, k: r.k, cur: r.cur })));
      const maxUp = Math.max(1, ...all.map(c => c.up));
      // "6 級分" is above 均標 5, not equal to it: say "達到" unless it is exactly the line.
      const lvSentence = (k, v, lv) => {
        if (!lv || lv === '未達底標') return '';
        const line = D.std[st.stdYear] && D.std[st.stdYear][k] ? D.std[st.stdYear][k][lv] : null;
        return line === v ? `${v} 級分剛好是 ${st.stdYear} 學年度${subj(k)}${lv}。` : `${v} 級分已達 ${st.stdYear} 學年度${subj(k)}${lv}（${line} 級分）。`;
      };
      const bestOf = r => r.cells.filter(Boolean).reduce((a, c) => (c.up > (a ? a.up : 0) ? c : a), null);
      const ranked = rows.map(r => ({ r, b: bestOf(r) })).filter(x => x.b && x.b.up > 0).sort((a, b) => b.b.up - a.b.up || (a.b.to - a.r.cur) - (b.b.to - b.r.cur));
      let hero;
      if (ranked.length) {
        const { r, b } = ranked[0];
        const lv = levelOf(r.k, b.to);
        hero = `<section class="hero"><span class="eyebrow">最值得補強</span><h2>${subj(r.k)} 從 ${r.cur || '沒考'} 考到 ${b.to} 級分</h2>
          <p>在${esc(sl || '目前的範圍')}（${fmtN(scope.length)} 個校系）裡，<b>${b.up}</b> 個校系落點變好${b.unlock ? `，其中 <b>${b.unlock}</b> 個從「不符」變成可以報` : ''}。${lvSentence(r.k, b.to, lv)}</p>
          ${ranked.length > 1 ? `<div class="alts">${ranked.slice(1, 4).map(x => `<span>${subj(x.r.k)} ${x.r.cur || '沒考'} → ${x.b.to}：${x.b.up} 個</span>`).join('')}</div>` : ''}</section>`;
      } else hero = `<section class="hero"><span class="eyebrow">最值得補強</span><h2>這個範圍裡，每科多考 1–5 級分都不會改變落點</h2><p>可以換個學群或放寬篩選再看看。</p></section>`;
      const grid = `<div class="heat" role="table" aria-label="每科多考幾級分，落點變好的校系數"><div role="row" style="display:contents"><span class="hh" role="columnheader">科目</span>${[1, 2, 3, 4, 5].map(i => `<span class="hh" role="columnheader">+${i}</span>`).join('')}</div>
        ${rows.map(r => `<div role="row" style="display:contents"><span class="hs" role="rowheader">${subj(r.k)}<small>現在 ${r.cur || '沒考'}</small></span>${r.cells.map(c => c ? `<span class="hc" role="cell" style="--h:${(c.up / maxUp).toFixed(3)}" title="${subj(r.k)} 考到 ${c.to} 級分：${c.up} 個校系落點變好${c.unlock ? `，${c.unlock} 個從不符變成可以報` : ''}"><span class="to">考到 ${c.to}</span><span class="n">${c.up}</span>${c.unlock ? `<span class="u">解鎖 ${c.unlock}</span>` : ''}</span>` : '<span class="hc na" role="cell">—</span>').join('')}</div>`).join('')}</div>`;
      const maxB = Math.max(1, ...blockers.map(b => b[1]));
      const blockHTML = blockers.length ? `<div class="hbars">${blockers.map(([k, n]) => `<div class="hb"><span class="l">${esc(k)}</span><span class="t" style="width:${(n / maxB) * 100}%"></span><span class="n">${n} 個系</span></div>`).join('')}</div><p class="hint" style="margin-top:14px">檢定沒過就不能參加篩選。116 五標 2027/2/25 才公布，這裡用 ${st.stdYear} 學年度五標換算。</p>` : '<p class="hint" style="margin-top:12px">這個範圍裡沒有被檢定或科目擋住的校系。</p>';
      if (!ui.tryS) ui.tryS = { ...st.scores };
      const tryGrid = SCORE_KEYS.map(k => sliderHTML('try', k, subj(k), L.val(ui.tryS, k) || 0, 15)).join('');
      el.innerHTML = head + hero +
        `<section class="sec"><h2>每科多考幾級分，會多出多少機會？</h2><p class="sub">格子裡是「落點變好的校系數」，顏色越深越多；「解鎖」是從不符變成可以報的數量。範圍：${esc(sl || '全部（一般組、公費、APCS）')}，${fmtN(scope.length)} 個校系。</p>${grid}</section>
        <section class="sec"><h2>擋住你的檢定</h2><p class="sub">這個範圍裡，因為檢定或沒考的科目而「一定進不了一階」的校系</p>${blockHTML}</section>
        <section class="sec" id="trySec"><h2>試算</h2><p class="sub">暫時改成績看結果，不會改掉你存的成績。<button class="textbtn" type="button" data-act="tryReset">${icon('reset', 'sm')}改回我的成績</button></p><div class="try-grid">${tryGrid}</div><div id="tryOut"></div></section>`;
      renderTry();
    }, 30);
  }
  function renderTry() {
    const out = $('#tryOut');
    if (!out || !ui.tryS) return;
    const S2 = ui.tryS, o = opts(), scope = baseFiltered();
    const c0 = {}, c1 = {}, better = [], worse = [];
    const has2 = hasScores(S2);
    for (const d of scope) {
      const t0 = tierOf(d), t1 = has2 ? L.evaluate(d, S2, o).tier : null;
      c0[t0] = (c0[t0] || 0) + 1;
      if (t1) c1[t1] = (c1[t1] || 0) + 1;
      if (t1 && TIERS.indexOf(t1) < TIERS.indexOf(t0) && t1 !== '無資料') better.push([d, t0, t1]);
      if (t1 && TIERS.indexOf(t1) > TIERS.indexOf(t0) && t0 !== '無資料') worse.push([d, t0, t1]);
    }
    better.sort((a, b) => (L.selectivity(b[0]) || 0) - (L.selectivity(a[0]) || 0));
    const W = out.clientWidth || 600;
    const same = JSON.stringify(SCORE_KEYS.map(k => L.val(S2, k))) === JSON.stringify(SCORE_KEYS.map(k => L.val(st.scores, k)));
    out.innerHTML = `<div class="cmpbars"><span>現在</span>${tierBarHTML(c0, scope.length, { small: true, width: W, label: '現在' })}<span>試算</span>${has2 ? tierBarHTML(c1, scope.length, { small: true, width: W, label: '試算' }) : '<span class="hint">試算成績都是沒考</span>'}</div>
      <div style="overflow-x:auto"><table class="cmptable"><thead><tr><th scope="col"><span class="sr">成績</span></th>${TIERS.map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody><tr><td>現在</td>${TIERS.map(t => `<td>${c0[t] || 0}</td>`).join('')}</tr><tr><td>試算</td>${TIERS.map(t => { const a = c0[t] || 0, b = c1[t] || 0; const good = t === '穩' || t === '適中'; return `<td class="${b !== a ? ((b > a) === good ? 'up' : 'dn') : ''}">${has2 ? b : '—'}</td>`; }).join('')}</tr></tbody></table></div>
      ${same ? '<p class="hint" style="margin-top:12px">拖曳上面的格子改成績，這裡會比較落點變化。</p>' : better.length ? `<h3 style="font-size:14.5px;margin-top:18px">落點變好的校系（${better.length}）</h3><ul class="better">${better.slice(0, 40).map(([d, a, b]) => `<li>${pillHTML(a)}<span class="arr">→</span>${pillHTML(b)}<a href="#d=${d.c}" data-open="${d.c}">${esc(sch(d) + ' ' + d.n)}</a></li>`).join('')}</ul>${better.length > 40 ? '<p class="hint">只列前 40 個（依 115 門檻高到低）。</p>' : ''}` : `<p class="hint" style="margin-top:12px">沒有校系的落點變好${worse.length ? `，有 ${worse.length} 個變差` : ''}。</p>`}`;
  }

  // ------------------------------------------------------------------ guide
  const TIMELINE = [
    ['準備期', '2026-11-03', '簡章與校系分則公告（甄選會網站可查）'],
    ['準備期', '2026-12-12', '英聽第二次考試（兩次擇優）'],
    ['學測與成績', '2027-01-22', '學測（1/22–1/24）'],
    ['學測與成績', '2027-02-25', '學測成績與 116 五標公布：回來把「檢定用五標」改成 116'],
    ['選系與報名', '2027-03-18', '繁星推薦第 1–7 類放榜：錄取者不論放棄與否，都不能報申請入學'],
    ['選系與報名', '2027-03-22', '申請入學繳費（3/22–3/24 17:00）'],
    ['選系與報名', '2027-03-23', '申請入學報名（3/23–3/24），最多 6 個校系'],
    ['一階篩選', '2027-03-30', '一階篩選結果（9:00）；3/31 中午前可申請複查'],
    ['二階：審查與甄試', '2027-04-01', '學習歷程上傳中央資料庫（約 4/1–4/21，依就讀高中規定）'],
    ['二階：審查與甄試', '2027-04-29', '二階審查資料上傳／勾選（4/29 起，截止日各校不同）'],
    ['二階：審查與甄試', '2027-05-13', '指定項目甄試（5/13–5/30，面試、筆試等）'],
    ['二階：審查與甄試', '2027-05-31', '各校放榜前限（各校自訂日期）'],
    ['放榜與分發', '2027-06-03', '登記就讀志願序（6/3–6/4 9:00–21:00）：正取、備取都要登記，沒登記視同放棄'],
    ['放榜與分發', '2027-06-10', '統一分發結果：每人最多分發 1 個校系'],
    ['放榜與分發', '2027-06-13', '放棄入學資格截止：分到了卻想考分科，要在這天前上網聲明放棄'],
    ['分科與分發入學', '2027-06-15', '分科測驗報名截止（沒分發到、要走分發入學的人）'],
    ['分科與分發入學', '2027-07-10', '分科測驗（7/10–7/11）'],
    ['分科與分發入學', '2027-08-13', '分發入學放榜'],
  ];
  const KEY_DATES = [['2027-01-22', '學測'], ['2027-02-25', '成績公布'], ['2027-03-23', '申請報名'], ['2027-03-30', '一階結果'], ['2027-05-13', '甄試開始'], ['2027-06-03', '登記志願序'], ['2027-06-10', '統一分發']];
  function renderCountdown() {
    const today = todayISO();
    const next = KEY_DATES.find(([d]) => d >= today);
    const el = $('#countdown');
    if (!next) { el.hidden = true; return; }
    const n = daysUntil(next[0]);
    el.hidden = false;
    el.innerHTML = n === 0 ? `${next[1]}<b>今天</b>` : `${next[1]}<b>${n}</b>天`;
    el.setAttribute('aria-label', n === 0 ? `今天${next[1]}，看時程` : `距離${next[1]}還有 ${n} 天，看時程`);
  }
  function renderGuide() {
    const today = todayISO();
    const nextI = TIMELINE.findIndex(([, d]) => d >= today);
    const exam = TIMELINE.find(x => x[2].startsWith('學測（'));
    const examDays = daysUntil(exam[1]);
    const nx = nextI >= 0 ? TIMELINE[nextI] : null;
    let hero;
    if (examDays > 0) hero = `<div class="big">${examDays}<small>天</small></div><div><h2>距離學測（2027/1/22–1/24）</h2><p>${nx && nx[1] !== exam[1] ? `下一個日期：${esc(nx[1].slice(5).replace('-', '/').replace(/^0/, ''))} ${esc(nx[2])}，還有 ${daysUntil(nx[1])} 天。` : ''}學測前最有用的是「怎麼進步」：看哪一科多考幾級分最划算。</p></div>`;
    else if (nx) hero = `<div class="big">${daysUntil(nx[1])}<small>天</small></div><div><h2>${esc(nx[2])}</h2><p>${esc(nx[1].replace(/-/g, '/'))}</p></div>`;
    else hero = '<div><h2>116 申請入學已經結束</h2></div>';
    let ph = null;
    const tl = TIMELINE.map(([phase, dte, txt], i) => {
      let pre = '';
      if (phase !== ph) { ph = phase; pre = `<li class="ph">${esc(phase)}</li>`; }
      const past = dte < today, next = i === nextI;
      const n = daysUntil(dte);
      const [y, m, dd] = dte.split('-').map(Number);
      return pre + `<li class="${past ? 'past' : ''}${next ? ' next' : ''}"><span class="d"><small>${y}<i>/</i></small>${m}/${dd}</span><span class="dc"></span><span class="t">${esc(txt)}${next ? `<span class="soon">${n === 0 ? '今天' : `還有 ${n} 天`}</span>` : ''}</span></li>`;
    }).join('');
    $('#guide').innerHTML = `<header class="page-h"><div><h1>時程與規則</h1><p>116 個人申請的官方日程與一定要知道的規則。來源：教育部《116 學年度大學多元入學學生手冊》。</p></div></header>
      <section class="count-hero">${hero}</section>
      <section class="sec"><h2>116 個人申請時程</h2><ol class="tl">${tl}</ol></section>
      <section class="sec"><h2>一定要知道的規則</h2><ol class="rules">
        <li><div><b>最多 6 個校系。</b>報名時一次選好、繳費，送出後不能改。</div></li>
        <li><div><b>一階 = 檢定 → 倍率篩選 → 同級分超額篩選。</b>檢定沒過，連篩選都不能參加。倍率從大到小一關一關篩，同一關同級分的人一起過；只有最後一關同分才比超額篩選的科目順序。</div></li>
        <li><div><b>每一關都要過。</b>只看第一關、或只看總級分都會判錯（這個工具的舊版就犯過這個錯）。</div></li>
        <li><div><b>數A、數B 同時列為檢定時，過一科就好。</b>只考數B 的人不會因為數A 沒考被擋。</div></li>
        <li><div><b>二階通常是學測＋審查資料＋面試或筆試，各系比例差很多。</b>學測佔比高的系，學測好的人比較有利；審查和面試佔比高的系，學習歷程和準備最重要。有 ${fmtN(D.depts.filter(d => !d.sp).length)} 個校系的二階完全不計學測。「找校系」可以依學測佔二階的比例篩選，「我的志願」會整理你的志願要交哪些審查資料。</div></li>
        <li><div><b>撞期很常見。</b>一階過了兩個同一天甄試的系，只能去一個。排志願時就先看甄試日期。</div></li>
        <li><div><b>放榜後要登記就讀志願序（6/3–6/4）。</b>正取、備取都要登記，沒登記等於放棄。甄選會依志願序和名次統一分發，每人只會分到 1 個。</div></li>
        <li><div><b>繁星第 1–7 類錄取的人不能報申請入學。</b>就算放棄繁星的錄取也一樣。</div></li>
        <li><div><b>分發到了但想改考分科測驗，要先聲明放棄。</b>6/13 前上網聲明放棄，否則不能參加分發入學。</div></li>
        <li><div><b>學測有一科 0 級分也能報。</b>只要該系用到的科目加總不是 0 就可以（學生手冊 Q&amp;A）。這個工具把空白和 0 都當「沒考」。</div></li>
      </ol></section>
      <section class="sec"><h2>這個工具怎麼判斷落點</h2><ul class="tdefs">${TIERS.map(t => `<li>${pillHTML(t)}<span>${esc(TIER_HELP[t])}</span></li>`).join('')}</ul>
        <div class="prose" style="margin-top:16px"><p>判斷用的是 <b>115 學年度一階篩選結果</b>（甄選會只公布圖片，每一格都經兩次獨立判讀核對）：你每一關的級分都要大於或等於 115 最低，最後一關剛好相等要看超額篩選。</p>
        <p>「穩」比較嚴格：每一關都要比 115 高，最後一關至少高 2 級分（門檻漲 1 也還會過），而且用大考中心 115 年各科、各科組合的級分人數表換算，排在你前面的人要明顯少於排在門檻前面的人。</p>
        <p>遇到這些情況，最多只判「適中」並寫出原因：116 倍率或科目跟 115 不同、用的是同系別組或名稱相近系組的資料、預計甄試人數比 115 少 15% 以上、你的級分換成 113 或 114 年五標就會檢定不過。</p>
        <p class="hint">這只是一階能不能過的估計，不是錄取機率。二階要看審查資料、面試和當年的競爭。</p></div></section>
      <section class="sec"><h2>審查資料代碼</h2><p class="sub">課程學習成果最多 3 件，多元表現最多 10 件（另附綜整心得）。R、S、T 看各系分則。</p><div class="codegrid">${Object.entries(REVIEW).map(([k, v]) => `<span class="code"><b>${k}</b>${v}</span>`).join('')}</div></section>
      <section class="sec"><h2>資料來源</h2><ul class="srcs">
        <li>116 校系分則：大學甄選入學委員會（${esc(D.fetched116)} 擷取，2,240 校系）。簡章若有「內容修正事項」以官方為準。</li>
        <li>115 一階篩選結果：甄選會「115 學年度各校系篩選標準一覽表」（圖片，雙重判讀）。</li>
        <li>115 分發最低標準（備取遞補到第幾名）：甄選會「115 學年度各校系分發標準一覽表」。</li>
        <li>五標（113–115）與各科、2–4 科組合級分人數累計表：大學入學考試中心。</li>
        <li>116 扶助弱勢校系一覽表、學生手冊：甄選會、教育部。</li>
        <li>學校所在縣市是校本部；有寫校區的系用該校區。</li>
      </ul><p class="hint" style="margin-top:10px">資料版本 ${esc(D.built)}。原始碼與資料處理程式公開在 GitHub（JayPengX/Apply-116）。</p></section>`;
  }

  // ------------------------------------------------------------------ navigation
  const tabHash = t => (t === 'explore' ? location.pathname + location.search : '#' + t);
  function renderNav() {
    $$('[data-plancount]').forEach(c => { c.textContent = st.plan.length ? `${st.plan.length}/6` : ''; });
    $$('.tab, .bnav').forEach(b => { if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    $('#themeBtn').innerHTML = icon(dark ? 'sun' : 'moon');
  }
  function render() {
    ensureEval();
    renderNav();
    if (ui.tab === 'explore') renderExplore();
    else if (ui.tab === 'plan') renderPlan();
    else if (ui.tab === 'boost') renderBoost();
    else renderGuide();
    save();
  }
  function setTab(name, fromRoute) {
    if (!['explore', 'plan', 'boost', 'guide'].includes(name)) name = 'explore';
    const changed = name !== ui.tab;
    ui.tab = name;
    ['explore', 'plan', 'boost', 'guide'].forEach(v => { $('#view-' + v).hidden = v !== name; });
    if (!fromRoute && !/^#d=/.test(location.hash)) history.replaceState(null, '', tabHash(name));
    if (name === 'boost') ui.tryS = null;
    render();
    if (changed) window.scrollTo(0, 0);
  }
  function route() {
    const m = /^#d=(\d{6})$/.exec(location.hash);
    if (m && BY_CODE[m[1]]) { if (!$('#detail').open || detailCode !== m[1]) openDetail(m[1], true); return; }
    if ($('#detail').open) { detailPushed = false; $('#detail').close(); }
    const t = { '#plan': 'plan', '#boost': 'boost', '#guide': 'guide' }[location.hash] || 'explore';
    if (t !== ui.tab) setTab(t, true);
  }
  function focusScoreEditor(k) {
    const el = (k === 'listen' ? $('#scorePanel [data-listen]') : null) || (k ? $(`[data-slider="${CSS.escape(k)}"]`) : null) || $('#scorePanel .track');
    if (!el) return;
    el.focus({ preventScroll: true });
    if (isNarrow()) el.closest('.srow').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function goScores() {
    if ($('#detail').open) $('#detail').close();
    ui.scoreOpen = true;
    if (ui.tab !== 'explore') setTab('explore'); else render();
    $('#scorePanel').scrollIntoView({ block: 'start', behavior: 'smooth' });
    setTimeout(() => focusScoreEditor(), 250);
  }

  // ------------------------------------------------------------------ filter sheet (phones and tablets)
  function openSheet() {
    const dlg = $('#sheet');
    $('#sheetBody').appendChild($('#filterPanel'));
    ui.sheet = true;
    renderExplore();
    dlg.showModal();
  }
  function onSheetClosed() {
    ui.sheet = false;
    $('#rail').appendChild($('#filterPanel'));
  }

  // ------------------------------------------------------------------ slider input (pointer, touch and keyboard)
  let drag = null, commitTimer = null;
  function valueAt(t, x) {
    const r = t.getBoundingClientRect(), n = +t.dataset.max;
    return clamp(Math.floor(((x - r.left) / r.width) * n) + 1, 1, n);
  }
  // Typing the first score must not swap the editor for the summary tiles mid-entry.
  function keepEditorOpen() { if ($('#scorePanel').classList.contains('editing')) ui.scoreOpen = true; }
  function commitSlider(t, delay) {
    clearTimeout(commitTimer);
    const kind = t.dataset.slider != null ? 'slider' : 'try';
    const k = t.dataset.slider || t.dataset.try;
    const v = +t.dataset.v;
    const run = () => {
      if (kind === 'slider') { keepEditorOpen(); st.scores[k] = v ? String(v) : ''; ui.shown = PAGE; render(); }
      else { ui.tryS[k] = v ? String(v) : ''; renderTry(); }
    };
    if (delay) commitTimer = setTimeout(run, delay); else run();
  }
  function bindSliders() {
    document.addEventListener('pointerdown', ev => {
      const t = ev.target.closest && ev.target.closest('.track');
      if (!t || ev.button > 0) return;
      drag = { t, id: ev.pointerId, x: ev.clientX, y: ev.clientY, touch: ev.pointerType === 'touch', scrub: false };
      if (!drag.touch) {
        ev.preventDefault();
        drag.scrub = true;
        t.focus({ preventScroll: true });
        try { t.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        paintSlider(t, valueAt(t, ev.clientX));
      }
    });
    document.addEventListener('pointermove', ev => {
      if (!drag || ev.pointerId !== drag.id) return;
      if (!drag.scrub) {
        const dx = Math.abs(ev.clientX - drag.x), dy = Math.abs(ev.clientY - drag.y);
        if (dx > 6 && dx > dy) { drag.scrub = true; try { drag.t.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } }
        else if (dy > 8) { drag = null; return; }
      }
      if (drag.scrub) { const v = valueAt(drag.t, ev.clientX); if (v !== +drag.t.dataset.v) paintSlider(drag.t, v); }
    });
    document.addEventListener('pointerup', ev => {
      if (!drag || ev.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.scrub) {
        if (Math.abs(ev.clientX - d.x) > 10 || Math.abs(ev.clientY - d.y) > 10) return;
        paintSlider(d.t, valueAt(d.t, ev.clientX));
      }
      commitSlider(d.t);
    });
    document.addEventListener('pointercancel', () => { if (drag && drag.scrub) commitSlider(drag.t); drag = null; });
    document.addEventListener('keydown', ev => {
      const t = ev.target;
      if (!t.classList || !t.classList.contains('track')) return;
      const n = +t.dataset.max;
      let v = +t.dataset.v;
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 3, PageDown: -3 }[ev.key];
      if (step) v += step;
      else if (ev.key === 'Home') v = 0;
      else if (ev.key === 'End') v = n;
      else if (ev.key === 'Delete' || ev.key === 'Backspace') v = 0;
      else return;
      ev.preventDefault();
      v = clamp(v, 0, n);
      if (v === +t.dataset.v) return;
      paintSlider(t, v);
      commitSlider(t, 260);
    });
  }

  // ------------------------------------------------------------------ events
  const toggle = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
  const ACTIONS = {
    editScores: b => { ui.scoreOpen = true; render(); focusScoreEditor(b.dataset.focus); },
    doneScores: () => { ui.scoreOpen = false; render(); $('#rail').scrollTop = 0; if (isNarrow()) $('#overview').scrollIntoView({ block: 'start', behavior: 'smooth' }); },
    showCats: () => {
      ui.catsOpen = true;
      if (getComputedStyle($('#filterPanel')).display === 'none' || $('#filterPanel').parentElement !== $('#rail')) { openSheet(); }
      else render();
      const b = $('#catsBox');
      if (b) { b.open = true; b.scrollIntoView({ block: 'center', behavior: 'smooth' }); const c = b.querySelector('.chip'); if (c) c.focus({ preventScroll: true }); }
    },
    clearScores: () => { st.scores = DEFAULT().scores; ui.scoreOpen = true; ui.shown = PAGE; render(); toast('已清除成績'); },
    goScores: () => goScores(),
    resetFilters: () => { st.f = { ...DEFAULT().f, sort: st.f.sort, q: st.f.q, tiers: st.f.tiers }; ui.shown = PAGE; render(); },
    resetAll: () => { st.f = { ...DEFAULT().f, sort: st.f.sort }; $('#q').value = ''; ui.shown = PAGE; render(); },
    resetCats: () => { st.f.cats = DEFAULT_CATS.slice(); ui.shown = PAGE; render(); },
    showTiers: () => { st.f.tiers = TIERS.slice(); render(); },
    groupsAll: () => { st.f.groups = []; ui.shown = PAGE; render(); },
    clearQ: () => { st.f.q = ''; $('#q').value = ''; ui.shown = PAGE; render(); },
    more: () => { ui.shown += PAGE; renderExplore(); },
    copyPlan: () => {
      const txt = planText();
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject(new Error('no clipboard'))).then(() => toast('已複製，可以貼給老師或 AI'), () => { download('apply116-plan.txt', txt, 'text/plain;charset=utf-8'); toast('無法複製，改成下載文字檔'); });
    },
    csvPlan: () => download('apply116-plan.csv', csv(), 'text/csv;charset=utf-8'),
    printPlan: () => { if (ui.tab !== 'plan') setTab('plan'); setTimeout(() => window.print(), 60); },
    exportState: () => download('apply116-backup.json', JSON.stringify(st, null, 1), 'application/json'),
    tryReset: () => { ui.tryS = { ...st.scores }; $$('#trySec .track').forEach(t => paintSlider(t, L.val(ui.tryS, t.dataset.try) || 0)); renderTry(); },
  };
  function bind() {
    document.addEventListener('click', ev => {
      const b = ev.target.closest('button, a, [data-open]');
      if (!b || b.closest('.track')) return;
      const ds = b.dataset, f = st.f;
      if (ds.tab) { ev.preventDefault(); if ($('#detail').open) $('#detail').close(); if (ds.tab === ui.tab) window.scrollTo({ top: 0, behavior: 'smooth' }); else setTab(ds.tab); return; }
      if (ds.fav) { ev.stopPropagation(); toggleFav(ds.fav); return; }
      if (ds.plan) { ev.stopPropagation(); togglePlan(ds.plan); return; }
      if (ds.tier) { toggle(f.tiers, ds.tier); ui.shown = PAGE; render(); return; }
      if (ds.group) { toggle(f.groups, ds.group); ui.shown = PAGE; render(); return; }
      if (ds.region) { toggle(f.regions, ds.region); ui.shown = PAGE; render(); return; }
      if (ds.own) { f.own = ds.own; ui.shown = PAGE; render(); return; }
      if (ds.cat) { toggle(f.cats, ds.cat); ui.shown = PAGE; render(); return; }
      if (ds.sat) { f.sat = ds.sat === f.sat ? 'all' : ds.sat; ui.shown = PAGE; render(); return; }
      if (ds.st2) { toggle(f.st2, ds.st2); ui.shown = PAGE; render(); return; }
      if (ds.listen) { keepEditorOpen(); st.scores.聽 = ds.listen === 'none' ? '' : ds.listen; render(); return; }
      if (ds.clear) {
        const [kind, k] = ds.clear.split(':');
        if (kind === 'slider') { st.scores[k] = ''; ui.shown = PAGE; render(); }
        else { ui.tryS[k] = ''; const t = $(`[data-try="${CSS.escape(k)}"]`); if (t) paintSlider(t, 0); renderTry(); }
        return;
      }
      if (ds.up || ds.down) {
        const c = ds.up || ds.down, i = st.plan.indexOf(c), j = ds.up ? i - 1 : i + 1;
        if (i >= 0 && j >= 0 && j < st.plan.length) { [st.plan[i], st.plan[j]] = [st.plan[j], st.plan[i]]; render(); }
        return;
      }
      if (ds.act && ACTIONS[ds.act]) { ev.preventDefault(); ACTIONS[ds.act](b, ev); return; }
      if (ds.open) { ev.preventDefault(); openDetail(ds.open); return; }
      if (b.id === 'dClose') { $('#detail').close(); return; }
      if (b.id === 'sheetClose' || b.id === 'sheetDone') { $('#sheet').close(); return; }
      if (b.id === 'sheetReset') { ACTIONS.resetFilters(); return; }
      if (b.id === 'openFilters') { openSheet(); return; }
      if (b.id === 'clearQ') { ACTIONS.clearQ(); $('#q').focus(); return; }
      if (b.id === 'themeBtn') {
        const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
        st.theme = dark ? 'light' : 'dark';
        document.documentElement.dataset.theme = st.theme;
        renderNav();
        save();
      }
    });
    document.addEventListener('change', ev => {
      const t = ev.target;
      if (t.id === 'stdYear') { st.stdYear = t.value; render(); return; }
      if (t.id === 'sort') { st.f.sort = t.value; ui.shown = PAGE; render(); return; }
      if (t.id === 'importState') {
        const file = t.files[0];
        if (!file) return;
        file.text().then(txt => {
          const s = JSON.parse(txt);
          if (!s || s.v !== 1) throw new Error('not a backup');
          const theme = st.theme;
          st = sanitize(s);
          st.theme = theme;
          render();
          toast('已還原備份');
        }).catch(() => toast('這個檔案不是這個工具的備份檔'));
        t.value = '';
      }
    });
    document.addEventListener('toggle', ev => {
      const id = ev.target.id;
      if (id === 'moreScores') ui.more = ev.target.open;
      if (id === 'catsBox') ui.catsOpen = ev.target.open;
      if (id === 'tierHelp') ui.helpOpen = ev.target.open;
    }, true);
    document.addEventListener('keydown', ev => {
      const t = ev.target;
      if (ev.key === '/' && !ev.metaKey && !ev.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !$('dialog[open]')) {
        if (ui.tab !== 'explore') setTab('explore');
        ev.preventDefault();
        $('#q').focus();
        return;
      }
      if ((ev.key === 'Enter' || ev.key === ' ') && t.dataset && t.dataset.open && t.getAttribute('role') === 'button') { ev.preventDefault(); openDetail(t.dataset.open); }
    });
    let qTimer = null;
    $('#q').addEventListener('input', ev => {
      $('#clearQ').hidden = !ev.target.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(() => { st.f.q = ev.target.value; ui.shown = PAGE; render(); }, 180);
    });
    $('#q').addEventListener('keydown', ev => { if (ev.key === 'Escape' && ev.target.value) { ev.preventDefault(); ACTIONS.clearQ(); } });
    const dlg = $('#detail');
    dlg.addEventListener('close', onDetailClosed);
    dlg.addEventListener('click', ev => { if (ev.target === dlg) dlg.close(); });
    const sh = $('#sheet');
    sh.addEventListener('close', onSheetClosed);
    sh.addEventListener('click', ev => { if (ev.target === sh) sh.close(); });
    window.matchMedia('(max-width: 959px)').addEventListener('change', e => { if (!e.matches && sh.open) sh.close(); if (ui.tab === 'explore') renderExplore(); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderNav);
    window.addEventListener('hashchange', route);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        if (es.some(e => e.isIntersecting) && ui.tab === 'explore' && ui.visible > ui.shown) { ui.shown += PAGE; renderExplore(); }
      }, { rootMargin: '600px 0px' }).observe($('#more'));
    }
    bindSliders();
  }

  // ------------------------------------------------------------------ init
  $('#tabs').innerHTML = NAV.map(([k, l, , ic]) => `<button class="tab" type="button" data-tab="${k}">${icon(ic)}${l}${k === 'plan' ? '<span class="count" data-plancount></span>' : ''}</button>`).join('');
  $('#bottomnav').innerHTML = NAV.map(([k, , s, ic]) => `<button class="bnav" type="button" data-tab="${k}">${icon(ic)}<span>${s}</span>${k === 'plan' ? '<span class="count" data-plancount></span>' : ''}</button>`).join('');
  if (st.theme) document.documentElement.dataset.theme = st.theme;
  $('#q').value = st.f.q;
  renderCountdown();
  bind();
  const startTab = { '#plan': 'plan', '#boost': 'boost', '#guide': 'guide' }[location.hash] || 'explore';
  ui.tab = '';
  setTab(startTab, true);
  route();
  window.__app = { st: () => st, evaluate: c => EV.get(c), render };
})();
