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
  // 一階組合 filter: only 系 whose 倍率篩選 uses exactly this set of subjects (all stages together).
  const COMBO_OF = Object.fromEntries(D.depts.map(d => [d.c, L.comboKey(d)]));
  const COMBO_KEYS = new Set(Object.values(COMBO_OF).filter(Boolean));
  const COMBO_TOP = 10; // chips shown before「更多組合」
  // 一階科目 filter: hide 系 that need any of these subjects for 檢定 or 倍率篩選.
  const SKIP_SUBJ = [['國', '國文'], ['英', '英文'], ['數A', '數A'], ['數B', '數B'], ['社', '社會'], ['自', '自然'], ['聽', '英聽']];
  const ST2_TEST = { noInterview: d => !L.hasInterview(d), noWritten: d => !L.hasWritten(d), noVisit: L.noVisit };
  const SORTS = ['chance', 'select', 'sat', 'satLow', 'date', 'quota', 'code'];
  const TIERS = L.TIERS;
  const TC = { 穩: 't1', 適中: 't2', 衝: 't3', 難: 't4', 不符: 't5', 無資料: 't6' };
  // one-liners for group headers
  const TIER_SHORT = { 穩: '每關都有餘裕', 適中: '都達到，差距小', 衝: '剛好或差一點', 難: '明顯不夠', 不符: '進不了一階', 無資料: '沒有可比的門檻' };
  const TIER_HELP = {
    穩: '每關都高過 115 最低，門檻漲 1 也會過',
    適中: '每一關都達到，但差距小或 116 規則有變',
    衝: '剛好等於門檻（看超額篩選）或差一點',
    難: '明顯低於 115 門檻',
    不符: '檢定沒過或沒考用到的科目，進不了一階',
    無資料: '沒有可比的 115 門檻（新科目組合、新設或術科）',
  };
  // 116 學測模擬考 (115 學年度高三): dates and 範圍 from several high schools' 115 學年度 notices (台南、高雄、新竹).
  // Schools sit the same papers on nearby days, so a school's own notice wins.
  // 翰林 學測模擬考 五標 (頂/前/均/後/底), as 翰林高中試務中心 names them:
  //   7月全國 (115-E1): 「115學年度第一次學測模擬考（翰林）各科成績標準一覽表」 (posted by threads.com/@minda_tsu);
  //     its 數學 row and 級距 6.60317 match the 翰林115E1 playlist (2026/7/30, 約 5.3 萬人) exactly.
  //   9月北北基 (115-E2): seventeen5.co/115-1-mock-test-analysis and xuebago.tw/blog/article/parent/115-trme-analysis.html agree.
  //   10月北北基 (115-E3): 原始分數與級分五標對照表 retyped by threads.com/@116_gsat_ (post Df4VMGFAYRh, 2026/11/19),
  //     with that account's correction for 社會 (post Df6TqE5AW-2): 13、12、10、8、7. 報考人數 數A 59616、數B 55802、社會 56679、自然 49241.
  // Anything not found is left for the student to copy from their 成績單.
  const lv5 = a => ({ 頂標: a[0], 前標: a[1], 均標: a[2], 後標: a[3], 底標: a[4] });
  const H1M = lv5([13, 11, 7, 4, 3]);
  const H1 = { 國: lv5([13, 12, 11, 9, 7]), 英: lv5([12, 10, 7, 5, 4]), 數A: H1M, 數B: H1M, 社: lv5([13, 12, 10, 8, 7]), 自: lv5([12, 10, 8, 5, 4]) };
  const H3 = { 國: lv5([13, 12, 11, 9, 7]), 英: lv5([12, 9, 6, 4, 3]), 數A: lv5([10, 8, 6, 4, 3]), 數B: lv5([12, 10, 6, 4, 3]), 社: lv5([13, 12, 10, 8, 7]), 自: lv5([13, 11, 9, 7, 5]) };
  const H2 = { 國: lv5([14, 13, 12, 10, 9]), 英: lv5([12, 10, 7, 4, 3]), 數A: lv5([11, 9, 6, 4, 3]), 數B: lv5([11, 9, 6, 4, 3]), 社: lv5([13, 11, 10, 8, 7]), 自: lv5([12, 10, 8, 6, 4]) };
  const MOCK_REF = [
    { n: '第一次學測模擬考', d: '2026-07-29', org: '7月全國', area: '全國', std: H1, stdNote: '翰林 7月全國模考的五標（數A、數B 同一份考卷）',  when: '7/29–7/30', r: { 國文: '第 1–2 冊', 英文: '第 1–2 冊', 數學: '第 1 冊（數A、數B 不分卷）', 社會: '歷史、地理第 1 冊；公民：社會政治', 自然: '物理、化學、生物、地科必修上半冊' } },
    { n: '第二次學測模擬考', d: '2026-09-02', org: '9月北北基', area: '北區', std: H2, stdNote: '翰林 9月北北基模考的五標（數A、數B 同一份考卷）',  when: '9/2–9/3（有的學校 9/9–9/10）', r: { 國文: '第 1–3 冊', 英文: '第 1–3 冊', 數學: '第 1–2 冊（不分卷）', 社會: '第 1–2 冊；公民：社會政治、法律', 自然: '物化生地必修全（含探究與實作）', 英聽: '英文必修第 1–4 學期' } },
    { n: '第三次學測模擬考', d: '2026-10-28', org: '10月北北基', area: '北區', std: H3, stdNote: '翰林 10月北北基模考（115-E3）的五標',  when: '10/28–10/29', r: { 國文: '第 1–4 冊', 英文: '第 1–4 冊', 數學: '第 1–2 冊＋數A 或數B 第 3 冊', 社會: '第 1–3 冊', 自然: '必修全（含探究與實作）' } },
    { n: '第四次學測模擬考', d: '2026-12-08', org: '12月', when: '12/8–12/9', r: { 國文: '第 1–5 冊', 英文: '第 1–5 冊', 數學: '第 1–2 冊＋數A 或數B 第 3–4 冊', 社會: '第 1–3 冊', 自然: '必修全（含探究與實作）' } },
    { n: '116 學測', d: '2027-01-22', when: '2027/1/22–1/24', r: null },
  ];
  const MOCK_MAX = 30;
  const REVIEW = { A: '修課紀錄', B: '書面報告', C: '實作作品', D: '自然科學探究與實作成果', E: '社會領域探究活動成果', F: '自主學習計畫與成果', G: '社團活動經驗', H: '擔任幹部經驗', I: '服務學習經驗', J: '競賽表現', K: '非修課紀錄之成果作品', L: '檢定證照', M: '特殊優良表現證明', N: '多元表現綜整心得', O: '高中學習歷程反思', P: '就讀動機', Q: '未來學習計畫與生涯規劃' };
  const SCORE_KEYS = ['國', '英', '數A', '數B', '社', '自'];
  const ABBR = { 國: '國', 英: '英', 數A: '數A', 數B: '數B', 社: '社', 自: '自', 識: 'APCS觀念', 實: 'APCS實作' };
  const LV_SHORT = { 頂標: '頂', 前標: '前', 均標: '均', 後標: '後', 底標: '底' };
  const LS = 'apply116-v1';
  const PAGE = 50;
  const NAV = [['explore', '找校系', '找校系', 'search'], ['plan', '我的志願', '我的志願', 'plan'], ['boost', '怎麼進步', '怎麼進步', 'boost'], ['mock', '模考', '模考', 'mock'], ['guide', '時程與規則', '時程規則', 'guide']];

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
    mock: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9.5 4V3h5v1M8.5 10.5h7M8.5 14.5h7M8.5 18h4"/>',
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
    stdCustom: copyStd(D.std['115']),
    f: { q: '', groups: [], regions: [], own: 'all', tiers: DEFAULT_TIERS.slice(), cats: DEFAULT_CATS.slice(), st2: [], sat: 'all', skip: [], combos: [], untaken: false, sort: 'chance' },
    fav: [], plan: [], mocks: [], mockV: 3, theme: '',
  });
  /** 五標 tables: {國: {頂標: 13, …}, …}. A custom one (e.g. a 模考's) must have every level as 1–15 級分. */
  function copyStd(x) { return JSON.parse(JSON.stringify(x)); }
  /** A 模考's 五標 may cover only some subjects (a subject counts only with all five levels). */
  function cleanStdPart(x) {
    if (!x || typeof x !== 'object') return null;
    const out = {};
    for (const k of SCORE_KEYS) {
      const r = {};
      if (L.LEVELS.every(l => { const n = Number(x[k] && x[k][l]); r[l] = n; return Number.isInteger(n) && n >= 1 && n <= 15; })) out[k] = r;
    }
    return Object.keys(out).length ? out : null;
  }
  function cleanStd(x) {
    if (!x || typeof x !== 'object') return null;
    const out = {};
    for (const k of SCORE_KEYS) {
      out[k] = {};
      for (const l of L.LEVELS) {
        const n = Number(x[k] && x[k][l]);
        if (!Number.isInteger(n) || n < 1 || n > 15) return null;
        out[k][l] = n;
      }
    }
    return out;
  }
  const todayISO = () => { const t = new Date(); return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  function cleanScores(x) {
    const out = DEFAULT().scores;
    for (const k of Object.keys(out)) {
      const v = x ? x[k] : '';
      if (k === '聽') out[k] = ['A', 'B', 'C', 'F'].includes(String(v).toUpperCase()) ? String(v).toUpperCase() : '';
      else { const n = Number(v); out[k] = v !== '' && v != null && Number.isInteger(n) && n > 0 && n <= (k === '識' || k === '實' ? 5 : 15) ? String(n) : ''; }
    }
    return out;
  }
  /**
   * One-time upgrade of 模考 saved before the 翰林 五標 were built in (state version < 2):
   * - match each record to a 翰林 preset by name (第三次 / 三模 / 10月…) or by date;
   * - per subject, a 五標 row that is missing, or is a copy of a 學測 五標 (the old default that
   *   was prefilled), takes the preset's row; a row the student typed themselves is kept;
   * - a copied 學測 row with no preset row is dropped (it was never this 模考's 五標).
   */
  const MOCK_KEYS = [[/第?一次|一模|7\s*月/, 0], [/第?二次|二模|9\s*月/, 1], [/第?三次|三模|10\s*月/, 2], [/第?四次|四模|12\s*月/, 3]];
  function mockPreset(m) {
    const ref = MOCK_REF.filter(x => x.r);
    const exact = ref.find(x => x.n === m.n);
    if (exact) return exact;
    // another publisher's or region's exam (中區、南一、樂模、校內…) is never matched to 翰林
    if (/中區|中模|南區|南一|康熹|龍騰|樂學|樂模|校內|段考|全真|晟景|大考中心/.test(m.n)) return null;
    const byName = MOCK_KEYS.find(([re]) => re.test(m.n));
    if (byName) return ref[byName[1]];
    const day = iso => Date.parse(iso + 'T00:00:00Z') / 864e5;
    return ref.find(x => { const dd = day(m.d) - day(x.d); return dd >= -3 && dd <= 14; }) || null;
  }
  function upgradeMockStd(m) {
    const p = mockPreset(m);
    const isTestCopy = (k, row) => Object.values(D.std).some(y => y[k] && L.LEVELS.every(l => y[k][l] === row[l]));
    const out = {};
    for (const k of SCORE_KEYS) {
      const mine = m.std && m.std[k], pre = p && p.std && p.std[k];
      if (mine && !isTestCopy(k, mine)) out[k] = mine;
      else if (pre) out[k] = { ...pre };
    }
    return Object.keys(out).length ? out : null;
  }
  function sanitize(s) {
    const d = DEFAULT();
    if (!s || typeof s !== 'object' || s.v !== 1) return d;
    const arr = (x, ok) => (Array.isArray(x) ? x.filter(ok) : []);
    const f = { ...d.f, ...(s.f && typeof s.f === 'object' ? s.f : {}) };
    const out = { ...d, theme: ['light', 'dark'].includes(s.theme) ? s.theme : '', stdYear: D.std[s.stdYear] || s.stdYear === 'custom' ? String(s.stdYear) : d.stdYear, f };
    out.stdCustom = cleanStd(s.stdCustom) || d.stdCustom;
    out.scores = cleanScores(s.scores);
    f.q = typeof f.q === 'string' ? f.q : '';
    f.groups = arr(f.groups, g => GROUPS.includes(g));
    f.regions = arr(f.regions, r => REGIONS.includes(r));
    f.tiers = Array.isArray(f.tiers) ? f.tiers.filter(t => TIERS.includes(t)) : d.f.tiers;
    f.cats = Array.isArray(f.cats) ? f.cats.filter(c => CATS.some(x => x[0] === c)) : d.f.cats;
    // v3 kept「學測佔 50% 以上」among the 第二階段 chips; it is now one of the 學測-share choices.
    if (Array.isArray(f.st2) && f.st2.includes('satHeavy') && !(s.f && s.f.sat)) f.sat = 'heavy';
    f.st2 = arr(f.st2, k => ST2.some(x => x[0] === k));
    if (!SAT_BY[f.sat]) f.sat = 'all';
    f.skip = arr(f.skip, k => SKIP_SUBJ.some(x => x[0] === k));
    f.untaken = f.untaken === true;
    f.combos = arr(f.combos, k => typeof k === 'string' && COMBO_KEYS.has(k));
    if (!['all', 'pub', 'pri'].includes(f.own)) f.own = 'all';
    if (!SORTS.includes(f.sort)) f.sort = 'chance';
    out.fav = [...new Set(arr(s.fav, c => BY_CODE[c]))];
    out.mocks = arr(s.mocks, m => m && typeof m === 'object').map(m => ({
      id: typeof m.id === 'string' ? m.id.slice(0, 20) : Math.random().toString(36).slice(2, 10),
      n: String(m.n || '模考').slice(0, 30),
      d: /^\d{4}-\d{2}-\d{2}$/.test(m.d) ? m.d : todayISO(),
      s: cleanScores(m.s),
      std: cleanStdPart(m.std),
    })).filter(m => SCORE_KEYS.some(k => L.val(m.s, k) != null)).slice(0, MOCK_MAX);
    if (!(s.mockV >= 2)) out.mocks.forEach(m => { m.std = upgradeMockStd(m); });
    // v3: 7月全國 五標 for every subject became available: fill subjects a matched 模考 still lacks
    if (!(s.mockV >= 3)) out.mocks.forEach(m => {
      const p = mockPreset(m);
      if (!p || !p.std) return;
      for (const k of SCORE_KEYS) if (p.std[k] && !(m.std && m.std[k])) { m.std = m.std || {}; m.std[k] = { ...p.std[k] }; }
    });
    out.mockV = 3;
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
  /** The 五標 used for 檢定: a 學年度's, or the user's own (自訂, e.g. from a 模考). */
  const STD = () => (st.stdYear === 'custom' ? st.stdCustom : D.std[st.stdYear]);
  const stdName = () => (st.stdYear === 'custom' ? '自訂五標' : `${st.stdYear} 學年度五標`);
  const opts = () => ({ std: STD(), stdByYear: D.std, stdYear: st.stdYear, pct: D.pct });
  function ensureEval() {
    const sig = JSON.stringify(st.scores) + '|' + st.stdYear + '|' + (st.stdYear === 'custom' ? JSON.stringify(st.stdCustom) : '');
    if (sig === evSig) return;
    evSig = sig;
    EV = new Map();
    if (!hasScores()) return;
    const o = opts();
    for (const d of D.depts) EV.set(d.c, L.evaluate(d, st.scores, o));
  }
  const tierOf = d => { const e = EV.get(d.c); return e ? e.tier : null; };
  /** 二階 採計 a subject you did not take (it counts as 0). 檢定／篩選 subjects you did not take are already 不符. */
  const usesUntaken = d => { const e = EV.get(d.c); return !!(e && e.tier !== '不符' && ((e.miss && e.miss.weight.length) || (e.screenZero && e.screenZero.length))); };

  // ------------------------------------------------------------------ formatting helpers
  const sch = d => SCHOOL[d.sid].n;
  const isPub = d => SCHOOL[d.sid].pub;
  const catOf = d => (d.cats.length ? d.cats : ['一般']);
  const subj = k => L.SUBJ_NAME[k] || k;
  const partsLabel = ps => (ps.length === 1 ? subj(ps[0]) : ps.length === 2 ? ps.map(subj).join('+') : ps.map(p => ABBR[p] || p).join('+'));
  function fmtTop(x) {
    if (x == null) return '';
    if (x < 1) return '前 ' + x.toFixed(2) + '%';
    if (x < 10) return '前 ' + x.toFixed(1) + '%';
    return '前 ' + Math.round(x) + '%';
  }
  /** Which 標 a score reaches in a given 五標 table ('' when unknown). */
  function levelIn(t, k, v) {
    const s = t && t[k];
    if (!s || !v) return '';
    for (const l of L.LEVELS) if (v >= s[l]) return l;
    return '未達底標';
  }
  function levelOf(k, v, year) {
    const t = year ? D.std[year] : STD(), s = t && t[k];
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
  /** A 116 stage with the 115 cut it is compared with: 國+英+社 ×3（115 最低 38）. */
  /** How a stage's 倍率 and the people it lets through (倍率 × 名額) changed from 115; empty when neither did. */
  function changeTag(s) {
    const t = [];
    if (s.kind === 'mult') t.push(`倍率 ${s.ref.m}→${s.m}`);
    if (s.scaled) t.push(`約 ${s.n115}→${s.n116} 人`);
    else if (s.kind === 'mult' && s.scale != null) t.push('人數差不多');
    return t.join('，');
  }
  function stageCutText(s, r) {
    const name = `${partsLabel(s.parts)} ×${s.m}`;
    if (!r) return name;
    if (s.ref) { const tag = changeTag(s); return `${name}（115 最低 ${s.ref.v}${tag ? '，' + tag : ''}）`; }
    return `${name}（${s.kind === 'open' ? '115 沒有篩掉人' : s.open ? '115 沒有篩掉人，116 收得比較少' : '115 沒有同樣科目'}）`;
  }
  /** 檢定 and the 116 一階 stages (each with its comparable 115 cut), for the copied plan and the CSV. */
  function requirementParts(d) {
    const th = d.sub.filter(s => s.t).map(s => (s.k === '聽' ? '英聽' + s.t : s.apcs ? subj(s.p[0]) + s.t + '級' : subj(s.k).replace('數學', '數') + s.t));
    const A = L.align116(d), r = d.r115;
    let one = A.stages.length ? A.stages.map(s => stageCutText(s, r)).join(' → ') + (A.arts116.length ? '，另有術科篩選' : '')
      : A.arts116.length ? '只用術科篩選' : '不篩學測，通過檢定就進二階';
    if (A.stages.length && r && !r.cut.length) one += '；115 一階沒有篩掉人';
    if (!r) one += `；無 115 資料（${d.why || '116 新設或改名'}）`;
    return { th: th.length ? '檢定 ' + th.join('、') : '無檢定', one };
  }
  function requirementLine(d) {
    const p = requirementParts(d);
    return `${p.th}　|　116 一階 ${p.one}`;
  }
  const hayCache = new Map();
  function hay(d) {
    let h = hayCache.get(d.c);
    if (!h) { h = [sch(d), d.n, d.c, d.g.join(' '), d.rv || '', d.rn || '', d.iv || '', d.notes || '', d.city, d.st2.map(x => x.i).join(' ')].join(' ').toLowerCase(); hayCache.set(d.c, h); }
    return h;
  }
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
    if (skip !== 'skip' && L.stage1Uses(d, f.skip)) return false;
    if (skip !== 'combos' && f.combos.length && !f.combos.includes(COMBO_OF[d.c])) return false;
    if (skip !== 'untaken' && !f.untaken && usesUntaken(d)) return false;
    if (qTerms.length) { const h = hay(d); if (!qTerms.every(t => h.includes(t))) return false; }
    return true;
  }
  const baseFiltered = skip => D.depts.filter(d => passes(d, skip));
  const filterCount = () => st.f.groups.length + st.f.regions.length + (st.f.own !== 'all' ? 1 : 0) + (st.f.sat !== 'all' ? 1 : 0) + st.f.st2.length + st.f.skip.length + st.f.combos.length + (st.f.untaken ? 1 : 0) + (catsChanged() ? 1 : 0);
  const skipName = k => SKIP_SUBJ.find(x => x[0] === k)[1];
  const comboParts = k => k.split('+');
  const comboName = k => { const ps = comboParts(k); return ps.length === 1 ? subj(ps[0]) : ps.map(p => ABBR[p] || p).join(''); };
  /** Combination chips: how many 系 screen on each, and your 115 rank on it; strongest first once you have scores. */
  function comboChips() {
    const f = st.f, has = hasScores(), c = {};
    for (const d of baseFiltered('combos')) { const k = COMBO_OF[d.c]; if (k) c[k] = (c[k] || 0) + 1; }
    const rows = [...new Set([...Object.keys(c), ...f.combos])].map(k => {
      const rk = has ? L.comboRank(comboParts(k), st.scores, D.pct) : null;
      return { k, n: c[k] || 0, rk };
    });
    // With scores: combinations you rank best on come first (only those with 5+ 系, so rare ones do not crowd the top).
    const strength = x => (has && x.n >= 5 && x.rk && x.rk.top != null ? x.rk.top : Infinity);
    rows.sort((a, b) => (strength(a) - strength(b)) || (b.n - a.n) || (a.k < b.k ? -1 : 1));
    const chipC = x => `<button type="button" class="chip combo${x.n === 0 ? ' zero' : ''}" aria-pressed="${f.combos.includes(x.k)}" data-combo="${esc(x.k)}" title="${esc(comboParts(x.k).map(subj).join('＋'))}">${esc(comboName(x.k))}<span class="n">${x.n}</span>${has ? `<span class="rk">${x.rk ? (x.rk.top != null ? fmtTop(x.rk.top) : x.rk.sum + ' 級分') : '沒考'}</span>` : ''}</button>`;
    const head = rows.slice(0, COMBO_TOP), rest = rows.slice(COMBO_TOP);
    const restOn = rest.some(x => f.combos.includes(x.k));
    return `<div class="chips" role="group" aria-labelledby="comboLab">${head.map(chipC).join('')}</div>${rest.length ? `<details class="combomore" id="comboMore" ${ui.comboOpen || restOn ? 'open' : ''}><summary>${icon('chevR', 'sm')}其他 ${rest.length} 種組合</summary><div class="chips">${rest.map(chipC).join('')}</div></details>` : ''}`;
  }
  function scopeLabel() {
    const f = st.f, p = [];
    if (f.groups.length) p.push(f.groups.join('、'));
    if (f.regions.length) p.push(f.regions.map(regionLabel).join('、'));
    if (f.own !== 'all') p.push(f.own === 'pub' ? '公立' : '私立');
    if (f.sat !== 'all') p.push(SAT_BY[f.sat][2]);
    f.st2.forEach(k => p.push(ST2.find(x => x[0] === k)[1]));
    if (f.skip.length) p.push('一階不用' + f.skip.map(skipName).join('、'));
    if (f.combos.length) p.push('一階篩 ' + f.combos.map(comboName).join('／'));
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
    const std = max === 15 && STD() ? STD()[k] : null;
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
  // ------------------------------------------------------------------ 模考紀錄
  const mocksByDate = () => st.mocks.slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const mdText = iso => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
  const mockTotal = m => SCORE_KEYS.reduce((t, k) => t + (L.val(m.s, k) || 0), 0);
  const scoreLine = sc => SCORE_KEYS.map(k => L.val(sc, k)).map((v, i) => (v == null ? null : `${ABBR[SCORE_KEYS[i]]}${v}`)).filter(Boolean).join(' ') + (sc.聽 ? ` 聽${sc.聽}` : '');
  // A 模考's 五標 completed with the 檢定 五標 for subjects it does not cover (used to judge 檢定 for that 模考).
  const presetOf = n => MOCK_REF.find(x => x.n === n && x.r);
  // Short display name: built-in 模考 read as 「翰林第二次」.
  const mName = m => { const p = presetOf(m.n); return p ? '翰林' + m.n.replace('學測模擬考', '') + (p.area ? `（${p.area}）` : '') : m.n; };
  const sameStd = (a, b) => JSON.stringify(cleanStdPart(a)) === JSON.stringify(cleanStdPart(b));
  function stdSource(m) {
    const p = mockPreset(m);
    if (!m.std) return '沒有五標';
    if (p && p.std && sameStd(m.std, p.std)) {
      const ks = SCORE_KEYS.filter(k => p.std[k]);
      return ks.length < SCORE_KEYS.length ? `翰林五標只有${[...new Set(ks.map(k => subj(k).replace(/[AB]$/, '')))].join('、')}，其他科可以按「修改」補上` : '翰林公布的五標';
    }
    const same = p && p.std ? Object.keys(m.std).filter(k => p.std[k] && L.LEVELS.every(l => p.std[k][l] === m.std[k][l])) : [];
    return same.length ? '翰林五標（有幾科自己改過）' : '自己填的五標';
  }
  /** New or edited 模考 in the form (ui.mf). */
  function newMockDraft() {
    const next = MOCK_REF.find(x => x.r && !st.mocks.some(m => m.n === x.n) && x.d <= todayISO()) || MOCK_REF.find(x => x.r && !st.mocks.some(m => m.n === x.n)) || MOCK_REF[0];
    return { id: null, n: next.n, d: next.d, s: {}, 聽: '', std: next.std ? copyStd(next.std) : {}, stdOpen: false };
  }
  function editMockDraft(m) {
    const s = {};
    SCORE_KEYS.forEach(k => { const v = L.val(m.s, k); if (v != null) s[k] = v; });
    const pre = mockPreset(m);
    return { id: m.id, n: m.n, pre: pre ? pre.n : null, d: m.d, s, 聽: m.s.聽 || '', std: m.std ? copyStd(m.std) : {}, stdOpen: false };
  }
  const mfLevel = (f, k) => {
    const v = f.s[k], r = f.std[k];
    if (!v || !r || L.LEVELS.some(l => !r[l])) return '';
    const e = L.mockToTest(f.std, k, v, D.pct);
    return `${levelIn(f.std, k, v)}${e ? `<span>學測約 ${e.g}</span>` : ''}`;
  };
  function mockFormHTML() {
    const f = ui.mf;
    // a record named 「三模」 etc. still belongs to its 翰林 模考: keep its own name, but offer that 模考's 五標
    const p = presetOf(f.n) || (f.pre && presetOf(f.pre));
    const pick = p ? p.n : '';
    const stdKeys = SCORE_KEYS.filter(k => f.std[k] && L.LEVELS.every(l => f.std[k][l]));
    const stdText = !stdKeys.length ? (p ? '還沒收錄這次的五標，可以照成績單填。' : '可以照成績單填這次的五標。')
      : p && p.std && sameStd(f.std, p.std) ? `已帶入${p.stdNote}。` : `已填 ${stdKeys.map(subj).join('、')} 的五標。`;
    const grid = `<div class="stdgrid" role="table" aria-label="這次模考的五標">
      <span role="columnheader"></span>${L.LEVELS.map(l => `<span role="columnheader">${l.replace('標', '')}</span>`).join('')}
      ${SCORE_KEYS.map(k => `<span role="rowheader">${subj(k)}</span>${L.LEVELS.map(l => `<input type="number" inputmode="numeric" min="1" max="15" value="${(f.std[k] && f.std[k][l]) || ''}" data-mfstd="${k}:${l}" aria-label="${subj(k)}${l}">`).join('')}`).join('')}
      </div><p class="hint">一科五格都填才算。${p && p.std ? ' <button class="textbtn" type="button" data-act="mfStdPreset">改回翰林公布的</button>' : ''}</p>`;
    return `<section class="sec mform" id="mockForm"><div class="sec-hh"><h2>${f.id ? '修改模考' : '新增一次模考'}</h2>${st.mocks.length ? '<button class="textbtn" type="button" data-act="mfCancel">取消</button>' : ''}</div>
      <div class="mf-top">
        <label class="mf-f"><span>哪一次</span><span class="selectbox"><select id="mfPreset">${MOCK_REF.filter(x => x.r).map(x => `<option value="${esc(x.n)}" ${x.n === pick ? 'selected' : ''}>翰林 ${esc(x.org)}（${x.area ? esc(x.area) + '・' : ''}${esc(x.n.replace('學測模擬考', ''))}，${esc(x.when.replace(/（.*）/, ''))}）</option>`).join('')}<option value="" ${pick ? '' : 'selected'}>其他模考</option></select>${icon('chevD', 'sm')}</span></label>
        ${pick ? '' : '<p class="hint mf-wide">中區（南一）、南一全國跟翰林是不同考試，五標照你的成績單填。</p>'}
        ${presetOf(f.n) ? '' : `<label class="mf-f"><span>名稱</span><input id="mfName" type="text" maxlength="30" value="${esc(f.n)}" placeholder="例如：南一第一次、校內模考"></label>`}
        <label class="mf-f"><span>日期</span><input id="mfDate" type="date" value="${f.d}"></label>
      </div>
      <h3 class="mf-h">級分 <small>沒考的空著</small>${hasScores() ? '<button class="textbtn" type="button" data-act="mfFromScores">帶入「我的學測級分」</button>' : ''}</h3>
      <div class="mf-scores">${SCORE_KEYS.map(k => `<label class="mf-s"><span class="k">${subj(k)}</span><input type="number" inputmode="numeric" min="0" max="15" value="${f.s[k] || ''}" data-mf="${k}" placeholder="—"><small class="lv" data-mflv="${k}">${mfLevel(f, k)}</small></label>`).join('')}
        ${p && !p.r.英聽 && !f.聽 ? '' : `<label class="mf-s"><span class="k">英聽</span><span class="selectbox"><select data-mf="聽"><option value="">—</option>${['A', 'B', 'C', 'F'].map(g => `<option ${f.聽 === g ? 'selected' : ''}>${g}</option>`).join('')}</select>${icon('chevD', 'sm')}</span><small class="lv"></small></label>`}
      </div>
      ${p && p.n === '第一次學測模擬考' || p && p.n === '第二次學測模擬考' ? '<p class="hint">這次數A、數B 同一份考卷，填在你要考的那科。</p>' : ''}
      ${p && !p.r.英聽 ? '<p class="hint">這次沒考英聽。</p>' : ''}
      <div class="mf-std"><div class="mf-std-h"><b>這次的五標</b><span>${esc(stdText)}</span><button class="textbtn" type="button" data-act="mfStdToggle" aria-expanded="${f.stdOpen}">${f.stdOpen ? '收起' : stdKeys.length ? '看／修改' : '填五標'}</button></div>${f.stdOpen ? grid : ''}</div>
      <div class="mf-actions"><button class="btn primary" type="button" data-act="mfSave">${icon('check', 'sm')}${f.id ? '存好了' : '存這次模考'}</button></div>
    </section>`;
  }
  function mockCardsHTML() {
    const ms = mocksByDate().reverse();
    return `<ul class="mcards">${ms.map(m => {
      const chips = SCORE_KEYS.map(k => { const v = L.val(m.s, k); if (v == null) return ''; const lv = m.std && m.std[k] ? levelIn(m.std, k, v) : ''; return `<span class="mchip"><span class="k">${ABBR[k]}</span><b>${v}</b>${lv ? `<small>${LV_SHORT[lv] || lv.replace('未達底標', '底下')}</small>` : ''}</span>`; }).join('') + (m.s.聽 ? `<span class="mchip"><span class="k">聽</span><b>${m.s.聽}</b></span>` : '');
      return `<li class="mcard"><div class="mc-h"><b>${esc(mName(m))}</b><span>${mdText(m.d)} · ${esc(stdSource(m))}</span></div><div class="mc-s">${chips}</div>
        <div class="mc-a"><button class="btn sm" type="button" data-mockuse="${m.id}">看落點</button><button class="textbtn" type="button" data-mockedit="${m.id}">${icon('edit', 'sm')}修改</button><button class="textbtn danger" type="button" data-mockdel="${m.id}" aria-label="刪除 ${esc(mName(m))}">刪除</button></div></li>`;
    }).join('')}</ul>`;
  }
  function saveMockForm() {
    const f = ui.mf;
    const sc = {};
    SCORE_KEYS.forEach(k => { sc[k] = f.s[k] ? String(f.s[k]) : ''; });
    sc.聽 = f.聽 || '';
    if (!SCORE_KEYS.some(k => f.s[k])) { toast('至少填一科級分'); return; }
    const n = (f.n || '').trim().slice(0, 30) || '模考';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(f.d) ? f.d : todayISO();
    const rec = { id: f.id || Math.random().toString(36).slice(2, 10), n, d, s: cleanScores(sc), std: cleanStdPart(f.std) };
    const at = st.mocks.findIndex(m => (f.id ? m.id === f.id : m.n === n && m.d === d));
    if (at >= 0) st.mocks[at] = rec;
    else {
      if (st.mocks.length >= MOCK_MAX) { toast(`最多存 ${MOCK_MAX} 次，先刪掉舊的`); return; }
      st.mocks.push(rec);
    }
    ui.mf = null; render();
    toast(at >= 0 ? `已更新「${mName(rec)}」` : `已存「${mName(rec)}」`);
    requestAnimationFrame(() => { const el = $('#trendSec'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  function useMock(id) {
    const m = st.mocks.find(x => x.id === id);
    if (!m) return;
    // 模考 級分 are read as 學測 級分 by rank, so 檢定 and the 115 cuts use the 學測 scale too
    const { S, eq } = mockAsTest(m);
    st.scores = { ...cleanScores(S), 聽: m.s.聽 || st.scores.聽, 識: st.scores.識, 實: st.scores.實 };
    if (st.stdYear === 'custom' && Object.keys(eq).length) st.stdYear = '115';
    ui.shown = PAGE; ui.tryS = null; setTab('explore');
    toast(Object.keys(eq).length ? `已把「${mName(m)}」換算成學測級分（${Object.keys(eq).map(k => ABBR[k] + ' ' + L.val(m.s, k) + '→' + eq[k].g).join('、')}）看落點` : `已用「${mName(m)}」的成績看落點`);
  }
  function tryMock(id) {
    const m = st.mocks.find(x => x.id === id);
    if (!m) return;
    ui.tryS = { ...st.scores, ...cleanScores(mockAsTest(m).S), 聽: m.s.聽 || st.scores.聽, 識: st.scores.識, 實: st.scores.實 };
    ui.tryFrom = mName(m);
    ui.keepTry = true;
    if (ui.tab === 'boost') render(); else setTab('boost');
    setTimeout(() => { const el = $('#trySec'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200);
  }
  function renderMock() {
    const el = $('#mock');
    if (!ui.mf && !st.mocks.length) ui.mf = newMockDraft();
    const head = `<header class="page-h"><div><h1>模考</h1><p>每次模考存一筆，看趨勢、落點和換算的學測級分。</p></div>${ui.mf ? '' : `<button class="btn primary" type="button" data-act="mfNew">${icon('plus', 'sm')}新增模考</button>`}</header>`;
    el.innerHTML = head + (ui.mf ? mockFormHTML() : '') + (st.mocks.length ? `<section class="sec"><h2>我的模考（${st.mocks.length}）</h2>${mockCardsHTML()}</section>` : '') + (st.mocks.length ? trendHTML(baseFiltered()) : '') + `<section class="sec">${mockRefHTML()}</section>`;
    bindTips();
  }

  /**
   * 五標 grid, one row per subject, 頂標 → 底標. `target` says which table it edits:
   * 'custom' = 自訂五標 used for 檢定, 'draft' = the 模考 being saved, otherwise a saved 模考's id.
   */
  function stdTable(target) { return target === 'custom' ? st.stdCustom : null; }
  function customStdHTML(target = 'custom', label = '自訂五標') {
    const c = stdTable(target);
    const bad = SCORE_KEYS.filter(k => L.LEVELS.some((l, i) => i && c[k][l] > c[k][L.LEVELS[i - 1]]));
    return `<div class="stdgrid" role="table" aria-label="${esc(label)}">
      <span role="columnheader"></span>${L.LEVELS.map(l => `<span role="columnheader">${l.replace('標', '')}</span>`).join('')}
      ${SCORE_KEYS.map(k => `<span role="rowheader">${subj(k)}</span>${L.LEVELS.map(l => `<input type="number" inputmode="numeric" min="1" max="15" value="${c[k][l]}" data-std="${target}:${k}:${l}" aria-label="${esc(label)} ${subj(k)}${l}">`).join('')}`).join('')}
    </div>
    <div class="stdgrid-f">${Object.keys(D.std).sort().reverse().map(y => `<button class="textbtn" type="button" data-stdcopy="${target}:${y}">填入 ${y} 學測五標</button>`).join('')}</div>
    ${bad.length ? `<p class="hint warn-t">${bad.map(subj).join('、')}的五標沒有由高到低，請檢查。</p>` : ''}`;
  }
  function scoreEditor() {
    const s = st.scores, any = hasScores();
    const years = Object.keys(D.std).sort().reverse().map(y => `<option value="${y}" ${y === st.stdYear ? 'selected' : ''}>${y} 學年度學測五標</option>`).join('') + `<option value="custom" ${st.stdYear === 'custom' ? 'selected' : ''}>自訂（例如模考的五標）</option>`;
    return `<div class="panel-h"><h2>我的學測級分</h2>${any || s.聽 ? '<button class="textbtn" type="button" data-act="clearScores">全部清除</button>' : ''}</div>
      <p class="panel-note">${any ? '點或拖曳格子改級分。' : '點格子填級分，模考或目標分數也可以。'}下方標的是${stdName()}。</p>
      <div class="sliders">${SCORE_KEYS.map(k => sliderHTML('slider', k, subj(k), L.val(s, k) || 0, 15)).join('')}
        <div class="srow listen-row"><span class="srow-l" id="lab-listen">英聽</span>${listenHTML(s.聽)}</div>
      </div>
 <p class="panel-note">模考成績存在<button class="textbtn inline" type="button" data-tab="mock">模考分頁</button>。</p>
      <details class="more" id="moreScores" ${ui.more ? 'open' : ''}><summary>${icon('chevR', 'sm')}APCS、檢定用五標年份</summary><div class="more-b">
        ${sliderHTML('slider', '識', 'APCS 觀念', L.val(s, '識') || 0, 5)}
        ${sliderHTML('slider', '實', 'APCS 實作', L.val(s, '實') || 0, 5)}
        <label class="field">檢定用五標<span class="selectbox"><select id="stdYear">${years}</select>${icon('chevD', 'sm')}</span></label>
        ${st.stdYear === 'custom' ? customStdHTML() : ''}
        <p class="hint">116 五標 2027/2/25 公布，先用${st.stdYear === 'custom' ? '自訂的' : ` ${st.stdYear} 年的`}。數A、數B 都列檢定時過一科就好。</p>
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
    // 科目 chips combine too: each count is what the list would show with that subject also left out.
    const kpool = baseFiltered('skip'), kc = {};
    for (const [k] of SKIP_SUBJ) { const ks = f.skip.includes(k) ? f.skip : [...f.skip, k]; kc[k] = kpool.filter(d => !L.stage1Uses(d, ks)).length; }
    const nUntaken = hasScores() ? baseFiltered('untaken').filter(usesUntaken).length : 0;
    const n = filterCount();
    const h = `<div class="filter-h"><h2>篩選</h2><button class="textbtn" type="button" data-act="resetFilters" ${n ? '' : 'hidden'}>${icon('reset', 'sm')}重設</button></div>
      <div class="fsec"><h3>學群${f.groups.length ? '<button class="textbtn" type="button" data-act="groupsAll">全部學群</button>' : ''}</h3><div class="chips">${GROUPS.map(g => chip(g, f.groups.includes(g), `data-group="${g}"`, gc[g] || 0)).join('')}</div></div>
      <div class="fsec"><h3>地區</h3><div class="chips">${REGIONS.map(r => chip(regionLabel(r), f.regions.includes(r), `data-region="${r}"`, rc[r] || 0)).join('')}</div></div>
      <div class="fsec"><h3>公私立</h3><div class="segctl" role="group" aria-label="公私立">${[['all', '全部'], ['pub', '公立'], ['pri', '私立']].map(([k, l]) => `<button type="button" data-own="${k}" aria-pressed="${f.own === k}">${l}${k !== 'all' ? `<span class="muted num"> ${oc[k] || 0}</span>` : ''}</button>`).join('')}</div></div>
      <div class="fsec"><h3>一階科目</h3>
        <p class="fsub" id="skipLab">不要檢定或倍率篩選用到這些科目的校系</p><div class="chips" role="group" aria-labelledby="skipLab">${SKIP_SUBJ.map(([k, l]) => chip(l, f.skip.includes(k), `data-skip="${k}"`, kc[k])).join('')}</div>
        <p class="hint">數A、數B 擇一檢定的系，兩科都選才隱藏。</p>
        <p class="fsub" id="comboLab">只看一階用這個組合篩選的校系</p>${comboChips()}
        <p class="hint">${hasScores() ? '% 是你在這個組合排 115 考生前幾 %，由強到弱排。' : '輸入成績後會顯示你在每個組合的排名。'}</p>
        ${hasScores() ? `<label class="fcheck"><input type="checkbox" id="untakenBox" ${f.untaken ? 'checked' : ''}> 也顯示用到我沒考科目的校系<span class="muted num"> ${nUntaken}</span></label><p class="hint">沒考的科目以 0 級分計，用到它的系預設隱藏。</p>` : ''}</div>
      <div class="fsec"><h3>第二階段</h3>
        <p class="fsub" id="satLab">學測佔二階總成績</p><div class="chips" role="group" aria-labelledby="satLab">${SAT.map(([k, l]) => chip(l, f.sat === k, `data-sat="${k}"`, sc[k] || 0)).join('')}</div>
        <p class="fsub" id="ivLab">甄試</p><div class="chips" role="group" aria-labelledby="ivLab">${ST2.map(([k, l]) => chip(l, f.st2.includes(k), `data-st2="${k}"`, xc[k] || 0)).join('')}</div></div>
      <div class="fsec"><details id="catsBox" ${ui.catsOpen || catsChanged() ? 'open' : ''}><summary>${icon('chevR', 'sm')}特殊組別${catsChanged() ? '（已變更）' : ''}</summary><div class="chips">${CATS.map(([k, l]) => chip(l, f.cats.includes(k), `data-cat="${k}"`)).join('')}</div><p class="hint">限特定身分或要考術科的組別，預設隱藏。</p></details></div>`;
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
    f.skip.forEach(k => out.push(af('一階不用' + skipName(k), `data-skip="${k}"`)));
    f.combos.forEach(k => out.push(af('一階篩 ' + comboName(k), `data-combo="${esc(k)}"`)));
    if (f.untaken && hasScores()) out.push(af('含用到沒考科目', 'data-act="hideUntaken"'));
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
      el.innerHTML = `<div class="ov-h">${head}</div><div class="cta">${icon('target')}<div><b>先輸入學測級分</b>（模考或目標分數也可以），就會標出每個系的落點。</div></div>`;
      return;
    }
    const c = {};
    base.forEach(d => { const t = tierOf(d); c[t] = (c[t] || 0) + 1; });
    const good = (c['穩'] || 0) + (c['適中'] || 0);
    const W = el.clientWidth || 600;
    el.innerHTML = `<div class="ov-h">${head}<p>穩＋適中 <b>${good}</b> 個${c['不符'] ? ` · <b>${c['不符']}</b> 個進不了一階` : ''}</p></div>
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
      const gaps = taken.filter(i => i.need != null).map(i => i.need - i.mine);
      out.push({
        what: same ? `數A或數B ${either[0].label}` : either.map(i => `${ABBR[i.k]} ${i.label}`).join(' 或 '),
        need: either.map(i => `${ABBR[i.k]} ${i.need ?? '?'}`).join(' 或 '),
        mine: taken.length ? taken.map(i => `${ABBR[i.k]} ${i.mine}`).join('、') : '都沒考',
        gap: gaps.length ? Math.min(...gaps) : null,
      });
    }
    th.items.filter(i => !i.either && !i.ok).forEach(i => out.push({
      what: `${subj(i.k)} ${i.label}`,
      need: i.k === '聽' ? i.need + ' 級' : String(i.need ?? '?'),
      mine: i.mine == null ? '沒考' : String(i.mine),
      gap: i.k !== '聽' && i.mine != null && i.need != null ? i.need - i.mine : null,
    }));
    return out;
  }
  // One verdict block per row: the tier, one plain sentence, and (only when it helps) a few aligned detail lines.
  const verdict = (t, head, more) => `<div class="r-verdict">${pillHTML(t)}<div class="rv-b"><div class="rv-h">${head}</div>${more || ''}</div></div>`;
  function cmpHTML(d, e) {
    if (e.tier === '不符' && !e.th.ok) {
      const parts = thFailParts(e.th);
      const lines = parts.map(x => `<div class="rv-k">${esc(x.what)}</div><div class="rv-v">要 <b>${esc(x.need)}</b>，你 <b>${esc(x.mine)}</b>${x.gap > 0 ? ` <span class="delta down">差 ${x.gap}</span>` : ''}</div>`).join('');
      return verdict(e.tier, `檢定沒過${parts.length > 1 ? ` ${parts.length} 項` : ''}`, `<div class="rv-grid">${lines}</div>`);
    }
    const c = e.cmp;
    // The 116 stage that decides the tier, against the 115 cut for the same subjects.
    if (e.tier !== '不符' && e.tier !== '無資料' && c && c.stages && c.stages.length && d.r115 && d.r115.cut.length) {
      const s = c.status === 'fail' ? c.worst : c.status === 'edge' ? c.stages.find(x => x.res === 'edge')
        : c.status === 'maybe' ? c.stages.find(x => x.res === 'maybe') : c.binding;
      if (s && s.ref && s.mine != null) {
        const n = c.stages.length;
        const moved = s.res === 'short' || s.res === 'maybe';
        const delta = moved ? `<span class="delta eq">${s.diff > 0 ? '+' : ''}${s.diff}</span>` : deltaHTML(s.diff, s.last);
        const notes = [];
        if (s.scaled) notes.push(`收 ${s.n115} → ${s.n116} 人`);
        else if (s.kind === 'mult' && s.scale == null && !e.warnings.some(w => w.includes(`116 ×${s.m}`))) notes.push(`116 倍率 ×${s.ref.m} → ×${s.m}`);
        if (n > 1) notes.push(`第 ${c.stages.indexOf(s) + 1}／${n} 關`);
        const head = `<span class="rv-subj">${esc(partsLabel(s.parts))}</span><span class="rv-num"><span class="lab">115 最低</span><b>${s.v}</b><span class="lab">你</span><b>${s.mine}</b></span>${delta}`;
        return verdict(e.tier, head, notes.length ? `<div class="rv-note">${esc(notes.join('・'))}</div>` : '');
      }
    }
    return verdict(e.tier, `<span class="rv-text">${esc(e.reasons[0] || '')}</span>`);
  }
  function reqHTML(d) {
    const th = thList(d);
    const r = d.r115, A = L.align116(d);
    let k = '115 一階最低', v;
    if (!A.stages.length) { k = '一階'; v = A.arts116.length ? '只用術科篩選' : '不篩學測，通過檢定就進二階'; }
    else if (!r) { k = '115'; v = d.why || '116 新設或改名，115 沒有可對應的校系'; }
    else if (!r.cut.length) v = '沒有篩掉人';
    else v = A.stages.map(s => { const tag = s.ref ? changeTag(s) : ''; return `${partsLabel(s.parts)} ${s.ref ? s.ref.v + (tag ? `（${tag}）` : '') : s.kind === 'open' ? '沒篩人' : s.open ? '沒篩人（116 收得比較少）' : '（115 沒有）'}`; }).join(' → ');
    return `<div class="rv-grid plain"><div class="rv-k">檢定</div><div class="rv-v">${th.length ? esc(th.join('、')) : '不設'}</div><div class="rv-k">${esc(k)}</div><div class="rv-v">${esc(v)}</div></div>`;
  }
  function metaHTML(d) {
    const parts = partsLine(d);
    // Weekdays live in the detail drawer; the row keeps dates short.
    const facts = [`名額 ${d.q}`, daysText(d).replace(/\([一二三四五六日]\)/g, ''), d.city].filter(Boolean);
    return `<div class="rm-facts">${facts.map(x => `<span>${esc(x)}</span>`).join('')}</div>${parts ? `<div class="rm-parts"><span class="lab">二階</span>${esc(parts)}</div>` : ''}`;
  }
  /** 「一、面試 二、審查資料 三、…」 → one item per line. */
  function orderList(t) {
    if (!t) return '—';
    const items = String(t).split(/\s*[一二三四五六七八九十]+、/).map(x => x.trim()).filter(Boolean);
    return items.length > 1 ? `<span class="olist">${items.map((x, i) => `<span><i>${i + 1}</i>${esc(x)}</span>`).join('')}</span>` : esc(t);
  }
  /** Short labels for a row's warnings; the full sentences stay in the detail view. */
  function warnTags(e) {
    const out = [];
    for (const w of e.warnings) {
      if (/^沒考 (.+)，116 倍率/.test(w)) out.push(w.replace(/^沒考 (.+)，116.*/, '$1 以 0 級分篩選'));
      else if (/^沒考 (.+)，二階/.test(w)) out.push(w.replace(/^沒考 (.+)，二階.*/, '二階 $1 以 0 計'));
      else if (/^檢定邊緣/.test(w)) out.push('檢定邊緣');
      else if (/還有術科/.test(w)) out.push('另有術科篩選');
      else if (/人數變多/.test(w)) out.push('甄試人數變多');
      else if (/這一關沒算進去/.test(w)) out.push('有一關 115 沒資料');
      else for (const part of w.split('；')) {
        if (/^116 篩選跟 115 不同|篩選順序|拿掉了/.test(part)) out.push('116 篩選有變');
        else if (/的資料$/.test(part)) out.push(/同系/.test(part) ? '用同系資料' : '用相近系組資料');
        else if (/人數變少/.test(part)) out.push('甄試人數變少');
        else if (/檢定邊緣/.test(part)) out.push('檢定邊緣');
      }
    }
    return [...new Set(out)].slice(0, 3);
  }
  function rowHTML(d) {
    const e = EV.get(d.c), t = e ? e.tier : null;
    const fav = st.fav.includes(d.c), pi = st.plan.indexOf(d.c);
    const name = sch(d) + ' ' + d.n;
    const tags = e ? warnTags(e) : [];
    const warn = tags.length ? `<div class="r-warn" title="${esc(e.warnings.join('\n'))}">${icon('alert')}<span>${tags.map(esc).join('・')}</span></div>` : '';
    return `<li class="row" data-code="${d.c}" data-open="${d.c}">
      <button class="r-title" type="button" data-open="${d.c}"><span class="sch">${esc(sch(d))}</span><span class="dn">${esc(d.n)}</span></button>
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
      if (group && t !== prev) { h += `<li class="ghead" aria-hidden="true">${pillHTML(t)}<span><b>${counts[t]}</b> 個 · ${esc(TIER_SHORT[t])}</span></li>`; prev = t; }
      h += rowHTML(d);
    }
    if (!h) {
      const hiddenTiers = has && base.length > 0;
      h = `<li class="empty"><b>沒有符合的校系</b><span>${hiddenTiers ? '目前的落點標籤都被隱藏了，或篩選太嚴。' : '試著放寬篩選或換個關鍵字。'}</span><button class="btn sm" type="button" data-act="${hiddenTiers ? 'showTiers' : 'resetAll'}">${hiddenTiers ? '顯示所有落點' : '清除所有篩選'}</button></li>`;
    }
    $('#list').innerHTML = h;
    const sortName = $('#sort').selectedOptions[0] ? $('#sort').selectedOptions[0].textContent : '';
    const hidden = has ? TIERS.filter(t => !st.f.tiers.includes(t)) : [];
    const nUntaken = has && !st.f.untaken ? baseFiltered('untaken').filter(d => usesUntaken(d) && st.f.tiers.includes(tierOf(d))).length : 0;
    const untakenNote = nUntaken ? `<button class="textbtn" type="button" data-act="showUntaken">＋${fmtN(nUntaken)} 個用到沒考科目</button>` : '';
    $('#listbar').innerHTML = `<span>顯示 <b class="num">${fmtN(s.length)}</b> 個${hidden.length ? `（隱藏了${hidden.join('、')}）` : ''}${untakenNote ? ' ' + untakenNote : ''}</span><span>${esc(sortName)}</span>`;
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
    const th = L.checkThreshold(d, st.scores, STD());
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
    return stepHTML(cls, has ? icon(th.ok ? 'check' : 'x') : '檢', `檢定<small>用${stdName()}換算</small>`, `<div class="reqs">${rows.join('')}</div>${risk}`);
  }
  /** How many people a stage lets through in 115 and 116 (倍率 × 名額), what that does to the cut, and where you land. */
  function flowNote(s, has) {
    if (s.scale == null) return `倍率 115 ×${s.ref.m} → 116 ×${s.m}，用同系別組資料，人數不能直接比`;
    const mm = s.ref.m !== s.m;
    const what = `115 ${mm ? `× ${s.ref.m}、` : ''}名額 ${s.q115}，約 ${s.n115} 人過這一關；116 ${mm ? `× ${s.m}、` : ''}名額 ${s.q116}，約 ${s.n116} 人`;
    if (!s.scaled) return `${what}：人數差不多，115 的門檻可以直接比`;
    const fewer = s.scale < 1;
    let t = `${what}：${fewer ? '收的人變少，門檻很可能比 115 高' : '收的人變多，門檻可能比 115 低'}`;
    if (has && s.adj != null && (fewer ? s.diff >= 0 : s.diff < 0)) t += `。照 115 級分人數換算，你${s.adj <= 1 ? (fewer ? '還在收的人數內' : '有機會在收的人數內') : '可能不夠'}`;
    return t;
  }
  function stageSteps(d, e) {
    const r = d.r115;
    const has = hasScores();
    const cmp = e && e.cmp && e.cmp.stages ? e.cmp : L.compare116(d, st.scores, D.pct);
    // 116 order: 學測 stages and 術科 stages (no 術科 scores here) by multiple, highest first.
    const steps = cmp.stages.map(s => ({ m: s.m, s }));
    const byM = new Map();
    (d.arts ? d.arts.items.filter(i => i.m != null) : []).forEach(i => { const m = typeof i.m === 'number' ? i.m : -1; if (!byM.has(m)) byM.set(m, []); byM.get(m).push(i.i); });
    for (const [m, names] of byM) steps.push({ m, arts: names });
    steps.sort((a, b) => b.m - a.m);
    return steps.map((x, i) => {
      const no = i + 1, lastStep = i === steps.length - 1;
      if (x.arts) return stepHTML('', no, `${lastStep ? '最後一關' : `第 ${no} 關`}<small>${esc(x.arts.join('+'))}${x.m >= 0 ? ` × ${x.m}` : ''}</small>`, '<p class="step-d">術科篩選：看術科成績，這個工具沒有術科資料。</p>');
      const s = x.s;
      const unit = s.apcs ? ' 級' : '';
      const title = `${s.last ? '最後一關' : `第 ${no} 關`}<small>${esc(partsLabel(s.parts))} × ${s.m}</small>`;
      const notes = [];
      let cls = '', you = '';
      if (has && s.mine == null) { cls = 'bad'; you = `<span class="you">你沒考${esc((s.missing || []).map(subj).join('、'))}</span><span class="delta down">沒過</span>`; }
      if (s.ref) {
        if (has && s.mine != null) {
          const moved = s.res === 'short' || s.res === 'maybe';
          cls = s.res === 'pass' ? 'ok' : s.res === 'fail' ? 'bad' : s.res === 'edge' || moved ? 'eq' : '';
          you = `<span class="you">你 ${s.mine}${unit}</span>${moved ? `<span class="delta eq">${s.diff > 0 ? '+' : ''}${s.diff}</span>` : deltaHTML(s.diff, s.last)}`;
        }
        if (s.kind === 'mult' || s.scaled) notes.push(flowNote(s, has));
        else if (!s.apcs) notes.push(s.last ? `剛好 ${s.v} 要比同級分超額篩選，${s.v + 1} 以上直接過` : `${s.v} 以上進下一關，同分的人一起過`);
        if (has && s.topCut != null) notes.push(`你在 115 考生${fmtTop(s.topMine)}，門檻是${fmtTop(s.topCut)}`);
        else if (!s.apcs) { const p = L.topPercent(D.pct, s.parts, s.v); if (p != null) notes.push(`門檻是 115 考生${fmtTop(p)}`); }
        return stepHTML(cls, no, title, `<div class="reqs"><div class="req"><span class="what">115 最低 ${s.v}${unit}</span>${you}</div></div><p class="step-d">${esc(notes.join('。'))}</p>`);
      }
      // No 115 cut for these subjects: say why, and show where you stand among 115 考生 on them.
      const what = s.open ? '115 這一關沒有篩掉人' : !r ? '沒有 115 資料' : '115 沒有同樣科目的門檻';
      const ppl = o => (o.n115 != null ? `；115 約 ${o.n115} 人，116 約 ${o.n116} 人` : '');
      if (s.kind === 'open') notes.push(`115 也用${partsLabel(s.parts)}篩選（× ${s.open.m}），報名的人沒有超過收的人數${ppl(s.open)}`);
      else if (s.open) notes.push(`115 用${partsLabel(s.parts)} × ${s.open.m} 沒有篩掉人，但${s.open.n115 != null ? ` 116 收的人變少（115 名額 ${r.q}，約 ${s.open.n115} 人；116 × ${s.m}、名額 ${d.q}，約 ${s.open.n116} 人）` : '那是同系別組的資料，人數沒辦法比'}，看不出 116 會不會篩人`);
      else if (r) notes.push(`115 沒有用${partsLabel(s.parts)}${s.parts.length > 1 ? '的總和' : ''}篩選，${r.cut.length ? '115 的門檻不能拿來比' : '看不出 116 會不會篩人'}`);
      if (has && s.mine != null) {
        if (s.kind === 'open') cls = 'ok';
        you = `<span class="you">你 ${s.mine}${unit}</span>`;
        if (s.topMine != null) notes.push(`你的${partsLabel(s.parts)}在 115 考生${fmtTop(s.topMine)}`);
      }
      return stepHTML(cls, no, title, `<div class="reqs"><div class="req"><span class="what">${what}</span>${you}</div></div><p class="step-d">${esc(notes.join('。'))}</p>`);
    }).join('');
  }
  function stage1HTML(d, e) {
    const r = d.r115;
    const plan = L.screenPlan(d);
    const cmp = e && e.cmp && e.cmp.stages ? e.cmp : L.compare116(d, st.scores, D.pct);
    let h = '<section class="d-sec"><h3>第一階段：一階篩選<small>檢定 → 倍率篩選 → 同級分超額篩選</small></h3>';
    const arts = d.arts ? d.arts.items.filter(i => i.i && i.i !== '--').map(i => `<span class="tagc">${esc(i.i)}${i.t ? ' 檢定' + esc(i.t) : ''}${i.m != null ? ' 倍率' + esc(i.m) : ''}</span>`).join('') : '';
    h += `<div class="plan116"><span>116 倍率篩選</span>${plan.length ? plan.map((p, i) => `<span class="tagc">${i + 1}. ${esc(partsLabel(p.parts))} × ${p.m}</span>`).join('') : '<span class="tagc">不篩學測</span>'}${arts}</div>`;
    if (r && r.cut.length && cmp.stages.length) {
      // 116 is the rule; say exactly how it differs from 115 and what 115 was.
      const none = cmp.stages.filter(s => s.kind === 'none' && !s.open), mult = cmp.stages.filter(s => s.kind === 'mult');
      const fewer = cmp.stages.filter(s => s.kind === 'none' && s.open);
      const parts = [];
      if (none.length) parts.push(`${none.map(s => `${partsLabel(s.parts)} × ${s.m}`).join('、')} 是 115 沒有篩過的科目組合，沒有門檻可以比`);
      if (fewer.length) parts.push(`${fewer.map(s => `${partsLabel(s.parts)} × ${s.m}`).join('、')} 在 115 沒有篩掉人，但 116 收的人比較少，看不出會不會篩人`);
      if (mult.length) parts.push(mult.map(s => `${partsLabel(s.parts)} 的倍率從 × ${s.ref.m} 改成 × ${s.m}${s.scale == null ? '' : s.scaled ? `（約 ${s.n115} → ${s.n116} 人）` : '（名額也改了，人數差不多）'}`).join('、'));
      if (cmp.dropped.length) parts.push(`115 的${cmp.dropped.map(c => `${partsLabel(c.parts)} × ${c.m ?? '?'}`).join('、')} 這${cmp.dropped.length > 1 ? '幾' : '一'}關，116 拿掉了`);
      if (parts.length) {
        const was = cmp.cuts.map(c => (c.k ? `${partsLabel(c.parts)} × ${c.m ?? '?'}（最低 ${c.v}${c.apcs ? ' 級' : ''}）` : c.raw)).join(' → ');
        h += noteHTML('warn', `116 的一階篩選跟 115 不同：${esc(parts.join('；'))}。下面每一關只跟 115 用同樣科目篩選的門檻比。<br><span class="muted">115 是：${esc(was)}</span>`);
      }
    }
    if (r && r.via) h += noteHTML('warn', `這裡用的是${esc(r.via)}的 115 資料，不是同一個系組。`);
    if (!r) h += noteHTML('info', `沒有 115 資料：${esc(d.why || '116 新設或改名，115 沒有可對應的校系')}。${d.near ? `名稱相近的 115 校系：${esc(d.near.join('、'))}（沒有拿來算落點，請自己判斷）。` : ''}`);
    else if (!r.cut.length) {
      const m115 = Object.entries(r.mult || {}).filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => `${k === '組合' ? (r.combo ? partsLabel(r.combo) : '科目組合') : subj(k)} × ${v}`).join('、');
      h += noteHTML('info', `115 一階沒有篩掉人${m115 ? `（115 倍率：${esc(m115)}）` : ''}：通過檢定的人都進了二階。`);
    }
    h += `<ol class="steps" style="margin-top:16px">${thresholdStep(d, e)}${stageSteps(d, e)}${plan.length ? stepHTML('', '=', '同級分超額篩選<small>最後一關同分時，116 依序比</small>', `<p class="step-d">${orderList(d.tbS)}</p>`) : ''}</ol>`;
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
      <dt>甄試費</dt><dd>${d.fee ? fmtN(d.fee) + ' 元' : '—'}</dd><dt>總成績同分</dt><dd>${orderList(d.tbT)}</dd></dl>`;
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
      if (c('不符')) ck('bad', `${c('不符')} 個志願一定進不了一階`, '一定進不了一階，建議換掉。');
      else ck('ok', '沒有一定進不了的志願', '每個志願都通過檢定、也考了要篩選的科目。');
      if (!c('穩') && !c('適中')) ck('bad', '沒有「穩」或「適中」', '如果一階全部沒過，就只剩分科測驗。建議至少放 1–2 個穩的。');
      else if (!c('穩')) ck('warn', '沒有「穩」的志願', '很多學長姐會留 1 個保底，避免一階全落。');
      else ck('ok', `有 ${c('穩')} 個「穩」保底`, '');
      if (c('衝') + c('難') >= 4) ck('warn', `${c('衝') + c('難')} 個是「衝」或「難」`, '2 衝 2 適中 2 穩比較安全。');
      if (c('穩') >= 4) ck('warn', `${c('穩')} 個都是「穩」`, '可能浪費機會。考慮把 1–2 個換成更想讀、但要衝一下的系。');
      if (c('無資料')) ck('info', `${c('無資料')} 個沒有可以比的 115 門檻`, '沒有可比的 115 門檻，點進去看原因。');
    } else ck('info', '輸入成績才能檢查穩衝搭配', '在「找校系」輸入學測級分（或模考、目標分數）。');
    const cf = L.conflicts(P);
    if (cf.length) {
      const sure = cf.some(x => x.sure);
      // group by day: which 志願 share each 甄試 day (pairs read badly with 6 志願)
      const byDay = {};
      cf.forEach(x => x.days.forEach(dy => { (byDay[dy] = byDay[dy] || new Set()).add(x.a).add(x.b); }));
      const no = c => P.findIndex(d => d.c === c) + 1;
      const groups = [];
      for (const dy of Object.keys(byDay).sort()) {
        const set = [...byDay[dy]].sort((a, b) => no(a) - no(b)), key = set.join(',');
        const last = groups[groups.length - 1];
        if (last && last.key === key) last.days.push(dy); else groups.push({ key, days: [dy], set });
      }
      const day = g => (g.days.length > 1 ? L.fmtDay(g.days[0]) + '–' + L.fmtDay(g.days[g.days.length - 1]) : L.fmtDay(g.days[0]));
      ck(sure ? 'bad' : 'warn', sure ? '甄試撞期' : '甄試可能撞期', `<ul class="clash">${groups.map(g => `<li><b>${day(g)}</b><span>${g.set.map(c => `<span class="clash-n">${no(c)}</span>`).join('')}</span></li>`).join('')}</ul><p>數字是第幾志願。${sure ? '同一天只能去一個。' : '多天的系通常可以選時段。'}</p>`);
    } else ck('ok', '甄試日期沒有撞期', '');
    // 簡章 五(二)：大學得限制考生可申請該校之學系(組)數，違者取消報名該大學所有校系(組)之申請資格.
    // In 116 these limits are 「同一系的各組限擇一組報名」 written in the 校系分則 備註.
    const ONE_OF = /擇一(組|系)?(報名|申請)|限擇一組/;
    const baseName = n => n.replace(/[（(].*$/, '').replace(/^(.*?(學系|學位學程|學程|系))(.*)$/, '$1');
    const byDept = {};
    P.forEach(d => { const k = d.sid + '|' + baseName(d.n); (byDept[k] = byDept[k] || []).push(d); });
    const pick = Object.values(byDept).filter(a => a.length > 1 && a.some(d => ONE_OF.test((d.notes || '') + (d.rn || ''))));
    if (pick.length) ck('bad', '同一系的組「限擇一組報名」', '只能報其中一組，違反會被取消該校所有申請：' + pick.map(a => a.map(d => esc(sch(d) + d.n)).join('、')).join('；'));
    const fee2 = P.reduce((a, d) => a + (d.fee || 0), 0);
    ck('info', `費用約 ${fmtN(P.length * 100 + fee2)} 元`, `報名費 ${P.length * 100} 元（低收入戶免繳、中低收入戶每系 40 元），甄試費全部約 ${fmtN(fee2)} 元。`);
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
        rows += `<tr${n === P.length && P.length > 1 ? ' class="all"' : ''}><th scope="row" title="${esc(c + ' ' + REVIEW[c])}"><b class="cd">${c}</b>${esc(REVIEW[c])}</th>${cells(has)}<td class="cnt">${n}</td></tr>`;
      }
    }
    // 其他: each 系 defines its own R, S, T, so rows are the items themselves.
    const others = new Map();
    G.forEach((gs, i) => (gs.find(x => x.g === '其他') || { items: [] }).items.forEach(it => { if (!others.has(it.t)) others.set(it.t, new Set()); others.get(it.t).add(i); }));
    if (others.size) {
      rows += groupRow('其他');
      for (const [t, set] of others) rows += `<tr><th scope="row" title="${esc(t)}">${esc(t)}</th>${cells(P.map((_, i) => set.has(i)))}<td class="cnt">${set.size}</td></tr>`;
    }
    const used = new Set(G.flatMap(gs => gs.flatMap(x => x.codes)));
    const unused = Object.keys(REVIEW).filter(c => !used.has(c));
    const head = `<tr><th scope="col"><span class="sr">審查資料</span></th>${P.map((d, i) => `<th scope="col" title="${esc(sch(d) + ' ' + d.n)}"><span aria-hidden="true">${i + 1}</span><span class="sr">第 ${i + 1} 志願 ${esc(sch(d) + ' ' + d.n)}</span></th>`).join('')}<th scope="col" class="cnt">幾個要</th></tr>`;
    const notes = P.map((d, i) => (d.rn || d.iv ? `<details class="fold"><summary>${icon('chevR', 'sm')}${i + 1}. ${esc(sch(d) + ' ' + d.n)}</summary>${d.rn ? `<div class="long"><b>審查資料說明</b>\n${esc(d.rn)}</div>` : ''}${d.iv ? `<div class="long"><b>甄試說明</b>\n${esc(d.iv)}</div>` : ''}</details>` : '')).join('');
    return `<section class="sec prep" id="prep"><h2>二階要準備什麼</h2><p class="sub">總成績怎麼算、要交哪些審查資料</p>
      <ul class="facts">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <h3 class="sec-h3">二階總成績怎麼組成</h3><ol class="cbars">${bars}</ol>
      <h3 class="sec-h3">審查資料：哪幾個志願要</h3>
      <div class="tablewrap"><table class="rmx"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
      ${unused.length ? `<p class="hint" style="margin-top:10px">你的志願都沒列出：${esc(unused.map(c => c + ' ' + REVIEW[c]).join('、'))}。</p>` : ''}
      <div style="margin-top:14px">${noteHTML('info', '審查「不是每項都要、不以量取勝」。各系必備項目和字數看下面說明。')}</div>
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
    const h = `<header class="page-h"><div><h1>我的志願</h1><p>最多 6 個，順序就是你的偏好。</p></div>
      <div class="page-actions">${P.length || favs.length ? `<button class="btn sm" type="button" data-act="copyPlan">${icon('copy', 'sm')}複製文字</button><button class="btn sm" type="button" data-act="csvPlan">${icon('download', 'sm')}下載 CSV</button><button class="btn sm" type="button" data-act="printPlan">${icon('print', 'sm')}列印</button>` : ''}</div></header>
      <div class="plan-grid">
        <section class="sec"><h2>六個志願</h2><p class="sub">已排 ${P.length}/6</p><ol class="slots" id="planList">${slots}</ol></section>
        <section class="sec"><h2>檢查</h2><p class="sub">落點搭配、撞期、同校規定和費用</p><div class="mix" aria-label="六個志願的落點">${mix}</div>
          ${checks.length ? `<ul class="checks">${checks.map(x => `<li class="check ${x.state}"><span class="ic">${icon(IC[x.state])}</span><div><b>${esc(x.title)}</b>${x.body ? (x.body.startsWith('<') ? x.body : `<p>${x.body}</p>`) : ''}</div></li>`).join('')}</ul>` : '<p class="hint" style="margin-top:14px">排入志願後，這裡會檢查穩衝搭配、甄試撞期和同校擇一報名。</p>'}
        </section>
      </div>
      <section class="sec"><h2>收藏</h2><p class="sub">${favs.length ? `${favs.length} 個 · 從這裡排進志願` : '在「找校系」按星號收藏想考慮的校系'}</p>${favs.length ? `<ol class="favs" id="favList">${favRows}</ol>` : `<div style="margin-top:14px"><button class="btn primary" type="button" data-tab="explore">${icon('search', 'sm')}去找校系</button></div>`}</section>
      ${prepHTML(P)}
      ${P.length ? `<section class="sec"><h2>二階行事曆</h2><p class="sub">審查資料截止、甄試、放榜和統一日期</p>${calendarHTML(P)}</section>` : ''}
      <section class="sec no-print"><h2>備份與換裝置</h2><p class="sub">資料只存在這台裝置，換裝置前先備份。</p>
        <div class="page-actions" style="margin-top:14px"><button class="btn sm" type="button" data-act="exportState">${icon('download', 'sm')}備份我的資料</button><label class="btn sm">${icon('upload', 'sm')}還原備份<input type="file" id="importState" accept="application/json,.json"></label></div></section>`;
    keepFocus($('#plan'), () => { $('#plan').innerHTML = h; });
  }
  function planText() {
    const P = planDepts(), s = st.scores;
    const lines = [`116 申請入學志願（${new Date().toLocaleDateString('zh-TW')}）`,
      `學測：${SCORE_KEYS.map(k => `${subj(k)}${L.val(s, k) ?? '沒考'}`).join(' ')} 英聽${s.聽 || '沒考'}（檢定用${stdName()}）`, ''];
    const row = (d, i) => {
      const e = EV.get(d.c);
      return `${i != null ? i + 1 + '. ' : '- '}${sch(d)} ${d.n}（${d.c}）【${e ? e.tier : '—'}】${e ? e.reasons.join('；') : ''}${e && e.warnings.length ? '；' + e.warnings.join('；') : ''}\n   ${requirementLine(d)}\n   二階：${partsLine(d, true)}；甄試 ${d.idays.length ? rocText(d.idate) : '不用到校'}；資料截止 ${rocDate(d.dd)}${d.rv ? `\n   審查資料：${d.rv}` : ''}`;
    };
    lines.push('【六個志願】');
    P.forEach((d, i) => lines.push(row(d, i)));
    const others = st.fav.filter(c => !st.plan.includes(c)).map(c => BY_CODE[c]).filter(Boolean);
    if (others.length) { lines.push('', '【其他收藏】'); others.forEach(d => lines.push(row(d))); }
    lines.push('', '說明：一階照 116 的篩選規則一關一關看，每一關只拿 115 同樣科目的最低級分推估（不是保證）；116 改用 115 沒篩過的科目時判「無資料」。116 五標 2027/2/25 公布。');
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
    const rows = [['志願', '校系代碼', '學校', '校系', '落點', '理由', '檢定', '116一階（115同科目最低）', '二階', '審查資料', '審查資料截止', '甄試日期', '放榜', '甄試費', '官方網址']];
    [...st.plan, ...st.fav.filter(c => !st.plan.includes(c))].forEach(c => {
      const d = BY_CODE[c];
      if (!d) return;
      const e = EV.get(c), i = st.plan.indexOf(c);
      const req = requirementParts(d);
      rows.push([i >= 0 ? i + 1 : '收藏', d.c, sch(d), d.n, e ? e.tier : '', e ? e.reasons.join('；') : '', req.th, req.one, partsLine(d, true), d.rv || '', rocDate(d.dd), d.idays.length ? rocText(d.idate) : '不用到校甄試', rocDate(d.rd), d.fee || '', d.url]);
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
  // ------------------------------------------------------------------ 模考趨勢
  const COMBO_N = {};
  for (const k of Object.values(COMBO_OF)) if (k) COMBO_N[k] = (COMBO_N[k] || 0) + 1;
  /** The combination (used by 5+ 系) you rank best on, with these scores. */
  function bestCombo(sc) {
    let best = null;
    for (const k of Object.keys(COMBO_N)) {
      if (COMBO_N[k] < 5) continue;
      const rk = L.comboRank(comboParts(k), sc, D.pct);
      if (rk && rk.top != null && (!best || rk.top < best.top)) best = { k, top: rk.top };
    }
    return best;
  }
  function mockRefHTML() {
    return `<details class="mockref" id="mockRef" ${ui.mockRefOpen ? 'open' : ''}><summary>${icon('chevR', 'sm')}翰林各次模考的時程、範圍和五標來源</summary>
      <div class="tablewrap"><table class="reftable"><thead><tr><th>次</th><th>日期</th>${['國文', '英文', '數學', '社會', '自然'].map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>
      ${MOCK_REF.filter(x => x.r).map(x => `<tr><th>${esc(x.n.replace('學測模擬考', ''))}</th><td>${esc(x.when)}</td>${['國文', '英文', '數學', '社會', '自然'].map(k => `<td>${esc(x.r[k] || '—')}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="hint">整理自各校 115 學年度模考公告，日期以學校為準。英聽只有第二次考。學測：2027/1/22–1/24。</p><p class="hint">內建五標來自公開整理的翰林成績表（7月全國 E1、9月北北基 E2、10月北北基 E3），跟成績單不同以成績單為準。中區、南一是不同考試。</p></details>`;
  }
  const mockLinkHTML = () => `<section class="sec mocklink"><h2>模考趨勢</h2><p class="sub">${st.mocks.length ? `已存 ${st.mocks.length} 次模考。` : ''}趨勢和每次的落點在「模考」分頁。</p><button class="btn sm" type="button" data-tab="mock">${icon('mock', 'sm')}${st.mocks.length ? '看模考趨勢' : '新增模考'}</button></section>`;
  /** One small chart per subject on a shared 級分 scale, plus 落點 per 模考 and a table. */
  /** A 模考's scores read as 學測 級分: each subject with that 模考's 五標 is converted by rank (L.mockToTest). */
  function mockAsTest(m) {
    const S = { ...m.s }, eq = {};
    for (const k of SCORE_KEYS) {
      const e = L.mockToTest(m.std, k, L.val(m.s, k), D.pct);
      if (e) { eq[k] = e; S[k] = String(e.g); }
    }
    return { S, eq };
  }
  /** Tier counts in a scope for a set of scores (current 檢定 五標). */
  function tierCounts(S, scope) {
    const o = opts(), c = {}, tiers = new Map();
    for (const d of scope) { const t = L.evaluate(d, S, o).tier; c[t] = (c[t] || 0) + 1; tiers.set(d.c, t); }
    return { c, tiers, good: (c.穩 || 0) + (c.適中 || 0) };
  }
  /** For each subject: how many 系 in the scope get a better 落點 with 1 more 級分. */
  function gainsFor(S, scope, base) {
    const o = opts(), out = {};
    for (const k of SCORE_KEYS) {
      const v = L.val(S, k);
      if (v == null || v >= 15) continue;
      const S2 = { ...S, [k]: String(v + 1) };
      let up = 0;
      for (const d of scope) { const t0 = base.tiers.get(d.c), t1 = L.evaluate(d, S2, o).tier; if (TIERS.indexOf(t1) < TIERS.indexOf(t0) && t1 !== '無資料') up++; }
      out[k] = up;
    }
    return out;
  }
  /** Tiny trend line for a list of numbers (null = not taken), on the 0–15 scale. */
  function miniSpark(vals, label) {
    const pts = vals.map((v, i) => [i, v]).filter(p => p[1] != null);
    if (pts.length < 2) return '';
    const W = 64, H = 22, X = i => 3 + (i * (W - 6)) / Math.max(1, vals.length - 1), Y = v => H - 3 - ((v - 0) * (H - 6)) / 15;
    const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
    const y = v => (hi === lo ? H / 2 : 3 + ((hi - v) * (H - 6)) / (hi - lo));
    const path = pts.map((p, j) => `${j ? 'L' : 'M'}${X(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    const last = pts[pts.length - 1];
    return `<svg class="msp" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><path d="${path}"/><circle cx="${X(last[0]).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="2.6"/></svg>`;
  }
  const deltaChip = d => (d == null ? '' : `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}">${d > 0 ? '+' + d : d === 0 ? '持平' : d}</span>`);

  /** 模考分析: the latest 模考 read as 學測 級分, how each subject moved, 落點 per 模考, table. */
  function trendHTML(scope) {
    const ms = mocksByDate();
    if (!ms.length) return `<section class="sec" id="trendSec"><h2>模考分析</h2><p class="sub">每次模考存一筆，這裡會畫出每一科的變化和每一次的落點。</p><button class="btn sm" type="button" data-act="goMocks">${icon('plus', 'sm')}存第一次模考</button></section>`;
    const subs = SCORE_KEYS.filter(k => ms.some(m => L.val(m.s, k) != null));
    const lvOf = (m, k, v) => (m.std && m.std[k] && v != null ? levelIn(m.std, k, v) : '');
    const conv = new Map(ms.map(m => [m.id, mockAsTest(m)]));
    // a subject is shown on the 學測 scale when every 模考 that has it also has its 五標
    const onTest = k => ms.every(m => L.val(m.s, k) == null || conv.get(m.id).eq[k]);
    const valOf = (m, k) => { const v = L.val(m.s, k); if (v == null) return null; const e = conv.get(m.id).eq[k]; return onTest(k) && e ? e.g : v; };
    const tierRows = ms.map(m => ({ m, ...tierCounts(conv.get(m.id).S, scope) }));
    const std = STD();

    // ---- latest 模考, subject by subject
    const lm = ms[ms.length - 1], lc = conv.get(lm.id), lt = tierRows[tierRows.length - 1];
    const gains = gainsFor(lc.S, scope, lt);
    const lp = mockPreset(lm);
    const cells = SCORE_KEYS.filter(k => L.val(lm.s, k) != null).map(k => {
      const v = L.val(lm.s, k), lv = lvOf(lm, k, v), e = lc.eq[k];
      let next;
      if (lv) { const i = L.LEVELS.indexOf(lv), up = i === -1 ? '底標' : i > 0 ? L.LEVELS[i - 1] : null; next = up ? `再 ${lm.std[k][up] - v} 級分到這次的${up}` : '已到這次的頂標'; }
      else next = lp && lp.std && !lp.std[k] ? '翰林沒公開這科五標：按「修改」補上' : '沒有這次的五標';
      const hist = ms.map(m => valOf(m, k));
      const g = gains[k];
      return `<div class="lt"><div class="lt-h"><span class="k">${subj(k)}</span>${miniSpark(hist, subj(k) + '：' + hist.filter(x => x != null).join('、'))}</div>
        <span class="v"><b class="num">${v}</b>${lv ? `<span class="lvt">${lv}</span>` : ''}</span>
        ${e ? `<span class="eqv">學測約 <b class="num">${e.g}</b><small>前 ${Math.round(e.top)}%</small></span>` : ''}
        <small>${esc(next)}</small>${g ? `<small class="gain">多 1 級分：<b>${g}</b> 個校系變好</small>` : ''}</div>`;
    }).join('');
    const lb = bestCombo(lc.S);
    const anyEq = Object.keys(lc.eq).length > 0;
    const latest = `<div class="latest"><h3 class="sec-h3">最近一次：${esc(mName(lm))}<small>${mdText(lm.d)}</small></h3>
      ${anyEq ? '<p class="sub">學測約＝照模考排名換算的學測級分（估計）</p>' : ''}
      <div class="lt-grid">${cells}</div>
      <p class="sub">穩＋適中 <b>${lt.good}</b> 個${lb ? ` · 最強組合 <b>${esc(comboName(lb.k))}</b>（${fmtTop(lb.top)}）` : ''}</p>
      <div class="lt-act"><button class="btn sm primary" type="button" data-mockuse="${lm.id}">看換算後的落點</button><button class="btn sm" type="button" data-mocktry="${lm.id}">${icon('boost', 'sm')}拿去試算</button></div></div>`;

    // ---- what changed
    const notes = [];
    if (ms.length > 1) {
      const ch = subs.map(k => { const vs = ms.map(m => valOf(m, k)).filter(v => v != null); return { k, d: vs.length > 1 ? vs[vs.length - 1] - vs[0] : 0, n: vs.length }; }).filter(x => x.n > 1);
      const up = ch.filter(x => x.d > 0).sort((a, b) => b.d - a.d), dn = ch.filter(x => x.d < 0).sort((a, b) => a.d - b.d);
      if (up.length) notes.push(`進步：${up.map(x => `${subj(x.k)} +${x.d}`).join('、')}`);
      if (dn.length) notes.push(`退步：${dn.map(x => `${subj(x.k)} ${x.d}`).join('、')}${dn[0].d <= -2 ? `，${subj(dn[0].k)}要多注意` : ''}`);
      // raw 級分 and standing can move apart: a harder or easier 模考
      const rank = l => (L.LEVELS.includes(l) ? L.LEVELS.indexOf(l) : 9);
      for (const k of subs) {
        const both = ms.filter(m => lvOf(m, k, L.val(m.s, k)));
        if (both.length < 2) continue;
        const a = both[0], b = both[both.length - 1], va = L.val(a.s, k), vb = L.val(b.s, k), la = lvOf(a, k, va), lb2 = lvOf(b, k, vb);
        if (la === lb2) continue;
        const better = rank(lb2) < rank(la), dv = vb - va;
        if ((better && dv < 0) || (!better && dv > 0)) notes.push(`${subj(k)}：${mName(a)} ${va} 級分（${la}）→ ${mName(b)} ${vb} 級分（${lb2}），${better ? '級分少了但排名更前面：這次比較難' : '級分多了但排名往後：這次比較簡單，別被分數騙了'}`);
      }
      const a = tierRows[tierRows.length - 2], b = tierRows[tierRows.length - 1];
      notes.push(`穩＋適中 ${a.good} → ${b.good}（${b.good - a.good >= 0 ? '+' : ''}${b.good - a.good}）`);
    }

    // ---- one chart per subject, on the 學測 scale when possible
    const all = ms.flatMap(m => subs.map(k => valOf(m, k)).filter(v => v != null));
    const lo = Math.max(0, Math.min(...all) - 2), hi = 15;
    const W = 240, H = 104, PL = 6, PR = 38, PT = 16, PB = 8;
    const X = i => (ms.length === 1 ? (PL + W - PR) / 2 : PL + (i * (W - PL - PR)) / (ms.length - 1));
    const Y = v => PT + ((hi - v) * (H - PT - PB)) / (hi - lo || 1);
    const panels = subs.map(k => {
      const test = onTest(k);
      const refStd = test ? std : (ms.slice().reverse().find(m => m.std && m.std[k]) || {}).std;
      const pts = ms.map((m, i) => ({ i, m, v: valOf(m, k), raw: L.val(m.s, k) })).filter(p => p.v != null);
      const last = pts[pts.length - 1], prev = pts[pts.length - 2], first = pts[0];
      const ref = refStd && refStd[k] ? [['前標', refStd[k].前標], ['均標', refStd[k].均標]].filter(([, v]) => v >= lo && v <= hi) : [];
      const refs = ref.map(([l, v], j) => `<line class="ref" x1="${PL}" x2="${W - PR}" y1="${Y(v)}" y2="${Y(v)}"/>${j && Math.abs(Y(v) - Y(ref[0][1])) < 11 ? '' : `<text class="reft" x="${W - PR + 4}" y="${Y(v) + 3.5}">${l} ${v}</text>`}`).join('');
      const path = pts.map((p, j) => `${j ? 'L' : 'M'}${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
      const tip = p => { const lv = lvOf(p.m, k, p.raw); return `${mName(p.m)}（${mdText(p.m.d)}）：${subj(k)} ${p.raw} 級分${lv ? `（這次的${lv}）` : ''}${test ? `，學測約 ${p.v} 級分` : ''}`; };
      const dots = pts.map(p => `<circle class="pt" cx="${X(p.i)}" cy="${Y(p.v)}" r="4"/>`).join('');
      const hits = pts.map(p => `<circle class="hit" cx="${X(p.i)}" cy="${Y(p.v)}" r="13" data-tip="${esc(tip(p))}" tabindex="0" aria-label="${esc(tip(p))}"/>`).join('');
      const lab = pts.length > 1 ? `<text class="vlab" x="${X(last.i) - 7}" y="${Y(last.v) - 7}" text-anchor="end">${last.v}</text>` : '';
      return `<figure class="spark"><figcaption><span class="sk">${subj(k)}</span><span class="sv num">${last.v}</span>${deltaChip(prev ? last.v - prev.v : null)}</figcaption>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${subj(k)}：` + pts.map(p => `${mName(p.m)} ${p.v}`).join('、'))}"><line class="base" x1="${PL}" x2="${W - PR}" y1="${H - PB}" y2="${H - PB}"/>${refs}<path class="ln" d="${path}"/>${dots}${lab}${hits}</svg>
        <span class="sx">${test ? '學測級分' : '模考級分'} · ${mdText(first.m.d)}${pts.length > 1 ? ` → ${mdText(last.m.d)}` : ''}</span></figure>`;
    }).join('');
    const allTest = subs.every(onTest);

    // ---- 落點 per 模考 and the table
    const bars = tierRows.map(x => `<div class="mt-row"><span class="mt-l"><b>${esc(mName(x.m))}</b><small>${mdText(x.m.d)}</small></span>${tierBarHTML(x.c, scope.length, { small: true, label: mName(x.m) })}<span class="mt-n num">穩＋適中 <b>${x.good}</b></span></div>`).join('');
    const table = `<div class="tablewrap"><table class="reftable"><thead><tr><th>模考</th>${subs.map(k => `<th>${ABBR[k]}</th>`).join('')}<th>英聽</th><th>最強組合</th></tr></thead><tbody>
      ${ms.map(m => { const c = conv.get(m.id), b = bestCombo(c.S); return `<tr><th>${esc(mName(m))}<small>${mdText(m.d)}</small></th>${subs.map(k => { const v = L.val(m.s, k), lv = lvOf(m, k, v), e = c.eq[k]; return `<td class="num">${v ?? '—'}${lv ? `<small class="lv">${lv}</small>` : ''}${e ? `<small class="lv eq">學測≈${e.g}</small>` : ''}</td>`; }).join('')}<td>${m.s.聽 || '—'}</td><td>${b ? `${esc(comboName(b.k))} ${fmtTop(b.top)}` : '—'}</td></tr>`; }).join('')}
      </tbody></table></div>`;
    return `<section class="sec" id="trendSec"><h2>模考分析</h2>${latest}
      ${notes.length ? `<h3 class="sec-h3">跟之前比</h3><ul class="trendnotes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <h3 class="sec-h3">每一科的變化</h3><p class="sub">${allTest ? '換算成學測級分，虛線是學測前標、均標。' : '有五標的科目換算成學測級分，沒有的畫原始級分。'}點圓點看原始級分。</p>
      <div class="sparks">${panels}</div>
      <h3 class="sec-h3">每次模考的落點</h3><p class="sub">用換算後的級分，範圍是找校系目前的 ${fmtN(scope.length)} 個校系。</p>
      <div class="mtiers">${bars}</div>
      <h3 class="sec-h3">成績表</h3><p class="sub">大字原始級分，小字是標和換算的學測級分。</p>${table}
      </section>`;
  }
  /** Each subject across the saved 模考, as 學測 級分 where the 模考 has 五標 (raw otherwise). */
  function mockSeries() {
    const ms = mocksByDate();
    const conv = ms.map(m => mockAsTest(m));
    const out = {};
    for (const k of SCORE_KEYS) {
      const vals = ms.map((m, i) => { const v = L.val(m.s, k); if (v == null) return null; const e = conv[i].eq[k]; return e ? e.g : v; });
      const have = vals.filter(v => v != null);
      if (!have.length) continue;
      out[k] = { vals, last: have[have.length - 1], first: have[0], n: have.length, eq: ms.every((m, i) => L.val(m.s, k) == null || conv[i].eq[k]) };
    }
    return { ms, out };
  }
  const trendWord = x => (!x || x.n < 2 ? '' : x.last > x.first ? `模考 ${x.first} → ${x.last}，在進步` : x.last < x.first ? `模考 ${x.first} → ${x.last}，要注意` : `模考持平在 ${x.last}`);
  /** 各科一覽: what you entered, how the 模考 went (on the 學測 scale), and what 1–2 more 級分 would do. */
  function boardHTML(rows, series) {
    const max1 = Math.max(1, ...rows.map(r => (r.cells[0] ? r.cells[0].up : 0)));
    const best = rows.reduce((a, r) => (r.cells[0] && (!a || r.cells[0].up > a.cells[0].up) ? r : a), null);
    const heat = (c, mx) => (c ? `<span class="bd-n" style="--h:${(c.up / mx).toFixed(3)}"><b>${c.up}</b>${c.unlock ? `<small>解鎖 ${c.unlock}</small>` : ''}</span>` : '<span class="bd-n none">—</span>');
    const body = rows.filter(r => r.cur || series.out[r.k]).map(r => {
      const x = series.out[r.k], lv = r.cur ? levelOf(r.k, r.cur) : '';
      const gap = x && r.cur ? x.last - r.cur : null;
      const mock = x ? `${miniSpark(x.vals, subj(r.k) + ' 模考：' + x.vals.filter(v => v != null).join('、'))}<span class="bd-m"><b class="num">${x.last}</b>${gap ? `<small class="${gap > 0 ? 'up' : 'down'}" title="比現在填的${gap > 0 ? '高' : '低'} ${Math.abs(gap)} 級分">${gap > 0 ? '+' + gap : gap}</small>` : ''}</span>` : '<span class="muted">—</span>';
      return `<div class="bd-row${best === r && best.cells[0].up ? ' top' : ''}" role="row"><span class="bd-k" role="rowheader">${subj(r.k)}</span><span class="bd-c" role="cell"><b class="num">${r.cur || '—'}</b>${lv && lv !== '未達底標' ? `<small>${lv}</small>` : !r.cur ? '<small>沒考</small>' : ''}</span><span class="bd-c bd-mock" role="cell">${mock}</span><span role="cell">${heat(r.cells[0], max1)}</span><span role="cell">${heat(r.cells[1], max1)}</span></div>`;
    }).join('');
    const hasMock = Object.keys(series.out).length > 0;
    return `<section class="sec"><h2>各科一覽</h2><p class="sub">數字是多考 1、2 級分會變好的校系數。</p>
      <div class="board" role="table" aria-label="各科一覽"><div class="bd-row bd-h" role="row"><span role="columnheader">科目</span><span role="columnheader">現在</span><span role="columnheader">${hasMock ? '模考換算' : '模考'}</span><span role="columnheader">多 1 級分</span><span role="columnheader">多 2 級分</span></div>${body}</div>
      ${hasMock ? `<p class="hint">模考換算＝照排名換算的學測級分。<button class="textbtn" type="button" data-tab="mock">${icon('mock', 'sm')}看模考分析</button></p>` : `<button class="btn sm" type="button" data-tab="mock">${icon('mock', 'sm')}新增模考</button>`}</section>`;
  }
  function renderBoost() {
    const el = $('#boost');
    const head = `<header class="page-h"><div><h1>怎麼進步</h1><p>哪一科多考幾級分最划算。</p></div></header>`;
    if (!hasScores()) {
      el.innerHTML = head + `<div class="cta">${icon('target')}<div><b>先輸入學測級分</b>（模考或目標分數也可以）。</div><button class="btn primary" type="button" data-act="goScores">輸入成績</button>${st.mocks.length ? `<button class="btn" type="button" data-mockuse="${mocksByDate().pop().id}">用最近一次模考（換算成學測級分）</button>` : ''}</div>` + mockLinkHTML();
      return;
    }
    const scope = baseFiltered();
    const sl = scopeLabel();
    el.innerHTML = head + '<div class="sec"><p class="hint">計算中…</p></div>';
    clearTimeout(renderBoost.t);
    renderBoost.t = setTimeout(() => {
      if (ui.tab !== 'boost') return;
      const { rows, blockers } = boostData(scope);
      const series = mockSeries();
      const all = rows.flatMap(r => r.cells.filter(Boolean).map(c => ({ ...c, k: r.k, cur: r.cur })));
      const maxUp = Math.max(1, ...all.map(c => c.up));
      // "6 級分" is above 均標 5, not equal to it: say "達到" unless it is exactly the line.
      const lvSentence = (k, v, lv) => {
        if (!lv || lv === '未達底標') return '';
        const line = STD() && STD()[k] ? STD()[k][lv] : null;
        return `${v} 級分達${lv}。`;
      };
      const bestOf = r => r.cells.filter(Boolean).reduce((a, c) => (c.up > (a ? a.up : 0) ? c : a), null);
      const ranked = rows.map(r => ({ r, b: bestOf(r) })).filter(x => x.b && x.b.up > 0).sort((a, b) => b.b.up - a.b.up || (a.b.to - a.r.cur) - (b.b.to - b.r.cur));
      let hero;
      if (ranked.length) {
        const { r, b } = ranked[0];
        const lv = levelOf(r.k, b.to);
        hero = `<section class="hero"><span class="eyebrow">最值得補強</span><h2>${subj(r.k)} 從 ${r.cur || '沒考'} 考到 ${b.to} 級分</h2>
          <p><b>${b.up}</b> 個校系落點變好${b.unlock ? `（${b.unlock} 個解鎖）` : ''}。${lvSentence(r.k, b.to, lv)}${trendWord(series.out[r.k]) ? `${esc(trendWord(series.out[r.k]))}。` : ''}</p>
          ${ranked.length > 1 ? `<div class="alts">${ranked.slice(1, 4).map(x => `<span>${subj(x.r.k)} ${x.r.cur || '沒考'} → ${x.b.to}：${x.b.up} 個</span>`).join('')}</div>` : ''}</section>`;
      } else hero = `<section class="hero"><span class="eyebrow">最值得補強</span><h2>這個範圍裡，每科多考 1–5 級分都不會改變落點</h2><p>可以換個學群或放寬篩選再看看。</p></section>`;
      const grid = `<div class="heat" role="table" aria-label="每科多考幾級分，落點變好的校系數"><div role="row" style="display:contents"><span class="hh" role="columnheader">科目</span>${[1, 2, 3, 4, 5].map(i => `<span class="hh" role="columnheader">+${i}</span>`).join('')}</div>
        ${rows.filter(r => r.cur || r.cells.some(c => c && c.up)).map(r => `<div role="row" style="display:contents"><span class="hs" role="rowheader">${subj(r.k)}<small>${r.cur ? '現在 ' + r.cur : '沒考'}</small></span>${r.cells.map(c => c ? `<span class="hc" role="cell" style="--h:${(c.up / maxUp).toFixed(3)}" title="${subj(r.k)} 考到 ${c.to} 級分：${c.up} 個校系落點變好${c.unlock ? `，${c.unlock} 個從不符變成可以報` : ''}"><span class="to">考到 ${c.to}</span><span class="n">${c.up}</span>${c.unlock ? `<span class="u">解鎖 ${c.unlock}</span>` : ''}</span>` : '<span class="hc na" role="cell">—</span>').join('')}</div>`).join('')}</div>`;
      const maxB = Math.max(1, ...blockers.map(b => b[1]));
      const blockHTML = blockers.length ? `<div class="hbars">${blockers.map(([k, n]) => `<div class="hb"><span class="l">${esc(k)}</span><span class="t" style="width:${(n / maxB) * 100}%"></span><span class="n">${n} 個系</span></div>`).join('')}</div><p class="hint" style="margin-top:14px">用${stdName()}算。</p>` : '<p class="hint" style="margin-top:12px">沒有被檢定擋住的校系。</p>';
      if (!ui.tryS) ui.tryS = { ...st.scores };
      const tryGrid = SCORE_KEYS.map(k => sliderHTML('try', k, subj(k), L.val(ui.tryS, k) || 0, 15)).join('');
      el.innerHTML = head + hero + boardHTML(rows, series) +
        `<section class="sec"><h2>每科多考幾級分，會多出多少機會？</h2><p class="sub">落點變好的校系數，解鎖＝不符變可報</p>${grid}</section>
        <section class="sec"><h2>擋住你的檢定</h2><p class="sub">因此進不了一階的校系數</p>${blockHTML}</section>
        <section class="sec" id="trySec"><h2>試算</h2>${ui.tryFrom ? `<p class="note-inline">${icon('mock', 'sm')}已帶入「${esc(ui.tryFrom)}」換算的學測級分</p>` : ''}<p class="sub">暫時改成績看結果，不會改掉你存的成績。</p><div class="try-act">${st.mocks.length ? `<button class="btn sm" type="button" data-mocktry="${mocksByDate().pop().id}">${icon('mock', 'sm')}帶入最近一次模考</button>` : ''}<button class="btn sm" type="button" data-act="tryReset">${icon('reset', 'sm')}改回我的成績</button></div><div class="try-grid">${tryGrid}</div><div id="tryOut"></div></section>`;
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
    ['準備期', '2026-11-03', '簡章與校系分則公告'],
    ['準備期', '2026-12-12', '英聽第二次考試'],
    ['學測與成績', '2027-01-22', '學測（1/22–1/24）'],
    ['學測與成績', '2027-02-25', '學測成績、116 五標公布'],
    ['選系與報名', '2027-03-18', '繁星第 1–7 類放榜'],
    ['選系與報名', '2027-03-22', '繳費（至 3/24 17:00）'],
    ['選系與報名', '2027-03-23', '報名（至 3/24）'],
    ['一階篩選', '2027-03-30', '一階結果（9:00）'],
    ['二階：審查與甄試', '2027-04-01', '學習歷程上傳（約至 4/21）'],
    ['二階：審查與甄試', '2027-04-09', '上傳系統測試版（至 4/14）'],
    ['二階：審查與甄試', '2027-04-29', '審查資料上傳（截止各校不同）'],
    ['二階：審查與甄試', '2027-05-08', '確認第 6 學期修課紀錄'],
    ['二階：審查與甄試', '2027-05-13', '二階甄試（至 5/30）'],
    ['二階：審查與甄試', '2027-05-31', '各校放榜截止'],
    ['放榜與分發', '2027-06-03', '登記就讀志願序（至 6/4）'],
    ['放榜與分發', '2027-06-10', '統一分發結果'],
    ['放榜與分發', '2027-06-13', '聲明放棄截止'],
    ['分科與分發入學', '2027-06-15', '分科測驗報名截止'],
    ['分科與分發入學', '2027-07-10', '分科測驗'],
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
    if (examDays > 0) hero = `<div class="big">${examDays}<small>天</small></div><div><h2>距離學測（2027/1/22–1/24）</h2><p>${nx && nx[1] !== exam[1] ? `下一個：${esc(nx[1].slice(5).replace('-', '/').replace(/^0/, ''))} ${esc(nx[2])}（${daysUntil(nx[1])} 天後）` : ''}</p></div>`;
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
    $('#guide').innerHTML = `<header class="page-h"><div><h1>時程與規則</h1><p>116 個人申請日程與規則（116 學生手冊、招生簡章）。</p></div></header>
      <section class="count-hero">${hero}</section>
      <section class="sec"><h2>116 個人申請時程</h2><ol class="tl">${tl}</ol></section>
      <section class="sec"><h2>一定要知道的規則</h2><ol class="rules">
        <li><div><b>最多 6 個校系，每系 100 元。</b>有些系限擇一組報名，違反會取消該校所有申請。</div></li>
        <li><div><b>一階：檢定 → 倍率篩選 → 超額篩選。</b>檢定沒過不能篩選。中間關卡同分一起過，最後一關同分才比超額篩選。</div></li>
        <li><div><b>每一關都要過。</b>只看第一關或總級分會判錯。</div></li>
        <li><div><b>數A、數B 都列檢定時，過一科就好。</b></div></li>
        <li><div><b>二階各系比例差很多。</b>${fmtN(D.depts.filter(d => !d.sp).length)} 個系完全不計學測，「找校系」可以依學測佔比篩選。</div></li>
        <li><div><b>小心甄試撞期。</b>同一天只能去一個。</div></li>
        <li><div><b>6/3–6/4 登記就讀志願序。</b>正備取都要登記，沒登記等於放棄，最後只分發 1 個。</div></li>
        <li><div><b>繁星第 1–7 類錄取，不能報申請。</b>放棄也一樣。第八類過一階的，不能報同校醫（牙）系。</div></li>
        <li><div><b>想改考分科，6/13 前聲明放棄。</b></div></li>
        <li><div><b>沒考的科目以 0 級分計。</b>用到的科目全沒考就不能篩選。</div></li>
      </ol></section>
      <section class="sec"><h2>這個工具怎麼判斷落點</h2><ul class="tdefs">${TIERS.map(t => `<li>${pillHTML(t)}<span>${esc(TIER_HELP[t])}</span></li>`).join('')}</ul>
        <div class="prose" style="margin-top:16px"><p>照 116 的科目、倍率和順序一關一關看，每關只跟 <b>115 同樣科目</b>的最低級分比。收的人數差超過 10% 就用 115 級分人數表換算。</p>
        <p class="hint">只是一階的估計，不是錄取機率。</p></div></section>
      <section class="sec"><h2>審查資料代碼</h2><p class="sub">課程學習成果最多 3 件、多元表現最多 10 件。</p><div class="codegrid">${Object.entries(REVIEW).map(([k, v]) => `<span class="code"><b>${k}</b>${v}</span>`).join('')}</div></section>
      <section class="sec"><h2>資料來源</h2><ul class="srcs">
        <li>116 校系分則：甄選會（${esc(D.fetched116)}）</li>
        <li>115 篩選標準一覽表：甄選會</li>
        <li>115 分發標準一覽表：甄選會</li>
        <li>五標與級分人數累計表：大考中心</li>
        <li>扶弱校系、學生手冊：甄選會、教育部</li>
              </ul><p class="hint" style="margin-top:10px">資料版本 ${esc(D.built)}</p></section>`;
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
    else if (ui.tab === 'mock') renderMock();
    else renderGuide();
    save();
  }
  function setTab(name, fromRoute) {
    if (!['explore', 'plan', 'boost', 'mock', 'guide'].includes(name)) name = 'explore';
    const changed = name !== ui.tab;
    ui.tab = name;
    ['explore', 'plan', 'boost', 'mock', 'guide'].forEach(v => { $('#view-' + v).hidden = v !== name; });
    if (!fromRoute && !/^#d=/.test(location.hash)) history.replaceState(null, '', tabHash(name));
    if (name === 'boost' && !ui.keepTry) { ui.tryS = null; ui.tryFrom = null; }
    ui.keepTry = false;
    render();
    if (changed) window.scrollTo(0, 0);
  }
  function route() {
    const m = /^#d=(\d{6})$/.exec(location.hash);
    if (m && BY_CODE[m[1]]) { if (!$('#detail').open || detailCode !== m[1]) openDetail(m[1], true); return; }
    if ($('#detail').open) { detailPushed = false; $('#detail').close(); }
    const t = { '#plan': 'plan', '#boost': 'boost', '#mock': 'mock', '#guide': 'guide' }[location.hash] || 'explore';
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
    showUntaken: () => { st.f.untaken = true; render(); },
    saveMock: () => saveMock(),
    goMocks: () => setTab('mock'),
    mfNew: () => { ui.mf = newMockDraft(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    mfCancel: () => { ui.mf = null; render(); },
    mfSave: () => saveMockForm(),
    mfStdToggle: () => { ui.mf.stdOpen = !ui.mf.stdOpen; render(); },
    mfStdPreset: () => { const x = presetOf(ui.mf.n) || (ui.mf.pre && presetOf(ui.mf.pre)); if (x && x.std) { ui.mf.std = copyStd(x.std); render(); toast('已改回翰林公布的五標'); } },
    mfFromScores: () => { SCORE_KEYS.forEach(k => { const v = L.val(st.scores, k); if (v != null) ui.mf.s[k] = v; else delete ui.mf.s[k]; }); ui.mf.聽 = st.scores.聽 || ''; render(); },
    hideUntaken: () => { st.f.untaken = false; ui.shown = PAGE; render(); },
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
    tryReset: () => { ui.tryS = { ...st.scores }; ui.tryFrom = null; const n = $('#trySec .note-inline'); if (n) n.remove(); $$('#trySec .track').forEach(t => paintSlider(t, L.val(ui.tryS, t.dataset.try) || 0)); renderTry(); },
  };
  /** Chart tooltips: any element with data-tip, on hover, keyboard focus or tap. */
  function bindTips() {
    const tip = document.createElement('div');
    tip.className = 'charttip'; tip.setAttribute('role', 'status'); tip.hidden = true;
    document.body.appendChild(tip);
    let cur = null;
    const show = el => {
      cur = el; tip.textContent = el.dataset.tip; tip.hidden = false;
      const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      const x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
      const y = r.top - h - 6 < 8 ? r.bottom + 6 : r.top - h - 6;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    };
    const hide = () => { cur = null; tip.hidden = true; };
    document.addEventListener('pointerover', ev => { const el = ev.target.closest && ev.target.closest('[data-tip]'); if (el) show(el); else if (cur && ev.pointerType === 'mouse') hide(); });
    document.addEventListener('focusin', ev => { const el = ev.target.closest && ev.target.closest('[data-tip]'); if (el) show(el); else if (cur) hide(); });
    document.addEventListener('pointerdown', ev => { const el = ev.target.closest && ev.target.closest('[data-tip]'); if (el) show(el); else if (cur) hide(); });
    window.addEventListener('scroll', hide, { passive: true });
  }
  function bind() {
    bindTips();
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
      if (ds.skip) { toggle(f.skip, ds.skip); ui.shown = PAGE; render(); return; }
      if (ds.mockuse) { useMock(ds.mockuse); return; }
      if (ds.mockdel) {
        const m = st.mocks.find(x => x.id === ds.mockdel);
        if (m && confirm(`刪除「${mName(m)}」（${mdText(m.d)}）？`)) { st.mocks = st.mocks.filter(x => x !== m); if (ui.mf && ui.mf.id === m.id) ui.mf = null; render(); toast('已刪除'); }
        return;
      }
      if (ds.stdcopy) {
        const [target, y] = ds.stdcopy.split(':'), tab = stdTable(target);
        if (tab) for (const k of SCORE_KEYS) Object.assign(tab[k], D.std[y][k]);
        keepEditorOpen(); render(); toast(`已填入 ${y} 學年度學測五標`); return;
      }
      if (ds.mocktry) { tryMock(ds.mocktry); return; }
      if (ds.mockedit) { const m = st.mocks.find(x => x.id === ds.mockedit); if (m) { ui.mf = editMockDraft(m); render(); requestAnimationFrame(() => $('#mockForm') && $('#mockForm').scrollIntoView({ behavior: 'smooth', block: 'start' })); } return; }
      if (ds.combo) { toggle(f.combos, ds.combo); ui.shown = PAGE; render(); return; }
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
      if (t.id === 'mfPreset' && ui.mf) {
        const x = presetOf(t.value);
        if (x) Object.assign(ui.mf, { n: x.n, pre: null, d: x.d, std: x.std ? copyStd(x.std) : {} });
        else Object.assign(ui.mf, { n: '', pre: null, std: {} });
        render();
        if (!x) $('#mfName').focus();
        return;
      }
      if (t.id === 'mfDate' && ui.mf) { ui.mf.d = t.value; return; }
      if (t.id === 'mfName' && ui.mf) { ui.mf.n = t.value; return; }
      if (t.dataset.mf === '聽' && ui.mf) { ui.mf.聽 = t.value; return; }
      if (t.id === 'stdYear') { st.stdYear = t.value; render(); return; }
      if (t.dataset.std) {
        const [target, k, l] = t.dataset.std.split(':'), n = Math.round(Number(t.value)), tab = stdTable(target);
        keepEditorOpen();
        if (tab && Number.isFinite(n) && n >= 1 && n <= 15) tab[k][l] = n;
        else toast('五標要填 1–15 級分');
        render();
        return;
      }
      if (t.id === 'untakenBox') { st.f.untaken = t.checked; ui.shown = PAGE; render(); return; }
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
      if (id === 'comboMore') ui.comboOpen = ev.target.open;
      if (id === 'mockRef') ui.mockRefOpen = ev.target.open;
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
    document.addEventListener('input', ev => {
      const t = ev.target, f = ui.mf;
      if (!f) return;
      if (t.dataset.mf && t.dataset.mf !== '聽') {
        const k = t.dataset.mf, n = Math.round(Number(t.value));
        if (t.value === '' || !Number.isFinite(n) || n <= 0) delete f.s[k]; else f.s[k] = Math.min(15, n);
        const lab = $(`[data-mflv="${k}"]`); if (lab) lab.innerHTML = mfLevel(f, k);
      } else if (t.dataset.mfstd) {
        const [k, l] = t.dataset.mfstd.split(':'), n = Math.round(Number(t.value));
        f.std[k] = f.std[k] || {};
        if (Number.isFinite(n) && n >= 1 && n <= 15) f.std[k][l] = n; else delete f.std[k][l];
        const lab = $(`[data-mflv="${k}"]`); if (lab) lab.innerHTML = mfLevel(f, k);
      }
    });
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
  const startTab = { '#plan': 'plan', '#boost': 'boost', '#mock': 'mock', '#guide': 'guide' }[location.hash] || 'explore';
  ui.tab = '';
  setTab(startTab, true);
  route();
  window.__app = { st: () => st, evaluate: c => EV.get(c), render };
})();
