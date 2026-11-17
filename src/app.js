/* 116 申請入學選系 UI. Depends on window.Logic and the embedded #app-data JSON. */
(function () {
  'use strict';
  const L = window.Logic;
  const D = JSON.parse(document.getElementById('app-data').textContent);
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SCHOOL = Object.fromEntries(D.schools.map(s => [s.id, s]));
  const BY_CODE = Object.fromEntries(D.depts.map(d => [d.c, d]));
  const GROUPS = ['資訊', '工程', '數理化', '醫藥衛生', '生命科學', '生物資源', '地球環境', '建築設計', '藝術', '社會心理', '大眾傳播', '外語', '文史哲', '教育', '法政', '管理', '財經', '遊憩運動', '其他'];
  const REGIONS = Object.keys(D.regions);
  const CITY_REGION = {};
  for (const [r, cs] of Object.entries(D.regions)) cs.forEach(c => { CITY_REGION[c] = r; });
  const CATS = [['一般', '一般組'], ['公費', '公費生'], ['APCS', 'APCS 組'], ['術科', '術科（音樂美術體育）'], ['扶弱', '扶弱專組'], ['青儲', '青年儲蓄帳戶組']];
  const TIER_HELP = {
    '穩': '每一關都高出去年最低，而且就算門檻漲 1 級分也還會過',
    '適中': '高於或等於去年門檻，但差距小，或今年規則有變',
    '衝': '剛好等於去年最後一關（看超額篩選），或略低於去年',
    '難': '明顯低於去年門檻',
    '不符': '檢定沒過，或沒考 116 要篩選的科目：一定進不了一階',
    '無資料': '116 新設或改名、沒有去年資料，或只用術科篩選',
  };
  const REVIEW = { A: '修課紀錄', B: '書面報告', C: '實作作品', D: '自然科學探究與實作成果', E: '社會領域探究活動成果', F: '自主學習計畫與成果', G: '社團活動經驗', H: '擔任幹部經驗', I: '服務學習經驗', J: '競賽表現', K: '非修課紀錄之成果作品', L: '檢定證照', M: '特殊優良表現證明', N: '多元表現綜整心得', O: '高中學習歷程反思', P: '就讀動機', Q: '未來學習計畫與生涯規劃' };
  const SCORE_KEYS = ['國', '英', '數A', '數B', '社', '自'];
  const LS = 'apply116-v1';
  const PAGE = 60;

  // ---------------- state
  const DEFAULT = () => ({
    v: 1,
    scores: { 國: '', 英: '', 數A: '', 數B: '', 社: '', 自: '', 聽: '', 識: '', 實: '' },
    stdYear: '115',
    f: { q: '', groups: [], regions: [], own: 'all', tiers: ['穩', '適中', '衝', '難', '無資料'], cats: ['一般', '公費', 'APCS'], st2: [], sort: 'chance' },
    fav: [], plan: [], theme: '',
  });
  let st = load();
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(LS)); } catch (e) { /* storage unavailable */ }
    const d = DEFAULT();
    if (!s || s.v !== 1) return d;
    return { ...d, ...s, scores: { ...d.scores, ...s.scores }, f: { ...d.f, ...s.f } };
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) { /* ignore */ } }, 150);
  }

  // ---------------- evaluation cache
  let EV = new Map();
  function hasScores() { return SCORE_KEYS.some(k => L.val(st.scores, k) != null); }
  function opts() { return { std: D.std[st.stdYear], stdByYear: D.std, stdYear: st.stdYear, pct: D.pct }; }
  function evaluateAll() {
    EV = new Map();
    if (!hasScores()) return;
    const o = opts();
    for (const d of D.depts) EV.set(d.c, L.evaluate(d, st.scores, o));
  }
  function tierOf(d) { const e = EV.get(d.c); return e ? e.tier : null; }

  // ---------------- helpers
  const sch = d => SCHOOL[d.sid].n;
  function catOf(d) { return d.cats.length ? d.cats : ['一般']; }
  function stdVal(k, label) { const r = D.std[st.stdYear] && D.std[st.stdYear][k]; return r ? r[label] : '?'; }
  function subjShort(parts) { return parts.map(p => L.SUBJ_NAME[p] || p).join('+'); }
  function fmtPct(x) { if (x == null) return ''; return x < 1 ? '前 ' + x.toFixed(2) + '%' : '前 ' + x.toFixed(1) + '%'; }
  function rocDate(s) { const m = /116\.(\d+)\.(\d+)/.exec(s || ''); return m ? `${m[1]}/${m[2]}` : (s && s !== '--' ? s : '—'); }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }
  function stage2Summary(d) {
    const parts = [];
    if (d.sp) parts.push(`學測 ${d.sp}%`);
    for (const x of d.st2) parts.push(`${x.i.replace(/^指定項目甄試[:：]?/, '')} ${x.p}%`);
    if (d.arts && d.arts.p) parts.push(`術科 ${d.arts.p}%`);
    return parts.join('・');
  }
  function requirementLine(d) {
    const th = d.sub.filter(s => s.t).map(s => {
      if (s.k === '聽') return '英聽' + s.t;
      if (s.apcs) return L.SUBJ_NAME[s.p[0]] + s.t + '級';
      return L.SUBJ_NAME[s.k] ? L.SUBJ_NAME[s.k].replace('數學', '數') + s.t : s.k + s.t;
    });
    const cut = d.r115 && d.r115.cut && d.r115.cut.length ? d.r115.cut.map(c => c.raw).join(' → ') : (d.r115 ? '115 沒篩人' : '無 115 資料');
    return (th.length ? '檢定 ' + th.join('、') : '無檢定') + '　|　115 一階 ' + cut;
  }

  // ---------------- scores UI
  function scoreSelect(k, label, max, extra) {
    const v = st.scores[k];
    const opts = ['<option value="">沒考</option>'];
    for (let i = max; i >= 1; i--) opts.push(`<option value="${i}" ${String(v) === String(i) ? 'selected' : ''}>${i}</option>`);
    return `<label class="score ${v !== '' && v != null && Number(v) > 0 ? 'filled' : ''}" data-k="${k}">${label}<select data-score="${k}" aria-label="${label}">${opts.join('')}</select><span class="pct">${extra || ''}</span></label>`;
  }
  function renderScores() {
    const ls = st.scores.聽 || '';
    $('#scoreGrid').innerHTML = SCORE_KEYS.map(k => {
      const v = L.val(st.scores, k);
      const p = v != null ? L.topPercent(D.pct, [k], v) : null;
      return scoreSelect(k, L.SUBJ_NAME[k], 15, p != null ? '115 ' + fmtPct(p) : '');
    }).join('') +
      `<label class="score ${ls ? 'filled' : ''}">英聽<select data-score="聽" aria-label="英聽"><option value="">沒考</option>${['A', 'B', 'C', 'F'].map(g => `<option ${ls === g ? 'selected' : ''}>${g}</option>`).join('')}</select><span class="pct"></span></label>`;
    $('#scoreGrid2').innerHTML = scoreSelect('識', 'APCS 觀念', 5, '') + scoreSelect('實', 'APCS 實作', 5, '');
    $('#stdYear').innerHTML = Object.keys(D.std).sort().reverse().map(y => `<option value="${y}" ${y === st.stdYear ? 'selected' : ''}>${y} 學年度學測五標</option>`).join('');
    const s = D.std[st.stdYear];
    $('#stdHint').innerHTML = `116 學測五標 2027/2/25 才公布，先用 ${st.stdYear} 年的：` +
      SCORE_KEYS.map(k => `${L.SUBJ_NAME[k]} ${['頂標', '前標', '均標', '後標', '底標'].map(l => s[k][l]).join('/')}`).join('；') + '（頂/前/均/後/底）。';
  }

  // ---------------- filters UI
  function chip(label, pressed, data, extra, cls) {
    return `<button class="chip ${cls || ''}" aria-pressed="${pressed}" ${data}>${esc(label)}${extra != null ? `<span class="n">${extra}</span>` : ''}</button>`;
  }
  function baseFiltered(skip) {
    // everything except the tier filter (so tier chips can show counts)
    const f = st.f;
    const q = f.q.trim().toLowerCase();
    const terms = q ? q.split(/[\s,，、]+/).filter(Boolean) : [];
    return D.depts.filter(d => {
      if (skip !== 'groups' && f.groups.length && !d.g.some(g => f.groups.includes(g))) return false;
      if (f.regions.length && !f.regions.includes(CITY_REGION[d.city])) return false;
      if (f.own !== 'all' && (SCHOOL[d.sid].pub ? 'pub' : 'pri') !== f.own) return false;
      if (!catOf(d).some(c => f.cats.includes(c)) || (d.cats.includes('青儲') && !f.cats.includes('青儲')) || (d.cats.includes('扶弱') && !f.cats.includes('扶弱'))) return false;
      if (f.st2.includes('noInterview') && d.st2.some(x => /面試|口試/.test(x.i))) return false;
      if (f.st2.includes('noWritten') && d.st2.some(x => /筆試|測驗/.test(x.i))) return false;
      if (f.st2.includes('satHeavy') && !(d.sp >= 50)) return false;
      if (terms.length) {
        const hay = (sch(d) + ' ' + d.n + ' ' + d.c + ' ' + d.g.join(' ') + ' ' + (d.rv || '') + ' ' + (d.rn || '') + ' ' + (d.iv || '') + ' ' + (d.notes || '') + ' ' + d.city).toLowerCase();
        if (!terms.every(t => hay.includes(t))) return false;
      }
      return true;
    });
  }
  function renderFilters(base) {
    const f = st.f;
    const counts = {};
    for (const d of base) { const t = tierOf(d) || '—'; counts[t] = (counts[t] || 0) + 1; }
    $('#tierChips').innerHTML = hasScores()
      ? L.TIERS.map(t => chip(t, f.tiers.includes(t), `data-tier="${t}" title="${TIER_HELP[t]}"`, counts[t] || 0, 't-' + t)).join('')
      : '<span class="hint inline">先輸入成績</span>';
    const gc = {};
    for (const d of baseFiltered('groups')) d.g.forEach(g => { gc[g] = (gc[g] || 0) + 1; });
    $('#groupChips').innerHTML = GROUPS.map(g => chip(g, f.groups.includes(g), `data-group="${g}"`, gc[g] || 0)).join('');
    $('#regionChips').innerHTML = REGIONS.map(r => chip(r + (r === '離島' ? '' : '部'), f.regions.includes(r), `data-region="${r}"`)).join('');
    $('#ownChips').innerHTML = [['all', '全部'], ['pub', '公立'], ['pri', '私立']].map(([k, l]) => chip(l, f.own === k, `data-own="${k}"`)).join('');
    $('#catChips').innerHTML = CATS.map(([k, l]) => chip(l, f.cats.includes(k), `data-cat="${k}"`)).join('');
    $('#st2Chips').innerHTML = [['noInterview', '不用面試'], ['noWritten', '不用筆試'], ['satHeavy', '學測佔 50% 以上']].map(([k, l]) => chip(l, f.st2.includes(k), `data-st2="${k}"`)).join('');
    const fs = [f.groups.join('、'), f.regions.map(r => r + (r === '離島' ? '' : '部')).join('、'), f.own === 'pub' ? '公立' : f.own === 'pri' ? '私立' : '', f.q ? '「' + f.q + '」' : ''].filter(Boolean).join('・');
    $('#filterSum').textContent = fs ? '（' + fs + '）' : '';
    $('#q').value = f.q;
    $('#sort').value = f.sort;
  }

  // ---------------- list
  let shown = PAGE;
  function sorted(list) {
    const k = st.f.sort;
    const T = L.TIERS;
    const by = {
      chance: (a, b) => {
        const ta = T.indexOf(tierOf(a)), tb = T.indexOf(tierOf(b));
        if (ta !== tb) return ta - tb;
        // inside a tier, show the more selective (usually more sought-after) departments first
        return (L.selectivity(b) || 0) - (L.selectivity(a) || 0);
      },
      select: (a, b) => (L.selectivity(b) || 0) - (L.selectivity(a) || 0),
      sat: (a, b) => (b.sp || 0) - (a.sp || 0),
      date: (a, b) => (a.idays[0] || '99') < (b.idays[0] || '99') ? -1 : (a.idays[0] || '99') > (b.idays[0] || '99') ? 1 : 0,
      quota: (a, b) => b.q - a.q,
      code: (a, b) => a.c < b.c ? -1 : 1,
    }[k] || ((a, b) => 0);
    return list.slice().sort((a, b) => by(a, b) || (a.c < b.c ? -1 : 1));
  }
  function itemHTML(d) {
    const e = EV.get(d.c);
    const t = e ? e.tier : null;
    const fav = st.fav.includes(d.c), inPlan = st.plan.includes(d.c);
    const why = e ? e.reasons[0] || '' : requirementLine(d);
    const warn = e && e.warnings.length ? e.warnings[0] : '';
    const meta = [
      `名額 ${d.q}`, `預計甄試 ${d.ei}`, stage2Summary(d), d.idays.length ? '甄試 ' + d.idays.map(L.fmtDay).join('、') : '無指定甄試日', d.city,
    ];
    const tags = [...d.cats.map(c => `<span class="tag">${c}</span>`), d.gen !== '無' ? `<span class="tag">${esc(d.gen)}</span>` : ''].join(' ');
    return `<li class="item ${inPlan ? 'inplan' : ''}" data-code="${d.c}">
      <span class="badge ${t ? 'b-' + t : 'b-none'}">${t || '—'}</span>
      <div class="i-main" data-open="${d.c}" tabindex="0" role="button" aria-label="${esc(sch(d) + d.n)} 詳細資料">
        <div class="i-title"><span class="school">${esc(sch(d))}</span>${esc(d.n)} ${tags}</div>
        <div class="i-why">${esc(why)}</div>
        ${warn ? `<div class="i-warn">⚠ ${esc(warn)}</div>` : ''}
        <div class="i-meta">${meta.filter(Boolean).map(m => `<span>${esc(m)}</span>`).join('')}</div>
      </div>
      <div class="i-actions">
        <button class="star" data-fav="${d.c}" aria-pressed="${fav}" title="${fav ? '移出候選' : '加入候選'}" aria-label="${fav ? '移出候選' : '加入候選'}">${fav ? '★' : '☆'}</button>
      </div>
    </li>`;
  }
  function render() {
    evaluateAll();
    renderScores();
    const base = baseFiltered();
    renderFilters(base);
    const list = hasScores() ? base.filter(d => st.f.tiers.includes(tierOf(d))) : base;
    const s = sorted(list);
    const tc = {};
    list.forEach(d => { const t = tierOf(d); if (t) tc[t] = (tc[t] || 0) + 1; });
    $('#summary').innerHTML = `<b>${s.length}</b> 個校系` + (hasScores() ? '：' + L.TIERS.filter(t => tc[t]).map(t => `${t} ${tc[t]}`).join('、') : '');
    $('#banner').innerHTML = hasScores() ? '' :
      `<div class="banner"><b>先在左邊輸入學測級分。</b>還沒考也可以先填模考或目標分數，看看哪些系要過什麼檢定、去年一階篩到幾級分。<br>每個校系下面先顯示：檢定標準｜115 一階篩選順序與最低級分。</div>`;
    $('#list').innerHTML = s.slice(0, shown).map(itemHTML).join('') || '<li class="empty">沒有符合的校系。試著放寬篩選。</li>';
    $('#more').innerHTML = s.length > shown ? `<button class="more-btn" id="moreBtn">再顯示 ${Math.min(PAGE, s.length - shown)} 個（還有 ${s.length - shown}）</button>` : '';
    renderPlanCount();
    if (!$('#tab-plan').hidden) renderPlan();
    if (!$('#tab-boost').hidden) renderBoost();
    save();
  }
  function renderPlanCount() { $('#planCount').textContent = st.plan.length ? `${st.plan.length}/6` : ''; }

  // ---------------- detail
  function stageCell(s) {
    if (s.arts) return '<td>術科</td><td>—</td>';
    if (s.mine == null) return `<td class="bad">沒考 ${esc((s.missing || []).map(k => L.SUBJ_NAME[k]).join('、'))}</td><td></td>`;
    const cls = s.diff > 0 ? 'ok' : s.diff === 0 ? (s.last ? 'eq' : 'ok') : 'bad';
    const sign = s.diff > 0 ? '+' + s.diff : String(s.diff);
    return `<td class="${cls}">${s.mine}（${sign}）</td><td>${s.topMine != null ? `你 ${fmtPct(s.topMine)}<br>門檻 ${fmtPct(s.topCut)}` : ''}</td>`;
  }
  function reviewHTML(rv) {
    if (!rv) return '—';
    return esc(rv).replace(/\b([A-Q])(?=[、,，)\s]|$)/g, (m, c) => `<abbr title="${REVIEW[c] || ''}">${c}</abbr>`) +
      '<br><span class="hint">' + [...new Set((rv.match(/\b[A-Q](?=[、,，)\s]|$)/g) || []))].map(c => `${c} ${REVIEW[c]}`).join('・') + '</span>';
  }
  function entranceText(r) {
    if (!r || !r.entr || !r.entr.length) return null;
    return r.entr.map(x => {
      const who = [x.g !== '無' ? x.g : '', x.a !== '--' ? x.a : ''].filter(Boolean).join(' ');
      const s = x.s === '正取' ? '只分發到正取（備取沒有遞補）' : x.s === '無' ? '沒有人分發入學' : `遞補到備取第 ${x.s.replace('備', '')} 名`;
      return (who ? who + '：' : '') + s;
    }).join('；');
  }
  function openDetail(code) {
    const d = BY_CODE[code];
    if (!d) return;
    const e = EV.get(code);
    const r = d.r115;
    const th = L.checkThreshold(d, st.scores, D.std[st.stdYear]);
    const plan = L.screenPlan(d);
    const sat = hasScores() ? L.satShare(d, st.scores) : null;
    const tg = L.targets(d, D.std[st.stdYear]);
    $('#dSchool').textContent = `${sch(d)}・${d.c}・${d.city}${SCHOOL[d.sid].pub ? '・公立' : '・私立'}`;
    $('#dTitle').textContent = d.n;
    const fav = st.fav.includes(code), inPlan = st.plan.includes(code);
    let h = '';
    if (e) {
      h += `<div class="verdict"><span class="badge b-${e.tier}">${e.tier}</span><div><b>${esc(TIER_HELP[e.tier])}</b><ul>${e.reasons.map(x => `<li>${esc(x)}</li>`).join('')}${e.warnings.map(x => `<li style="color:var(--warn)">⚠ ${esc(x)}</li>`).join('')}</ul></div></div>`;
    }
    h += `<div class="d-actions">
      <button class="btn ${fav ? 'ghost' : ''}" data-fav="${code}">${fav ? '★ 已在候選（按一下移除）' : '☆ 加入候選'}</button>
      <button class="btn ${inPlan ? 'ghost' : ''}" data-plan="${code}">${inPlan ? '從六個志願移除' : '排入六個志願'}</button>
      <a class="btn ghost" href="${esc(d.url)}" target="_blank" rel="noopener">甄選會官方校系分則 ↗</a></div>`;

    // 一階
    h += `<section><h3>第一階段：檢定</h3>`;
    if (th.items.length) {
      h += `<table class="t"><tr><th>科目</th><th>標準</th><th>${st.stdYear} 年換算</th><th>你</th><th></th></tr>` +
        th.items.map(i => {
          const okv = i.either ? i.groupOk : i.ok;
          return `<tr><td>${L.SUBJ_NAME[i.k]}${i.either ? '<span class="hint inline">（數A/數B 擇一）</span>' : ''}</td><td>${esc(i.label)}</td><td>${i.k === '聽' ? esc(i.need) + ' 級以上' : i.need != null ? i.need + ' 級分以上' : '—'}</td><td>${i.mine == null ? '沒考' : esc(i.mine)}</td><td class="${okv ? 'ok' : 'bad'}">${hasScores() || st.scores.聽 ? (okv ? '✓' : '✗') : ''}</td></tr>`;
        }).join('') + '</table>';
      if (e && e.thRisk) h += `<p class="hint" style="color:var(--warn)">⚠ ${esc(e.warnings.find(w => w.startsWith('檢定邊緣')) || '')}</p>`;
    } else h += '<p>不設檢定。</p>';
    h += `</section><section><h3>第一階段：116 倍率篩選</h3>`;
    h += plan.length
      ? `<p>依序：${plan.map((p, i) => `${i + 1}. ${subjShort(p.parts)} ${p.m} 倍`).join('　→　')}</p><p class="hint">倍率大的先篩。同一關同級分的人一起進下一關；最後一關同分才用「同級分超額篩選」。</p>`
      : '<p>116 沒有學測倍率篩選。</p>';
    if (d.arts) h += `<p>術科：${d.arts.items.map(i => `${esc(i.i)}${i.t ? ' 檢定' + esc(i.t) : ''}${i.m != null ? ' 倍率' + esc(i.m) : ''}`).join('、')}</p>`;
    h += `<dl class="kv"><dt>招生名額</dt><dd>${d.q}${d.gen !== '無' ? '（' + esc(d.gen) + '）' : ''}</dd><dt>預計甄試人數</dt><dd>${d.ei}${e && e.e115 ? `（115 約 ${e.e115}）` : ''}</dd><dt>同級分超額篩選</dt><dd>${esc(d.tbS || '—')}</dd></dl></section>`;

    // 115 reference
    h += `<section><h3>115 一階篩選結果（參考）</h3>`;
    if (r) {
      if (r.via) h += `<p class="hint" style="color:var(--warn)">⚠ ${esc(r.via)}</p>`;
      if (r.chg) h += `<p class="hint" style="color:var(--warn)">⚠ 116 的篩選倍率或科目跟 115 不同，去年的門檻只能粗略參考。</p>`;
      h += `<p class="hint">115 名稱：${esc(r.name)}（${r.code}）・名額 ${r.q}・倍率 ${Object.entries(r.mult).map(([k, v]) => `${k}${v}`).join(' ')}</p>`;
      if (r.cut.length) {
        const cmp = e && e.cmp ? e.cmp : L.compareCuts(r.cut, st.scores, D.pct);
        h += `<table class="t"><tr><th>篩選順序</th><th>115 最低</th><th>你</th><th>115 考生位置</th></tr>` +
          cmp.stages.map((s, i) => `<tr><td>${i + 1}${s.last ? '（最後一關）' : ''}</td><td>${esc(s.raw)}</td>${hasScores() ? stageCell(s) : '<td></td><td>' + (s.s && !s.apcs ? fmtPct(L.topPercent(D.pct, s.s, s.v)) : '') + '</td>'}</tr>`).join('') + '</table>';
        h += `<p class="hint">「位置」用大考中心 115 學測各科／組合級分人數累計表換算：例如「前 12%」代表 115 年有 12% 的考生這個組合考到這個級分以上。</p>`;
      } else h += '<p>115 一階沒有篩掉人：通過檢定的人都進了二階。</p>';
      if (r.majors) h += `<p class="hint">各主修：${esc(r.majors.map(m => m.major + ' ' + m.cut.map(c => c.raw).join('→')).join('；'))}</p>`;
      const et = entranceText(r);
      if (et) h += `<p><b>115 二階錄取後統一分發：</b>${esc(et)}。<span class="hint inline">遞補越深，代表越多錄取者最後選了別的系，備取比較有機會。</span></p>`;
    } else {
      h += `<p>${esc(d.why || '116 新設或改名，115 沒有可對應的校系')}</p>`;
      if (d.near) h += `<p class="hint">可能相關的 115 校系（名稱相近，沒有採用它的數據，請自己判斷）：${esc(d.near.join('、'))}</p>`;
    }
    h += `</section>`;

    // targets
    h += `<section><h3>要考到多少</h3><ul>`;
    tg.th.forEach(t => { h += `<li>檢定 ${L.SUBJ_NAME[t.k]}${t.label ? t.label : ''}：${t.k === '聽' ? esc(t.need) : t.need}${t.k === '聽' || String(t.need).includes('級') ? '' : ' 級分'}${t.either ? '（數A、數B 過一科就好）' : ''}</li>`; });
    tg.cuts.forEach(c => { h += `<li>${c.last ? '最後一關' : '中間關卡'} ${esc(c.raw)}：${c.s ? (c.last ? `要 <b>${c.v + 1}</b> 以上才不用看超額篩選（等於 ${c.v} 要比同分）` : `要 <b>${c.v}</b> 以上`) : '術科'}</li>`; });
    if (!tg.th.length && !tg.cuts.length) h += '<li>沒有學測門檻資料。</li>';
    h += `</ul><p class="hint">門檻是 115 的結果，116 會隨報名人數和名額浮動。</p></section>`;

    // 二階
    h += `<section><h3>第二階段</h3><div class="bar" aria-hidden="true">${[['學測', d.sp], ...d.st2.map(x => [x.i, x.p]), ...(d.arts && d.arts.p ? [['術科', d.arts.p]] : [])].filter(x => x[1]).map((x, i) => `<span class="s${i % 6}" style="width:${x[1]}%">${esc(x[0])} ${x[1]}%</span>`).join('')}</div>`;
    h += `<dl class="kv" style="margin-top:10px"><dt>學測採計</dt><dd>${d.sub.filter(s => s.w != null).map(s => `${esc(L.SUBJ_NAME[s.k] || s.k)}×${s.w}`).join('、') || '—'}${sat ? `<br><span class="hint inline">你的學測部分約 ${sat.points.toFixed(1)} / ${sat.of} 分（${(sat.pct * 100).toFixed(0)}%，以多數學校「級分×權重」換算的估計${sat.missing ? '；有沒考的科目以 0 計' : ''}）</span>` : ''}</dd>`;
    h += d.st2.map(x => `<dt>${esc(x.i)}</dt><dd>${x.p}%${x.t ? `（${esc(x.t)}以上才錄取）` : ''}</dd>`).join('');
    h += `<dt>審查資料</dt><dd>${reviewHTML(d.rv)}</dd><dt>資料截止</dt><dd>${rocDate(d.dd)}</dd><dt>甄試日期</dt><dd>${esc(d.idate || '—')}</dd><dt>放榜</dt><dd>${rocDate(d.rd)}</dd><dt>甄試費</dt><dd>${d.fee ? d.fee + ' 元' : '—'}</dd><dt>總成績同分</dt><dd>${esc(d.tbT || '—')}</dd></dl>`;
    if (d.rn) h += `<h3>審查資料說明</h3><div class="long">${esc(d.rn)}</div>`;
    if (d.iv) h += `<h3>甄試說明</h3><div class="long">${esc(d.iv)}</div>`;
    h += `</section>`;
    h += `<section><h3>備註</h3><div class="long">${esc(d.notes || '—')}</div>`;
    const ex = Object.entries(d.extra || {}).map(([k, v]) => ({ indigenous_extra: '原住民外加', offshore_extra: '離島外加', vision_extra: '願景計畫外加' }[k] + ' ' + v));
    if (ex.length || d.vul) h += `<p class="hint">${[...ex, d.vul ? '列在甄選會「116 訂有扶助弱勢招生措施校系一覽表」' : ''].filter(Boolean).join('・')}</p>`;
    h += `<p class="hint">學群：${esc(d.g.join('、'))}・資料：甄選會 116 校系分則（${esc(D.fetched116)} 擷取），以官方網站最新公告為準。</p></section>`;
    $('#dBody').innerHTML = h;
    const dlg = $('#detail');
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
    $('#dBody').scrollTop = 0;
    location.hash = 'd=' + code;
  }

  // ---------------- favourites & plan
  function toggleFav(code) {
    const i = st.fav.indexOf(code);
    if (i >= 0) { st.fav.splice(i, 1); toast('已移出候選'); } else { st.fav.push(code); toast('已加入候選'); }
    render();
    if ($('#detail').open) openDetail(code);
  }
  function togglePlan(code) {
    const i = st.plan.indexOf(code);
    if (i >= 0) { st.plan.splice(i, 1); toast('已從六個志願移除'); }
    else {
      if (st.plan.length >= 6) { toast('已經有 6 個志願了，先移除一個'); return; }
      st.plan.push(code);
      if (!st.fav.includes(code)) st.fav.push(code);
      toast(`已排入第 ${st.plan.length} 志願`);
    }
    render();
    if ($('#detail').open) openDetail(code);
  }
  function planDepts() { return st.plan.map(c => BY_CODE[c]).filter(Boolean); }

  function renderPlan() {
    const P = planDepts();
    let h = '';
    for (let i = 0; i < 6; i++) {
      const d = P[i];
      if (!d) { h += `<li class="emptyslot"><span class="no">${i + 1}</span><span>空位：到「找校系」或下方候選清單按「排入志願」</span></li>`; continue; }
      const t = tierOf(d);
      h += `<li data-code="${d.c}"><span class="no">${i + 1}</span><span class="badge ${t ? 'b-' + t : 'b-none'}">${t || '—'}</span>
        <div class="i-main" data-open="${d.c}" role="button" tabindex="0"><div class="i-title"><span class="school">${esc(sch(d))}</span>${esc(d.n)}</div>
        <div class="i-meta"><span>資料截止 ${rocDate(d.dd)}</span><span>甄試 ${d.idays.length ? d.idays.map(L.fmtDay).join('、') : '無'}</span><span>放榜 ${rocDate(d.rd)}</span></div></div>
        <div class="ctrl"><button data-up="${d.c}" aria-label="上移" title="上移">↑</button><button data-down="${d.c}" aria-label="下移" title="下移">↓</button><button data-plan="${d.c}" aria-label="移除" title="移除">✕</button></div></li>`;
    }
    $('#planList').innerHTML = h;
    $('#planAnalysis').innerHTML = planAnalysis(P);
    const favs = st.fav.map(c => BY_CODE[c]).filter(Boolean);
    $('#favList').innerHTML = favs.length ? favs.map(d => {
      const t = tierOf(d);
      const inPlan = st.plan.includes(d.c);
      return `<li class="item ${inPlan ? 'inplan' : ''}"><span class="badge ${t ? 'b-' + t : 'b-none'}">${t || '—'}</span>
        <div class="i-main" data-open="${d.c}" role="button" tabindex="0"><div class="i-title"><span class="school">${esc(sch(d))}</span>${esc(d.n)}</div>
        <div class="i-meta"><span>${esc(stage2Summary(d))}</span><span>甄試 ${d.idays.length ? d.idays.map(L.fmtDay).join('、') : '無'}</span></div></div>
        <div class="i-actions"><button class="btn small ${inPlan ? 'ghost' : ''}" data-plan="${d.c}">${inPlan ? '移出志願' : '排入志願'}</button><button class="star" data-fav="${d.c}" aria-pressed="true" aria-label="移出候選">★</button></div></li>`;
    }).join('') : '<li class="empty">還沒有候選。到「找校系」按 ☆ 加入。</li>';
  }
  function planAnalysis(P) {
    if (!P.length) return '';
    const out = [];
    const tiers = P.map(tierOf);
    const c = t => tiers.filter(x => x === t).length;
    if (hasScores()) {
      if (c('不符')) out.push(`<div class="alert bad"><b>${c('不符')} 個志願你一定進不了一階</b>（檢定沒過或沒考篩選科目）。這等於浪費一個志願和報名費，建議換掉。</div>`);
      if (!c('穩') && !c('適中')) out.push(`<div class="alert bad"><b>沒有「穩」或「適中」的志願。</b>如果全部一階都沒過，就只剩分科測驗。建議至少放 1–2 個穩的。</div>`);
      else if (!c('穩')) out.push(`<div class="alert warn">沒有「穩」的志願。很多學長姐會留 1 個保底，避免一階全落。</div>`);
      if (c('衝') + c('難') >= 4) out.push(`<div class="alert warn">${c('衝') + c('難')} 個是「衝」或「難」，風險偏高。如果你打算考分科測驗當後路，可以接受；如果申請是主要管道，建議改成 2 衝 2 適中 2 穩左右。</div>`);
      if (c('穩') >= 4) out.push(`<div class="alert warn">${c('穩')} 個都是「穩」，可能浪費機會。考慮把 1–2 個換成更想讀、但要衝一下的系。</div>`);
      if (c('無資料')) out.push(`<div class="alert">${c('無資料')} 個沒有去年資料（新設、改名或只看術科），無法估計落點。</div>`);
      if (!out.length) out.push(`<div class="alert good">組合看起來平衡：穩 ${c('穩')}、適中 ${c('適中')}、衝 ${c('衝')}、難 ${c('難')}。</div>`);
    }
    const cf = L.conflicts(P);
    if (cf.length) {
      out.push(`<div class="alert ${cf.some(x => x.sure) ? 'bad' : 'warn'}"><b>甄試可能撞期</b><ul>${cf.map(x => `<li>${esc(sch(BY_CODE[x.a]) + BY_CODE[x.a].n)} 和 ${esc(sch(BY_CODE[x.b]) + BY_CODE[x.b].n)}：${x.days.map(L.fmtDay).join('、')}${x.sure ? '（都只有這一天，確定撞期）' : '（有一系是多天，可能可以錯開：看兩系的甄試說明、通常可以選時段）'}</li>`).join('')}</ul>一階如果兩個都過，二階只能擇一參加。現在就決定哪個比較重要。</div>`);
    }
    const sameSchool = {};
    P.forEach(d => { (sameSchool[d.sid] = sameSchool[d.sid] || []).push(d); });
    const pick = Object.values(sameSchool).filter(a => a.length > 1 && a.some(d => /擇一/.test(d.notes + d.rn)));
    if (pick.length) out.push(`<div class="alert warn">同校有「擇一報名」的規定，請看備註：${pick.map(a => a.map(d => esc(sch(d) + d.n)).join('、')).join('；')}</div>`);
    const fee2 = P.reduce((a, d) => a + (d.fee || 0), 0);
    out.push(`<div class="alert"><b>費用估計</b>：一階報名費 ${P.length} × 100 = ${P.length * 100} 元（115 簡章每校系 100 元；低收入戶免繳、中低收入戶減免；以 116 簡章為準）。全部進二階的甄試費共 ${fee2.toLocaleString()} 元（116 校系分則）。</div>`);
    // timeline
    const ev = [];
    P.forEach(d => {
      const n = esc(sch(d).replace(/^國立/, '') + d.n);
      const dd = /116\.(\d+)\.(\d+)/.exec(d.dd || '');
      if (dd) ev.push([`${String(dd[1]).padStart(2, '0')}-${String(dd[2]).padStart(2, '0')}`, `${n}：審查資料截止`]);
      d.idays.forEach(x => ev.push([x, `${n}：甄試`]));
      const rd = /116\.(\d+)\.(\d+)/.exec(d.rd || '');
      if (rd) ev.push([`${String(rd[1]).padStart(2, '0')}-${String(rd[2]).padStart(2, '0')}`, `${n}：放榜`]);
    });
    ev.push(['03-30', '一階篩選結果公布（9:00）'], ['06-03', '登記就讀志願序（6/3–6/4，沒登記 = 放棄）'], ['06-10', '統一分發結果']);
    ev.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    out.push(`<div><h3>你的二階時間表</h3><ul class="timeline">${ev.map(([dte, t]) => `<li><span class="d">${L.fmtDay(dte)}</span><span>${t}</span></li>`).join('')}</ul></div>`);
    return `<div class="analysis">${out.join('')}</div>`;
  }
  function planText() {
    const P = planDepts();
    const s = st.scores;
    const lines = [`116 申請入學志願（${new Date().toLocaleDateString('zh-TW')}）`,
      `學測：${SCORE_KEYS.map(k => `${L.SUBJ_NAME[k]}${L.val(s, k) ?? '沒考'}`).join(' ')} 英聽${s.聽 || '沒考'}（檢定用 ${st.stdYear} 五標）`, ''];
    const row = (d, i) => {
      const e = EV.get(d.c);
      return `${i != null ? i + 1 + '. ' : '- '}${sch(d)} ${d.n}（${d.c}）【${e ? e.tier : '—'}】${e ? e.reasons.join('；') : ''}${e && e.warnings.length ? '；' + e.warnings.join('；') : ''}\n   ${requirementLine(d)}\n   二階：${stage2Summary(d)}；甄試 ${d.idate}；資料截止 ${rocDate(d.dd)}`;
    };
    lines.push('【六個志願】');
    P.forEach((d, i) => lines.push(row(d, i)));
    const others = st.fav.filter(c => !st.plan.includes(c)).map(c => BY_CODE[c]).filter(Boolean);
    if (others.length) { lines.push('', '【其他候選】'); others.forEach(d => lines.push(row(d))); }
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
    const rows = [['志願', '校系代碼', '學校', '校系', '落點', '理由', '檢定', '115一階', '二階', '審查資料截止', '甄試日期', '放榜', '甄試費', '官方網址']];
    const codes = [...st.plan, ...st.fav.filter(c => !st.plan.includes(c))];
    codes.forEach(c => {
      const d = BY_CODE[c]; if (!d) return;
      const e = EV.get(c);
      const i = st.plan.indexOf(c);
      const req = requirementLine(d).split('　|　');
      rows.push([i >= 0 ? i + 1 : '候選', d.c, sch(d), d.n, e ? e.tier : '', e ? e.reasons.join('；') : '', req[0], req[1].replace('115 一階 ', ''), stage2Summary(d), rocDate(d.dd), d.idate, rocDate(d.rd), d.fee || '', d.url]);
    });
    return '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }

  // ---------------- boost (what-if)
  function renderBoost() {
    const el = $('#boost');
    if (!hasScores()) { el.innerHTML = '<div class="card"><h2>怎麼進步</h2><p>先在「找校系」輸入學測級分（還沒考可以填模考或目標）。</p></div>'; return; }
    const scope = baseFiltered();
    const scopeLabel = st.f.groups.length ? `你選的學群（${st.f.groups.join('、')}）` : '目前篩選範圍';
    const o = opts();
    const T = L.TIERS;
    const good = t => t === '穩' || t === '適中';
    const nowGood = scope.filter(d => good(tierOf(d))).length;
    const nowIn = scope.filter(d => !['不符'].includes(tierOf(d))).length;
    const rows = [];
    for (const k of SCORE_KEYS) {
      const cur = L.val(st.scores, k) || 0;
      const cells = [];
      for (const inc of [1, 2, 3, 4, 5]) {
        if (cur + inc > 15) { cells.push(null); continue; }
        const S2 = { ...st.scores, [k]: cur + inc };
        let up = 0, unlock = 0;
        for (const d of scope) {
          const t0 = tierOf(d), t1 = L.evaluate(d, S2, o).tier;
          if (T.indexOf(t1) < T.indexOf(t0) && t1 !== '無資料') up++;
          if (t0 === '不符' && t1 !== '不符') unlock++;
        }
        cells.push({ up, unlock, to: cur + inc });
      }
      rows.push({ k, cur, cells });
    }
    // most common 檢定 blockers
    const block = {};
    for (const d of scope) {
      const e = EV.get(d.c);
      if (e && e.tier === '不符') e.reasons.forEach(r => { const m = r.replace(/^未通過檢定：/, ''); if (m !== r) m.split('、').forEach(x => { block[x] = (block[x] || 0) + 1; }); else block[r] = (block[r] || 0) + 1; });
    }
    const blockers = Object.entries(block).sort((a, b) => b[1] - a[1]).slice(0, 8);
    let h = `<div class="card"><div class="card-h"><h2>每科多考幾級分，會多出多少機會？</h2></div>
      <p class="hint inline">範圍：${esc(scopeLabel)}，共 ${scope.length} 個校系。現在「穩＋適中」${nowGood} 個，能進一階篩選的（不是不符）${nowIn} 個。格子裡是「落點變好的校系數」，括號是「從不符變成可以報」的數量。</p>
      <div class="scroll-x"><table class="t boost-table"><tr><th>科目</th><th>現在</th><th>+1</th><th>+2</th><th>+3</th><th>+4</th><th>+5</th></tr>` +
      rows.map(r => `<tr><td>${L.SUBJ_NAME[r.k]}</td><td>${r.cur || '沒考'}</td>${r.cells.map(c => c ? `<td class="${c.up ? 'up' : ''}">${c.to} 級分：${c.up}${c.unlock ? `（+${c.unlock}）` : ''}</td>` : '<td>—</td>').join('')}</tr>`).join('') + '</table></div></div>';
    h += `<div class="card"><div class="card-h"><h2>擋住你最多的檢定</h2></div>` +
      (blockers.length ? `<ol>${blockers.map(([k, n]) => `<li><b>${esc(k)}</b>：擋住 ${n} 個校系</li>`).join('')}</ol><p class="hint">檢定是「沒過就不能參加篩選」。116 的五標要等 2027/2/25 才知道，表格用 ${st.stdYear} 年五標換算。</p>` : '<p>這個範圍裡沒有被檢定擋住的校系。</p>') + '</div>';
    h += `<div class="card"><div class="card-h"><h2>試算</h2></div><p class="hint inline">暫時改一下成績看看結果（不會改掉你存的成績）。</p><div class="score-grid" id="tryGrid">${SCORE_KEYS.map(k => `<label class="score">${L.SUBJ_NAME[k]}<select data-try="${k}">${['<option value="">沒考</option>', ...Array.from({ length: 15 }, (_, i) => 15 - i).map(i => `<option ${String(L.val(st.scores, k)) === String(i) ? 'selected' : ''}>${i}</option>`)].join('')}</select></label>`).join('')}</div><div id="tryOut" style="margin-top:10px"></div></div>`;
    el.innerHTML = h;
    renderTry();
  }
  function renderTry() {
    const S2 = { ...st.scores };
    $$('[data-try]').forEach(s => { S2[s.dataset.try] = s.value; });
    const o = opts();
    const scope = baseFiltered();
    const c0 = {}, c1 = {};
    const better = [];
    for (const d of scope) {
      const t0 = tierOf(d), t1 = L.evaluate(d, S2, o).tier;
      c0[t0] = (c0[t0] || 0) + 1; c1[t1] = (c1[t1] || 0) + 1;
      if (L.TIERS.indexOf(t1) < L.TIERS.indexOf(t0) && t1 !== '無資料') better.push([d, t0, t1]);
    }
    better.sort((a, b) => (L.selectivity(b[0]) || 0) - (L.selectivity(a[0]) || 0));
    $('#tryOut').innerHTML = `<table class="t"><tr><th></th>${L.TIERS.map(t => `<th>${t}</th>`).join('')}</tr><tr><td>現在</td>${L.TIERS.map(t => `<td>${c0[t] || 0}</td>`).join('')}</tr><tr><td>試算</td>${L.TIERS.map(t => `<td class="${(c1[t] || 0) > (c0[t] || 0) && (t === '穩' || t === '適中') ? 'ok' : ''}">${c1[t] || 0}</td>`).join('')}</tr></table>` +
      (better.length ? `<h3>落點變好的校系（${better.length}）</h3><ul>${better.slice(0, 40).map(([d, a, b]) => `<li><a href="#d=${d.c}" data-open="${d.c}">${esc(sch(d) + ' ' + d.n)}</a>：${a} → <b>${b}</b></li>`).join('')}</ul>${better.length > 40 ? `<p class="hint">只列前 40 個（依去年門檻高到低）。</p>` : ''}` : '<p class="hint">沒有校系的落點變好。</p>');
  }

  // ---------------- guide
  const TIMELINE = [
    ['2026-11-03', '簡章與校系分則公告（甄選會網站可查）'],
    ['2026-12-12', '英聽第二次考試（兩次擇優）'],
    ['2027-01-22', '學測（1/22–1/24）'],
    ['2027-02-25', '學測成績與 116 五標公布 → 回來把五標年份改成 116'],
    ['2027-03-18', '繁星推薦第 1–7 類放榜：錄取者不論放棄與否，都不能報申請入學'],
    ['2027-03-22', '申請入學繳費（3/22–3/24 17:00）'],
    ['2027-03-23', '申請入學報名（3/23–3/24），最多 6 個校系'],
    ['2027-03-30', '一階篩選結果（9:00）；3/31 中午前可申請複查'],
    ['2027-04-01', '學習歷程上傳中央資料庫（約 4/1–4/21，依就讀高中規定）'],
    ['2027-04-29', '二階審查資料上傳／勾選（4/29 起，截止日各校不同）'],
    ['2027-05-13', '指定項目甄試（5/13–5/30，面試、筆試等）'],
    ['2027-05-31', '各校放榜前限（各校自訂日期）'],
    ['2027-06-03', '登記就讀志願序（6/3–6/4 9:00–21:00）：正取、備取都要登記，沒登記視同放棄'],
    ['2027-06-10', '統一分發結果：每人最多分發 1 個校系'],
    ['2027-06-13', '放棄入學資格截止：分到了卻想考分科，要在這天前上網聲明放棄'],
    ['2027-06-15', '分科測驗報名截止（沒分發到、要走分發入學的人）'],
    ['2027-07-10', '分科測驗（7/10–7/11）'],
    ['2027-08-13', '分發入學放榜'],
  ];
  function renderGuide() {
    const today = new Date();
    const iso = d => d.toISOString().slice(0, 10);
    const t = iso(new Date(today.getTime() - today.getTimezoneOffset() * 60000));
    let nextDone = false;
    const tl = TIMELINE.map(([dte, txt]) => {
      const past = dte < t;
      let cls = past ? 'past' : '';
      let extra = '';
      if (!past && !nextDone) {
        nextDone = true; cls = 'next';
        const days = Math.round((new Date(dte) - new Date(t)) / 86400000);
        extra = days === 0 ? '（今天）' : `（還有 ${days} 天）`;
      }
      const [y, m, dd] = dte.split('-').map(Number);
      return `<li class="${cls}"><span class="d">${y}/${m}/${dd}</span><span>${esc(txt)}${extra}</span></li>`;
    }).join('');
    const tiers = L.TIERS.map(x => `<li><span class="badge b-${x}">${x}</span> ${esc(TIER_HELP[x])}</li>`).join('');
    $('#guide').innerHTML = `
<div class="card"><div class="card-h"><h2>116 個人申請時程</h2><span class="hint inline">來源：教育部《116 學年度大學多元入學學生手冊》</span></div><ul class="timeline">${tl}</ul></div>
<div class="card"><h2>一定要知道的規則</h2>
<ol>
<li><b>最多 6 個校系。</b>報名時一次選好、繳費，送出後不能改。</li>
<li><b>一階 = 檢定 → 倍率篩選 → 同級分超額篩選。</b>檢定沒過，連篩選都不能參加。倍率從大到小一關一關篩，同一關同級分的人一起過；只有最後一關同分才比「同級分超額篩選」的科目順序。</li>
<li><b>每一關都要過。</b>只看第一關、或只看總級分都會判錯（舊版工具就犯了這個錯）。</li>
<li><b>數A、數B 同時列為檢定時，過一科就好。</b>只考數B的人不會因為數A沒考被擋。</li>
<li><b>二階成績通常是學測＋審查資料＋面試／筆試，各系比例差很多。</b>「學測佔比」高的系，學測好的人比較有利；審查和面試佔比高的系，學習歷程和準備最重要。</li>
<li><b>撞期很常見。</b>一階如果過了兩個同一天甄試的系，只能去一個。排志願時就先看甄試日期。</li>
<li><b>放榜後要登記就讀志願序（6/3–6/4）。</b>正取、備取都要登記，沒登記等於放棄。甄選會依志願序和名次統一分發，每人只會分到 1 個。</li>
<li><b>繁星第 1–7 類錄取的人不能報申請入學</b>，就算放棄也一樣。</li>
<li><b>分發到了但想考分科測驗</b>，要在 6/13 前上網聲明放棄，否則不能參加分發入學。</li>
<li><b>學測有一科 0 級分也能報</b>，只要該系用到的科目加總不是 0（學生手冊 Q&amp;A）。這個工具把空白和 0 都當「沒考」。</li>
</ol></div>
<div class="card"><h2>這個工具怎麼判斷落點</h2>
<ul class="plain">${tiers}</ul>
<p>判斷用的是 <b>115 學年度一階篩選結果</b>（甄選會只公布圖片，每一格都經兩次獨立判讀核對）：你每一關的級分都要大於或等於去年最低，最後一關剛好相等要看超額篩選。</p>
<p>「穩」比較嚴格：每一關都要比去年高，最後一關至少高 2 級分（門檻漲 1 也還會過），而且用大考中心 115 年各科／組合級分人數表換算，排在你前面的人要明顯少於排在門檻前面的人。</p>
<p>遇到這些情況，最多只判「適中」並寫出原因：116 倍率或科目跟 115 不同、用的是同系別組或名稱相近系組的資料、預計甄試人數比去年少 15% 以上、你的級分換成 113 或 114 年五標就會檢定不過。</p>
<p class="hint">這只是一階能不能過的估計，不是錄取機率。二階要看審查資料、面試和當年的競爭。</p></div>
<div class="card"><h2>審查資料代碼</h2><table class="t"><tr><th>代碼</th><th>項目</th></tr>${Object.entries(REVIEW).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table><p class="hint">課程學習成果最多 3 件，多元表現最多 10 件（另附綜整心得）。R、S、T 看各系分則。</p></div>
<div class="card"><h2>資料來源</h2><ul>
<li>116 校系分則：大學甄選入學委員會（${esc(D.fetched116)} 擷取，2,240 校系）。簡章若有「內容修正事項」以官方為準。</li>
<li>115 一階篩選結果：甄選會「115 學年度各校系篩選標準一覽表」（圖片，雙重判讀）。</li>
<li>115 分發最低標準（備取遞補到第幾名）：甄選會「115 學年度各校系分發標準一覽表」。</li>
<li>五標（113–115）與各科、2–4 科組合級分人數累計表：大學入學考試中心。</li>
<li>116 扶助弱勢校系一覽表、學生手冊：甄選會、教育部。</li>
<li>學校所在縣市是校本部；有寫校區的系用該校區。</li>
</ul><p class="hint">資料版本 ${esc(D.built)}。原始碼與資料處理程式在 GitHub 上公開。</p></div>`;
  }

  // ---------------- events
  function setTab(name) {
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('.tab-panel').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
    if (name === 'plan') renderPlan();
    if (name === 'boost') renderBoost();
    if (name === 'guide') renderGuide();
    window.scrollTo(0, 0);
  }
  function bind() {
    document.addEventListener('change', ev => {
      const t = ev.target;
      if (t.dataset.score) { st.scores[t.dataset.score] = t.value; shown = PAGE; render(); return; }
      if (t.dataset.try != null) { renderTry(); return; }
      if (t.id === 'stdYear') { st.stdYear = t.value; render(); return; }
      if (t.id === 'sort') { st.f.sort = t.value; shown = PAGE; render(); return; }
      if (t.id === 'importState') {
        const f = t.files[0]; if (!f) return;
        f.text().then(txt => {
          const s = JSON.parse(txt);
          if (!s || s.v !== 1) throw new Error('bad');
          const d = DEFAULT();
          st = { ...d, ...s, scores: { ...d.scores, ...s.scores }, f: { ...d.f, ...s.f } };
          render(); renderPlan(); toast('已還原');
        }).catch(() => toast('這個檔案不是備份檔'));
      }
    });
    let qTimer;
    $('#q').addEventListener('input', ev => { clearTimeout(qTimer); qTimer = setTimeout(() => { st.f.q = ev.target.value; shown = PAGE; render(); }, 200); });
    document.addEventListener('click', ev => {
      const b = ev.target.closest('button, [data-open], a[data-open]');
      if (!b) return;
      const ds = b.dataset;
      const f = st.f;
      const toggle = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
      if (ds.tab) { setTab(ds.tab); return; }
      if (ds.tier) { toggle(f.tiers, ds.tier); shown = PAGE; render(); return; }
      if (ds.group) { toggle(f.groups, ds.group); shown = PAGE; render(); return; }
      if (ds.region) { toggle(f.regions, ds.region); shown = PAGE; render(); return; }
      if (ds.own) { f.own = ds.own; shown = PAGE; render(); return; }
      if (ds.cat) { toggle(f.cats, ds.cat); shown = PAGE; render(); return; }
      if (ds.st2) { toggle(f.st2, ds.st2); shown = PAGE; render(); return; }
      if (ds.fav) { ev.stopPropagation(); toggleFav(ds.fav); return; }
      if (ds.plan) { ev.stopPropagation(); togglePlan(ds.plan); return; }
      if (ds.up || ds.down) {
        const c = ds.up || ds.down, i = st.plan.indexOf(c), j = ds.up ? i - 1 : i + 1;
        if (j >= 0 && j < st.plan.length) { [st.plan[i], st.plan[j]] = [st.plan[j], st.plan[i]]; render(); renderPlan(); }
        return;
      }
      if (ds.open) { ev.preventDefault(); openDetail(ds.open); return; }
      if (b.id === 'moreBtn') { shown += PAGE; render(); return; }
      if (b.id === 'groupsNone') { f.groups = []; render(); return; }
      if (b.id === 'clearScores') { st.scores = DEFAULT().scores; render(); return; }
      if (b.id === 'resetFilters') { ev.preventDefault(); st.f = { ...DEFAULT().f, sort: f.sort }; shown = PAGE; render(); return; }
      if (b.id === 'dClose') { closeDetail(); return; }
      if (b.id === 'themeBtn') {
        const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        st.theme = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = st.theme; save(); return;
      }
      if (b.id === 'copyPlan') {
        const txt = planText();
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('已複製'), () => { download('apply116-plan.txt', txt, 'text/plain;charset=utf-8'); toast('無法複製，改成下載文字檔'); });
        return;
      }
      if (b.id === 'csvPlan') { download('apply116-plan.csv', csv(), 'text/csv;charset=utf-8'); return; }
      if (b.id === 'printPlan') { setTab('plan'); setTimeout(() => window.print(), 50); return; }
      if (b.id === 'exportState') { download('apply116-backup.json', JSON.stringify(st, null, 1), 'application/json'); return; }
    });
    document.addEventListener('keydown', ev => {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.dataset && ev.target.dataset.open) { ev.preventDefault(); openDetail(ev.target.dataset.open); }
    });
    const dlg = $('#detail');
    dlg.addEventListener('close', () => { if (location.hash.startsWith('#d=')) history.replaceState(null, '', location.pathname + location.search); });
    dlg.addEventListener('click', ev => { if (ev.target === dlg) closeDetail(); });
    window.addEventListener('hashchange', fromHash);
  }
  function closeDetail() { const dlg = $('#detail'); if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
  function fromHash() {
    const m = /^#d=(\d{6})$/.exec(location.hash);
    if (m && BY_CODE[m[1]]) openDetail(m[1]);
  }

  // ---------------- init
  if (st.theme) document.documentElement.dataset.theme = st.theme;
  if (window.matchMedia && matchMedia('(max-width: 900px)').matches) $('#filtersBox').open = false;
  bind();
  render();
  fromHash();
  window.__app = { st: () => st, evaluate: c => EV.get(c), render };
})();
