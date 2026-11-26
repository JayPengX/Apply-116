/* 116 申請入學選系: interface. Depends on window.Logic (src/logic.js, the pure scoring rules) and the embedded #app-data (gzipped JSON, base64). */
/** The embedded data: base64 → gzip → JSON. DecompressionStream where there is one, tiny-inflate otherwise. */
async function loadAppData() {
  const b64 = document.getElementById('app-data').textContent.trim();
  const bin = atob(b64), gz = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) gz[i] = bin.charCodeAt(i);
  if (window.DecompressionStream) return JSON.parse(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  // gzip: a 10-byte header (no name or extras, written by the build), raw deflate, then CRC32 and the size (LE)
  const n = gz[gz.length - 4] | (gz[gz.length - 3] << 8) | (gz[gz.length - 2] << 16) | (gz[gz.length - 1] << 24);
  return JSON.parse(new TextDecoder().decode(window.tinyInflate(gz.subarray(10, gz.length - 8), new Uint8Array(n >>> 0))));
}
loadAppData().then(D => {
  'use strict';
  const L = window.Logic;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // thousands separators without toLocaleString (slow when called for every count)
  const fmtN = n => { const [i, f] = String(n).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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
  const SORTS = ['chance', 'select', 'selectLow', 'sat', 'satLow', 'date', 'quota', 'code'];
  const TIERS = L.TIERS;
  const TC = { 穩: 't1', 適中: 't2', 衝: 't3', 難: 't4', 不符: 't5', 無資料: 't6' };
  // The 落點 as students read them: each label answers 「一階過得了嗎？」, with a signal-strength icon (4 bars =
  // safest). Internally the tiers keep their short keys (穩 適中 衝 難 不符 無資料; see src/logic.js).
  const TL = { 穩: '穩過', 適中: '應該過', 衝: '邊緣', 難: '機會低', 不符: '過不了', 無資料: '看不出' };
  const TSIG = { 穩: 4, 適中: 3, 衝: 2, 難: 1, 不符: 0, 無資料: -1 };
  // one line, for group headers and tooltips
  const TIER_SHORT = { 穩: '去年門檻再漲也過', 適中: '過得了去年門檻，但差距小', 衝: '卡在去年門檻上下', 難: '比去年門檻低不少', 不符: '檢定沒過或沒考要用的科目', 無資料: '去年沒有能比的門檻' };
  // the rule behind each label, for the legend and the guide
  const TIER_HELP = {
    穩: '每一關都高出去年（115）最低級分，最後一關至少高 2 級分，門檻漲 1 也過',
    適中: '每一關都過去年最低，但只高一點，或 116 篩選有改',
    衝: '剛好等於去年最後一關（要比同級分超額篩選），或只差一點',
    難: '比去年最低差不少，排在你前面的人明顯比門檻多',
    不符: '檢定沒過，或要用的科目你沒考：一定進不了一階',
    無資料: '116 用了去年沒篩過的科目、新設系或只看術科，沒得比',
  };
  const GOOD = '穩過＋應該過';
  // 興趣量表 (Holland) codes, and the 學群 each roughly points to. A rough guide only: ColleGo! has the real 適配.
  const HOL = [['R', '實用型', '動手做、操作機具'], ['I', '研究型', '分析、解決問題'], ['A', '藝術型', '創作、表達'], ['S', '社會型', '教人、幫助人'], ['E', '企業型', '領導、說服'], ['C', '事務型', '整理、有條理']];
  const HOL_G = { R: ['工程', '資訊', '生物資源', '地球環境', '建築設計', '遊憩運動'], I: ['數理化', '生命科學', '醫藥衛生', '資訊', '地球環境', '工程'], A: ['藝術', '建築設計', '大眾傳播', '文史哲', '外語'], S: ['教育', '社會心理', '醫藥衛生', '遊憩運動', '文史哲'], E: ['管理', '財經', '法政', '大眾傳播'], C: ['財經', '管理', '資訊'] };
  const COLLEGO = 'https://collego.edu.tw/Learningplan/interest';
  // 興趣測驗: the RIASEC Markers (Armstrong, Allison & Rounds, 2008, Journal of Vocational Behavior 73, 287–299),
  // activities set A, 8 per type; free for noncommercial use with credit. Chinese wording is ours (not normed).
  const QUIZ = {
    // Test the quality of parts before shipment / Lay brick or tile / Work on an offshore oil-drilling rig /
    // Assemble electronic parts / Operate a grinding machine in a factory / Fix a broken faucet /
    // Assemble products in a factory / Install flooring in houses
    R: ['出貨前檢驗零件的品質', '砌磚或貼磁磚', '在海上的鑽油平台工作', '組裝電子零件', '在工廠操作研磨機', '修理漏水的水龍頭', '在工廠的生產線組裝產品', '幫人家裡鋪設木地板'],
    // Study the structure of the human body / Study animal behavior / Do research on plants or animals /
    // Develop a new medical treatment or procedure / Conduct biological research / Study whales and other marine life /
    // Work in a biology lab / Make a map of the bottom of an ocean
    I: ['研究人體的構造', '觀察研究動物的行為', '研究植物或動物', '研發新的醫療方法', '從事生物學研究', '研究鯨魚和其他海洋生物', '在生物實驗室工作', '繪製海底地形圖'],
    // Conduct a musical choir / Direct a play / Design artwork for magazines / Write a song / Write books or plays /
    // Play a musical instrument / Perform stunts for a movie or television show / Design sets for plays
    A: ['指揮合唱團', '執導一齣舞台劇', '為雜誌設計插畫和版面', '寫一首歌', '寫小說或劇本', '演奏樂器', '在電影或電視劇裡當特技演員', '設計舞台劇的布景'],
    // Give career guidance to people / Do volunteer work at a non-profit organization / Help people who have problems
    // with drugs or alcohol / Teach an individual an exercise routine / Help people with family-related problems /
    // Supervise the activities of children at a camp / Teach children how to read / Help elderly people with their daily activities
    S: ['幫別人做生涯規劃諮詢', '在公益團體當志工', '協助有藥癮或酗酒問題的人', '一對一教別人一套健身運動', '協助有家庭困擾的人', '在營隊帶小朋友的活動', '教小朋友識字閱讀', '協助長輩打理日常生活'],
    // Sell restaurant franchises to individuals / Sell merchandise at a department store / Manage the operations of a hotel /
    // Operate a beauty salon or barber shop / Manage a department within a large company / Manage a clothing store /
    // Sell houses / Run a toy store
    E: ['推銷餐廳的加盟方案', '在百貨公司專櫃賣東西', '管理一間飯店的營運', '開一間美髮店或理髮店', '管理大公司裡的一個部門', '經營一家服飾店', '當房仲賣房子', '開一家玩具店'],
    // Generate the monthly payroll checks for an office / Inventory supplies using a hand-held computer / Use a computer
    // program to generate customer bills / Maintain employee records / Compute and record statistical and other numerical
    // data / Operate a calculator / Handle customers' bank transactions / Keep shipping and receiving records
    C: ['處理公司每個月的薪資', '用手持掃描器盤點存貨', '用電腦軟體開立客戶帳單', '整理和更新員工資料', '計算並記錄各種統計數字', '操作計算機算帳', '在銀行櫃台幫客戶辦理存提款', '登記貨品進出貨的紀錄'],
  };
  const QK = 'RIASEC'.split('');
  // one type after another, so the same kind of activity never comes twice in a row
  const QITEMS = Array.from({ length: 48 }, (_, i) => ({ k: QK[i % 6], t: QUIZ[QK[i % 6]][Math.floor(i / 6)] }));
  const QSCALE = [[1, '很不喜歡'], [2, '不喜歡'], [3, '說不上來'], [4, '喜歡'], [5, '很喜歡']];
  /** Mean like-rating per type (1–5) and the 3-letter code; null until every item is answered. */
  function quizResult(a) {
    if (!a || a.length !== 48 || a.some(x => !(x >= 1 && x <= 5))) return null;
    const m = Object.fromEntries(QK.map(k => [k, 0]));
    a.forEach((x, i) => { m[QITEMS[i].k] += x / 8; });
    const order = QK.slice().sort((x, y) => m[y] - m[x]);
    return { m, code: order.slice(0, 3), spread: m[order[0]] - m[order[5]], top: m[order[0]] };
  }

  /** Logic text names the tiers by their keys (「適中」); show the student-facing names. */
  const tw = t => String(t).replace(/「(穩|適中|衝|難|不符|無資料)」/g, (_, k) => `「${TL[k]}」`);
  // 116 學測模擬考 (115 學年度高三): dates and 範圍 from several high schools' 115 學年度 notices (台南、高雄、新竹).
  // Schools sit the same papers on nearby days, so a school's own notice wins.
  // 翰林 學測模擬考 五標 (頂/前/均/後/底), as 翰林高中試務中心 names them. Primary source: 翰林's own
  // 「115學年度第一／二／三次學測模擬考（翰林）各科成績標準一覽表」 as handed to students (copies from
  // students who sat them, 2026-11-20). Every number was cross-checked against independent public copies:
  //   7月全國 (115-E1): threads.com/@minda_tsu; 數學 row and 級距 6.60317 = 翰林115E1 playlist (約 5.3 萬人).
  //   9月北北基 (115-E2): seventeen5.co/115-1-mock-test-analysis, xuebago.tw/blog/article/parent/115-trme-analysis.html.
  //   10月北北基 (115-E3): threads.com/@116_gsat_ 原始分數與級分五標對照表 (社會 per its correction:
  //     13、12、10、8、7). 報考人數 數A 59616、數B 55802、社會 56679、自然 49241.
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
  const HAVE_CODES = 'BCDEFGHIJKLMNOPQ'.split('');
  const REVIEW = { A: '修課紀錄', B: '書面報告', C: '實作作品', D: '自然科學探究與實作成果', E: '社會領域探究活動成果', F: '自主學習計畫與成果', G: '社團活動經驗', H: '擔任幹部經驗', I: '服務學習經驗', J: '競賽表現', K: '非修課紀錄之成果作品', L: '檢定證照', M: '特殊優良表現證明', N: '多元表現綜整心得', O: '高中學習歷程反思', P: '就讀動機', Q: '未來學習計畫與生涯規劃' };
  const SCORE_KEYS = ['國', '英', '數A', '數B', '社', '自'];
  const ABBR = { 國: '國', 英: '英', 數A: '數A', 數B: '數B', 社: '社', 自: '自', 識: 'APCS觀念', 實: 'APCS實作' };
  const LV_SHORT = { 頂標: '頂', 前標: '前', 均標: '均', 後標: '後', 底標: '底' };
  const LS = 'apply116-v1';
  const PAGE = 50;
  // The order is the order you use it in: scores → departments → 志願; then how to improve, and the calendar.
  const NAV = [['scores', '我的成績', '成績', 'mock'], ['explore', '找校系', '找校系', 'search'], ['plan', '我的志願', '志願', 'plan'], ['boost', '怎麼進步', '進步', 'boost'], ['guide', '時程與規則', '時程', 'guide']];
  const TABS = NAV.map(x => x[0]);
  const HASH_TAB = { '#scores': 'scores', '#mock': 'scores', '#plan': 'plan', '#uac': 'explore', '#boost': 'boost', '#guide': 'guide' };

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
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3 3 0 0 1 0 5.6M17.6 13.8a5.5 5.5 0 0 1 2.9 5.7"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>',
    funnel: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>',
    doc: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/><path d="M14 3.5V8h4M9.5 12.5h5M9.5 16h5"/>',
    flag: '<path d="M5.5 21V4M5.5 4h11l-2.2 4 2.2 4h-11"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7"/><path d="M4 4v4.7h4.7M12 8v4.5l3 2"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    fork: '<path d="M12 21v-6.5M12 14.5 6 8.5M12 14.5l6-6"/><path d="M5 4h4v4M19 4h-4v4"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    shield: '<path d="M12 3.5 19 6v5.5c0 4.3-3 7.7-7 9-4-1.3-7-4.7-7-9V6z"/>',
  };
  const icon = (n, cls) => `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
  /** A heading with its icon in a small tinted square: makes sections easy to find when scrolling. */
  const hIcon = (ic, text, tag = 'h2', extra = '') => `<${tag} class="hi">${icon(ic)}<span>${text}</span>${extra}</${tag}>`;

  // ------------------------------------------------------------------ state (same storage key and shape as v3, so saved scores and plans carry over)
  const DEFAULT = () => ({
    v: 1,
    scores: { 國: '', 英: '', 數A: '', 數B: '', 社: '', 自: '', 聽: '', 識: '', 實: '' },
    stdYear: '115',
    stdCustom: copyStd(D.std['115']),
    f: { q: '', groups: [], regions: [], own: 'all', tiers: DEFAULT_TIERS.slice(), cats: DEFAULT_CATS.slice(), st2: [], sat: 'all', skip: [], combos: [], untaken: false, sort: 'chance', path: 'both', list: 'all' },
    fav: [], plan: [], mocks: [], mockV: 3, theme: '',
    // which scores every 落點 is judged on: 'test' = 學測級分 you typed (or a target), else a saved 模考's id
    src: 'test',
    // 興趣量表 (Holland) codes the student picked, at most 3: only used to order 學群 in 探索
    hol: [],
    // 興趣測驗 answers (48 × 1–5, 0 = not yet)
    quiz: [],
    // 學習歷程 the student already has (審查資料 codes B–Q; A 修課紀錄 comes from the 資料庫)
    have: [],
    // 分科: which subjects you will take and how to score them ({數甲: 'e' (estimate) | '0'–'60'}); null = follow 學測
    ast: null,
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
    if (!['both', 'app', 'uac'].includes(f.path)) f.path = 'both';
    if (!['all', 'fav', 'plan'].includes(f.list)) f.list = 'all';
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
    out.src = out.mocks.some(m => m.id === s.src) ? s.src : 'test';
    out.hol = [...new Set(arr(s.hol, x => HOL.some(h => h[0] === x)))].slice(0, 3);
    out.have = [...new Set(arr(s.have, c => HAVE_CODES.includes(c)))];
    out.quiz = Array.isArray(s.quiz) ? s.quiz.slice(0, 48).map(x => (Number.isInteger(x) && x >= 0 && x <= 5 ? x : 0)) : [];
    if (s.ast && typeof s.ast === 'object') {
      out.ast = {};
      for (const k of L.AST) { const v = s.ast[k]; if (v === 'e' || (/^\d{1,2}$/.test(v) && +v <= 60)) out.ast[k] = v; }
    }

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
  const ui = { tab: 'explore', more: false, catsOpen: false, helpOpen: false, shown: PAGE, visible: 0, tryS: null, trySig: null, sheet: false, mf: null };

  // ------------------------------------------------------------------ evaluation (cached until the scores in use change)
  let EV = new Map(), evSig = null;
  /** The 學測 五標 used for 檢定 with 學測 級分: a 學年度's, or the user's own (自訂, e.g. 116 once published). */
  const STD = () => (st.stdYear === 'custom' ? st.stdCustom : D.std[st.stdYear]);
  const stdName = () => (st.stdYear === 'custom' ? '自訂五標' : `${st.stdYear} 學年度學測五標`);
  /**
   * The scores every 落點 is judged on ("context"), from st.src:
   * - 學測級分: S = what you typed; 檢定 against the chosen 學測 五標.
   * - a 模考: 檢定 compares the 模考's own 級分 (thS) with that 模考's own 五標 (std; a subject without them
   *   falls back to the 學測 五標), and 倍率篩選 uses the 模考 read as 學測 級分 by rank (S), since the 115 cuts
   *   are 學測 級分. 英聽 and APCS come from the 模考 when it has them, else from your 學測 entries.
   */
  const srcMock = () => (st.src !== 'test' && st.mocks.find(m => m.id === st.src)) || null;
  /** Subjects you set to 沒考 on 學測級分 (once you filled any): left out everywhere, a 模考's score in them too. */
  const skipped = () => (SCORE_KEYS.some(k => L.val(st.scores, k) != null) ? SCORE_KEYS.filter(k => L.val(st.scores, k) == null) : []);
  /** A 模考's scores without the subjects you do not take (第一、二次 數A、數B are one paper: many fill both). */
  function msc(m) {
    const sk = skipped();
    if (!sk.length || !sk.some(k => L.val(m.s, k) != null)) return m.s;
    const s = { ...m.s };
    sk.forEach(k => { s[k] = ''; });
    return s;
  }
  function ctxFor(m) {
    if (!m) return { key: 'test', S: st.scores, thS: st.scores, std: STD(), stdYear: st.stdYear, mock: null, eq: {}, own: [], name: '學測級分', stdName: stdName() };
    const { S: conv, eq } = mockAsTest(m);
    const ms = msc(m), extra = { 聽: m.s.聽 || st.scores.聽, 識: st.scores.識, 實: st.scores.實 };
    const base = STD(), std = {};
    for (const k of SCORE_KEYS) std[k] = (m.std && m.std[k]) || base[k];
    const own = SCORE_KEYS.filter(k => m.std && m.std[k]);
    return { key: m.id, S: { ...cleanScores(conv), ...extra }, thS: { ...cleanScores(ms), ...extra }, std, stdYear: null, mock: m, eq, own, name: mName(m), stdName: own.length ? `${mName(m)}的五標` : stdName() };
  }
  let CTX = null, ctxSig = null;
  function cur() {
    const m = srcMock();
    const sig = st.src + '|' + JSON.stringify(st.scores) + '|' + st.stdYear + '|' + (st.stdYear === 'custom' ? JSON.stringify(st.stdCustom) : '') + '|' + (m ? JSON.stringify(m) : '');
    if (sig !== ctxSig) { ctxSig = sig; CTX = ctxFor(m); CTX.sig = sig; }
    return CTX;
  }
  const optsFor = c => ({ std: c.std, thS: c.thS, stdByYear: D.std, stdYear: c.stdYear, pct: D.pct });
  const hasScores = S => SCORE_KEYS.some(k => L.val(S || cur().S, k) != null);
  /**
   * What-ifs (試算, 怎麼進步) are typed on the scale you see: with a 模考 in use, that 模考's own 級分 against its own
   * 五標 (檢定), converted by rank to 學測 級分 only for 倍率篩選, exactly as the 模考 itself is judged.
   */
  function atRaw(c, R) {
    if (!c.mock) return { S: R, thS: R };
    const S = { ...R };
    for (const k of SCORE_KEYS) { const e = L.mockToTest(c.mock.std, k, L.val(R, k), D.pct); if (e) S[k] = String(e.g); }
    return { S, thS: R };
  }
  const evalAt = (d, c, R) => { const x = atRaw(c, R); return L.evaluate(d, x.S, { ...optsFor(c), thS: x.thS }); };
  /** The 五標 the sliders mark, and what a 級分 reads as: the 模考's own with a 模考, else the 學測 五標. */
  const tryScale = () => { const c = cur(); return c.mock ? { std: c.std, mock: c.mock } : null; };
  function ensureEval() {
    const c = cur();
    if (c.sig === evSig) return;
    evSig = c.sig;
    EV = new Map();
    if (!hasScores(c.S)) return;
    const o = optsFor(c);
    for (const d of D.depts) EV.set(d.c, L.evaluate(d, c.S, o));
  }
  const tierOf = d => { const e = EV.get(d.c); return e ? e.tier : null; };
  /** 二階 採計 a subject you did not take (it counts as 0). 檢定／篩選 subjects you did not take are already 不符. */
  const usesUntaken = d => { const e = EV.get(d.c); return !!(e && e.tier !== '不符' && ((e.miss && e.miss.weight.length) || (e.screenZero && e.screenZero.length))); };

  // ------------------------------------------------------------------ formatting helpers
  const sch = d => SCHOOL[d.sid].n;
  // The short names students use. A monogram, not the school's logo (those are trademarks, and this page is offline).
  const SCH_SHORT = { 國立臺灣大學: '臺大', 國立臺灣師範大學: '師大', 國立中興大學: '興大', 國立成功大學: '成大', 東吳大學: '東吳', 國立政治大學: '政大', 高雄醫學大學: '高醫', 中原大學: '中原', 東海大學: '東海', 國立清華大學: '清大', 中國醫藥大學: '中國醫', 國立陽明交通大學: '陽交', 淡江大學: '淡江', 逢甲大學: '逢甲', 國立中央大學: '中央', 中國文化大學: '文化', 靜宜大學: '靜宜', 大同大學: '大同', 輔仁大學: '輔大', 國立臺灣海洋大學: '海大', 國立高雄師範大學: '高師', 國立彰化師範大學: '彰師', 中山醫學大學: '中山醫', 國立中山大學: '中山', 國立臺北藝術大學: '北藝', 長庚大學: '長庚', 國立臺中教育大學: '中教', 國立臺北教育大學: '北教', 國立臺南大學: '南大', 國立東華大學: '東華', 臺北市立大學: '北市大', 國立屏東大學: '屏大', 國立臺東大學: '東大', 國立體育大學: '體大', 元智大學: '元智', 國立中正大學: '中正', 大葉大學: '大葉', 華梵大學: '華梵', 義守大學: '義守', 銘傳大學: '銘傳', 世新大學: '世新', 實踐大學: '實踐', 長榮大學: '長榮', 國立臺灣藝術大學: '臺藝', 國立暨南國際大學: '暨大', 南華大學: '南華', 國立臺灣體育運動大學: '臺體', 國立臺南藝術大學: '南藝', 玄奘大學: '玄奘', 真理大學: '真理', 國立臺北大學: '北大', 國立嘉義大學: '嘉大', 國立高雄大學: '高大', 慈濟大學: '慈濟', 臺北醫學大學: '北醫', 開南大學: '開南', 康寧大學: '康寧', 中信金融管理學院: '中信', 佛光大學: '佛光', 亞洲大學: '亞洲', 國立宜蘭大學: '宜大', 國立聯合大學: '聯大', 馬偕醫學大學: '馬偕', 國立金門大學: '金大' };
  const schShort = d => SCH_SHORT[sch(d)] || sch(d).replace(/^國立/, '').slice(0, 2);
  /** Each school keeps one soft hue (golden-angle spread), so the same school is easy to spot down a list. */
  const schBadge = (d, cls) => { const t = schShort(d); return `<span class="sbadge${t.length > 2 ? ' s3' : ''}${cls ? ' ' + cls : ''}" style="--sh:${Math.round((+d.sid * 137.508) % 360)}" aria-hidden="true">${t}</span>`; };
  /** A 校系 name that breaks only between its parts (系｜組｜（校區）), never inside a word; see .nm. */
  const nameHTML = n => `<span class="nm">${esc(n).replace(/(學位學程|學系|學程|、|暨)/g, '$1<wbr>').replace(/([（(])/g, '<wbr>$1')}</span>`;
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
  const partsHTML = d => (d.sp ? '' : '<span class="pt nosat">不計學測</span>') + L.stage2(d).map(x => `<span class="pt">${esc(shortItem(x.n))} ${x.p}%</span>`).join('');
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
    if (!h) { h = normQ([sch(d), schShort(d), d.n, d.c, d.g.join(' '), d.rv || '', d.rn || '', d.iv || '', d.notes || '', d.city, d.st2.map(x => x.i).join(' ')].join(' ')); hayCache.set(d.c, h); }
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
    if (skip !== 'cats' && !catOk(d, f.cats)) return false;
    if (skip !== 'sat' && f.sat !== 'all' && !SAT_BY[f.sat][3](d)) return false;
    if (skip !== 'st2' && f.st2.some(k => !ST2_TEST[k](d))) return false;
    if (skip !== 'skip' && L.stage1Uses(d, f.skip)) return false;
    if (skip !== 'combos' && f.combos.length && !f.combos.includes(COMBO_OF[d.c])) return false;
    if (skip !== 'untaken' && !f.untaken && usesUntaken(d)) return false;
    if (skip !== 'list' && f.list !== 'all' && !listCodes().includes(d.c)) return false;
    if (qTerms.length) { const h = hay(d); if (!qTerms.every(t => termHit(t, d, h))) return false; }
    return true;
  }
  /** 收藏 or 志願 when the filters are narrowed to one of them. */
  const listCodes = () => (st.f.list === 'plan' ? st.plan : st.fav);
  const normQ = x => x.toLowerCase().replace(/台/g, '臺');
  const setQ = q => { const x = normQ(q.trim()); qTerms = x ? x.split(/[\s,，、]+/).filter(Boolean) : []; };
  /** a, b, c in order inside s (資工 → 資訊工程, 企管 → 企業管理). */
  const subseq = (t, s) => { let i = 0; for (const ch of s) if (ch === t[i] && ++i === t.length) return true; return false; };
  // what students type for a school: 東吳大學, 東吳, 臺大, 臺灣大學
  const ALIAS = new Map();
  const aliasesOf = d => { let a = ALIAS.get(d.sid); if (!a) { const n = sch(d); a = [...new Set([n, n.replace(/^國立/, ''), schShort(d)])].map(normQ).sort((x, y) => y.length - x.length); ALIAS.set(d.sid, a); } return a; };
  /**
   * One search word: anywhere in the 校系's text, or a school name stuck to a 系 (東吳法律, 政大企管),
   * or a 系 abbreviation whose characters appear in order in its name (資工, 財金, 外文).
   */
  function termHit(t, d, h) {
    if (h.includes(t)) return true;
    const n = normQ(d.n);
    for (const a of aliasesOf(d)) if (t.length > a.length && t.startsWith(a)) { const r = t.slice(a.length); if (h.includes(r) || (r.length >= 2 && subseq(r, n))) return true; }
    return t.length >= 2 && /[\u4e00-\u9fff]/.test(t) && subseq(t, n);
  }
  // One set of filters for the whole app (找校系, 我的成績, 怎麼進步): each list is worked out once per change.
  const BF = new Map();
  function baseFiltered(skip) {
    const k = (skip || '') + JSON.stringify(st.f) + qTerms.join(' ') + evSig + st.fav.join() + '|' + st.plan.join();
    if (!BF.has(k)) { if (BF.size > 40) BF.clear(); BF.set(k, D.depts.filter(d => passes(d, skip))); }
    return BF.get(k);
  }
  /** 一般 departments: the default 組別 (no 青儲、扶弱 or 術科 groups), as 找校系 shows them before any filter. */
  const catOk = (d, cats) => catOf(d).some(c => cats.includes(c)) && !(d.cats.includes('青儲') && !cats.includes('青儲')) && !(d.cats.includes('扶弱') && !cats.includes('扶弱'));
  const filterCount = () => st.f.groups.length + st.f.regions.length + (st.f.own !== 'all' ? 1 : 0) + (st.f.sat !== 'all' ? 1 : 0) + st.f.st2.length + st.f.skip.length + st.f.combos.length + (st.f.untaken ? 1 : 0) + (catsChanged() ? 1 : 0) + (st.f.list !== 'all' ? 1 : 0);
  const skipName = k => SKIP_SUBJ.find(x => x[0] === k)[1];
  const comboParts = k => k.split('+');
  const comboName = k => { const ps = comboParts(k); return ps.length === 1 ? subj(ps[0]) : ps.map(p => ABBR[p] || p).join(''); };
  /** Combination chips: how many 系 screen on each, and your 115 rank on it; strongest first once you have scores. */
  function comboChips() {
    const f = st.f, has = hasScores(), S = cur().S, c = {};
    for (const d of baseFiltered('combos')) { const k = COMBO_OF[d.c]; if (k) c[k] = (c[k] || 0) + 1; }
    const rows = [...new Set([...Object.keys(c), ...f.combos])].map(k => {
      const rk = has ? L.comboRank(comboParts(k), S, D.pct) : null;
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
  const LIST_NAME = { fav: '只看收藏', plan: '只看志願' };
  function scopeLabel(f = st.f) {
    const p = [];
    if (f.list !== 'all') p.push(LIST_NAME[f.list]);
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
    // tier and selectivity once per row, not once per comparison
    const T = new Map(list.map(d => { const t = xTier(d); return [d, t ? TIERS.indexOf(t) : 9]; }));
    const ti = d => T.get(d);
    const N = new Map(qTerms.length ? list.map(d => { const h = normQ(`${d.isU ? uSch(d) : sch(d)} ${schShort(d)} ${d.n} ${d.c} ${d.g.join(' ')}`); return [d, qTerms.every(t => termHit(t, d, h)) ? 0 : 1]; }) : []);
    const nm = d => N.get(d) || 0;
    const by = {
      chance: (a, b) => (ti(a) - ti(b)) || (nm(a) - nm(b)) || ((xSel(b) || 0) - (xSel(a) || 0)),
      select: (a, b) => (xSel(b) || 0) - (xSel(a) || 0),
      // no 115 門檻 → last
      selectLow: (a, b) => (xSel(a) ?? 99) - (xSel(b) ?? 99),
      sat: (a, b) => (b.sp ?? -1) - (a.sp ?? -1),
      satLow: (a, b) => (a.sp || 0) - (b.sp || 0),
      date: (a, b) => (((a.idays || [])[0] || '99') < ((b.idays || [])[0] || '99') ? -1 : ((a.idays || [])[0] || '99') > ((b.idays || [])[0] || '99') ? 1 : 0),
      quota: (a, b) => b.q - a.q,
      code: () => 0,
    }[k] || (() => 0);
    // with a search, 校系 whose school and name match come before ones that match only in their notes
    return list.slice().sort((a, b) => (k === 'chance' ? 0 : nm(a) - nm(b)) || by(a, b) || (a.c < b.c ? -1 : 1));
  }

  // ------------------------------------------------------------------ small components
  /** Signal bars (4 = safest), ✕ for 過不了, ? for 看不出. */
  const sigHTML = t => {
    const n = TSIG[t];
    if (n === 0) return `<i class="sig x" aria-hidden="true">${icon('x')}</i>`;
    if (n < 0) return '<i class="sig q" aria-hidden="true"></i>';
    return `<i class="sig" aria-hidden="true">${[1, 2, 3, 4].map(i => `<b class="${i <= n ? 'on' : ''}"></b>`).join('')}</i>`;
  };
  const pillHTML = (t, cls) => `<span class="pill ${t ? TC[t] : 't0'}${cls ? ' ' + cls : ''}" title="${t ? esc(TIER_SHORT[t]) : ''}">${t ? sigHTML(t) + TL[t] : '—'}</span>`;
  /** Where you rank among 115 考生 against where the cut fell: the shaded part got through. */
  const rankBar = (me, cut) => `<div class="rkbar" role="img" aria-label="你在 115 考生${fmtTop(me)}，門檻是${fmtTop(cut)}"><div class="rk-track"><span class="rk-ok" style="width:${cut.toFixed(1)}%"></span><span class="rk-cut" style="left:${cut.toFixed(1)}%"></span><span class="rk-me ${me <= cut ? 'in' : 'out'}" style="left:${Math.min(98.5, me).toFixed(1)}%"></span></div><div class="rk-lab"><span>你 <b>${fmtTop(me)}</b></span><span>門檻 <b>${fmtTop(cut)}</b></span><span class="muted">115 考生排名</span></div></div>`;
  function deltaHTML(diff, last) {
    if (diff == null) return '';
    if (diff > 0) return `<span class="delta up">+${diff}</span>`;
    if (diff === 0) return last ? '<span class="delta eq">同分，看超篩</span>' : '<span class="delta up">剛好</span>';
    return `<span class="delta down">${diff}</span>`;
  }
  const noteHTML = (kind, html) => `<div class="note ${kind}">${icon(kind === 'warn' ? 'alert' : 'info')}<div>${html}</div></div>`;
  function focusKey(el) {
    if (!el || !el.dataset) return null;
    for (const a of ['slider', 'try', 'focus', 'src', 'list', 'gsel', 'gx', 'hol', 'astmode', 'astv', 'path', 'qans', 'have', 'srcsel', 'tier', 'group', 'region', 'own', 'cat', 'sat', 'st2', 'listen', 'fav', 'plan', 'up', 'down', 'act', 'open']) {
      if (el.dataset[a] != null) return `[data-${a}="${CSS.escape(el.dataset[a])}"]`;
    }
    return el.id ? '#' + CSS.escape(el.id) : null;
  }
  function keepFocus(root, fn) {
    const a = document.activeElement;
    // a <select> is never focused again: Safari on iPhone opens its picker on focus(), so a choice would reopen it
    const key = a && a !== document.body && a.tagName !== 'SELECT' && root.contains(a) ? focusKey(a) : null;
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
  function valueHTML(k, v, max, sc) {
    if (!v) return '<span class="none">沒考</span>';
    if (max !== 15) return `<b>${v}</b><span>級</span>`;
    if (sc) {
      const lv = levelIn(sc.std, k, v), e = L.mockToTest(sc.mock.std, k, v, D.pct);
      return `<b>${v}</b><span>級分</span>${lv ? `<span class="lv">這次${lv}</span>` : ''}${e ? `<span>≈學測 ${e.g}</span>` : ''}`;
    }
    const lv = levelOf(k, v);
    const p = L.topPercent(D.pct, [k], v);
    return `<b>${v}</b><span>級分</span>${lv ? `<span class="lv">${lv}</span>` : ''}${p != null ? `<span>115 ${fmtTop(p)}</span>` : ''}`;
  }
  const valueText = (k, v, max, sc) => { const lv = sc ? levelIn(sc.std, k, v) : levelOf(k, v); return !v ? '沒考' : max === 15 ? `${v} 級分${lv ? '，' + lv : ''}` : `${v} 級`; };
  function marksHTML(k, max, v, sc) {
    const std = max !== 15 ? null : sc ? sc.std[k] : STD() ? STD()[k] : null;
    if (!std) return '';
    const lv = v ? (sc ? levelIn(sc.std, k, v) : levelOf(k, v)) : '';
    const byV = new Map();
    for (const l of L.LEVELS) { if (!byV.has(std[l])) byV.set(std[l], []); byV.get(std[l]).push(l); }
    return `<div class="marks" aria-hidden="true">${[...byV].map(([x, ls]) => `<span class="${ls.includes(lv) ? 'hit' : ''}" style="left:${(((x - 0.5) / max) * 100).toFixed(2)}%">${ls.map(l => LV_SHORT[l]).join('')}</span>`).join('')}</div>`;
  }
  function sliderHTML(kind, k, label, v, max, sc) {
    const id = `lab-${kind}-${k}`;
    let cells = '';
    for (let i = 1; i <= max; i++) cells += `<span class="c${i <= v ? ' on' : ''}" style="--i:${i}"></span>`;
    return `<div class="srow">
      <div class="srow-h"><span class="srow-l" id="${id}">${esc(label)}</span><span class="srow-v">${valueHTML(k, v, max, sc)}</span><button class="textbtn srow-x" type="button" data-clear="${kind}:${k}" aria-label="${esc(label)}設為沒考" ${v ? '' : 'hidden'}>設為沒考</button></div>
      <div class="track" role="slider" tabindex="0" data-${kind}="${k}" data-max="${max}" data-v="${v}" aria-labelledby="${id}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${v}" aria-valuetext="${esc(valueText(k, v, max, sc))}" style="--n:${max}">${cells}</div>
      ${marksHTML(k, max, v, sc)}
    </div>`;
  }
  function paintSlider(t, v) {
    const k = t.dataset.slider || t.dataset.try;
    const max = +t.dataset.max, sc = t.dataset.try ? tryScale() : null;
    t.dataset.v = v;
    $$('.c', t).forEach((c, i) => c.classList.toggle('on', i < v));
    t.setAttribute('aria-valuenow', v);
    t.setAttribute('aria-valuetext', valueText(k, v, max, sc));
    const row = t.closest('.srow');
    row.querySelector('.srow-v').innerHTML = valueHTML(k, v, max, sc);
    const x = row.querySelector('.srow-x');
    if (x) x.hidden = !v;
    const m = row.querySelector('.marks');
    if (m) m.outerHTML = marksHTML(k, max, v, sc);
  }
  function listenHTML(v, kind) {
    return `<div class="segctl" role="group" aria-labelledby="lab-listen">${[['', '沒考'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['F', 'F']].map(([x, l]) => `<button type="button" data-listen="${x || 'none'}" aria-pressed="${(v || '') === x}">${l}</button>`).join('')}</div>`;
  }
  /** Which scores the 落點 on this page use, with a switch: the same bar on 找校系, 我的志願 and 怎麼進步. */
  function ctxBarHTML() {
    const c = cur(), has = hasScores(c.S);
    const pick = st.mocks.length
      ? `<span class="selectbox ctx-sel"><select data-srcsel aria-label="看落點用哪一份成績"><option value="test" ${c.mock ? '' : 'selected'}>學測級分${hasScores(st.scores) ? '' : '（還沒填）'}</option><optgroup label="模考">${mocksByDate().reverse().map(m => `<option value="${m.id}" ${c.mock === m ? 'selected' : ''}>${esc(mName(m))}・${mdText(m.d)}</option>`).join('')}</optgroup></select>${icon('chevD', 'sm')}</span>`
      : '<b class="ctx-name">學測級分</b>';
    let note = '';
    if (c.mock) {
      const lack = SCORE_KEYS.filter(k => L.val(c.thS, k) != null && !c.own.includes(k));
      note = `檢定比${c.own.length ? '這次模考的五標' : stdName()}${c.own.length && lack.length ? `（${lack.map(k => ABBR[k]).join('、')}用${stdName()}）` : ''}；篩選用換算的學測級分（≈）比 115 門檻。`;
    } else if (has) note = `檢定用${stdName()}。`;
    return `<div class="ctxbar"><div class="ctx-top"><span class="ctx-lab">${icon('target', 'sm')}落點依據</span>${pick}<button class="btn sm ctx-edit" type="button" data-tab="scores" aria-label="${has ? '改成績' : '輸入成績'}" title="${has ? '改成績' : '輸入成績'}">${icon('edit', 'sm')}<span class="lbl">${has ? '改成績' : '輸入成績'}</span></button></div>
      ${has ? sgridHTML(c.thS, c.std, scoreCols().filter(k => k === '聽' ? c.thS.聽 : L.val(c.thS, k) != null)) : '<p class="ctx-none">還沒有成績：先到「我的成績」填學測級分（或目標分數），或存一次模考。</p>'}
      ${note ? (c.mock ? `<details class="ctx-how"><summary>${icon('info', 'sm')}模考怎麼看落點</summary><p class="ctx-note">${esc(note)}</p>${Object.keys(c.eq).length ? `<p class="ctx-note">換算的學測級分：${SCORE_KEYS.filter(k => c.eq[k]).map(k => `${ABBR[k]} ${c.eq[k].g}`).join('、')}</p>` : ''}</details>` : `<p class="ctx-note">${esc(note)}</p>`) : ''}</div>`;
  }
  // ------------------------------------------------------------------ 模考紀錄
  const mocksByDate = () => st.mocks.slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const mdText = iso => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
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
    return `<section class="sec mform" id="mockForm"><div class="sec-hh">${hIcon(f.id ? 'edit' : 'plus', f.id ? '修改模考' : '新增一次模考')}<button class="textbtn" type="button" data-act="mfCancel">取消</button></div>
      <div class="mf-top">
        <label class="mf-f"><span>哪一次</span><span class="selectbox"><select id="mfPreset">${MOCK_REF.filter(x => x.r).map(x => `<option value="${esc(x.n)}" ${x.n === pick ? 'selected' : ''}>翰林 ${esc(x.org)}（${x.area ? esc(x.area) + '・' : ''}${esc(x.n.replace('學測模擬考', ''))}，${esc(x.when.replace(/（.*）/, ''))}）</option>`).join('')}<option value="" ${pick ? '' : 'selected'}>其他模考</option></select>${icon('chevD', 'sm')}</span></label>
        ${pick ? '' : '<p class="hint mf-wide">中區（南一）、南一全國跟翰林是不同考試，五標照你的成績單填。</p>'}
        ${presetOf(f.n) ? '' : `<label class="mf-f"><span>名稱</span><input id="mfName" type="text" maxlength="30" value="${esc(f.n)}" placeholder="例如：南一第一次、校內模考"></label>`}
        <label class="mf-f"><span>日期</span><input id="mfDate" type="date" value="${f.d}"></label>
      </div>
      <h3 class="mf-h">級分 <small>沒考的空著</small>${hasScores(st.scores) ? '<button class="textbtn" type="button" data-act="mfFromScores">帶入我填的學測級分</button>' : ''}</h3>
      <div class="mf-scores">${SCORE_KEYS.map(k => `<label class="mf-s"><span class="k">${subj(k)}</span><input type="number" inputmode="numeric" min="0" max="15" value="${f.s[k] || ''}" data-mf="${k}" placeholder="—"><small class="lv" data-mflv="${k}">${mfLevel(f, k)}</small></label>`).join('')}
        ${p && !p.r.英聽 && !f.聽 ? '' : `<label class="mf-s"><span class="k">英聽</span><span class="selectbox"><select data-mf="聽"><option value="">—</option>${['A', 'B', 'C', 'F'].map(g => `<option ${f.聽 === g ? 'selected' : ''}>${g}</option>`).join('')}</select>${icon('chevD', 'sm')}</span><small class="lv"></small></label>`}
      </div>
      ${p && p.n === '第一次學測模擬考' || p && p.n === '第二次學測模擬考' ? '<p class="hint">這次數A、數B 同一份考卷，填在你要考的那科。</p>' : ''}
      ${p && !p.r.英聽 ? '<p class="hint">這次沒考英聽。</p>' : ''}
      <div class="mf-std"><div class="mf-std-h"><b>這次的五標</b><span>${esc(stdText)}</span><button class="textbtn" type="button" data-act="mfStdToggle" aria-expanded="${f.stdOpen}">${f.stdOpen ? '收起' : stdKeys.length ? '看／修改' : '填五標'}</button></div>${f.stdOpen ? grid : ''}</div>
      <div class="mf-actions"><button class="btn primary" type="button" data-act="mfSave">${icon('check', 'sm')}${f.id ? '存好了' : '存這次模考'}</button></div>
    </section>`;
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
    ui.mf = null;
    st.src = rec.id;
    render();
    toast(at >= 0 ? `已更新「${mName(rec)}」` : `已存「${mName(rec)}」，現在用它看落點`);
    requestAnimationFrame(() => { const el = $('#srcSec'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  /** Use a source (學測級分 or a 模考) for every 落點. */
  function useSource(id, go) {
    st.src = id === 'test' || st.mocks.some(m => m.id === id) ? id : 'test';
    ui.mf = null; ui.shown = PAGE;
    if (go) setTab(go); else render();
    toast(`現在用「${cur().name}」看落點`);
  }
  /** Subjects shown in the score rows: any you have a score in (沒考 ones left out), plus 英聽. */
  function scoreCols() {
    const all = [st.scores, ...st.mocks.map(msc)];
    const ks = SCORE_KEYS.filter(k => all.some(x => L.val(x, k) != null));
    return all.some(x => x.聽) ? [...ks, '聽'] : ks;
  }
  /** One aligned row of 級分 with the 標 each reaches (in `std`): the same columns on every card. */
  function sgridHTML(raw, std, cols) {
    return `<span class="sgrid" style="--n:${cols.length}">${cols.map(k => {
      if (k === '聽') return `<span class="sg${raw.聽 ? '' : ' na'}"><small>英聽</small><b>${raw.聽 || '—'}</b><i></i></span>`;
      const v = L.val(raw, k), lv = v != null && std && std[k] ? levelIn(std, k, v) : '';
      return `<span class="sg${v == null ? ' na' : ''}"><small>${ABBR[k]}</small><b>${v ?? '—'}</b>${lv ? `<i class="lvb l${L.LEVELS.includes(lv) ? L.LEVELS.indexOf(lv) : 5}" title="${lv}">${LV_SHORT[lv] || '未達'}</i>` : '<i></i>'}</span>`;
    }).join('')}</span>`;
  }
  /** One card per source; pressing one makes it the scores every page uses. */
  function sourceCardsHTML() {
    const c = cur(), cols = scoreCols();
    const card = (id, title, sub, grid, on) => `<button type="button" class="srccard" data-src="${id}" aria-pressed="${on}"><span class="sc-h"><b>${title}</b><span class="sc-sub">${sub}</span>${on ? `<span class="sc-on">${icon('check', 'sm')}使用中</span>` : '<span class="sc-use">用這份</span>'}</span>${grid}</button>`;
    const test = card('test', '學測級分', '目標或正式成績', hasScores(st.scores) || st.scores.聽 ? sgridHTML(st.scores, STD(), cols) : '<span class="muted sc-empty">還沒填，按這裡填</span>', !c.mock);
    const mocks = mocksByDate().reverse().map(m => card(m.id, esc(mName(m)), mdText(m.d), sgridHTML(msc(m), m.std, cols), c.mock === m)).join('');
    return `<div class="srccards">${test}${mocks}<button type="button" class="srccard add" data-act="mfNew">${icon('plus')}<b>新增模考</b><span class="sc-sub">選翰林哪一次，五標自動帶入</span></button></div>
      <p class="hint sc-key">小字是那份成績的標：<i class="lvb l0">頂</i><i class="lvb l1">前</i><i class="lvb l2">均</i><i class="lvb l3">後</i><i class="lvb l4">底</i>（模考用那次的五標）</p>`;
  }
  /** The selected 模考: each subject's 標 on that 模考, the 學測 級分 it reads as, and what 檢定 compares. */
  function mockViewHTML(m) {
    const c = cur(), p = mockPreset(m);
    const ms = msc(m), gone = SCORE_KEYS.filter(k => L.val(m.s, k) != null && L.val(ms, k) == null);
    const rows = SCORE_KEYS.filter(k => L.val(ms, k) != null).map(k => {
      const v = L.val(ms, k), lv = m.std && m.std[k] ? levelIn(m.std, k, v) : '', e = c.eq[k];
      let next = '';
      if (lv) { const i = L.LEVELS.indexOf(lv), up = i === -1 ? '底標' : i > 0 ? L.LEVELS[i - 1] : null; next = up ? `再 ${m.std[k][up] - v} 到${up}` : '頂標'; }
      return `<tr><th scope="row">${subj(k)}</th><td class="num"><b>${v}</b></td><td>${lv ? `${lv}${next && next !== '頂標' ? `<small>${next}</small>` : ''}` : `<span class="muted">${p && p.std && !p.std[k] ? '翰林沒公開這科五標' : '沒有這次的五標'}</span>`}</td><td class="num">${e ? `<b>${e.g}</b><small>前 ${Math.round(e.top)}%</small>` : `<span class="muted">${v}（沒換算）</span>`}</td></tr>`;
    }).join('') + (m.s.聽 ? `<tr><th scope="row">英聽</th><td><b>${m.s.聽}</b></td><td class="muted">—</td><td class="muted">—</td></tr>` : '');
    return `<section class="sec" id="srcSec"><div class="sec-hh wrap-hh">${hIcon('mock', `${esc(mName(m))}<small class="h-sub">${mdText(m.d)}</small>`)}<span class="sec-act"><button class="textbtn" type="button" data-mockedit="${m.id}">${icon('edit', 'sm')}修改</button><button class="textbtn danger" type="button" data-mockdel="${m.id}" aria-label="刪除 ${esc(mName(m))}">刪除</button></span></div>
      <p class="sub">${esc(stdSource(m))}</p>
      <div class="tablewrap"><table class="mvt"><thead><tr><th scope="col">科目</th><th scope="col">模考級分</th><th scope="col">這次的標</th><th scope="col">換算學測級分</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${gone.length ? `<p class="hint">${gone.map(subj).join('、')}你在學測級分設為沒考，這次的${gone.map(k => ABBR[k]).join('、')}不列出、也不算。</p>` : ''}
      ${c.own.length ? `<details class="ctx-how mv-how"><summary>${icon('info', 'sm')}模考怎麼看落點</summary><ol class="howto"><li><b>檢定</b>用你的模考級分比<b>這次模考的五標</b>：系要英文均標，就看你是不是到這次英文的均標。</li><li><b>倍率篩選</b>把模考級分照排名換算成學測級分，再跟 115 一階最低級分比（115 門檻是學測級分）。</li></ol></details>`
        : noteHTML('warn', `這次沒有五標：檢定只能拿模考級分比${esc(stdName())}，篩選也只能直接用模考級分，落點不準。按「修改」照成績單填這次的五標。`)}
    </section>`;
  }
  /** Live result of the chosen scores, so a change here shows its effect right away. */
  function resultCardHTML() {
    const c = cur();
    if (!hasScores(c.S)) return '';
    ensureUac();
    const P = U ? st.f.path : 'app', showA = P !== 'uac', showU = U && P !== 'app';
    const scope = scopeDepts(), n = {}, us = showU ? uScope() : [], m = {};
    scope.forEach(d => { const t = tierOf(d); n[t] = (n[t] || 0) + 1; });
    us.forEach(u => { const t = uTier(u); m[t] = (m[t] || 0) + 1; });
    const p = U ? pathCompare(scope, us) : null, [verdict, cls] = p && P === 'both' ? pathVerdict(p) : [];
    const nm = x => `${esc(schShort(x))} ${esc(x.n)}`;
    const lane = (t, sub, cnt, total, good, best) => `<div class="rc-lane"><div class="rc-h"><b>${t}</b><small>${sub}</small><span class="rc-g">${GOOD} <b class="num">${fmtN(good)}</b></span></div>
      ${total ? tierBarHTML(cnt, total, { label: t }) : ''}${best && best.length ? `<p class="rc-best">最搶手：${best.map(nm).join('、')}</p>` : ''}</div>`;
    const empty = `<p class="hint">${emptyScopeHTML()}</p>`;
    return `<section class="sec result-card">${hIcon('target', '落點分布')}<p class="sub">用「${esc(c.name)}」看${P === 'both' ? '兩條路：申請看一階，分發看學測＋分科總分' : P === 'app' ? '申請入學一階' : '分發：學測＋分科總分'}。</p>
      ${U ? `<div class="pathbar">${pathSegHTML()}</div>` : ''}
      ${scopeBarHTML(P === 'uac' ? us.length : scope.length)}
      ${!showA ? '' : scope.length ? lane('申請入學', `一階・${fmtN(scope.length)} 個系`, n, scope.length, p ? p.app.length : scope.filter(d => isGood(tierOf(d))).length, p && p.aBest) : empty}
      ${showU ? (hasAst() ? lane('分發入學', `學測＋分科・${fmtN(us.length)} 個系組`, m, us.length, p.uac.length, p.uBest) : `<div class="rc-lane"><div class="rc-h"><b>分發入學</b><small>學測＋分科</small></div><p class="hint">還沒選要考的分科（上面「分科成績」）。</p></div>`) : ''}
      ${verdict ? `<p class="pc-verdict ${cls}">${esc(verdict)}</p>${hasAst() ? `<p class="rc-cross">只有申請有機會 <b>${p.aOnly.length}</b> 個系・只有分發有機會 <b>${p.uOnly.length}</b> 個</p>
      <details class="rc-why" id="pathWhy" ${ui.whyOpen ? 'open' : ''}><summary>${icon('info', 'sm')}為什麼兩條路結果不一樣？</summary>${ui.whyOpen ? pathWhyHTML(scope, us) : ''}</details>` : ''}
      <details class="rc-why"><summary>${icon('info', 'sm')}兩條路怎麼選、你在考生裡排哪</summary><ul class="pc-why">
        <li><b>申請</b>：這裡只算一階。過了還有二階（審查資料、面試），看總成績；3 月就知道。</li>
        <li><b>分發</b>：只看分數（學測＋分科加權），沒有面試；分科 7/10 考、8/13 放榜，要多準備半年。</li>
        <li>申請錄取了想改考分科，要在 6/13 前聲明放棄。很多人兩條都準備：申請先試，沒上或不滿意再拚分科。</li></ul>
        <p class="sub">學測科目比 115 分發考生，分科比 115 分科考生；「約」是估計。</p>${standHTML()}</details>` : ''}
      <div class="rc-act"><button class="btn primary" type="button" data-tab="explore">${icon('search', 'sm')}看校系</button><button class="btn" type="button" data-tab="boost">${icon('boost', 'sm')}怎麼進步</button><button class="btn" type="button" data-act="reportOpen">${icon('doc', 'sm')}完整報告（可給 AI）</button></div></section>`;
  }
  /**
   * Why 申請 and 分發 disagree for these scores: what blocks each path, and what one 級分 more or less in each
   * subject does to each (a 檢定 cliff hits 申請 hard; 分發 adds subjects up, so one weak subject matters less).
   */
  function pathWhyHTML(scope, us) {
    const c = cur(), R0 = c.thS;
    const count = (m, k) => { m[k] = (m[k] || 0) + 1; };
    const aBlock = {}, uBlock = {};
    for (const d of scope) {
      const e = EV.get(d.c);
      if (!e || e.tier !== '不符') continue;
      if (!e.th.ok) thFailParts(e.th).forEach(x => count(aBlock, x.what + ' 檢定'));
      else count(aBlock, '沒考要篩選的科目');
    }
    for (const u of us) {
      const e = UEV.get(u.c);
      if (!e || e.tier !== '不符') continue;
      e.thFail.forEach(alts => count(uBlock, alts.map(a => (a.k === '聽' ? '英聽' : subj(a.k) + ' ') + a.t).join(' 或 ') + ' 檢定'));
      e.missing.forEach(k => count(uBlock, '沒考' + uName(k)));
    }
    const top = m => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const blockList = (m, none) => { const t = top(m); return t.length ? t.map(([k, n]) => `<li><span>${esc(k)}</span><b class="num">${fmtN(n)}</b></li>`).join('') : `<li class="muted">${none}</li>`; };
    // one 級分 up or down in each subject you took, on the scale you see (a 模考's own 級分)
    const goodA = R => { const x = atRaw(c, R); const o = { ...optsFor(c), thS: x.thS }; let n = 0; for (const d of scope) if (isGood(L.evaluate(d, x.S, o).tier)) n++; return n; };
    const goodU = R => { const x = atRaw(c, R); const M = L.scores60(x.S, astPlan(), UT); let n = 0; for (const u of us) if (isGood(L.evaluateUac(u, M, x.thS, c.std).tier)) n++; return n; };
    const a0 = scope.filter(d => isGood(tierOf(d))).length, u0 = us.filter(u => isGood(uTier(u))).length;
    const sgn = n => (n > 0 ? `<span class="delta up">+${n}</span>` : n < 0 ? `<span class="delta down">${n}</span>` : '<span class="muted">0</span>');
    const rows = SCORE_KEYS.filter(k => L.val(R0, k) != null).map(k => {
      const v = L.val(R0, k);
      const at = dv => { const w = v + dv; if (w < 1 || w > 15) return null; const R = { ...R0, [k]: String(w) }; return [goodA(R) - a0, goodU(R) - u0]; };
      return { k, v, dn: at(-1), up: at(1) };
    });
    // the subject where one 級分 moves the two paths furthest apart
    const gap = r => Math.max(...[r.dn, r.up].filter(Boolean).map(([a, u]) => Math.abs(a - u)));
    const big = rows.slice().sort((x, y) => gap(y) - gap(x))[0];
    let lead = '';
    if (big && gap(big) > 0) {
      const span = x => (x ? Math.abs(x[0] - x[1]) : -1);
      const down = span(big.dn) >= span(big.up), [a, u] = down ? big.dn : big.up, dir = down ? '少' : '多';
      const lv = c.mock ? levelIn(c.std, big.k, big.v) : levelOf(big.k, big.v);
      lead = `<p class="pw-lead">最敏感的是<b>${subj(big.k)}</b>（你 ${big.v} 級分${lv ? `，${lv}` : ''}）：${dir} 1 級分，申請${GOOD} ${a >= 0 ? '多' : '少'} <b>${Math.abs(a)}</b> 個、分發 ${u >= 0 ? '多' : '少'} <b>${Math.abs(u)}</b> 個。${Math.abs(a) > Math.abs(u) * 1.5 ? '申請的檢定常卡在某一標，掉一級分就整批過不了；分發看加權總分，一科少一點，別科可以補。' : Math.abs(u) > Math.abs(a) * 1.5 ? '這一科在分發的權重比較重（也影響你的分科估計），對分發影響比較大。' : ''}</p>`;
    }
    return `<div class="pw">${lead}
      <div class="pw-b"><div><h4>申請：擋住最多系的</h4><ul class="pw-l">${blockList(aBlock, '沒有被檢定擋住的系')}</ul></div>
      <div><h4>分發：擋住最多系組的</h4><ul class="pw-l">${blockList(uBlock, '沒有被檢定擋住的系組')}</ul></div></div>
      <h4>每科差 1 級分，${GOOD}的數目怎麼變</h4>
      <div class="tablewrap"><table class="pw-t"><thead><tr><th scope="col">科目</th><th scope="col">少 1 級分<small>申請／分發</small></th><th scope="col">多 1 級分<small>申請／分發</small></th></tr></thead><tbody>
      ${rows.map(r => `<tr><th scope="row">${subj(r.k)}<small>${r.v}</small></th><td>${r.dn ? `${sgn(r.dn[0])} ／ ${sgn(r.dn[1])}` : '—'}</td><td>${r.up ? `${sgn(r.up[0])} ／ ${sgn(r.up[1])}` : '—'}</td></tr>`).join('')}</tbody></table></div>
      <ul class="pc-why"><li><b>申請一階</b>：檢定＋倍率篩選，每一科都是一道關卡，一科沒到某一標就整個系過不了。</li>
        <li><b>分發</b>：學測和分科照權重加總，一科低可以用別科補；有設學測檢定的系組比申請少。</li>
        <li>分發還要看分科（7 月考），你選的估計或自己填的分數也會影響。</li></ul>
      <p class="hint">${c.mock ? `用${esc(c.name)}的級分和五標算。` : ''}只算目前篩選裡的校系。</p></div>`;
  }
  /** Each 學群: how many of its 系 you would likely pass (穩過＋應該過), the subjects its 一階 screens on, the most sought-after one you reach. */
  function groupFit() {
    const out = [];
    // the shared filters (地區, 公私立, …) apply; 學群 and 收藏／志願 do not, since this compares every 學群
    const f0 = st.f;
    st.f = { ...f0, groups: [], list: 'all' };
    const pool = baseFiltered();
    st.f = f0;
    for (const g of GROUPS) {
      if (g === '其他') continue;
      const ds = pool.filter(d => d.g.includes(g));
      if (ds.length < 5) continue;
      const good = ds.filter(d => isGood(tierOf(d)));
      const use = {};
      ds.forEach(d => L.screenSubjects(d).forEach(k => { use[k] = (use[k] || 0) + 1; }));
      const subjects = Object.entries(use).filter(([, n]) => n >= ds.length * 0.35).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
      // how well its 一階 subjects suit you: the 115 rank of your 級分 in each, weighted by how many of its 系 use it
      let w = 0, fit = 0;
      for (const [k, n] of Object.entries(use)) { const v = L.val(cur().S, k); const t = v == null ? 100 : L.topPercent(D.pct, [k], v); w += n; fit += n * (1 - (t ?? 100) / 100); }
      const best = good.slice().sort((a, b) => (L.selectivity(b) || 0) - (L.selectivity(a) || 0)).slice(0, 2);
      const share = good.length / ds.length, match = w ? fit / w : 0;
      out.push({ g, n: ds.length, good: good.length, share, match, score: share + match, subjects, best, hol: st.hol.filter(h => HOL_G[h].includes(g)) });
    }
    return out.sort((a, b) => b.hol.length - a.hol.length || b.score - a.score || b.good - a.good);
  }
  function quizCardHTML() {
    const r = quizResult(st.quiz), done = st.quiz.filter(x => x).length;
    if (r) return `<div class="qz-card"><span>興趣測驗結果 <b class="qz-code">${r.code.join('')}</b></span><button class="textbtn" type="button" data-act="quizOpen">看結果</button></div>`;
    return `<div class="qz-card"><span>沒做過興趣量表？<small>48 題，約 5 分鐘，不用上網</small></span><button class="btn sm${done ? '' : ' primary'}" type="button" data-act="quizOpen">${done ? `繼續（${done}/48）` : '開始測驗'}</button></div>`;
  }
  /** The 興趣測驗 dialog: one activity at a time, then the profile and the 3-letter code. */
  function renderQuiz() {
    const body = $('#qBody'), a = st.quiz;
    const r = quizResult(a);
    if (r && !ui.qRedo) {
      const name = k => HOL.find(h => h[0] === k)[1];
      const max = 5;
      const note = r.top < 2.6 ? '大部分活動你都不太喜歡：興趣可能還沒定型，或題目離你的生活太遠。可以多看幾個學群，或找輔導室做正式量表。'
        : r.spread < 0.6 ? '幾種興趣分數差不多，沒有特別突出的一型：前三碼可以參考，但不用太在意順序。' : '';
      body.innerHTML = `<p class="qz-lead">你的興趣代碼</p><p class="qz-big">${r.code.map(k => `<span><b>${k}</b>${name(k)}</span>`).join('')}</p>
        <div class="qz-bars">${QK.slice().sort((x, y) => r.m[y] - r.m[x]).map(k => `<div class="qz-bar${r.code.includes(k) ? ' on' : ''}"><span class="qk"><b>${k}</b>${name(k)}</span><span class="qt"><i style="width:${((r.m[k] - 1) / (max - 1)) * 100}%"></i></span><span class="qn num">${r.m[k].toFixed(1)}</span></div>`).join('')}</div>
        <p class="hint">每一型 8 題的平均（1＝很不喜歡，5＝很喜歡）。${HOL.map(([k, n, d]) => `${k} ${n}：${d}`).join('；')}。</p>
        ${note ? `<p class="qz-note">${note}</p>` : ''}
        <div class="qz-act"><button class="btn primary" type="button" data-act="quizApply">${icon('check', 'sm')}用 ${r.code.join('')} 排學群</button><button class="btn" type="button" data-act="quizRedo">重做</button></div>
        <p class="src">題目：Armstrong, Allison & Rounds (2008) 公開的 RIASEC Markers（非商業使用），中文是本站翻譯，沒有台灣常模。結果只是探索的起點，不能取代學校的大考中心興趣量表。</p>`;
      return;
    }
    const i = Math.max(0, Math.min(47, ui.qi ?? a.findIndex(x => !x)));
    ui.qi = i;
    const it = QITEMS[i];
    requestAnimationFrame(() => { ui.qDir = 0; });
    body.innerHTML = `<div class="qz-prog" role="progressbar" aria-valuemin="0" aria-valuemax="48" aria-valuenow="${i + 1}"><i style="width:${((i + 1) / 48) * 100}%"></i></div>
      <p class="qz-n num">${i + 1} / 48</p>
      <div class="qz-q${ui.qDir ? (ui.qDir > 0 ? ' fwd' : ' back') : ''}"><p class="qz-lead">你喜不喜歡做這件事？</p><p class="qz-item">${esc(it.t)}</p>
      <div class="qz-opts" role="group" aria-label="${esc(it.t)}">${QSCALE.map(([v, l]) => `<button type="button" class="qz-o" data-qans="${v}" aria-pressed="${a[i] === v}">${l}${icon('check', 'sm')}</button>`).join('')}</div></div>
      <p class="hint">不用考慮自己會不會做、薪水多少、要念多少書，只看你喜不喜歡。</p>
      <div class="qz-nav"><button class="textbtn" type="button" data-act="quizBack" ${i ? '' : 'disabled'}>${icon('chevR', 'sm')}上一題</button>${a[i] ? `<button class="textbtn" type="button" data-act="quizNext">下一題</button>` : ''}</div>`;
  }
  function openQuiz() {
    ui.qRedo = false; ui.qi = undefined;
    renderQuiz();
    const dlg = $('#quiz');
    if (!dlg.open) dlg.showModal();
  }
  /** Your strongest subjects (by 115 rank) and the 學群 that fit them: for students not sure what to study. */
  function strengthHTML() {
    const c = cur();
    if (!hasScores(c.S)) return '';
    const ranks = SCORE_KEYS.map(k => { const v = L.val(c.S, k); return v == null ? null : { k, v, top: L.topPercent(D.pct, [k], v) }; }).filter(x => x && x.top != null).sort((a, b) => a.top - b.top);
    const cls = t => (t <= 25 ? 'hi' : t <= 50 ? 'mid' : 'lo');
    const strong = new Set(ranks.filter(x => x.top <= 25 || x === ranks[0]).map(x => x.k));
    const gs = groupFit(), shown = ui.gxAll ? gs : gs.slice(0, 6);
    const maxShare = Math.max(0.01, ...gs.map(x => x.share));
    const row = x => `<li><button type="button" class="gx" data-gx="${esc(x.g)}">
        <span class="gx-h"><b>${esc(x.g)}</b>${x.hol.length ? `<span class="gx-hol">符合興趣 ${x.hol.join('')}</span>` : ''}<span class="gx-n"><b class="num">${x.good}</b><small>/ ${x.n} 系</small></span></span>
        <span class="gx-bar"><i style="width:${((x.share / maxShare) * 100).toFixed(1)}%"></i></span>
        <span class="gx-m">${x.subjects.length ? `<span class="gx-s">看重 ${x.subjects.map(k => `<i class="${strong.has(k) ? 'on' : ''}">${ABBR[k]}</i>`).join('')}</span>` : ''}${x.best.length ? `<span class="gx-b">最搶手：${x.best.map(d => esc(schShort(d) + ' ' + d.n)).join('、')}</span>` : ''}</span>
      </button></li>`;
    return `<section class="sec" id="strengthSec">${hIcon('compass', '還不確定讀什麼？')}<p class="sub">從強項看哪些學群最有機會。按一個學群，列出你${GOOD}的系，去年門檻高的在前。${(l => (l ? `照你的篩選：${esc(l)}。` : ''))(scopeLabel({ ...st.f, groups: [], list: 'all' }))}</p>
      <div class="str-rank" aria-label="各科在 115 考生的排名">${ranks.map(x => `<span class="sr-c ${cls(x.top)}"><b>${subj(x.k)}</b><small>${fmtTop(x.top)}</small></span>`).join('')}</div>
      <div class="hol"><span class="hol-l">興趣量表結果（可略過，選 1–3 個）</span><div class="hol-c" role="group" aria-label="興趣代碼">${HOL.map(([h, n, d]) => `<button type="button" class="chip" data-hol="${h}" aria-pressed="${st.hol.includes(h)}" title="${d}"><b>${h}</b>${n}</button>`).join('')}</div>
        ${quizCardHTML()}
        <p class="hint">高一做過大考中心興趣量表的話，直接選結果的前 1–3 碼。<a href="${COLLEGO}" target="_blank" rel="noopener">ColleGo! 有各興趣代碼適合的學類</a>（要上網）。</p></div>
      <ol class="gxs">${shown.map(row).join('')}</ol>
      ${gs.length > 6 ? `<button class="textbtn gx-more" type="button" data-act="gxAll">${ui.gxAll ? '收起' : `看全部 ${gs.length} 個學群`}</button>` : ''}
      <p class="hint">數字是${GOOD}的系／學群的系數，條越長比例越高。「看重」是這個學群一階最常篩的科目，亮的是你的強項。興趣和學群的對應只是大致參考。</p></section>`;
  }
  function renderScores() {
    const el = $('#scores'), m = srcMock();
    const head = `<header class="page-h"><div><h1 class="hi">${icon('mock')}<span>我的成績</span></h1><p>選一份成績，找校系、志願和怎麼進步都會用它看落點。116 學測成績 2/25 公布前，可以用模考或目標分數。</p></div></header>`;
    const editor = ui.mf ? mockFormHTML() : m ? mockViewHTML(m) : `<section class="sec score-panel" id="scorePanel">${scoreEditor()}</section>`;
    keepFocus(el, () => {
      el.innerHTML = head + `<section class="sec">${hIcon('sliders', '看落點用哪一份成績')}<p class="sub">按一下換。每次模考存一筆，就能比較。</p>${sourceCardsHTML()}</section>` + editor + (ui.mf ? '' : (U && hasScores(cur().S) ? astEditorHTML() : '') + resultCardHTML() + strengthHTML()) + (st.mocks.length && !ui.mf ? trendHTML(scopeDepts()) : '') + `<section class="sec">${mockRefHTML()}</section>`;
    });
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
    const s = st.scores, any = hasScores(s);
    const years = Object.keys(D.std).sort().reverse().map(y => `<option value="${y}" ${y === st.stdYear ? 'selected' : ''}>${y} 學年度學測五標</option>`).join('') + `<option value="custom" ${st.stdYear === 'custom' ? 'selected' : ''}>自訂（例如 116 五標公布後）</option>`;
    return `<div class="sec-hh">${hIcon('edit', '學測級分')}${any || s.聽 ? '<button class="textbtn" type="button" data-act="clearScores">全部清除</button>' : ''}</div>
      <p class="sub">${any ? '點或拖曳格子改級分，下面的結果會跟著變。' : '點格子填級分：目標分數也可以。沒考的科目空著。'}格子下的「頂前均後底」是${stdName()}。</p>
      <div class="sliders">${SCORE_KEYS.map(k => sliderHTML('slider', k, subj(k), L.val(s, k) || 0, 15)).join('')}
        <div class="srow listen-row"><span class="srow-l" id="lab-listen">英聽</span>${listenHTML(s.聽)}</div>
      </div>
      <details class="more" id="moreScores" ${ui.more ? 'open' : ''}><summary>${icon('chevR', 'sm')}APCS、檢定用哪一年的五標</summary><div class="more-b">
        ${sliderHTML('slider', '識', 'APCS 觀念', L.val(s, '識') || 0, 5)}
        ${sliderHTML('slider', '實', 'APCS 實作', L.val(s, '實') || 0, 5)}
        <label class="field">檢定用五標<span class="selectbox"><select id="stdYear">${years}</select>${icon('chevD', 'sm')}</span></label>
        ${st.stdYear === 'custom' ? customStdHTML() : ''}
        <p class="hint">116 五標 2027/2/25 公布，先用${st.stdYear === 'custom' ? '自訂的' : ` ${st.stdYear} 年的`}。數A、數B 都列檢定時過一科就好。模考的五標在每次模考裡，不用填在這裡。</p>
      </div></details>`;
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
    const h = `<div class="filter-h"><h2>篩選校系</h2><button class="textbtn" type="button" data-act="resetFilters" ${n ? '' : 'hidden'}>${icon('reset', 'sm')}重設</button></div>
      <p class="hint fnote">找校系、我的成績、怎麼進步都用這組篩選。</p>
      <div class="fsec"><h3>範圍</h3>${listSegHTML()}</div>
      <div class="fsec"><h3>學群${f.groups.length ? '<button class="textbtn" type="button" data-act="groupsAll">全部學群</button>' : ''}</h3><div class="chips">${GROUPS.map(g => chip(g, f.groups.includes(g), `data-group="${g}"`, gc[g] || 0)).join('')}</div></div>
      <div class="fsec"><h3>學校</h3><div class="chips" role="group" aria-label="地區">${REGIONS.map(r => chip(regionLabel(r), f.regions.includes(r), `data-region="${r}"`, rc[r] || 0)).join('')}</div>
        <div class="segctl fseg" role="group" aria-label="公私立">${[['all', '公私立都要'], ['pub', '公立'], ['pri', '私立']].map(([k, l]) => `<button type="button" data-own="${k}" aria-pressed="${f.own === k}">${l}${k !== 'all' ? `<span class="muted num"> ${oc[k] || 0}</span>` : ''}</button>`).join('')}</div></div>
      <div class="fsec"><h3>一階：學測怎麼篩</h3>
        <p class="fsub" id="skipLab">不要用到這些科目（檢定或倍率篩選）</p><div class="chips" role="group" aria-labelledby="skipLab">${SKIP_SUBJ.map(([k, l]) => chip(l, f.skip.includes(k), `data-skip="${k}"`, kc[k])).join('')}</div>
        <p class="hint">數A、數B 擇一檢定的系，兩科都選才隱藏。</p>
        <p class="fsub" id="comboLab">只看用這組科目篩選的</p>${comboChips()}
        <p class="hint">${hasScores() ? '綠字是你在這組科目排 115 考生前幾 %，最強的排前面。' : '有成績後會標出你在每組科目的排名。'}</p>
        ${hasScores() ? `<label class="fcheck"><input type="checkbox" id="untakenBox" ${f.untaken ? 'checked' : ''}> 也列出用到我沒考科目的系<span class="muted num"> ${nUntaken}</span></label>` : ''}</div>
      <div class="fsec"><h3>二階：怎麼甄選</h3>
        <p class="fsub" id="satLab">學測佔二階總成績</p><div class="chips" role="group" aria-labelledby="satLab">${SAT.map(([k, l]) => chip(l, f.sat === k, `data-sat="${k}"`, sc[k] || 0)).join('')}</div>
        <p class="fsub" id="ivLab">甄試方式</p><div class="chips" role="group" aria-labelledby="ivLab">${ST2.map(([k, l]) => chip(l, f.st2.includes(k), `data-st2="${k}"`, xc[k] || 0)).join('')}</div></div>
      <div class="fsec"><details id="catsBox" ${ui.catsOpen || catsChanged() ? 'open' : ''}><summary>${icon('chevR', 'sm')}特殊組別${catsChanged() ? '（已變更）' : ''}</summary><div class="chips">${CATS.map(([k, l]) => chip(l, f.cats.includes(k), `data-cat="${k}"`)).join('')}</div><p class="hint">限特定身分或要考術科的組別，預設隱藏。</p></details></div>
`;
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
    if (f.list !== 'all') out.unshift(af(LIST_NAME[f.list], 'data-list="all"'));
    if (out.length > 1) out.push('<button class="textbtn" type="button" data-act="resetAll">全部清除</button>');
    $('#activeFilters').innerHTML = out.join('');
  }

  // ------------------------------------------------------------------ overview (落點分布)
  function tierBarHTML(c, total, opts) {
    const W = (opts && opts.width) || 600;
    return `<div class="tierbar${opts && opts.small ? ' sm' : ''}" role="img" aria-label="${esc((opts && opts.label ? opts.label + '：' : '') + TIERS.map(t => `${TL[t]} ${c[t] || 0} 個`).join('，'))}">${TIERS.filter(t => c[t]).map(t => {
      const share = c[t] / (total || 1);
      const fits = !(opts && opts.small) && share * W >= String(c[t]).length * 8 + 16;
      const off = opts && opts.tiers ? !opts.tiers.includes(t) : false;
      return `<span class="tb-s ${TC[t]}${off ? ' off' : ''}" style="flex-grow:${c[t]}" title="${TL[t]} ${c[t]} 個（${Math.round(share * 100)}%）">${fits ? c[t] : ''}</span>`;
    }).join('')}</div>`;
  }
  /** First visit: the whole tool in three steps. */
  const startHTML = () => `<div class="start"><h2>三步驟選系</h2><ol class="steps3">
      <li><b>輸入成績</b><span>學測級分、模考或目標分數。模考會用它自己的五標。</span></li>
      <li><b>找校系</b><span>每個系標出落點（穩過、應該過、邊緣、機會低），按 ☆ 收藏。</span></li>
      <li><b>排志願</b><span>最多 6 個，檢查穩衝搭配、甄試撞期和要交的資料。</span></li></ol>
    <button class="btn primary" type="button" data-tab="scores">${icon('edit', 'sm')}先輸入成績</button><span class="hint">不輸入也可以先看各系的條件。</span></div>`;
  const pathSegHTML = () => `<div class="segctl" role="group" aria-label="看哪條路">${[['both', '申請＋分發'], ['app', '只看申請'], ['uac', '只看分發']].map(([k, l]) => `<button type="button" data-path="${k}" aria-pressed="${st.f.path === k}">${l}</button>`).join('')}</div>`;
  function renderOverview(base) {
    const el = $('#overview');
    const scope = scopeLabel();
    const p = U ? st.f.path : 'app';
    const outCats = p === 'uac' ? 0 : baseFiltered('cats').length - baseFiltered().length;
    const nU = base.filter(d => d.isU).length;
    const path = U ? `<div class="pathbar">${pathSegHTML()}
      <p class="hint">${p === 'both' ? `同一個系看申請一階和分發（學測＋分科）兩條路，標籤用比較有機會的那條${nU ? `；另有 ${fmtN(nU)} 個只有分發的系組` : ''}。` : p === 'uac' ? '分發只看學測＋分科加權總分，跟 115 最低錄取分數比。一階、二階的篩選只適用申請。' : '只看申請入學一階。'}${p !== 'app' && hasScores() && !hasAst() ? ' <button class="textbtn" type="button" data-tab="scores">還沒選分科，到我的成績選</button>' : ''}</p></div>` : '';
    const head = `${path}<div class="ov-t"><h2><b class="num">${fmtN(base.length)}</b> 個${p === 'uac' ? '分發系組' : '校系'}${scope ? ' · ' + esc(scope) : ''}</h2>${outCats > 0 ? `<button class="textbtn ov-note" type="button" data-act="showCats">另有 ${fmtN(outCats)} 個特殊組別沒列出</button>` : ''}</div>`;
    if (!hasScores()) {
      el.innerHTML = `${startHTML()}<div class="ov-h">${head}</div>`;
      return;
    }
    const c = {};
    base.forEach(d => { const t = xTier(d); c[t] = (c[t] || 0) + 1; });
    // the bar's width only decides which counts fit inside; reading it now would force a layout of the whole page
    const W = ui.ovW || Math.max(280, Math.min(innerWidth - 64, 820));
    requestAnimationFrame(() => { ui.ovW = el.clientWidth || ui.ovW; });
    el.innerHTML = `<div class="ov-h">${head}</div>
      ${tierBarHTML(c, base.length, { width: W, tiers: st.f.tiers, label: '落點分布' })}
      <div class="legend" role="group" aria-label="一階過得了嗎？按一下隱藏或顯示">${TIERS.map(t => `<button type="button" class="lg ${TC[t]}" data-tier="${t}" aria-pressed="${st.f.tiers.includes(t)}" title="${esc(TIER_SHORT[t])}">${sigHTML(t)}${TL[t]}<b>${c[t] || 0}</b></button>`).join('')}</div>
      <details class="tierhelp" id="tierHelp" ${ui.helpOpen ? 'open' : ''}><summary>${icon('info', 'sm')}這些標籤怎麼判斷？</summary><ul class="tierdefs">${TIERS.map(t => `<li>${pillHTML(t)}<span>${esc(TIER_HELP[t])}</span></li>`).join('')}</ul><p class="hint">標籤也是篩選：按一下隱藏或顯示。只是估計，不是錄取機率。</p>${U ? `<p class="hint"><b>分發</b>：學測、分科都換成 60 級分照權重加總，比 115 最低錄取分數。每科平均多 ${L.UAC_SAFE} 級分以上＝穩過，過 115 最低＝應該過，差 ${-L.UAC_REACH} 以內＝邊緣；檢定沒過或沒考要用的科目＝過不了；術科、116 新系組＝看不出。116 最低登記標準 7/29 才公布，沒算。</p>` : ''}</details>
      ${st.f.groups.length ? '' : `<button class="textbtn ov-explore" type="button" data-act="goStrength">${icon('compass', 'sm')}不知道選哪個學群？從強項和興趣看</button>`}`;
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
        // you took only one of them: it is the one that has to reach its 標
        what: taken.length === 1 ? `${subj(taken[0].k)} ${taken[0].label}` : same ? `數A或數B ${either[0].label}` : either.map(i => `${ABBR[i.k]} ${i.label}`).join(' 或 '),
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
        const head = `<span class="rv-subj">${esc(partsLabel(s.parts))}</span><span class="rv-num"><span class="lab">去年最低</span><b>${s.v}</b><span class="lab">你</span><b>${s.mine}</b></span>${delta}`;
        return verdict(e.tier, head, notes.length ? `<div class="rv-note">${esc(notes.join('・'))}</div>` : '');
      }
    }
    return verdict(e.tier, `<span class="rv-text">${esc(tw(e.reasons[0] || ''))}</span>`);
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
  /** 二階 in two facts: how much 學測 counts, and the biggest other part (the full mix is in the detail). */
  function stage2Key(d) {
    const parts = L.stage2(d), sat = parts.find(x => x.kind === 'sat');
    const big = parts.filter(x => x.kind !== 'sat').sort((a, b) => b.p - a.p)[0];
    return [sat ? `學測 ${sat.p}%` : '不計學測', big ? `${shortItem(big.n)} ${big.p}%` : ''].filter(Boolean);
  }
  function metaHTML(d) {
    // Weekdays live in the detail drawer; the row keeps dates short.
    const facts = [['cal', daysText(d).replace(/\([一二三四五六日]\)/g, '')], ['pin', d.city], ['users', `名額 ${d.q}`]].filter(x => x[1]);
    const s2 = L.stage2(d).length ? `<span class="rm-s2"><span class="lab">二階</span>${stage2Key(d).map(x => `<span class="pt${x === '不計學測' ? ' nosat' : ''}">${esc(x)}</span>`).join('')}</span>` : '';
    return `<div class="rm-facts">${facts.map(([ic, x]) => `<span>${icon(ic, 'xs')}${esc(x)}</span>`).join('')}${s2}</div>`;
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
    for (const w0 of e.warnings) {
      const w = tw(w0);
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
    return `<li class="row" data-code="${d.c}" data-open="${d.c}">${schBadge(d)}
      <button class="r-title" type="button" data-open="${d.c}"><span class="sch">${esc(sch(d))}</span><span class="dn">${nameHTML(d.n)}</span></button>
      <div class="r-act">${pi >= 0 ? `<span class="inplan">第 ${pi + 1} 志願</span>` : ''}<button class="star" type="button" data-fav="${d.c}" aria-pressed="${fav}" aria-label="${fav ? '取消收藏' : '收藏'}：${esc(name)}" title="${fav ? '取消收藏' : '收藏'}">${icon('star')}</button></div>
      <div class="r-cmp${st.f.path === 'both' && UTWIN[d.c] && e ? ' two' : ''}">${st.f.path === 'both' && UTWIN[d.c] && e ? '<span class="pl">申請</span>' : ''}${e ? cmpHTML(d, e) : reqHTML(d)}</div>
      ${st.f.path === 'both' && e ? uLineHTML(d) : ''}
      ${warn}
      <div class="r-meta">${metaHTML(d)}</div>
    </li>`;
  }
  function renderList(base) {
    const has = hasScores();
    const list = has ? base.filter(d => st.f.tiers.includes(xTier(d))) : base;
    const s = sorted(list);
    ui.visible = s.length;
    const group = has && st.f.sort === 'chance';
    const counts = {};
    if (group) s.forEach(d => { const t = xTier(d); counts[t] = (counts[t] || 0) + 1; });
    let h = '', prev = null;
    for (const d of s.slice(0, ui.shown)) {
      const t = xTier(d);
      if (group && t !== prev) { h += `<li class="ghead" aria-hidden="true">${pillHTML(t)}<span><b>${counts[t]}</b> 個 · ${esc(TIER_SHORT[t])}</span></li>`; prev = t; }
      h += d.isU ? uRowHTML(d) : rowHTML(d);
    }
    if (!h) {
      const hiddenTiers = has && base.length > 0;
      h = `<li class="empty"><b>沒有符合的校系</b><span>${hiddenTiers ? '這些落點標籤都被隱藏了，或篩選太嚴。' : '試著放寬篩選或換個關鍵字。'}</span><button class="btn sm" type="button" data-act="${hiddenTiers ? 'showTiers' : 'resetAll'}">${hiddenTiers ? '顯示所有落點' : '清除所有篩選'}</button></li>`;
    }
    $('#list').innerHTML = h;
    // what each order means, in a few words under the menu
    const SORT_NOTE = { chance: '穩過在前；同一級裡去年門檻高的在前', select: '去年門檻高的在前：越前面越熱門', selectLow: '去年門檻低的在前：越前面越好進', sat: '二階總成績裡學測佔比高的在前', satLow: '二階總成績裡學測佔比低的在前', date: '到校甄試早的在前', quota: '名額多的在前', code: '照甄選會校系代碼' };
    const sortName = SORT_NOTE[st.f.sort] || ($('#sort').selectedOptions[0] ? $('#sort').selectedOptions[0].textContent : '');
    const hidden = has ? TIERS.filter(t => !st.f.tiers.includes(t)) : [];
    const nUntaken = has && !st.f.untaken && st.f.path !== 'uac' ? baseFiltered('untaken').filter(d => usesUntaken(d) && st.f.tiers.includes(tierOf(d))).length : 0;
    const untakenNote = nUntaken ? `<button class="textbtn" type="button" data-act="showUntaken">＋${fmtN(nUntaken)} 個用到沒考科目</button>` : '';
    $('#listbar').innerHTML = `<span>顯示 <b class="num">${fmtN(s.length)}</b> 個${hidden.length ? `（隱藏了${hidden.map(t => TL[t]).join('、')}）` : ''}${untakenNote ? ' ' + untakenNote : ''}</span><span class="lb-sort">${esc(sortName)}</span>`;
    $('#more').innerHTML = s.length > ui.shown ? `<button class="btn" type="button" data-act="more">再顯示 ${Math.min(PAGE, s.length - ui.shown)} 個（還有 ${fmtN(s.length - ui.shown)} 個）</button>` : '';
    if (ui.sheet) $('#sheetDone').textContent = `看 ${fmtN(s.length)} 個結果`;
  }
  function renderExplore() {
    if ($('#q').value !== st.f.q && document.activeElement !== $('#q')) $('#q').value = st.f.q;
    $('#clearQ').hidden = !st.f.q;
    $('#sort').value = st.f.sort;
    // first visit: the start card says what to do, so the empty 落點依據 bar waits until there are scores
    keepFocus($('#ctxExplore'), () => { $('#ctxExplore').innerHTML = hasScores() ? ctxBarHTML() : ''; });
    const base = exploreBase();
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
    const c = cur();
    const th = L.checkThreshold(d, c.thS, c.std);
    if (!th.items.length) return stepHTML('', '檢', '檢定', '<p class="step-d">不設檢定。</p>');
    const has = hasScores() || !!c.thS.聽;
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
    return stepHTML(cls, has ? icon(th.ok ? 'check' : 'x') : '檢', `檢定<small>${c.mock ? `你的模考級分比${esc(c.stdName)}` : `用${esc(c.stdName)}換算`}</small>`, `<div class="reqs">${rows.join('')}</div>${risk}`);
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
    const cmp = e && e.cmp && e.cmp.stages ? e.cmp : L.compare116(d, cur().S, D.pct);
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
        const rank = has && s.topCut != null && s.topMine != null ? rankBar(s.topMine, s.topCut) : '';
        if (!rank && !s.apcs) { const p = L.topPercent(D.pct, s.parts, s.v); if (p != null) notes.push(`門檻是 115 考生${fmtTop(p)}`); }
        return stepHTML(cls, no, title, `<div class="reqs"><div class="req"><span class="what">去年最低 ${s.v}${unit}</span>${you}</div></div>${rank}${notes.length ? `<p class="step-d">${esc(notes.join('。'))}</p>` : ''}`);
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
    const cmp = e && e.cmp && e.cmp.stages ? e.cmp : L.compare116(d, cur().S, D.pct);
    let h = `<section class="d-sec">${hIcon('funnel', '第一階段：一階篩選', 'h3', '<small>檢定 → 倍率篩選 → 同級分超額篩選</small>')}`;
    const arts = d.arts ? d.arts.items.filter(i => i.i && i.i !== '--').map(i => `<span class="tagc">${esc(i.i)}${i.t ? ' 檢定' + esc(i.t) : ''}${i.m != null ? ' 倍率' + esc(i.m) : ''}</span>`).join('') : '';
    // the steps below already list each 學測 stage; say it here only when 術科 also screens, or nothing does
    if (arts || !plan.length) h += `<div class="plan116"><span>116 倍率篩選</span>${plan.length ? plan.map((p, i) => `<span class="tagc">${i + 1}. ${esc(partsLabel(p.parts))} × ${p.m}</span>`).join('') : '<span class="tagc">不篩學測</span>'}${arts}</div>`;
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
        h += `<details class="fold chg">${'<summary>' + icon('alert', 'sm') + '116 的篩選跟 115 不一樣' + icon('chevD', 'sm') + '</summary>'}<div class="long">${esc(parts.join('；'))}。下面每一關只跟 115 用同樣科目篩選的門檻比。\n115 是：${esc(was)}</div></details>`;
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
    課程學習成果: '從學習歷程資料庫挑最多 3 件，有哪幾類就挑哪幾類',
    多元表現: '從學習歷程資料庫挑最多 10 件，有哪幾類就挑哪幾類；另寫綜整心得 N（800 字、3 張圖以內）',
    學習歷程自述: '自己寫，列出的幾項都寫到，做成一個 PDF 上傳',
    其他: '自己做成一個 PDF，內容依各系規定',
  };
  const codeChip = (c, t) => { const h = c && HAVE_CODES.includes(c) && st.have.includes(c); return `<span class="code${h ? ' have' : ''}"${h ? ' title="你有了"' : ''}>${c ? `<b>${esc(c)}</b>` : ''}${esc(t)}${h ? icon('check', 'xs') : ''}</span>`; };
  function reviewHTML(d) {
    const gs = L.reviewGroups(d.rv);
    if (!gs.length) return '';
    return `<h4 class="d-h4">要交的審查資料</h4><p class="hint rg-note">列出的是這個系會看的類別，不用每一類都有。挑最能代表你、跟這個系有關的；字數和必交項目以「審查資料說明」為準。</p><div class="rgs">${gs.map(g => `<div class="rg"><p class="rg-h"><b>${esc(g.g)}</b>${REVIEW_HOW[g.g] ? `<span>${esc(REVIEW_HOW[g.g])}</span>` : ''}</p><div class="codes">${(g.g === '其他' ? g.items.map(it => codeChip(it.c, it.t)) : g.codes.map(c => codeChip(c, REVIEW[c] || ''))).join('')}</div></div>`).join('')}</div>`;
  }
  const foldHTML = (title, text) => `<details class="fold"><summary>${icon('chevR', 'sm')}${esc(title)}</summary><div class="long">${esc(text)}</div></details>`;
  function stage2HTML(d) {
    const parts = L.stage2(d);
    const sat = hasScores() ? L.satShare(d, cur().S) : null;
    let h = `<section class="d-sec">${hIcon('users', '第二階段：總成績怎麼算', 'h3', '<small>116 校系分則</small>')}<p class="s2lead">${stage2Lead(d)}</p>`;
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
      const more = [...e.reasons.slice(1).map(tw), ...e.warnings.map(tw)];
      const tags = warnTags(e);
      h += `<div class="verdict ${TC[e.tier]}"><div class="v-top">${pillHTML(e.tier, 'lg2')}<div><p class="v-t">${esc(TIER_SHORT[e.tier])}</p><p class="v-src">一階過得了嗎？用「${esc(cur().name)}」看</p></div></div>
        ${e.reasons[0] ? `<p class="v-why">${esc(tw(e.reasons[0]))}</p>` : ''}
        ${more.length ? `<details class="v-more"><summary>${icon('alert', 'sm')}<span>${tags.length ? esc(tags.join('・')) : `還有 ${more.length} 件事`}</span>${icon('chevD', 'sm')}</summary><ul>${more.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}</div>`;
    } else {
      h += `<div style="margin-top:18px">${noteHTML('info', '輸入成績後，這裡會逐關比較你和 115 的門檻，判斷落點。 <button class="textbtn" type="button" data-tab="scores">去輸入成績</button>')}</div>`;
    }
    h += stage1HTML(d, e) + stage2HTML(d);
    const et = entranceText(d.r115);
    if (et) h += `<section class="d-sec">${hIcon('history', '115 錄取後統一分發', 'h3', '<small>參考</small>')}<p style="font-size:14.5px">${esc(et)}。</p><p class="hint" style="margin-top:6px">遞補越深，代表越多錄取的人最後選了別的系，備取比較有機會。</p></section>`;
    h += uacTwinHTML(d);
    const ex = Object.entries(d.extra || {}).map(([k, v]) => ({ indigenous_extra: '原住民外加', offshore_extra: '離島外加', vision_extra: '願景計畫外加' }[k] + ' ' + v));
    h += `<section class="d-sec">${hIcon('info', '備註', 'h3')}<div class="long">${esc(d.notes || '—')}</div>
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
    $('#dTitle').innerHTML = nameHTML(d.n);
    $('#dBadge').innerHTML = schBadge(d, 'lg');
    $('#dMeta').innerHTML = [d.c, d.city, isPub(d) ? '公立' : '私立', d.g.join('、')].map(x => `<span class="pt">${esc(x)}</span>`).join('');
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
      if (c('不符')) ck('bad', `${c('不符')} 個「過不了」`, '檢定沒過或沒考要用的科目，一定進不了一階，建議換掉。');
      else ck('ok', '沒有一定進不了的志願', '每個志願都通過檢定、也考了要篩選的科目。');
      if (!c('穩') && !c('適中')) ck('bad', '沒有「穩過」或「應該過」', '如果一階全部沒過，就只剩分科測驗。建議至少放 1–2 個穩過的。');
      else if (!c('穩')) ck('warn', '沒有「穩過」的志願', '很多學長姐會留 1 個保底，避免一階全落。');
      else ck('ok', `有 ${c('穩')} 個「穩過」保底`, '');
      if (c('衝') + c('難') >= 4) ck('warn', `${c('衝') + c('難')} 個是「邊緣」或「機會低」`, '大約 2 個穩過、2 個應該過、2 個邊緣比較安全。');
      if (c('穩') >= 4) ck('warn', `${c('穩')} 個都是「穩過」`, '可能浪費機會。考慮把 1–2 個換成更想讀、但要拚一下的系。');
      if (c('無資料')) ck('info', `${c('無資料')} 個「看不出」`, '去年沒有能比的門檻，點進去看原因。');
    } else ck('info', '輸入成績才能檢查穩衝搭配', '在「我的成績」填學測級分（或模考、目標分數）。');
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
    if (pick.length) ck('bad', '同一系的組「限擇一組報名」', `<p>只能報其中一組，違反會被取消該校所有申請：</p><ul>${pick.map(a => `<li>${a.map(d => `${esc(schShort(d))} ${nameHTML(d.n)}`).join('、')}</li>`).join('')}</ul>`);
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
      return `<li class="${clash ? 'clash' : ''}${past ? ' past' : ''}"><div class="d">${m}/${d}<small>週${wd}</small>${clash ? '<small class="clash-t">撞期</small>' : ''}</div><div class="evs">${xs.map(x => `<div class="ev"><span class="tag ${x.cls}">${x.kind}</span><span>${esc(x.t)}</span></div>`).join('')}</div></li>`;
    }).join('')}</ol>`;
  }
  // ------------------------------------------------------------------ 二階準備 (plan page)
  const kindCls = k => (k === 'sat' ? 'k-sat' : k === 'review' ? 'k-rev' : 'k-exam');
  const compBar = d => `<div class="cbar" aria-hidden="true">${L.stage2(d).map(x => `<span class="${kindCls(x.kind)}" style="flex-grow:${x.p}"></span>`).join('')}</div>`;
  const compCap = d => (d.sp ? '' : '<span class="nosat">不計學測</span>') + L.stage2(d).map(x => `<span><i class="sw ${kindCls(x.kind)}"></i>${esc(x.n)} ${x.p}%</span>`).join('');
  const REVIEW_ORDER = ['修課紀錄', '課程學習成果', '多元表現', '學習歷程自述'];
  // the 學習歷程 a student can tick, by how they are handed in
  const HAVE_GROUPS = [['課程學習成果', 'BCDE', '上傳到學習歷程資料庫的'], ['多元表現', 'FGHIJKLMN', 'N 綜整心得申請時自己寫'], ['學習歷程自述', 'OPQ', '申請時自己寫，寫好就勾']];
  const WRITE = new Set(['N', 'O', 'P', 'Q']);
  /**
   * 我的學習歷程: tick what you have, then see what your 志願 (or 收藏) will look at that you do not have yet.
   * 課程學習成果 and 多元表現 list the kinds a 系 reads (any of them will do); what you write yourself (N–Q) is asked for.
   */
  function haveHTML(P) {
    const H = new Set(st.have), list = P.length ? P : st.fav.map(c => BY_CODE[c]).filter(Boolean);
    const G = list.map(d => L.reviewGroups(d.rv));
    const codesOf = (gs, g) => (gs.find(x => x.g === g) || { codes: [] }).codes;
    const want = {};
    G.forEach(gs => gs.forEach(x => x.codes.forEach(c => { want[c] = (want[c] || 0) + 1; })));
    const chips = HAVE_GROUPS.map(([g, cs, how]) => `<div class="hv-g"><p class="hv-h"><b>${g}</b><small>${how}</small></p><div class="chips">${cs.split('').map(c => `<button type="button" class="chip hv" data-have="${c}" aria-pressed="${H.has(c)}"><b class="cd">${c}</b>${REVIEW[c]}${want[c] ? `<span class="n" title="${want[c]} 個${P.length ? '志願' : '收藏'}會看">${want[c]}</span>` : ''}</button>`).join('')}</div></div>`).join('');
    let out = '';
    if (list.length) {
      const who = P.length ? '志願' : '收藏';
      const toWrite = Object.keys(want).filter(c => WRITE.has(c) && !H.has(c)).sort();
      const toGet = Object.keys(want).filter(c => !WRITE.has(c) && c !== 'A' && REVIEW[c] && !H.has(c)).sort((a, b) => want[b] - want[a]);
      // each 系: a group is covered once you have any kind it reads; what you write must all be there
      const rows = list.map((d, i) => {
        const gs = G[i], parts = [];
        for (const g of ['課程學習成果', '多元表現']) { const cs = codesOf(gs, g).filter(c => c !== 'N'); if (cs.length) parts.push([g, cs.some(c => H.has(c))]); }
        const ws = [...codesOf(gs, '多元表現'), ...codesOf(gs, '學習歷程自述')].filter(c => WRITE.has(c));
        const done = ws.filter(c => H.has(c)).length;
        if (ws.length) parts.push([`自己寫 ${done}/${ws.length}`, done === ws.length]);
        const other = (gs.find(x => x.g === '其他') || { items: [] }).items.length;
        const ok = parts.every(x => x[1]);
        return `<li class="${ok ? 'ok' : ''}"><button type="button" class="hv-d" data-open="${d.c}">${P.length ? `<span class="no">${i + 1}</span>` : ''}<span>${esc(schShort(d))} ${esc(d.n)}</span></button><span class="hv-s">${parts.map(([t, y]) => `<span class="${y ? 'y' : 'x'}">${y ? icon('check', 'xs') : ''}${esc(t)}</span>`).join('')}${other ? `<span class="o">另有 ${other} 項系定資料</span>` : ''}</span></li>`;
      }).join('');
      out = `${toWrite.length ? `<p class="hv-todo"><b>還要寫</b>${toWrite.map(c => `<span><b class="cd">${c}</b>${REVIEW[c]}<small>${want[c]} 個</small></span>`).join('')}</p>` : ''}
        ${toGet.length ? `<p class="hv-todo soft"><b>你的${who}會看、你還沒有</b>${toGet.slice(0, 8).map(c => `<span><b class="cd">${c}</b>${REVIEW[c]}<small>${want[c]} 個</small></span>`).join('')}</p><p class="hint">這些是系會看的「種類」，有其中幾種就夠，不用每種都有；挑跟系相關、最能代表你的。</p>` : ''}
        <h3 class="sec-h3">每個${who}準備到哪</h3><ol class="hv-list">${rows}</ol>`;
    }
    return `<section class="sec" id="haveSec">${hIcon('check', '我的學習歷程')}<p class="sub">勾你已經有的，看${P.length ? '志願' : '收藏'}還缺什麼。修課紀錄（A）由資料庫提供，不用勾。數字是幾個${P.length ? '志願' : '收藏'}會看。</p>
      ${chips}${list.length ? out : '<p class="hint" style="margin-top:12px">收藏或排志願之後，這裡會列出每個系還缺什麼。</p>'}</section>`;
  }
  function prepHTML(P) {
    if (!P.length) return '';
    const sps = P.map(d => d.sp || 0), lo = Math.min(...sps), hi = Math.max(...sps);
    const nIv = P.filter(L.hasInterview).length, nWr = P.filter(L.hasWritten).length, nNo = P.filter(L.noVisit).length;
    const facts = [`學測佔二階 ${lo === hi ? lo : lo + '–' + hi}%`, nIv ? `${nIv} 個要面試` : '都不用面試', nWr ? `${nWr} 個要筆試` : '', nNo ? `${nNo} 個不用到校甄試` : ''].filter(Boolean);
    const bars = P.map((d, i) => `<li><div class="cb-h"><span class="no">${i + 1}</span><button class="cb-name" type="button" data-open="${d.c}"><span class="sch">${esc(sch(d))}</span>${nameHTML(d.n)}</button></div>${compBar(d)}<div class="cb-cap">${compCap(d)}</div></li>`).join('');
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
        const mine = st.have.includes(c);
        rows += `<tr class="${n === P.length && P.length > 1 ? 'all' : ''}${mine ? ' have' : ''}"><th scope="row" title="${esc(c + ' ' + REVIEW[c])}"><b class="cd">${c}</b>${esc(REVIEW[c])}${mine ? `<span class="hv-ok">${icon('check', 'xs')}有了</span>` : ''}</th>${cells(has)}<td class="cnt">${n}</td></tr>`;
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
    return `<section class="sec prep" id="prep">${hIcon('doc', '二階要準備什麼')}<p class="sub">總成績怎麼算、要交哪些審查資料</p>
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
        <div class="s-main" data-open="${d.c}" role="button" tabindex="0"><div class="s-t"><span class="sch">${esc(sch(d))}</span>${nameHTML(d.n)}</div><div class="s-d"><span>${icon('cal', 'xs')}${esc(daysText(d))}</span><span>${icon('doc', 'xs')}截止 ${esc(rocDate(d.dd))}</span><span>${icon('flag', 'xs')}放榜 ${esc(rocDate(d.rd))}</span></div></div>
        <div class="ctrl"><button type="button" data-up="${d.c}" aria-label="上移" title="上移" ${i === 0 ? 'disabled' : ''}>${icon('up', 'sm')}</button><button type="button" data-down="${d.c}" aria-label="下移" title="下移" ${i === P.length - 1 ? 'disabled' : ''}>${icon('down', 'sm')}</button><button type="button" data-plan="${d.c}" aria-label="移出志願" title="移出志願">${icon('x', 'sm')}</button></div></li>`;
    }
    const mix = Array.from({ length: 6 }, (_, i) => { const d = P[i]; if (!d) return '<span class="e">空</span>'; const t = tierOf(d); return `<span class="${t ? TC[t] : 't0'}" title="${t ? TL[t] : ''}">${t ? sigHTML(t) : '—'}</span>`; }).join('');
    const checks = planChecks(P);
    const IC = { ok: 'check', warn: 'alert', bad: 'x', info: 'info' };
    const favRows = favs.map(d => {
      const pi = st.plan.indexOf(d.c);
      return `<li class="fav">${pillHTML(tierOf(d))}<div class="s-main" data-open="${d.c}" role="button" tabindex="0"><div class="s-t"><span class="sch">${esc(sch(d))}</span>${nameHTML(d.n)}</div><div class="s-d"><span>${icon('cal', 'xs')}${esc(daysText(d))}</span><span class="pts">${partsHTML(d)}</span></div></div>
        <div class="fav-act"><button class="btn sm${pi >= 0 ? '' : ' primary'}" type="button" data-plan="${d.c}">${pi >= 0 ? `移出第 ${pi + 1} 志願` : `${icon('plus', 'sm')}排入志願`}</button><button class="star" type="button" data-fav="${d.c}" aria-pressed="true" aria-label="取消收藏：${esc(sch(d) + d.n)}" title="取消收藏">${icon('star')}</button></div></li>`;
    }).join('');
    const h = `<header class="page-h"><div><h1 class="hi">${icon('plan')}<span>我的志願</span></h1><p>最多 6 個，順序就是你的偏好。</p></div>
      <div class="page-actions"><button class="btn sm primary" type="button" data-act="reportOpen">${icon('doc', 'sm')}完整報告（可給 AI）</button>${P.length || favs.length ? `<button class="btn sm" type="button" data-act="copyPlan">${icon('copy', 'sm')}複製文字</button><button class="btn sm" type="button" data-act="csvPlan">${icon('download', 'sm')}下載 CSV</button><button class="btn sm" type="button" data-act="printPlan">${icon('print', 'sm')}列印</button>` : ''}</div></header>
      ${ctxBarHTML()}
      <div class="plan-grid">
        <section class="sec">${hIcon('plan', '六個志願')}<p class="sub">已排 ${P.length}/6</p><ol class="slots" id="planList">${slots}</ol></section>
        <section class="sec">${hIcon('shield', '檢查')}<p class="sub">落點搭配、撞期、同校規定和費用</p><div class="mix" aria-label="六個志願的落點">${mix}</div>
          ${checks.length ? `<ul class="checks">${checks.map(x => `<li class="check ${x.state}"><span class="ic">${icon(IC[x.state])}</span><div><b>${esc(x.title)}</b>${x.body ? (x.body.startsWith('<') ? x.body : `<p>${x.body}</p>`) : ''}</div></li>`).join('')}</ul>` : '<p class="hint" style="margin-top:14px">排入志願後，這裡會檢查穩衝搭配、甄試撞期和同校擇一報名。</p>'}
        </section>
      </div>
      <section class="sec">${hIcon('star', '收藏')}<p class="sub">${favs.length ? `${favs.length} 個 · 從這裡排進志願` : '在「找校系」按星號收藏想考慮的校系'}</p>${favs.length ? `<ol class="favs" id="favList">${favRows}</ol>` : `<div style="margin-top:14px"><button class="btn primary" type="button" data-tab="explore">${icon('search', 'sm')}去找校系</button></div>`}</section>
      ${haveHTML(P)}
      ${prepHTML(P)}
      ${P.length ? `<section class="sec">${hIcon('cal', '二階行事曆')}<p class="sub">審查資料截止、甄試、放榜和統一日期</p>${calendarHTML(P)}</section>` : ''}
      <section class="sec no-print">${hIcon('download', '換裝置與備份')}<p class="sub">資料只存在這台裝置，沒有帳號也不上傳。手機和電腦之間用連結或轉移碼帶過去。</p>
        <div class="page-actions" style="margin-top:14px"><button class="btn sm primary" type="button" data-act="moveOpen">${icon('upload', 'sm')}換裝置／備份</button></div></section>`;
    keepFocus($('#plan'), () => { $('#plan').innerHTML = h; });
  }
  function planText() {
    const P = planDepts(), c = cur(), s = c.thS;
    const lines = [`116 申請入學志願（${new Date().toLocaleDateString('zh-TW')}）`,
      `${c.mock ? `模考「${c.name}」` : '學測'}：${SCORE_KEYS.map(k => `${subj(k)}${L.val(s, k) ?? '沒考'}${c.eq[k] ? `（學測約 ${c.eq[k].g}）` : ''}`).join(' ')} 英聽${s.聽 || '沒考'}（檢定用${c.stdName}）`, ''];
    const row = (d, i) => {
      const e = EV.get(d.c);
      return `${i != null ? i + 1 + '. ' : '- '}${sch(d)} ${d.n}（${d.c}）【${e ? TL[e.tier] : '—'}】${e ? tw(e.reasons.join('；')) : ''}${e && e.warnings.length ? '；' + tw(e.warnings.join('；')) : ''}\n   ${requirementLine(d)}\n   二階：${partsLine(d, true)}；甄試 ${d.idays.length ? rocText(d.idate) : '不用到校'}；資料截止 ${rocDate(d.dd)}${d.rv ? `\n   審查資料：${d.rv}` : ''}`;
    };
    lines.push('【六個志願】');
    P.forEach((d, i) => lines.push(row(d, i)));
    const others = st.fav.filter(c => !st.plan.includes(c)).map(c => BY_CODE[c]).filter(Boolean);
    if (others.length) { lines.push('', '【其他收藏】'); others.forEach(d => lines.push(row(d))); }
    lines.push('', '說明：一階照 116 的篩選規則一關一關看，每一關只拿 115 同樣科目的最低級分推估（不是保證）；116 改用 115 沒篩過的科目時判「看不出」。116 五標 2027/2/25 公布。');
    return lines.join('\n');
  }
  // ------------------------------------------------------------------ 完整報告 (Markdown): everything needed to judge the situation, for a teacher, a parent or an AI
  const plain = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const signed = n => (n > 0 ? '+' + n : String(n));
  const mdRow = cells => '| ' + cells.map(x => String(x == null ? '' : x).replace(/\|/g, '／')).join(' | ') + ' |';
  const mdTable = (head, rows) => [mdRow(head), mdRow(head.map(() => '---')), ...rows.map(mdRow)].join('\n');
  const AI_PROMPT = `你是熟悉台灣大學入學制度（學測、個人申請、分科測驗、分發入學）的升學顧問。下面是一位 116 學年度考生的資料，以及離線選系工具照 116 校系分則和 115 實際結果算出的估計。請：
1. 先用 3–5 句話說明他的處境：哪幾科是強項、弱項，個人申請和分發入學哪條路比較有利、為什麼。
2. 檢查他的 6 個志願：穩過／衝的搭配、甄試撞期、二階要準備的東西，具體說要換掉或加入哪些系（可以從「其他可以考慮的校系」挑）。
3. 依照「怎麼進步」和學習歷程的缺口，排出接下來最值得做的 3 件事。
4. 報告裡沒有的資料（例如 116 五標、116 分發最低登記標準、各系評分細節），請明說是推估，不要編造數字；最後提醒以甄選會、大考中心公告和各系分則為準。
請用繁體中文、台灣用語回答。`;
  /** The whole report. o: {ai: prompt on top, more: other options to consider}. */
  function reportText(o) {
    ensureEval(); ensureUac();
    const c = cur(), has = hasScores(c.S), out = [];
    const P = planDepts(), favs = st.fav.map(x => BY_CODE[x]).filter(d => d && !st.plan.includes(d.c));
    const push = (...x) => out.push(...x);
    push(`# 116 大學選系報告（${todayISO()}）`, '', `> 由「116 大學選系」離線工具產生（${location.origin}${location.pathname}）。資料：116 校系分則（甄選會）、115 一階篩選和分發錄取結果、大考中心五標與級分人數累計表。落點是估計，不是錄取機率。`, '');
    if (o.ai) push('## 給 AI 的說明', '', AI_PROMPT, '', '下面是資料。', '');
    // 成績
    push('## 成績', '');
    if (!has) push('還沒輸入成績。', '');
    else {
      push(`- 看落點用：${c.mock ? `模考「${c.name}」（${c.mock.d}）` : '學測級分（自己輸入的成績或目標）'}`, `- 檢定用的五標：${c.stdName}`, `- 學測 116 年 1/22–1/24 考，2/25 公布成績和五標；之前的 116 五標用 ${st.stdYear === 'custom' ? '自訂' : st.stdYear + ' 年'}的代替。`, '');
      const rows = SCORE_KEYS.map(k => {
        const raw = L.val(c.thS, k), g = L.val(c.S, k);
        if (raw == null) return [subj(k), '沒考', '', '', ...(c.mock ? [''] : [])];
        const lv = c.mock ? levelIn(c.std, k, raw) : levelOf(k, raw);
        const top = g != null ? L.topPercent(D.pct, [k], g) : null;
        return [subj(k), raw, lv || '', top != null ? fmtTop(top) : '', ...(c.mock ? [c.eq[k] ? c.eq[k].g : ''] : [])];
      });
      push(mdTable(['科目', c.mock ? '模考級分' : '級分', c.mock ? '這次模考的標' : '標', '在 115 考生排名', ...(c.mock ? ['換算學測級分'] : [])], rows), '');
      const ex = [c.thS.聽 ? `英聽 ${c.thS.聽} 級` : '英聽沒考', L.val(st.scores, '識') ? `APCS 觀念 ${st.scores.識} 級` : '', L.val(st.scores, '實') ? `APCS 實作 ${st.scores.實} 級` : ''].filter(Boolean);
      push('- ' + ex.join('、'), '');
    }
    const ms = mocksByDate();
    if (ms.length) {
      push('### 歷次模考（模考級分，括號是照排名換算的學測級分）', '');
      push(mdTable(['科目', ...ms.map(m => `${mName(m)} ${mdText(m.d)}`)], SCORE_KEYS.map(k => [subj(k), ...ms.map(m => { const v = L.val(msc(m), k), e = v != null ? L.mockToTest(m.std, k, v, D.pct) : null; return v == null ? '—' : `${v}${e ? `（${e.g}）` : ''}`; })])), '');
    }
    // 分科
    if (U && has) {
      push('## 分科測驗（走分發用）', '');
      const plan = astPlan(), rows = ASTK.filter(k => plan[k] != null).map(k => { const m = UM[k]; return [uName(k), plan[k] === 'e' ? '估計' : '自己填', m ? m.v.toFixed(0) : '—', m && m.kind === 'est' ? `${m.lo.toFixed(0)}–${m.hi.toFixed(0)}` : '']; });
      push(rows.length ? mdTable(['科目', '來源', '60 級分', '估計範圍'], rows) : '還沒選要考的分科。', '', '- 估計：學測（或模考換算）在 115 分發考生排前幾 %，就當作在 115 分科考生也排那裡；分科範圍更深，只是粗估。', '- 學測 g 級分在分發換算成 60 級分制約 4g。', '');
    }
    // 興趣
    const qr = quizResult(st.quiz);
    if (qr || st.hol.length) {
      push('## 興趣', '');
      if (qr) push(`- 興趣測驗（RIASEC，48 題，1–5 分）：代碼 **${qr.code.join('')}**；${QK.map(k => `${k} ${HOL.find(h => h[0] === k)[1]} ${qr.m[k].toFixed(1)}`).join('、')}`);
      if (st.hol.length) push(`- 用來排學群的興趣碼：${st.hol.join('')}`);
      push('');
    }
    if (has) {
      // 整體落點
      const scope = scopeDepts(), us = U ? uScope() : [];
      const cnt = (xs, f) => { const n = {}; xs.forEach(x => { const t = f(x); n[t] = (n[t] || 0) + 1; }); return TIERS.filter(t => n[t]).map(t => `${TL[t]} ${n[t]}`).join('、'); };
      push('## 整體落點', '', `- 範圍：${scopeName()}（${fmtN(scope.length)} 個申請校系${U ? `、${fmtN(us.length)} 個分發系組` : ''}）`, `- 申請入學一階：${cnt(scope, tierOf)}`);
      if (U && hasAst()) {
        const p = pathCompare(scope, us), [v] = pathVerdict(p);
        push(`- 分發入學（學測＋分科）：${cnt(us, uTier)}`, `- 工具的判斷：${v}`, `- 只有申請有機會 ${p.aOnly.length} 個系、只有分發有機會 ${p.uOnly.length} 個`);
      }
      push('', '落點標籤：' + TIERS.map(t => `「${TL[t]}」＝${TIER_HELP[t]}`).join('；') + '。', '');
      // 學群
      const gs = groupFit().slice(0, 6);
      if (gs.length) push('### 最有機會的學群（穩過＋應該過的系數 / 這個學群的系數）', '', ...gs.map(x => `- ${x.g}：${x.good}/${x.n}，一階常看 ${x.subjects.map(subj).join('、') || '—'}${x.hol.length ? `，符合興趣 ${x.hol.join('')}` : ''}${x.best.length ? `；最搶手：${x.best.map(d => schShort(d) + d.n).join('、')}` : ''}`), '');
    }
    // 志願
    const detail = (d, i) => {
      const e = EV.get(d.c), req = requirementParts(d), lines = [];
      lines.push(`### ${i != null ? `${i + 1}. ` : ''}${sch(d)} ${d.n}（${d.c}）`);
      if (e) {
        lines.push(`- 落點：**${TL[e.tier]}**——${tw(e.reasons.join('；')) || '—'}`);
        const ws = e.warnings.filter((w, j, a) => !a.some((x, k) => k !== j && x.length > w.length && x.startsWith(w)));
        if (ws.length) lines.push(`- 注意：${tw(ws.join('；'))}`);
        if (!e.th.ok) lines.push(`- 檢定沒過：${thFailParts(e.th).map(x => `${x.what} 要 ${x.need}、你 ${x.mine}`).join('；')}`);
        const cmp = e.cmp;
        if (cmp && cmp.stages && cmp.stages.length) lines.push(`- 116 一階（每關對 115 同科目最低）：${cmp.stages.map(x => `${partsLabel(x.parts)} ×${x.m}：${x.ref ? `115 最低 ${x.v}` : x.kind === 'open' ? '115 沒篩掉人' : '115 沒有同樣科目'}${x.mine != null ? `，你 ${x.mine}${x.diff != null ? `（${signed(x.diff)}）` : ''}` : '，你沒考'}`).join(' → ')}`);
      } else lines.push(`- ${req.th}；116 一階 ${req.one}`);
      if (e) lines.push(`- ${req.th}`);
      lines.push(`- 名額 ${d.q}${d.ei ? `，預計甄試 ${d.ei} 人` : ''}；二階：${partsLine(d, true) || '—'}`);
      if (d.rv) {
        const codes = [...new Set(L.reviewGroups(d.rv).flatMap(g => g.codes))].filter(x => HAVE_CODES.includes(x));
        lines.push(`- 審查資料：${d.rv}${codes.length ? `；已有 ${codes.filter(x => st.have.includes(x)).join('、') || '無'}，還沒有 ${codes.filter(x => !st.have.includes(x)).join('、') || '無'}` : ''}`);
      }
      lines.push(`- 日期：資料截止 ${rocDate(d.dd)}；甄試 ${d.idays.length ? rocText(d.idate) : '不用到校'}；放榜 ${rocDate(d.rd)}${d.fee ? `；甄試費 ${d.fee} 元` : ''}`);
      const ub = U && has ? uBestOf(d) : null, ue = ub && UEV.get(ub.c);
      if (ue) lines.push(`- 同系走分發（${ub.n}）：**${TL[ue.tier]}**${ue.cut != null ? `，你約 ${ue.total.toFixed(0)}、115 最低 ${ue.cut.toFixed(0)}` : ''}`);
      lines.push(`- 分則：${d.url}`);
      return lines.join('\n');
    };
    push('## 我的志願', '');
    if (P.length) {
      P.forEach((d, i) => push(detail(d, i), ''));
      const ck = planChecks(P);
      if (ck.length) push('### 工具的志願檢查', '', ...ck.map(x => `- ${{ ok: '✓', warn: '⚠', bad: '✗', info: 'ℹ' }[x.state] || '-'} ${x.title}${x.body ? '：' + plain(x.body) : ''}`), '');
    } else push('還沒排志願。', '');
    if (favs.length) { push('## 其他收藏', ''); favs.forEach(d => push(detail(d), '')); }
    // 學習歷程
    push('## 學習歷程', '', st.have.length ? `- 已經有：${st.have.map(x => `${x} ${REVIEW[x]}`).join('、')}` : '- 還沒勾選已有的學習歷程。', '- 代碼：' + Object.entries(REVIEW).map(([k, v]) => `${k} ${v}`).join('、'), '- 課程學習成果最多 3 件、多元表現最多 10 件，系列出的是會看的種類，不用每種都有；學習歷程自述（O–Q）自己寫。', '');
    if (has) {
      // 怎麼進步
      const scope = scopeDepts(), { rows, blockers } = boostData(scope);
      const best = rows.map(r => ({ r, b: r.cells.filter(Boolean).reduce((a, x) => (x.up > (a ? a.up : 0) ? x : a), null) })).filter(x => x.b && x.b.up > 0).sort((a, b) => b.b.up - a.b.up).slice(0, 4);
      push('## 怎麼進步（申請一階，目前範圍）', '');
      if (best.length) push(...best.map(({ r, b }) => `- ${subj(r.k)} ${r.cur || '沒考'} → ${b.to} 級分：${b.up} 個系落點變好${b.unlock ? `（${b.unlock} 個從過不了變成可以報）` : ''}`));
      if (blockers.length) push(`- 擋住最多系的：${blockers.slice(0, 5).map(([w, n]) => `${w}（${n} 個）`).join('、')}`);
      push('');
      // 其他選擇
      if (o.more) {
        const skip = new Set([...st.plan, ...st.fav]);
        const pool = scope.filter(d => !skip.has(d.c)).sort((a, b) => (L.selectivity(b) || 0) - (L.selectivity(a) || 0));
        const one = d => { const e = EV.get(d.c); return `- ${TL[e.tier]}｜${sch(d)} ${d.n}（${d.c}）｜${requirementParts(d).one}｜二階 ${partsLine(d)}`; };
        const good = pool.filter(d => isGood(tierOf(d))).slice(0, 15), reach = pool.filter(d => tierOf(d) === '衝').slice(0, 10);
        push('## 其他可以考慮的校系（目前範圍，去年門檻高的在前）', '');
        if (good.length) push('### 穩過、應該過', '', ...good.map(one), '');
        if (reach.length) push('### 邊緣（可以衝）', '', ...reach.map(one), '');
      }
    }
    push('## 附註', '', '- 一階：照 116 的科目、倍率和順序一關一關看，每關只跟 115 同樣科目的最低級分比；116 改用 115 沒篩過的科目時判「看不出」。收的人數差 10% 以上用級分人數表換算。', '- 模考：檢定用那次模考的級分和五標；倍率篩選把模考級分照排名換成學測級分再比。', U ? `- 分發：學測、分科換成 60 級分照權重加總，比 115 最低錄取分數；116 最低登記標準 7/29 才公布。` : '', '- 這份報告沒有姓名或學校；分享前可以再刪掉不想給別人看的內容。');
    return out.filter(x => x != null).join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }
  function openReport() {
    const dlg = $('#report');
    ui.rep = ui.rep || { ai: true, more: true };
    const draw = () => {
      const txt = reportText(ui.rep);
      ui.repText = txt;
      $('#rpBody').innerHTML = `<p class="sub">一份文字報告：成績、模考、分科估計、興趣、整體落點、每個志願的關卡和準備狀況。可以給老師或家長看，也可以整份貼給 ChatGPT、Claude、Gemini 之類的 AI，請它幫你看。</p>
        <div class="rp-opt"><label class="fcheck"><input type="checkbox" data-rep="ai" ${ui.rep.ai ? 'checked' : ''}> 開頭加上給 AI 的說明</label><label class="fcheck"><input type="checkbox" data-rep="more" ${ui.rep.more ? 'checked' : ''}> 附上其他可以考慮的校系</label></div>
        <div class="mv-act"><button class="btn primary sm" type="button" data-act="repCopy">${icon('copy', 'sm')}複製全文</button><button class="btn sm" type="button" data-act="repDownload">${icon('download', 'sm')}下載 .md</button>${navigator.share ? `<button class="btn sm" type="button" data-act="repShare">${icon('upload', 'sm')}分享</button>` : ''}<span class="muted num">${fmtN(txt.length)} 字</span></div>
        <textarea class="mv-code rp-text" readonly rows="14" aria-label="報告內容">${esc(txt)}</textarea>
        <p class="hint">報告只在你複製、下載或分享時才離開這台裝置，裡面沒有姓名或學校。</p>`;
    };
    $('#rpBody').innerHTML = '<p class="hint">整理中…</p>';
    if (!dlg.open) dlg.showModal();
    ui.repDraw = draw;
    setTimeout(draw, 30);
  }
  /** Clipboard, or the old select-and-copy where the Clipboard API is not allowed (file:// pages, older Safari). */
  function copyText(txt, msg) {
    const old = () => { const t = document.createElement('textarea'); t.value = txt; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0'; ($('dialog[open]') || document.body).appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* not allowed */ } t.remove(); return ok; };
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject(new Error('no clipboard'))).then(() => toast(msg), () => toast(old() ? msg : '無法自動複製，請長按文字選取後複製'));
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
  // ------------------------------------------------------------------ moving your data to another device (no server: the data rides in the link's # part, which browsers never send)
  const b64u = u8 => { let b = ''; for (let i = 0; i < u8.length; i += 0x8000) b += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = t => { const b = atob(t.replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const pipe = (u8, tf) => new Response(new Blob([u8]).stream().pipeThrough(tf)).arrayBuffer().then(x => new Uint8Array(x));
  /** Everything you saved, as one short code: z + base64url(length, raw deflate), or j + base64url(JSON) without CompressionStream. */
  async function packState() {
    const { theme, ...rest } = st;
    const raw = new TextEncoder().encode(JSON.stringify(rest));
    if (!window.CompressionStream) return 'j' + b64u(raw);
    const z = await pipe(raw, new CompressionStream('deflate-raw')), out = new Uint8Array(z.length + 4);
    new DataView(out.buffer).setUint32(0, raw.length, true);
    out.set(z, 4);
    return 'z' + b64u(out);
  }
  async function unpackState(code) {
    const c = String(code).trim().replace(/^.*#import=/, '').replace(/\s+/g, '');
    const u = unb64u(c.slice(1));
    let raw;
    if (c[0] === 'j') raw = u;
    else if (c[0] === 'z') {
      const n = new DataView(u.buffer).getUint32(0, true), z = u.subarray(4);
      raw = window.DecompressionStream ? await pipe(z, new DecompressionStream('deflate-raw')) : window.tinyInflate(z, new Uint8Array(n));
    } else throw new Error('not a code');
    const s = JSON.parse(new TextDecoder().decode(raw));
    if (!s || s.v !== 1) throw new Error('not a backup');
    return s;
  }
  const linkFor = code => location.origin + location.pathname + '#import=' + code;
  const stateSummary = s => [`${(s.plan || []).length} 個志願`, `${(s.fav || []).length} 個收藏`, `${(s.mocks || []).length} 次模考`, SCORE_KEYS.some(k => s.scores && L.val(s.scores, k) != null) ? '學測級分' : '', (s.quiz || []).some(x => x) ? '興趣測驗' : '', (s.have || []).length ? '學習歷程勾選' : ''].filter(Boolean).join('、');
  function applyImported(s) {
    const theme = st.theme;
    st = sanitize(s);
    st.theme = theme;
    ui.mf = null; ui.shown = PAGE;
    render();
  }
  /** The 換裝置 dialog: send a link to yourself, or copy a code, or a file; the other device opens or pastes it. */
  async function openMove() {
    const dlg = $('#move'), body = $('#mvBody');
    body.innerHTML = '<p class="hint">整理中…</p>';
    if (!dlg.open) dlg.showModal();
    const code = await packState(), link = linkFor(code);
    ui.moveLink = link;
    body.innerHTML = `<p class="sub">你的資料（${esc(stateSummary(st)) || '目前沒有資料'}）只存在這台裝置。用下面任一種方式帶到另一台：</p>
      <div class="mv-s"><h3><span class="mv-n">1</span>傳連結給自己（最簡單）</h3><p class="hint">用 LINE、AirDrop、Email 傳給自己，在另一台打開連結就會問要不要匯入。資料在連結 # 後面，不會送到任何伺服器。</p>
        <div class="mv-act">${navigator.share ? `<button class="btn primary sm" type="button" data-act="moveShare">${icon('upload', 'sm')}分享連結</button>` : ''}<button class="btn sm${navigator.share ? '' : ' primary'}" type="button" data-act="moveCopyLink">${icon('copy', 'sm')}複製連結</button><span class="muted num">${fmtN(link.length)} 字</span></div></div>
      <div class="mv-s"><h3><span class="mv-n">2</span>轉移碼</h3><p class="hint">在另一台打開這個網站 → 我的志願 → 換裝置，貼上轉移碼。</p>
        <textarea class="mv-code" id="mvCode" readonly rows="3" aria-label="轉移碼">${esc(code)}</textarea>
        <div class="mv-act"><button class="btn sm" type="button" data-act="moveCopyCode">${icon('copy', 'sm')}複製轉移碼</button></div>
        <label class="mv-in"><span>從別台帶過來：貼上轉移碼或連結</span><textarea id="mvPaste" rows="2" placeholder="z…" aria-label="貼上轉移碼或連結"></textarea></label>
        <div class="mv-act"><button class="btn sm" type="button" data-act="movePaste">${icon('download', 'sm')}匯入</button></div></div>
      <div class="mv-s"><h3><span class="mv-n">3</span>備份檔</h3><p class="hint">存成檔案放雲端硬碟或 USB，之後再選回來。</p>
        <div class="mv-act"><button class="btn sm" type="button" data-act="exportState">${icon('download', 'sm')}下載備份檔</button><label class="btn sm">${icon('upload', 'sm')}選擇備份檔<input type="file" id="importState" accept="application/json,.json"></label></div></div>
      <p class="hint">匯入會取代那台裝置上原本的資料（深淺色設定除外）。</p>`;
  }
  /** Before replacing anything: say what is coming in and what will be replaced. */
  function confirmImport(s) {
    const dlg = $('#move'), body = $('#mvBody');
    ui.pending = s;
    body.innerHTML = `<p class="mv-q">要匯入這份資料嗎？</p><p class="sub">帶進來的：${esc(stateSummary(s)) || '（空的）'}</p>
      <p class="sub">這台裝置現在的（會被取代）：${esc(stateSummary(st)) || '（空的）'}</p>
      <div class="mv-act"><button class="btn primary" type="button" data-act="moveApply">${icon('check', 'sm')}匯入並取代</button><button class="btn" type="button" data-act="moveCancel">取消</button></div>`;
    if (!dlg.open) dlg.showModal();
  }
  function csv() {
    const rows = [['志願', '校系代碼', '學校', '校系', '落點', '理由', '檢定', '116一階（115同科目最低）', '二階', '審查資料', '審查資料截止', '甄試日期', '放榜', '甄試費', '官方網址']];
    [...st.plan, ...st.fav.filter(c => !st.plan.includes(c))].forEach(c => {
      const d = BY_CODE[c];
      if (!d) return;
      const e = EV.get(c), i = st.plan.indexOf(c);
      const req = requirementParts(d);
      rows.push([i >= 0 ? i + 1 : '收藏', d.c, sch(d), d.n, e ? TL[e.tier] : '', e ? tw(e.reasons.join('；')) : '', req.th, req.one, partsLine(d, true), d.rv || '', rocDate(d.dd), d.idays.length ? rocText(d.idate) : '不用到校甄試', rocDate(d.rd), d.fee || '', d.url]);
    });
    return '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }

  // ------------------------------------------------------------------ boost (what to improve)
  let boostCache = { sig: null, data: null };
  function boostData(scope) {
    const c = cur();
    const sig = c.sig + '#' + scope.map(d => d.c).join('');
    if (boostCache.sig === sig) return boostCache.data;
    const rows = SCORE_KEYS.map(k => {
      const now = L.val(c.thS, k) || 0;
      const cells = [1, 2, 3, 4, 5].map(inc => {
        const to = now + inc;
        if (to > 15) return null;
        const S2 = { ...c.thS, [k]: String(to) };
        let up = 0, unlock = 0, good = 0;
        for (const d of scope) {
          const t0 = tierOf(d), t1 = evalAt(d, c, S2).tier;
          if (TIERS.indexOf(t1) < TIERS.indexOf(t0) && t1 !== '無資料') up++;
          if (t0 === '不符' && t1 !== '不符') unlock++;
          if (t1 === '穩' || t1 === '適中') good++;
        }
        return { to, up, unlock, good };
      });
      return { k, cur: now, cells };
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
  /** The 申請 校系 the counts on 我的成績 and 怎麼進步 cover: 找校系's list under the same filters (落點 labels aside). */
  const scopeDepts = () => baseFiltered();
  const boostScope = scopeDepts;
  const scopeName = () => scopeLabel() || '全部一般校系';
  /** 全部／收藏／志願: part of the shared filters; each count is what the other filters leave of it. */
  const listSegHTML = () => {
    const lc = new Set(baseFiltered('list').map(d => d.c));
    const n = k => (k === 'all' ? lc.size : (k === 'plan' ? st.plan : st.fav).filter(c => lc.has(c)).length);
    return `<div class="segctl" role="group" aria-label="範圍">${[['all', '全部校系'], ['fav', '收藏'], ['plan', '志願']].map(([k, l]) => { const c = n(k); return `<button type="button" data-list="${k}" aria-pressed="${st.f.list === k}">${l}${c != null ? `<span class="muted num"> ${c}</span>` : ''}</button>`; }).join('')}</div>`;
  };
  /** On 我的成績 and 怎麼進步: which 校系 are counted, with 找校系's filters (one set for the whole app). */
  function scopeBarHTML(n) {
    const fc = filterCount(), lab = scopeLabel();
    const nU = hasScores() && !st.f.untaken ? baseFiltered('untaken').filter(usesUntaken).length : 0;
    return `<div class="scopebar"><span class="ctx-lab">算哪些校系</span>${listSegHTML()}
      <button class="btn sm" type="button" data-act="openFilters">${icon('sliders', 'sm')}篩選${fc ? `<span class="count">${fc}</span>` : ''}</button><span class="muted num">共 ${fmtN(n)} 個</span>
      <p class="sb-f">${lab ? `${esc(lab)} <button class="textbtn" type="button" data-act="resetFilters">清除篩選</button>` : '全部一般校系'}${nU ? ` <button class="textbtn" type="button" data-act="showUntaken">＋${fmtN(nU)} 個用到沒考科目</button>` : ''}<small>跟「找校系」同一組篩選</small></p></div>`;
  }
  const emptyScopeHTML = () => (st.f.list === 'fav' && !st.fav.length ? '還沒有收藏的校系。到「找校系」按 ☆ 收藏。' : st.f.list === 'plan' && !st.plan.length ? '還沒有排志願。' : '篩選後沒有校系，放寬篩選看看。');
  // ------------------------------------------------------------------ 模考趨勢
  function mockRefHTML() {
    return `<details class="mockref" id="mockRef" ${ui.mockRefOpen ? 'open' : ''}><summary>${icon('chevR', 'sm')}翰林各次模考的時程、範圍和五標來源</summary>
      <div class="tablewrap"><table class="reftable"><thead><tr><th>次</th><th>日期</th>${['國文', '英文', '數學', '社會', '自然'].map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>
      ${MOCK_REF.filter(x => x.r).map(x => `<tr><th>${esc(x.n.replace('學測模擬考', ''))}</th><td>${esc(x.when)}</td>${['國文', '英文', '數學', '社會', '自然'].map(k => `<td>${esc(x.r[k] || '—')}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="hint">整理自各校 115 學年度模考公告，日期以學校為準。英聽只有第二次考。學測：2027/1/22–1/24。</p><p class="hint">內建五標照翰林「各科成績標準一覽表」（7月全國、9月北北基、10月北北基），並跟公開資料逐一核對過；跟你的成績單不同以成績單為準。中區、南一是不同考試。</p></details>`;
  }
  /** A 模考's scores read as 學測 級分: each subject with that 模考's 五標 is converted by rank (L.mockToTest). */
  function mockAsTest(m) {
    const ms = msc(m), S = { ...ms }, eq = {};
    for (const k of SCORE_KEYS) {
      const e = L.mockToTest(m.std, k, L.val(ms, k), D.pct);
      if (e) { eq[k] = e; S[k] = String(e.g); }
    }
    return { S, eq };
  }
  /** Tier counts in a scope for a score context (a 模考 judged on its own 五標). */
  function tierCounts(x, scope) {
    const o = optsFor(x), c = {}, tiers = new Map();
    for (const d of scope) { const t = L.evaluate(d, x.S, o).tier; c[t] = (c[t] || 0) + 1; tiers.set(d.c, t); }
    return { c, tiers, good: (c.穩 || 0) + (c.適中 || 0) };
  }
  const deltaChip = d => (d == null ? '' : `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}">${d > 0 ? '+' + d : d === 0 ? '持平' : d}</span>`);

  /** Short column name of a 模考: 「三模」 for 翰林, otherwise its own name. */
  const mShort = m => (presetOf(m.n) ? m.n.replace('學測模擬考', '').replace(/^第(.)次$/, '$1模') : m.n.slice(0, 5));
  /** 模考進退步: each subject on the 學測 scale across 模考, what changed, and 落點 per 模考 (in the chosen scope). */
  function trendHTML(scope) {
    const ms = mocksByDate();
    const conv = new Map(ms.map(m => [m.id, mockAsTest(m)]));
    const subs = SCORE_KEYS.filter(k => ms.some(m => L.val(msc(m), k) != null));
    const lvOf = (m, k, v) => (m.std && m.std[k] && v != null ? levelIn(m.std, k, v) : '');
    // a subject is compared on the 學測 scale when every 模考 that has it also has its 五標
    const onTest = k => ms.every(m => L.val(msc(m), k) == null || conv.get(m.id).eq[k]);
    const valOf = (m, k) => { const v = L.val(msc(m), k); if (v == null) return null; const e = conv.get(m.id).eq[k]; return onTest(k) && e ? e.g : v; };
    const tierRows = ms.map(m => ({ m, ...tierCounts(ctxFor(m), scope) }));

    // ---- what changed, first → last
    const notes = [];
    if (ms.length > 1) {
      // raw 級分 and standing can move apart: a harder or easier 模考
      const rank = l => (L.LEVELS.includes(l) ? L.LEVELS.indexOf(l) : 9);
      for (const k of subs) {
        const both = ms.filter(m => lvOf(m, k, L.val(msc(m), k)));
        if (both.length < 2) continue;
        const a = both[0], b = both[both.length - 1], va = L.val(msc(a), k), vb = L.val(msc(b), k), la = lvOf(a, k, va), lb = lvOf(b, k, vb);
        if (la === lb) continue;
        const better = rank(lb) < rank(la), dv = vb - va;
        if ((better && dv < 0) || (!better && dv > 0)) notes.push(`${subj(k)}：${mShort(a)} ${va}（${la}）→ ${mShort(b)} ${vb}（${lb}）。${better ? '級分少了但排名更前面，這次比較難。' : '級分多了但排名往後，這次比較簡單，別被分數騙了。'}`);
      }
    }
    // ---- subjects × 模考 (the last 4)
    const show = ms.slice(-4);
    const delta = k => { const vs = ms.map(m => valOf(m, k)).filter(v => v != null); return vs.length > 1 ? vs[vs.length - 1] - vs[0] : null; };
    const table = `<div class="tablewrap"><table class="ttable"><thead><tr><th scope="col">科目</th>${show.map(m => `<th scope="col"><b>${esc(mShort(m))}</b><small>${mdText(m.d)}</small></th>`).join('')}${ms.length > 1 ? '<th scope="col">變化</th>' : ''}</tr></thead><tbody>
      ${subs.map(k => `<tr><th scope="row">${subj(k)}${onTest(k) ? '' : '<small>原始級分</small>'}</th>${show.map(m => { const v = valOf(m, k), raw = L.val(msc(m), k), lv = lvOf(m, k, raw); return `<td>${v == null ? '<span class="muted">—</span>' : `<b class="num">${v}</b>${lv ? `<i class="lvb l${L.LEVELS.includes(lv) ? L.LEVELS.indexOf(lv) : 5}" title="那次的${lv}">${LV_SHORT[lv] || '未達'}</i>` : ''}`}</td>`; }).join('')}${ms.length > 1 ? `<td>${deltaChip(delta(k))}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>`;
    const bars = tierRows.map(x => `<div class="mt-row"><span class="mt-l"><b>${esc(mShort(x.m))}</b><small>${mdText(x.m.d)}</small></span>${tierBarHTML(x.c, scope.length, { small: true, label: mName(x.m) })}<span class="mt-n"><b class="num">${x.good}</b></span></div>`).join('');
    const g = tierRows.length > 1 ? tierRows[tierRows.length - 1].good - tierRows[0].good : 0;
    return `<section class="sec" id="trendSec">${hIcon('boost', '模考進退步')}<p class="sub">${ms.length > 1 ? `${ms.length} 次模考，換算成學測級分比（每次難度不同，原始級分不能直接比）。小字是那次的標。` : '再存一次模考就能看進退步。'}</p>
      ${table}
      ${notes.length ? `<ul class="trendnotes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <h3 class="sec-h3">每次的落點</h3><p class="sub">${esc(scopeName())} ${fmtN(scope.length)} 個（在「落點分布」改範圍）。右邊是${GOOD}的數目${tierRows.length > 1 ? `，${g >= 0 ? '多了' : '少了'} <b>${Math.abs(g)}</b> 個` : ''}。</p>
      <div class="mtiers">${bars}</div>
      </section>`;
  }
  /** Each subject across the saved 模考, as 學測 級分 where the 模考 has 五標 (raw otherwise). */
  function mockSeries() {
    const ms = mocksByDate();
    const conv = ms.map(m => mockAsTest(m));
    const out = {};
    for (const k of SCORE_KEYS) {
      const vals = ms.map((m, i) => { const v = L.val(msc(m), k); if (v == null) return null; const e = conv[i].eq[k]; return e ? e.g : v; });
      const have = vals.filter(v => v != null);
      if (!have.length) continue;
      out[k] = { vals, last: have[have.length - 1], first: have[0], n: have.length, eq: ms.every((m, i) => L.val(msc(m), k) == null || conv[i].eq[k]) };
    }
    return { ms, out };
  }
  const trendWord = x => (!x || x.n < 2 ? '' : x.last > x.first ? `模考 ${x.first} → ${x.last}，在進步` : x.last < x.first ? `模考 ${x.first} → ${x.last}，要注意` : `模考持平在 ${x.last}`);
  /** 各科一覽: what you entered, how the 模考 went (on the 學測 scale), and what 1–2 more 級分 would do. */
  /** What reaching one 級分 does: labelled, so each number says what it counts. */
  function gStatsHTML(cur, cl, good0) {
    return `<p class="gi-at">考到 <b>${cl.to}</b> 級分${cur ? `（多 ${cl.to - cur}）` : ''}的話</p><span><b>${cl.up}</b><small>個系變好</small></span><span><b>${cl.unlock}</b><small>個從過不了變可報</small></span><span class="wide"><small>${GOOD}</small><b>${good0} → ${cl.good}</b>${cl.good > good0 ? `<em>+${cl.good - good0}</em>` : ''}</span>`;
  }
  function renderBoost() {
    const el = $('#boost'), c = cur();
    const head = `<header class="page-h"><div><h1 class="hi">${icon('boost')}<span>怎麼進步</span></h1><p>哪一科多考幾級分，能讓最多校系的落點變好。</p></div></header>`;
    if (!hasScores(c.S)) {
      el.innerHTML = head + ctxBarHTML();
      return;
    }
    const scope = boostScope();
    el.innerHTML = head + ctxBarHTML() + scopeBarHTML(scope.length) + '<div class="sec"><p class="hint">計算中…</p></div>';
    clearTimeout(renderBoost.t);
    renderBoost.t = setTimeout(() => {
      if (ui.tab !== 'boost') return;
      if (!scope.length) {
        el.innerHTML = head + ctxBarHTML() + scopeBarHTML(0) + `<div class="cta">${icon('info')}<div>${emptyScopeHTML()}</div></div>`;
        return;
      }
      const { rows: allRows, blockers: allBlockers } = boostData(scope);
      const series = mockSeries();
      // subjects you have not taken (no score, no 模考) only matter if you are thinking of adding one
      const taken = k => L.val(c.S, k) != null || (!skipped().includes(k) && !!series.out[k]);
      const untaken = SCORE_KEYS.filter(k => !taken(k));
      const rows = st.f.untaken ? allRows : allRows.filter(r => taken(r.k));
      const NAME_RE = { 國: /國文/, 英: /英文/, 數A: /數學A|數A/, 數B: /數學B|數B/, 社: /社會/, 自: /自然/ };
      const blockers = st.f.untaken ? allBlockers : allBlockers.filter(([lab]) => { const ks = SCORE_KEYS.filter(k => NAME_RE[k].test(lab)); return !ks.length || ks.some(taken); });
      const allToggle = untaken.length ? `<label class="fcheck boost-all"><input type="checkbox" id="boostAll" ${st.f.untaken ? 'checked' : ''}> 也算沒考的科目（${untaken.map(k => ABBR[k]).join('、')}）和用到它們的系，想加考的話</label>` : '';
      const all = rows.flatMap(r => r.cells.filter(Boolean));
      const maxUp = Math.max(1, ...all.map(x => x.up));
      const bestOf = r => r.cells.filter(Boolean).reduce((a, x) => (x.up > (a ? a.up : 0) ? x : a), null);
      const ranked = rows.map(r => ({ r, b: bestOf(r) })).filter(x => x.b && x.b.up > 0).sort((a, b) => b.b.up - a.b.up || (a.b.to - a.r.cur) - (b.b.to - b.r.cur));
      const scale = c.mock ? `（${c.name}的級分）` : '';
      let hero;
      if (ranked.length) {
        const { r, b } = ranked[0];
        const lv = c.mock ? levelIn(c.std, r.k, b.to) : levelOf(r.k, b.to);
        const tw = trendWord(series.out[r.k]);
        hero = `<section class="hero"><span class="eyebrow">${icon('target', 'sm')}最值得補強</span><h2>${subj(r.k)} 從 ${r.cur || '沒考'} 考到 ${b.to} 級分</h2>
          <p>${scale ? `${scale.replace(/[（）]/g, '')}。` : ''}<b>${b.up}</b> 個校系落點變好${b.unlock ? `（${b.unlock} 個從過不了變成可以報）` : ''}。${lv && lv !== '未達底標' ? `${b.to} 級分達${c.mock ? '這次模考的' : '學測'}${lv}。` : ''}${tw ? `${esc(tw)}。` : ''}</p>
          ${ranked.length > 1 ? `<div class="alts">${ranked.slice(1, 4).map(x => `<span>${subj(x.r.k)} ${x.r.cur || '沒考'} → ${x.b.to}：${x.b.up} 個</span>`).join('')}</div>` : ''}</section>`;
      } else hero = `<section class="hero"><span class="eyebrow">${icon('target', 'sm')}最值得補強</span><h2>這些校系裡，每科多考 1–5 級分都不會改變落點</h2><p>換一個範圍看看（上面的「算哪些校系」）。</p></section>`;
      // one table: each subject now (with its 模考 trend), then what 1–5 more 級分 would do
      // One card per subject, most useful first: a small bar chart (taller = more 系 get a better 落點; the
      // number under a bar is the 級分 you would reach) and one sentence saying what it adds up to.
      const cards = rows.map(r => {
        const valid = r.cells.filter(Boolean), max = Math.max(0, ...valid.map(x => x.up));
        return { r, valid, max, best: max ? valid.find(x => x.up === max) : null };
      }).sort((a, b) => b.max - a.max || (a.best && b.best ? (a.best.to - a.r.cur) - (b.best.to - b.r.cur) : 0));
      const top = Math.max(1, ...cards.map(x => x.max));
      ui.gcards = {};
      const good0 = scope.filter(d => { const t = tierOf(d); return t === '穩' || t === '適中'; }).length;
      const trendTag = x => (!x || x.n < 2 ? '' : x.last > x.first ? '<span class="gi-tr up">模考進步中</span>' : x.last < x.first ? '<span class="gi-tr down">模考退步</span>' : '<span class="gi-tr">模考持平</span>');
      // Each kind of gain is named with the LEAST 級分 that reaches it: the 34 系 that stop being 過不了 at 12
      // stay unlocked at 13–15, so the sentence says 「考到 12 就有 34 個」, not the bar with the most 系變好.
      const say = ({ r, valid, max, best }) => {
        if (!valid.length) return '已經 15 級分（滿級分）。';
        if (!best) return '多考 1–5 級分，這些校系的落點都不會變。';
        const ul = Math.max(0, ...valid.map(x => x.unlock)), atUl = ul ? valid.find(x => x.unlock === ul) : null;
        const plateau = valid.some(x => x.to > best.to);
        const parts = [];
        if (atUl && atUl.to < best.to) parts.push(`考到 <b>${atUl.to}</b> 就有 <b>${ul}</b> 個原本過不了的變可報`);
        parts.push(`考到 <b>${best.to}</b> 變好的系最多（${max} 個）${atUl && atUl.to === best.to ? `，其中 ${ul} 個原本過不了` : ''}${plateau ? '，再多也不會更多' : ''}`);
        return parts.join('；') + '。';
      };
      const grid = `<ol class="gains">${cards.map(x => {
        const lv = x.r.cur ? (c.mock ? levelIn(c.std, x.r.k, x.r.cur) : levelOf(x.r.k, x.r.cur)) : '';
        // the bar you picked (default: the one with the most 系變好); every bar is a button
        const picked = x.valid.find(cl => cl.to === (ui.gsel || {})[x.r.k]) || x.best;
        const bars = [0, 1, 2, 3, 4].map(i => {
          const cl = x.r.cells[i];
          if (!cl) return '<span class="gb na"><i></i><small>—</small></span>';
          return `<button type="button" class="gb${picked === cl ? ' sel' : ''}${cl.up ? '' : ' zero'}" data-gsel="${x.r.k}:${cl.to}" aria-pressed="${picked === cl}" aria-label="${subj(x.r.k)}考到 ${cl.to} 級分：${cl.up} 個系變好${cl.unlock ? `，${cl.unlock} 個原本過不了` : ''}"><em>${cl.up}</em><i style="height:${Math.max(cl.up ? 5 : 3, (cl.up / top) * 64).toFixed(1)}px"></i><small>${cl.to}</small></button>`;
        }).join('');
        ui.gcards = ui.gcards || {};
        ui.gcards[x.r.k] = { cur: x.r.cur, cells: x.valid, good0 };
        return `<li class="gi${x.max ? '' : ' none'}" data-gcard="${x.r.k}"><div class="gi-h"><b>${subj(x.r.k)}</b><span class="gi-now">${x.r.cur ? `現在 ${x.r.cur}${lv && lv !== '未達底標' ? `・${lv}` : ''}` : '沒考'}</span>${trendTag(series.out[x.r.k])}</div>
          ${x.valid.length ? `<div class="gi-bars" role="group" aria-label="${subj(x.r.k)}：按柱子看考到幾級分的變化">${bars}</div>` : ''}
          ${picked && x.max ? `<div class="gi-stats">${gStatsHTML(x.r.cur, picked, good0)}</div>` : ''}<p class="gi-say">${say(x)}</p></li>`;
      }).join('')}</ol>`;
      const maxB = Math.max(1, ...blockers.map(b => b[1]));
      const blockHTML = blockers.length ? `<div class="hbars">${blockers.map(([k, n]) => `<div class="hb"><span class="l">${esc(k)}</span><span class="n">${n} 個系</span><span class="t" style="width:${Math.max(2, (n / maxB) * 100).toFixed(1)}%"></span></div>`).join('')}</div><p class="hint" style="margin-top:14px">用${esc(c.stdName)}算。</p>` : '<p class="hint" style="margin-top:12px">沒有被檢定擋住的校系。</p>';
      if (!ui.tryS || ui.trySig !== c.sig) { ui.tryS = { ...c.thS }; ui.trySig = c.sig; }
      const sc = tryScale();
      const tryGrid = SCORE_KEYS.filter(k => st.f.untaken || taken(k) || L.val(ui.tryS, k) != null).map(k => sliderHTML('try', k, subj(k), L.val(ui.tryS, k) || 0, 15, sc)).join('');
      el.innerHTML = head + ctxBarHTML() + scopeBarHTML(scope.length) + allToggle + hero +
        `<section class="sec">${hIcon('boost', '每一科多考幾級分，有幾個系變好？')}<p class="sub">柱子上是落點變好的系數，下面是考到幾級分${c.mock ? `（${esc(c.name)}的級分和五標）` : ''}。按一根柱子看那個分數的變化。</p><p class="gains-base">現在${esc(GOOD)} <b>${fmtN(good0)}</b> 個・過不了 <b>${fmtN(scope.filter(d => tierOf(d) === '不符').length)}</b> 個・共 ${fmtN(scope.length)} 個系</p>${grid}</section>
        <section class="sec">${hIcon('alert', '擋住你的檢定')}<p class="sub">因此進不了一階的校系數</p>${blockHTML}</section>
        <section class="sec" id="trySec">${hIcon('sliders', '試算')}<p class="sub">暫時改級分看落點怎麼變，不會改掉你存的成績。${c.mock ? `用${esc(c.name)}的級分和五標試算，跟上面「落點依據」一樣（篩選會照排名換算成學測級分）。` : ''}</p><div class="try-act"><button class="btn sm" type="button" data-act="tryReset">${icon('reset', 'sm')}改回「${esc(c.name)}」</button></div><div class="try-grid">${tryGrid}</div><div id="tryOut"></div></section>`;
      renderTry();
    }, 30);
  }
  function renderTry() {
    const out = $('#tryOut');
    if (!out || !ui.tryS) return;
    const c = cur(), S2 = ui.tryS, scope = boostScope();
    // compare on the scale the sliders use
    const c0 = {}, c1 = {}, better = [], worse = [];
    const has2 = hasScores(S2);
    for (const d of scope) {
      const t0 = tierOf(d), t1 = has2 ? evalAt(d, c, S2).tier : null;
      c0[t0] = (c0[t0] || 0) + 1;
      if (t1) c1[t1] = (c1[t1] || 0) + 1;
      if (t1 && TIERS.indexOf(t1) < TIERS.indexOf(t0) && t1 !== '無資料') better.push([d, t0, t1]);
      if (t1 && TIERS.indexOf(t1) > TIERS.indexOf(t0) && t0 !== '無資料') worse.push([d, t0, t1]);
    }
    better.sort((a, b) => (L.selectivity(b[0]) || 0) - (L.selectivity(a[0]) || 0));
    const W = out.clientWidth || 600;
    const same = JSON.stringify(SCORE_KEYS.map(k => L.val(S2, k))) === JSON.stringify(SCORE_KEYS.map(k => L.val(c.thS, k)));
    out.innerHTML = `<div class="cmpbars"><span>現在</span>${tierBarHTML(c0, scope.length, { small: true, width: W, label: '現在' })}<span>試算</span>${has2 ? tierBarHTML(c1, scope.length, { small: true, width: W, label: '試算' }) : '<span class="hint">試算成績都是沒考</span>'}</div>
      <div style="overflow-x:auto"><table class="cmptable"><thead><tr><th scope="col"><span class="sr">成績</span></th>${TIERS.map(t => `<th>${TL[t]}</th>`).join('')}</tr></thead><tbody><tr><td>現在</td>${TIERS.map(t => `<td>${c0[t] || 0}</td>`).join('')}</tr><tr><td>試算</td>${TIERS.map(t => { const a = c0[t] || 0, b = c1[t] || 0; const good = t === '穩' || t === '適中'; return `<td class="${b !== a ? ((b > a) === good ? 'up' : 'dn') : ''}">${has2 ? b : '—'}</td>`; }).join('')}</tr></tbody></table></div>
      ${same ? '<p class="hint" style="margin-top:12px">拖曳上面的格子改級分，這裡會比較落點變化。</p>' : better.length ? `<h3 style="font-size:14.5px;margin-top:18px">變好的校系（${better.length}）</h3><ul class="better">${better.slice(0, 40).map(([d, a, b]) => `<li>${pillHTML(a)}<span class="arr">→</span>${pillHTML(b)}<a href="#d=${d.c}" data-open="${d.c}">${esc(sch(d))} ${nameHTML(d.n)}</a></li>`).join('')}</ul>${better.length > 40 ? '<p class="hint">只列前 40 個（依 115 門檻高到低）。</p>' : ''}` : `<p class="hint" style="margin-top:12px">沒有校系的落點變好${worse.length ? `，有 ${worse.length} 個變差` : ''}。</p>`}`;
  }

  // ------------------------------------------------------------------ 分科與分發
  const U = D.uac;
  const UT = U ? { g60: U.g60, ast: U.ast } : null;
  // 申請 系 → the 分發 系組 of the same 系 (a 系 can have several 分發 groups)
  const UTWIN = {};
  if (U) U.depts.forEach(u => { u.isU = true; if (u.twin && BY_CODE[u.twin]) (UTWIN[u.twin] = UTWIN[u.twin] || []).push(u); else u.twin = null; });
  const ASTK = L.AST;
  const astName = k => L.AST_NAME[k] || subj(k);
  const uName = k => (L.AST_NAME[k] ? L.AST_NAME[k] : subj(k));
  const uAbbr = k => ({ 數甲: '數甲', 數乙: '數乙', 物: '物', 化: '化', 生: '生', 歷: '歷', 地: '地', 公: '公', 音: '音樂', 美: '美術', 體: '體育' }[k] || ABBR[k] || k);
  /** Until you choose: the 分科 subjects that go with your 學測 ones (數A → 數甲, 數B → 數乙, 自然 → 物化生, 社會 → 歷地公), estimated. */
  function astDefault(S) {
    const o = {}, has = k => L.val(S, k) != null;
    if (has('數A')) o.數甲 = 'e';
    if (has('數B')) o.數乙 = 'e';
    if (has('自')) ['物', '化', '生'].forEach(k => { o[k] = 'e'; });
    if (has('社')) ['歷', '地', '公'].forEach(k => { o[k] = 'e'; });
    return o;
  }
  const astPlan = () => st.ast || astDefault(cur().S);
  let UEV = new Map(), uSig = null, UM = {};
  function ensureUac() {
    const c = cur(), sig = c.sig + '|' + JSON.stringify(astPlan());
    if (sig === uSig) return;
    uSig = sig; UEV = new Map(); UM = {};
    if (!U || !hasScores(c.S)) return;
    UM = L.scores60(c.S, astPlan(), UT);
    for (const d of U.depts) UEV.set(d.c, L.evaluateUac(d, UM, c.thS, c.std));
  }
  const uTier = d => { const e = UEV.get(d.c); return e ? e.tier : null; };
  const isGood = t => t === '穩' || t === '適中';
  const uSch = d => SCHOOL[d.sid].n;
  /** The 分發 系組 under the shared filters: the 分發 groups of the 申請 系 in scope, plus 分發-only ones (as 找校系 lists them). */
  function uScope() {
    if (st.f.path === 'uac') return U.depts.filter(u => uPasses(u, true));
    const us = new Set(scopeDepts().flatMap(d => UTWIN[d.c] || []));
    for (const u of U.depts) if (!u.twin && uPasses(u, false)) us.add(u);
    return [...us];
  }
  /** 申請 vs 分發 on one yardstick: a 分發 系 is placed by the 115 申請 一階 門檻 of the same 系 (its twin). */
  function pathCompare(scope, us) {
    const appGood = scope.filter(d => isGood(tierOf(d)));
    const appSet = new Set(appGood.map(d => d.c));
    const uGood = us.filter(d => isGood(uTier(d)));
    const sel = d => L.selectivity(d) || 0;
    const top = (xs, f) => { const v = xs.map(f).filter(x => x > 0).sort((a, b) => b - a).slice(0, 5); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
    const twin = d => (d.twin ? BY_CODE[d.twin] : null);
    const uOnly = uGood.filter(d => !twin(d) || !appSet.has(d.twin));
    const uTwins = new Set(uGood.map(d => d.twin).filter(Boolean));
    const aOnly = appGood.filter(d => !uTwins.has(d.c));
    const best = (xs, f) => xs.slice().sort((a, b) => f(b) - f(a)).slice(0, 3);
    return {
      app: appGood, uac: uGood, aOnly, uOnly,
      aTop: top(appGood, sel), uTop: top(uGood, d => (twin(d) ? sel(twin(d)) : 0)),
      aBest: best(appGood, sel), uBest: best(uGood, d => L.uacSelectivity(d, UT) || 0),
    };
  }
  const hasAst = () => ASTK.some(k => UM[k]);
  /** One sentence: which path suits these scores better (or what is missing to tell). */
  function pathVerdict(p) {
    const d = p.uTop - p.aTop;
    if (!hasAst()) return ['選好要考的分科（上面），才能比分發', 'even'];
    if (!p.uac.length && !p.app.length) return ['兩條路現在都很難，先把成績拉上來', 'bad'];
    if (!p.uac.length) return ['申請比較有機會，分科當備案', 'app'];
    if (!p.app.length || d >= 0.6) return ['分科可能讓你上更好的系，值得拚', 'uac'];
    if (d <= -0.6) return ['申請比較有利，分科當備案', 'app'];
    return ['兩條路差不多：申請先試，分科當保底也能再拚', 'even'];
  }
  // 找校系 with both paths: a 申請 系 takes the better 落點 of its 一階 and its 分發 groups
  const RANK_BEST = { 穩: 0, 適中: 1, 衝: 2, 難: 3, 無資料: 4, 不符: 5 };
  const uBestOf = d => { const us = UTWIN[d.c]; return us ? us.reduce((a, u) => (RANK_BEST[uTier(u)] < RANK_BEST[uTier(a)] ? u : a)) : null; };
  function xTier(d) {
    if (d.isU) return uTier(d);
    const a = tierOf(d), u = st.f.path === 'both' ? uBestOf(d) : null;
    return u && RANK_BEST[uTier(u)] < RANK_BEST[a] ? uTier(u) : a;
  }
  /** A 分發 系組 under 找校系's filters (學群, 地區, 公私立, 關鍵字; 申請-only filters leave out 分發-only rows). */
  function uPasses(u, onlyUac) {
    const f = st.f;
    if (!onlyUac && (f.st2.length || f.sat !== 'all' || f.skip.length || f.combos.length)) return false;
    if (!f.cats.includes('一般')) return false;
    if (f.list !== 'all' && !(u.twin && listCodes().includes(u.twin))) return false;
    if (f.groups.length && !u.g.some(g => f.groups.includes(g))) return false;
    if (f.regions.length && !f.regions.includes(CITY_REGION[u.city])) return false;
    if (f.own !== 'all' && (SCHOOL[u.sid].pub ? 'pub' : 'pri') !== f.own) return false;
    if (qTerms.length) { const h = normQ(`${uSch(u)} ${schShort(u)} ${u.n} ${u.c} ${u.g.join(' ')}`); if (!qTerms.every(t => termHit(t, u, h))) return false; }
    return true;
  }
  /** 找校系's list for the chosen 管道: 申請 系 (each with its 分發 groups), 分發 系組 only, or both. */
  function exploreBase() {
    const p = U ? st.f.path : 'app';
    if (p === 'uac') return U.depts.filter(u => uPasses(u, true));
    const A = baseFiltered();
    // 分發-only 系組 join once there are scores to judge them
    return p === 'app' || !hasScores() ? A : A.concat(U.depts.filter(u => !u.twin && uPasses(u, false)));
  }
  // 分發 selectivity on the 申請 scale (avg 級分 per subject), so mixed rows sort together
  const uSel15 = u => { const x = L.uacSelectivity(u, UT); if (x == null) return null; for (let g = 15; g >= 1; g--) if (L.topPercent(D.pct, ['英'], g) >= 100 - x) return g; return 1; };
  // how hard a 系 was in 115 does not depend on your scores: work it out once
  const SEL = new Map();
  const xSel = d => { if (!SEL.has(d)) SEL.set(d, d.isU ? uSel15(d) : L.selectivity(d)); return SEL.get(d); };
  const uShort = e => (e.tier === '不符' ? (e.missing.length ? `要考${e.missing.map(uName).join('、')}` : '檢定沒過')
    : e.tier === '無資料' ? (e.arts ? '要考術科' : '沒有 115 分數')
      : `<span>你約 <b>${e.total.toFixed(0)}</b></span><span>115 最低 <b>${e.cut.toFixed(0)}</b></span>`);
  /** Under a 申請 row: the same 系 in 分發 (the best of its groups). */
  function uLineHTML(d) {
    const us = UTWIN[d.c], u = us && uBestOf(d), e = u && UEV.get(u.c);
    if (!e) return '';
    return `<div class="r-uac"><span class="pl">分發</span>${pillHTML(e.tier)}<span class="ul">${uShort(e)}${us.length > 1 ? `<small>${us.length} 組裡最好的</small>` : ''}</span></div>`;
  }
  /** Where you stand among 115 分發 考生 (學測) and 分科 考生, subject by subject. */
  function standHTML() {
    const out = [];
    for (const k of SCORE_KEYS) { const m = UM[k]; if (m) out.push({ k, top: L.topAt(U.g60[k], m.v), est: false, lab: subj(k) }); }
    for (const k of ASTK) { const m = UM[k]; if (m) out.push({ k, top: L.topAt(U.ast[k], m.v), est: m.kind === 'est', lab: astName(k) }); }
    const cls = t => (t <= 25 ? 'hi' : t <= 50 ? 'mid' : 'lo');
    return `<div class="str-rank">${out.map(x => `<span class="sr-c ${cls(x.top)}"><b>${x.lab}</b><small>${x.est ? '約' : ''}${fmtTop(x.top)}</small></span>`).join('')}</div>`;
  }
  /** 分科 subjects: not taking / estimated from 學測 / your own number (目標或模考). */
  function astEditorHTML() {
    const plan = astPlan(), c = cur(), std = U.astStd;
    const row = k => {
      const v = plan[k], mode = v === 'e' ? 'e' : v != null && v !== '' ? 'n' : '';
      const e = L.estimateAst(k, c.S, UT), m = UM[k];
      const lv = m && std[k] ? (L.LEVELS.find(l => m.v >= std[k][l]) || '未達底標') : '';
      const seg = [['', '不考'], ['e', '估計'], ['n', '自己填']].map(([x, l]) => `<button type="button" data-astmode="${k}:${x}" aria-pressed="${mode === x}" ${x === 'e' && !e ? 'disabled' : ''}>${l}</button>`).join('');
      const body = mode === 'e' && e ? `<span class="av"><b class="num">約 ${e.v}</b><small>${e.lo}–${e.hi}・從學測${subj(e.from)}的排名推</small></span>`
        : mode === 'n' ? `<span class="av"><input type="number" inputmode="numeric" min="0" max="60" value="${v}" data-astv="${k}" aria-label="${astName(k)}級分（0–60）"><small>/ 60</small></span>`
          : '';
      return `<div class="ar"><span class="ak">${astName(k)}</span><div class="segctl sm" role="group" aria-label="${astName(k)}">${seg}</div>${body}${lv && mode ? `<span class="alv">${lv}</span>` : ''}</div>`;
    };
    return `<section class="sec" id="astSec">${hIcon('edit', '分科成績', 'h2', '<small class="h-sub">想走分發入學的話</small>')}<p class="sub">每科 0–60 級分。還沒考就先用估計，或填目標、分科模考的成績。分發裡的學測科目也換成 60 級分（g 級分 ≈ 4g−3～4g）。</p>
      <div class="ars">${ASTK.map(row).join('')}</div>
      <p class="hint">估計：你的學測在 115 分發考生裡排前幾 %，就當你在 115 分科考生裡也排那裡（數A → 數甲、數B → 數乙、自然 → 物化生、社會 → 歷地公；沒考對應的學測科目就不能估，要考的話選自己填）。分科只考一科、範圍更深，實際可能差很多。標是 115 分科五標。${st.ast ? ' <button class="textbtn" type="button" data-act="astReset">改回照學測自動選</button>' : ''}</p></section>`;
  }
  function uRowHTML(d) {
    const e = UEV.get(d.c), t = e ? e.tier : null, r = d.r115;
    const chips = d.use.map(u => { const m = UM[u.k]; return `<span class="uc${m ? '' : ' miss'}"><span>${uAbbr(u.k)}${u.w !== 1 ? `×${u.w.toFixed(2).replace(/0$/, '')}` : ''}</span>${u.x === '術科' ? '<small>術科</small>' : m ? `<b>${m.kind === 'ast' ? '' : '≈'}${Math.round(m.v)}</b>` : '<small>沒考</small>'}</span>`; }).join('');
    let head, more = '';
    if (!e) head = r && r.cut != null ? `115 最低錄取 <b>${r.cut}</b>` : '116 新的系組';
    else if (t === '不符') {
      head = e.missing.length ? `要考${e.missing.map(uName).join('、')}` : `檢定沒過：${e.thFail.map(alts => alts.map(a => (a.k === '聽' ? `英聽 ${a.t} 級` : `${subj(a.k)} ${a.t}`)).join(' 或 ')).join('、')}`;
    } else if (t === '無資料') head = e.arts ? '要考術科，這裡算不了' : r ? '115 沒有錄取分數' : '116 新的系組，沒有 115 分數';
    else {
      const per = e.margin;
      head = `<span class="uh"><span class="lab">你約</span><b>${e.total.toFixed(1)}</b></span><span class="uh"><span class="lab">115 最低</span><b>${e.cut.toFixed(1)}</b></span><span class="delta ${per >= 0 ? 'up' : 'down'}">每科${per >= 0 ? '多' : '差'} ${Math.abs(per).toFixed(1)}</span>`;
      const notes = [];
      if (e.est) notes.push(`含估計，範圍 ${e.lo.toFixed(0)}–${e.hi.toFixed(0)}`);
      if (r.via) notes.push(`115 是「${esc(r.via)}」`);
      else if (r.use) notes.push(`115 採計 ${r.use.map(u => uAbbr(u.k) + (u.w !== 1 ? '×' + u.w : '')).join(' ')}，門檻照權重換算`);
      if (notes.length) more = `<div class="rv-n">${notes.join('・')}</div>`;
    }
    return `<li class="row urow">${schBadge(d)}<div class="r-title"><span class="sch">${esc(uSch(d))}</span><span class="dn">${nameHTML(d.n)}</span></div>
      <div class="r-act"><span class="utag">${d.twin ? '分發' : '只有分發'}</span></div>
      <div class="r-cmp">${e ? verdict(t, head, more) : `<div class="rv-h">${head}</div>`}</div>
      <div class="ucs">${chips}</div>
      <div class="r-meta"><span class="pt">分發 ${d.c}</span><span class="pt">${icon('users', 'sm')}名額 ${d.q ?? '—'}</span>${r && r.adm ? `<span class="pt">115 錄取 ${r.adm}</span>` : ''}${d.th.length ? `<span class="pt">${icon('shield', 'sm')}檢定 ${d.th.map(alts => alts.map(a => (a.k === '聽' ? `英聽${a.t}` : `${uAbbr(a.k)}${a.t.replace('標', '')}`)).join('或')).join('、')}</span>` : ''}</div>
      ${d.note ? `<details class="unote"><summary>選系說明</summary><p>${esc(d.note)}</p></details>` : ''}</li>`;
  }
  /** In a 申請 系's detail: the same 系 in 分發, with your 分發 落點. */
  function uacTwinHTML(d) {
    const us = UTWIN[d.c] || [];
    if (!us.length) return '';
    ensureUac();
    const row = u => {
      const e = UEV.get(u.c);
      const use = u.use.map(x => `<span class="nw">${uAbbr(x.k)}${x.w !== 1 ? '×' + x.w : ''}${x.x === '分科' ? '<small>分科</small>' : ''}</span>`).join('、');
      const line = [`採計 ${use}`, u.r115 && u.r115.cut != null ? `115 最低 ${u.r115.cut}` : '', e && e.margin != null ? `你約 ${e.total.toFixed(1)}` : e && e.tier === '不符' && e.missing.length ? `要考${e.missing.map(uName).join('、')}` : ''].filter(Boolean).join('・');
      return `<div class="ut">${e ? pillHTML(e.tier) : ''}<div><b>${esc(u.n)}</b> <span class="muted num">${u.c}</span><p>${line}</p></div></div>`;
    };
    return `<section class="d-sec">${hIcon('fork', '分發入學（考分科）', 'h3', '<small>116 分發分則</small>')}${us.map(row).join('')}</section>`;
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
    $('#guide').innerHTML = `<header class="page-h"><div><h1 class="hi">${icon('guide')}<span>時程與規則</span></h1><p>116 個人申請日程與規則（116 學生手冊、招生簡章）。</p></div></header>
      <section class="count-hero">${hero}</section>
      <section class="sec">${hIcon('cal', '116 個人申請時程')}<ol class="tl">${tl}</ol></section>
      <section class="sec">${hIcon('shield', '一定要知道的規則')}<ol class="rules">
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
      <section class="sec">${hIcon('target', '一階過得了嗎？標籤的意思')}<ul class="tdefs">${TIERS.map(t => `<li>${pillHTML(t)}<span>${esc(TIER_HELP[t])}</span></li>`).join('')}</ul>
        <p class="hint" style="margin-top:14px">只是估計，不是錄取機率。</p>
        <details class="fold"><summary>${icon('chevR', 'sm')}怎麼算的</summary><div class="prose">
        <p><b>申請</b>：照 116 的科目、倍率和順序一關一關看，每關只跟 115 同樣科目的最低級分比。收的人數差超過 10% 就用 115 級分人數表換算。</p>
        <p><b>模考</b>：檢定拿你的模考級分比那次模考的五標；倍率篩選先把模考級分照排名換算成學測級分，再比 115 門檻。</p>
        ${U ? `<p><b>分發</b>：學測、分科都換成 60 級分照權重加總，比 115 最低錄取分數；每科平均多 ${L.UAC_SAFE} 級分以上＝穩過。</p>` : ''}</div></details></section>
      <section class="sec">${hIcon('doc', '審查資料代碼')}<p class="sub">課程學習成果最多 3 件、多元表現最多 10 件。</p><div class="codegrid">${Object.entries(REVIEW).map(([k, v]) => `<span class="code"><b>${k}</b>${v}</span>`).join('')}</div></section>
      <section class="sec">${hIcon('book', '資料來源')}<ul class="srcs">
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
    setQ(st.f.q);
    ensureEval();
    ensureUac();
    renderNav();
    if (ui.tab === 'explore') renderExplore();
    else if (ui.tab === 'plan') renderPlan();
    else if (ui.tab === 'boost') renderBoost();
    else if (ui.tab === 'scores') renderScores();
    else renderGuide();
    // the filter sheet can be opened from 我的成績 and 怎麼進步 too
    if (ui.sheet && ui.tab !== 'explore') { renderFilterPanel(); $('#sheetDone').textContent = '完成'; }
    save();
  }
  function setTab(name, fromRoute) {
    if (!TABS.includes(name)) name = 'explore';
    const changed = name !== ui.tab;
    if (changed && ui.tab === 'scores' && ui.mf && !ui.mf.id) ui.mf = null; // an unsaved new 模考 form does not follow you around
    ui.tab = name;
    TABS.forEach(v => { $('#view-' + v).hidden = v !== name; });
    if (!fromRoute && !/^#d=/.test(location.hash)) history.replaceState(null, '', tabHash(name));
    render();
    if (changed) window.scrollTo(0, 0);
  }
  function route() {
    if (/^#import=/.test(location.hash)) {
      const code = location.hash.slice(8);
      history.replaceState(null, '', location.pathname + location.search);
      unpackState(code).then(confirmImport, () => toast('這個連結的資料不完整，請重新傳一次'));
      return;
    }
    const m = /^#d=(\d{6})$/.exec(location.hash);
    if (m && BY_CODE[m[1]]) { if (!$('#detail').open || detailCode !== m[1]) openDetail(m[1], true); return; }
    if ($('#detail').open) { detailPushed = false; $('#detail').close(); }
    const t = HASH_TAB[location.hash] || 'explore';
    if (t !== ui.tab) setTab(t, true);
  }
  // ------------------------------------------------------------------ filter sheet (phones and tablets)
  function openSheet() {
    const dlg = $('#sheet');
    $('#sheetBody').appendChild($('#filterPanel'));
    ui.sheet = true;
    render();
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
  function commitSlider(t, delay) {
    clearTimeout(commitTimer);
    const kind = t.dataset.slider != null ? 'slider' : 'try';
    const k = t.dataset.slider || t.dataset.try;
    const v = +t.dataset.v;
    const run = () => {
      if (kind === 'slider') { st.scores[k] = v ? String(v) : ''; ui.shown = PAGE; render(); }
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
    showCats: () => {
      ui.catsOpen = true;
      if (getComputedStyle($('#filterPanel')).display === 'none' || $('#filterPanel').parentElement !== $('#rail')) { openSheet(); }
      else render();
      const b = $('#catsBox');
      if (b) { b.open = true; b.scrollIntoView({ block: 'center', behavior: 'smooth' }); const c = b.querySelector('.chip'); if (c) c.focus({ preventScroll: true }); }
    },
    clearScores: () => { st.scores = DEFAULT().scores; ui.shown = PAGE; render(); toast('已清除學測級分'); },
    resetFilters: () => { st.f = { ...DEFAULT().f, sort: st.f.sort, q: st.f.q, tiers: st.f.tiers, path: st.f.path }; ui.shown = PAGE; render(); },
    resetAll: () => { st.f = { ...DEFAULT().f, sort: st.f.sort, path: st.f.path }; $('#q').value = ''; ui.shown = PAGE; render(); },
    resetCats: () => { st.f.cats = DEFAULT_CATS.slice(); ui.shown = PAGE; render(); },
    openFilters: () => openSheet(),
    showTiers: () => { st.f.tiers = TIERS.slice(); render(); },
    goStrength: () => { setTab('scores'); requestAnimationFrame(() => { const el = $('#strengthSec'); if (el) el.scrollIntoView({ block: 'start' }); }); },
    astReset: () => { st.ast = null; render(); },
    quizOpen: () => openQuiz(),
    quizBack: () => { ui.qi = Math.max(0, (ui.qi || 0) - 1); ui.qDir = -1; renderQuiz(); },
    quizNext: () => { ui.qi = Math.min(47, (ui.qi || 0) + 1); ui.qDir = 1; renderQuiz(); },
    quizRedo: () => { st.quiz = []; ui.qRedo = false; ui.qi = 0; save(); renderQuiz(); },
    quizApply: () => { const r = quizResult(st.quiz); if (!r) return; st.hol = r.code.slice(); $('#quiz').close(); render(); toast(`用 ${r.code.join('')} 排學群`); requestAnimationFrame(() => { const el = $('#strengthSec'); if (el) el.scrollIntoView({ block: 'start' }); }); },
    gxAll: () => { ui.gxAll = !ui.gxAll; render(); },
    showUntaken: () => { st.f.untaken = true; render(); },
    mfNew: () => { ui.mf = newMockDraft(); if (ui.tab !== 'scores') setTab('scores'); else render(); requestAnimationFrame(() => { const f = $('#mockForm'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); },
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
    exportState: () => download(`apply116-backup-${todayISO()}.json`, JSON.stringify(st, null, 1), 'application/json'),
    moveOpen: () => openMove(),
    reportOpen: () => openReport(),
    repCopy: () => copyText(ui.repText, '已複製報告：可以貼給老師或 AI'),
    repDownload: () => download(`116選系報告-${todayISO()}.md`, ui.repText, 'text/markdown;charset=utf-8'),
    repShare: () => navigator.share({ title: '116 大學選系報告', text: ui.repText }).catch(() => {}),
    repClose: () => $('#report').close(),
    moveShare: () => navigator.share({ title: '我的選系資料', text: '在另一台裝置打開這個連結，匯入我的選系資料', url: ui.moveLink }).catch(() => {}),
    moveCopyLink: () => copyText(ui.moveLink, '已複製連結：傳給自己，在另一台打開'),
    moveCopyCode: () => copyText($('#mvCode').value, '已複製轉移碼'),
    movePaste: () => { const v = $('#mvPaste').value; if (!v.trim()) { toast('先貼上轉移碼或連結'); return; } unpackState(v).then(confirmImport, () => toast('轉移碼不完整或不是這個工具的')); },
    moveApply: () => { const s = ui.pending; ui.pending = null; $('#move').close(); if (s) { applyImported(s); toast('已匯入'); } },
    moveCancel: () => { ui.pending = null; $('#move').close(); },
    tryReset: () => { ui.tryS = { ...cur().thS }; $$('#trySec .track').forEach(t => paintSlider(t, L.val(ui.tryS, t.dataset.try) || 0)); renderTry(); },
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
      if (ds.src) { if (ds.src === st.src && !ui.mf) return; useSource(ds.src); return; }
      if (ds.qans) {
        if (ui.qBusy) return;
        const i = ui.qi || 0;
        // show the choice land before moving on: the button fills in with a check, then the next item slides in
        b.parentNode.querySelectorAll('.qz-o').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        b.classList.add('pick');
        if (navigator.vibrate) navigator.vibrate(8);
        ui.qBusy = true; ui.qDir = 1;
        st.quiz = Array.from({ length: 48 }, (_, j) => st.quiz[j] || 0);
        st.quiz[i] = +ds.qans;
        save();
        // the next unanswered item, or the result when all 48 are in
        const next = st.quiz.findIndex((x, j) => j > i && !x);
        ui.qi = next >= 0 ? next : st.quiz.findIndex(x => !x) >= 0 ? st.quiz.findIndex(x => !x) : 47;
        setTimeout(() => { ui.qBusy = false; renderQuiz(); if (quizResult(st.quiz)) render(); }, 260);
        return;
      }
      if (ds.list) { st.f.list = ds.list; ui.shown = PAGE; render(); return; }
      if (ds.astmode) {
        const [k, m] = ds.astmode.split(':'), plan = { ...astPlan() };
        if (m === '') delete plan[k];
        else if (m === 'e') plan[k] = 'e';
        else { const e = L.estimateAst(k, cur().S, UT); plan[k] = String(e ? e.v : 30); }
        st.ast = plan; render(); return;
      }
      if (ds.path) { st.f.path = ds.path; ui.shown = PAGE; render(); return; }
      if (ds.gx) {
        // the best 系 you would likely pass in that 學群: a clean 找校系 so the list means exactly that
        st.f = { ...st.f, groups: [ds.gx], list: 'all', tiers: ['穩', '適中'], sort: 'select' };
        ui.shown = PAGE;
        setTab('explore');
        toast(`${ds.gx}學群裡${GOOD}的系，去年門檻高的在前`);
        return;
      }
      if (ds.have) { toggle(st.have, ds.have); render(); return; }
      if (ds.hol) {
        if (st.hol.includes(ds.hol)) st.hol = st.hol.filter(x => x !== ds.hol);
        else if (st.hol.length >= 3) { toast('最多選 3 個'); return; } else st.hol = [...st.hol, ds.hol];
        render(); return;
      }
      if (ds.gsel) {
        const [k, to] = ds.gsel.split(':'), card = ui.gcards && ui.gcards[k], li = b.closest('[data-gcard]');
        const cl = card && card.cells.find(x => x.to === +to);
        if (!cl || !li) return;
        ui.gsel = { ...(ui.gsel || {}), [k]: cl.to };
        $$('.gb[data-gsel]', li).forEach(x => { const on = x === b; x.classList.toggle('sel', on); x.setAttribute('aria-pressed', on); });
        const box = $('.gi-stats', li);
        if (box) box.innerHTML = gStatsHTML(card.cur, cl, card.good0);
        return;
      }
      if (ds.mockdel) {
        const m = st.mocks.find(x => x.id === ds.mockdel);
        if (m && confirm(`刪除「${mName(m)}」（${mdText(m.d)}）？`)) { st.mocks = st.mocks.filter(x => x !== m); if (st.src === m.id) st.src = 'test'; if (ui.mf && ui.mf.id === m.id) ui.mf = null; render(); toast('已刪除'); }
        return;
      }
      if (ds.stdcopy) {
        const [target, y] = ds.stdcopy.split(':'), tab = stdTable(target);
        if (tab) for (const k of SCORE_KEYS) Object.assign(tab[k], D.std[y][k]);
        render(); toast(`已填入 ${y} 學年度學測五標`); return;
      }
      if (ds.mockedit) { const m = st.mocks.find(x => x.id === ds.mockedit); if (m) { ui.mf = editMockDraft(m); render(); requestAnimationFrame(() => $('#mockForm') && $('#mockForm').scrollIntoView({ behavior: 'smooth', block: 'start' })); } return; }
      if (ds.combo) { toggle(f.combos, ds.combo); ui.shown = PAGE; render(); return; }
      if (ds.listen) { st.scores.聽 = ds.listen === 'none' ? '' : ds.listen; render(); return; }
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
      if (b.id === 'qClose') { $('#quiz').close(); return; }
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
      // a choice is final: let go of the <select> so a re-render cannot bring its picker back (Safari on iPhone)
      if (t.tagName === 'SELECT') t.blur();
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
      if (t.dataset.srcsel != null) { useSource(t.value); return; }
      if (t.dataset.astv) {
        const n = Math.round(Number(t.value));
        if (t.value !== '' && Number.isFinite(n) && n >= 0 && n <= 60) { st.ast = { ...astPlan(), [t.dataset.astv]: String(n) }; render(); } else toast('分科級分是 0–60');
        return;
      }
      if (t.dataset.std) {
        const [target, k, l] = t.dataset.std.split(':'), n = Math.round(Number(t.value)), tab = stdTable(target);
        if (tab && Number.isFinite(n) && n >= 1 && n <= 15) tab[k][l] = n;
        else toast('五標要填 1–15 級分');
        render();
        return;
      }
      if (t.dataset.rep) { ui.rep[t.dataset.rep] = t.checked; ui.repDraw(); return; }
      if (t.id === 'boostAll') { st.f.untaken = t.checked; ui.shown = PAGE; render(); return; }
      if (t.id === 'untakenBox') { st.f.untaken = t.checked; ui.shown = PAGE; render(); return; }
      if (t.id === 'sort') { st.f.sort = t.value; ui.shown = PAGE; render(); return; }
      if (t.id === 'importState') {
        const file = t.files[0];
        if (!file) return;
        file.text().then(txt => {
          const s = JSON.parse(txt);
          if (!s || s.v !== 1) throw new Error('not a backup');
          confirmImport(s);
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
      if (id === 'pathWhy' && ui.whyOpen !== ev.target.open) { ui.whyOpen = ev.target.open; if (ui.whyOpen) render(); }
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
    $('#quiz').addEventListener('close', () => { if (ui.tab === 'scores') render(); });
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

  // ------------------------------------------------------------------ no orphans
  // Chinese text can break after any character, so a sentence often ends with 1–2 characters alone on its last
  // line (CSS text-wrap: pretty does not prevent this for CJK). After every render, the last few characters of
  // each sentence are glued into one unbreakable piece, so a last line always has at least four characters.
  const GLUE_SEL = 'p, li, dd, td, .hint, .sub, .ctx-note, .step-d, .rv-note, .rv-text, .rv-v, .sc-sub, .long, .s2lead';
  function glue(root) {
    for (const el of root.querySelectorAll(GLUE_SEL)) {
      if (el.dataset.g) continue;
      el.dataset.g = '1';
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let last = null;
      while (w.nextNode()) if (w.currentNode.textContent.trim()) last = w.currentNode;
      if (!last || last.parentElement.closest('.nw, button, select, .pill, .chip, .delta')) continue;
      const raw = last.textContent, t = raw.replace(/\s+$/, ''), ch = [...t];
      if (ch.length < 8) continue;
      let n = 4; // never split a Latin word or number from the glued tail
      while (n < ch.length - 1 && /[A-Za-z0-9.%+\-→]/.test(ch[ch.length - n - 1]) && /[A-Za-z0-9.%+\-→]/.test(ch[ch.length - n])) n++;
      const span = document.createElement('span');
      span.className = 'nw';
      span.textContent = ch.slice(-n).join('') + raw.slice(t.length);
      last.textContent = ch.slice(0, -n).join('');
      last.after(span);
    }
  }
  let glueQueued = false;
  new MutationObserver(() => { if (glueQueued) return; glueQueued = true; requestAnimationFrame(() => { glueQueued = false; glue(document.body); }); }).observe(document.body, { childList: true, subtree: true });

  // ------------------------------------------------------------------ init
  $('#tabs').innerHTML = NAV.map(([k, l, , ic]) => `<button class="tab" type="button" data-tab="${k}">${icon(ic)}${l}${k === 'plan' ? '<span class="count" data-plancount></span>' : ''}</button>`).join('');
  $('#bottomnav').innerHTML = NAV.map(([k, , s, ic]) => `<button class="bnav" type="button" data-tab="${k}">${icon(ic)}<span>${s}</span>${k === 'plan' ? '<span class="count" data-plancount></span>' : ''}</button>`).join('');
  if (st.theme) document.documentElement.dataset.theme = st.theme;
  $('#q').value = st.f.q;
  renderCountdown();
  bind();
  const startTab = HASH_TAB[location.hash] || 'explore';
  ui.tab = '';
  setTab(startTab, true);
  route();
  window.__app = { D, st: () => st, evaluate: c => EV.get(c), evaluateUac: c => { ensureUac(); return UEV.get(c); }, ctx: () => cur(), render };
});
