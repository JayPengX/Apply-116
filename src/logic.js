/* 116 申請入學選系 pure scoring logic (no DOM). Works in the browser (window.Logic) and in Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUBJ = ['國', '英', '數A', '數B', '社', '自'];
  const SUBJ_NAME = { 國: '國文', 英: '英文', 數A: '數學A', 數B: '數學B', 社: '社會', 自: '自然', 聽: '英聽', 識: 'APCS觀念', 實: 'APCS實作' };
  const LEVELS = ['頂標', '前標', '均標', '後標', '底標'];
  const LISTEN_RANK = { A: 4, B: 3, C: 2, F: 1 };
  const TIERS = ['穩', '適中', '衝', '難', '不符', '無資料'];

  // Tuning for tiers. ratio = (115 考生 at or above my score) / (115 考生 at or above last year's cut).
  const SAFE_RATIO = 0.75; // 穩: at most 75% as many people at or above me as at or above the cut
  const REACH_RATIO = 1.4; // 衝: below the cut, but at most 40% more people ahead of me than ahead of the cut

  /** A score is "not taken" when blank, missing, or 0 (project rule: blank or 0 = 沒考). */
  function val(S, k) {
    const v = S ? S[k] : null;
    if (v === '' || v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  function sumOf(parts, S) {
    let t = 0;
    const missing = [];
    for (const k of parts) {
      const v = val(S, k);
      if (v == null) missing.push(k);
      else t += v;
    }
    return { v: missing.length ? null : t, missing };
  }

  function stdLevel(std, k, label) {
    const row = std && std[k];
    return row ? row[label] : undefined;
  }

  /** 檢定 check. std = {國:{頂標:13,...},...}. Returns items and overall ok. */
  function checkThreshold(d, S, std) {
    const items = [];
    const math = d.sub.filter(s => (s.k === '數A' || s.k === '數B') && s.t);
    const either = math.length === 2; // official rule: both set → passing either one is enough
    for (const s of d.sub) {
      if (!s.t) continue;
      if (s.k === '聽') {
        const mine = S && S.聽 ? String(S.聽).toUpperCase() : '';
        const need = String(s.t).replace('級', '');
        const ok = !!LISTEN_RANK[mine] && LISTEN_RANK[mine] >= LISTEN_RANK[need];
        items.push({ k: '聽', label: s.t, need, mine: mine || null, ok });
        continue;
      }
      if (s.apcs) {
        const key = s.p[0];
        const mine = val(S, key);
        items.push({ k: key, label: s.t + '級', need: s.t, mine, ok: mine != null && mine >= s.t });
        continue;
      }
      if (!s.p || s.p.length !== 1) continue;
      const k = s.p[0];
      const need = stdLevel(std, k, s.t);
      const mine = val(S, k);
      items.push({ k, label: s.t, need, mine, ok: mine != null && need != null && mine >= need, either: either && (k === '數A' || k === '數B') });
    }
    let ok = true;
    const fails = [];
    const mathItems = items.filter(i => i.either);
    if (mathItems.length) {
      const anyOk = mathItems.some(i => i.ok);
      mathItems.forEach(i => { i.groupOk = anyOk; });
      if (!anyOk) { ok = false; fails.push(mathItems.map(i => SUBJ_NAME[i.k] + i.label).join(' 或 ')); }
    }
    for (const i of items) {
      if (i.either) continue;
      if (!i.ok) { ok = false; fails.push(SUBJ_NAME[i.k] + i.label); }
    }
    return { ok, items, fails };
  }

  /** How many 115 考生 scored >= v on this subject combination. Returns null if no official table. */
  function countAtOrAbove(pct, parts, v) {
    if (!pct || !parts || parts.some(p => !SUBJ.includes(p))) return null;
    const key = SUBJ.filter(s => parts.includes(s)).join('');
    const tab = pct[key];
    if (!tab) return null;
    const max = 15 * parts.length;
    if (v > max) return 0;
    if (v <= 0) return tab['0'] ? tab['0'][1] : null;
    const row = tab[String(Math.round(v))];
    return row ? row[1] : null;
  }

  function totalTakers(pct, parts) { return countAtOrAbove(pct, parts, 0); }

  function topPercent(pct, parts, v) {
    const n = countAtOrAbove(pct, parts, v), t = totalTakers(pct, parts);
    if (n == null || !t) return null;
    return (n / t) * 100;
  }

  /**
   * Compare my scores with last year's 一階 cuts.
   * Official rule (116 學生手冊): screening goes from the highest multiple to the lowest; at every stage except the
   * last, everyone tied at the cut moves on; at the last stage a tie is broken by 同級分超額篩選.
   * So you must reach EVERY stage's minimum, and a tie at the last stage is a coin flip.
   */
  function compareCuts(cuts, S, pct) {
    if (!cuts || !cuts.length) return { status: 'none', stages: [] };
    const stages = [];
    let unknown = false;
    cuts.forEach((c, i) => {
      const last = i === cuts.length - 1;
      if (!c.s) { unknown = true; stages.push({ raw: c.raw, v: c.v, last, arts: true }); return; }
      const { v: mine, missing } = sumOf(c.s, S);
      const st = { raw: c.raw, s: c.s, v: c.v, mine, missing, last, apcs: !!c.apcs };
      if (mine != null) {
        st.diff = mine - c.v;
        const nm = countAtOrAbove(pct, c.s, mine), nc = countAtOrAbove(pct, c.s, c.v);
        if (nm != null && nc) { st.ratio = nm / nc; st.topMine = topPercent(pct, c.s, mine); st.topCut = topPercent(pct, c.s, c.v); }
      }
      stages.push(st);
    });
    const evals = stages.filter(s => !s.arts);
    if (!evals.length) return { status: 'arts', stages };
    if (evals.some(s => s.mine == null)) {
      return { status: 'fail', stages, missing: [...new Set(evals.flatMap(s => s.missing || []))] };
    }
    const minDiff = Math.min(...evals.map(s => s.diff));
    const ratios = evals.map(s => s.ratio).filter(r => r != null);
    const ratio = ratios.length ? Math.max(...ratios) : null;
    let status;
    if (evals.some(s => s.diff < 0)) status = 'fail';
    else if (evals.some(s => s.last && s.diff === 0)) status = 'edge';
    else status = 'pass';
    const binding = evals.reduce((a, b) => {
      if (a == null) return b;
      if (b.ratio != null && a.ratio != null) return b.ratio > a.ratio ? b : a;
      return b.diff < a.diff ? b : a;
    }, null);
    return { status, stages, minDiff, ratio, binding, unknown };
  }

  /** 116 screening plan: items with multiples, grouped by equal multiple, highest first. */
  function screenPlan(d) {
    const items = d.sub.filter(s => s.m != null && s.k !== '聽');
    const by = new Map();
    for (const s of items) {
      const key = String(s.m);
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(s);
    }
    return [...by.entries()].sort((a, b) => Number(b[0]) - Number(a[0])).map(([m, ss]) => ({
      m: Number(m), parts: [...new Set(ss.flatMap(s => s.p || []))], keys: ss.map(s => s.k),
    }));
  }

  /** Untaken subjects that 116 uses for 倍率篩選 (you would be screened with 0) or for 二階 採計. */
  function missingUse(d, S) {
    const screen = new Set(), weight = new Set();
    for (const s of d.sub) {
      if (s.k === '聽' || !s.p) continue;
      for (const k of s.p) {
        if (val(S, k) != null) continue;
        if (s.m != null) screen.add(k);
        if (s.w != null) weight.add(k);
      }
    }
    // 數A/數B: if the department uses both for the same purpose, having either one is normal
    return { screen: [...screen], weight: [...weight] };
  }

  /** 115 expected interviewees ≈ quota × lowest multiple. */
  function expected115(r) {
    const ms = Object.values(r.mult || {}).filter(v => typeof v === 'number');
    if (!ms.length || !r.q) return null;
    return Math.round(r.q * Math.min(...ms));
  }

  /** Does my score pass 檢定 under every one of the last three years' 五標? (116 五標 are unknown until Feb 2027) */
  function thresholdRisk(d, S, stdByYear, baseYear) {
    const risky = [];
    for (const y of Object.keys(stdByYear || {})) {
      if (String(y) === String(baseYear)) continue;
      const r = checkThreshold(d, S, stdByYear[y]);
      if (!r.ok) risky.push({ year: y, fails: r.fails });
    }
    return risky;
  }

  /**
   * Main evaluation. opts: {std, stdByYear, stdYear, pct}
   * Returns {tier, reasons[], warnings[], th, cmp, plan, ...}
   */
  function evaluate(d, S, opts) {
    const o = opts || {};
    const reasons = [], warnings = [];
    const th = checkThreshold(d, S, o.std);
    const miss = missingUse(d, S);
    const mathEither = d.sub.some(s => s.k === '數A' && s.m != null) && d.sub.some(s => s.k === '數B' && s.m != null);
    const screenMissing = miss.screen.filter(k => !(mathEither && (k === '數A' || k === '數B') && (val(S, '數A') != null || val(S, '數B') != null)));
    const res = { th, miss, plan: screenPlan(d), reasons, warnings };

    if (!th.ok) {
      res.tier = '不符';
      reasons.push('未通過檢定：' + th.fails.join('、'));
      return res;
    }
    if (screenMissing.length) {
      res.tier = '不符';
      reasons.push('沒考 ' + screenMissing.map(k => SUBJ_NAME[k]).join('、') + '，但 116 用它做倍率篩選');
      return res;
    }
    if (miss.weight.length) warnings.push('沒考 ' + miss.weight.map(k => SUBJ_NAME[k]).join('、') + '，二階學測成績這科以 0 計');

    const risk = thresholdRisk(d, S, o.stdByYear, o.stdYear);
    if (risk.length) {
      res.thRisk = risk;
      warnings.push('檢定邊緣：如果 116 五標跟 ' + risk.map(r => r.year).join('、') + ' 年一樣，你會卡在 ' + risk[0].fails.join('、'));
    }

    const r = d.r115;
    if (!r) {
      res.tier = '無資料';
      reasons.push(d.why || '116 新設或改名，115 沒有可對應的校系');
      return res;
    }
    const cmp = compareCuts(r.cut, S, o.pct);
    res.cmp = cmp;
    const hasMult116 = res.plan.length > 0 || (d.arts && d.arts.items.some(i => i.m != null));

    let tier;
    if (cmp.status === 'none') {
      if (!hasMult116) { tier = '穩'; reasons.push('116 沒有倍率篩選：通過檢定就能進二階'); }
      else { tier = '適中'; reasons.push('115 一階沒有篩掉人（通過檢定者都進二階），116 不一定一樣'); }
    } else if (cmp.status === 'arts') {
      tier = '無資料';
      reasons.push('115 一階只用術科篩選，要看你的術科成績');
    } else if (cmp.status === 'pass') {
      // 穩 = still passes even if every cut rises by 1 級分 (ties pass except at the last stage),
      // and (where the official percentile table exists) clearly fewer people ahead of you than ahead of the cut.
      const robust = cmp.stages.filter(s => !s.arts).every(s => s.diff >= (s.last ? 2 : 1));
      tier = robust && (cmp.ratio == null || cmp.ratio <= SAFE_RATIO) ? '穩' : '適中';
      reasons.push(cmp.binding ? `115 最低 ${cmp.binding.raw}，你 ${cmp.binding.mine}（+${cmp.binding.diff}）` : '每一關都高於 115 最低');
    } else if (cmp.status === 'edge') {
      tier = '衝';
      const b = cmp.stages.find(s => s.last);
      reasons.push(`剛好等於 115 最後一關 ${b.raw}：要看同級分超額篩選`);
    } else {
      if (cmp.missing && cmp.missing.length) {
        tier = '難';
        reasons.push('115 用 ' + cmp.missing.map(k => SUBJ_NAME[k]).join('、') + ' 篩選，你沒有這科成績');
      } else {
        const worst = cmp.stages.filter(s => s.diff != null && s.diff < 0).sort((a, b) => a.diff - b.diff)[0];
        const near = cmp.ratio != null ? cmp.ratio <= REACH_RATIO : cmp.minDiff >= -1;
        tier = near ? '衝' : '難';
        reasons.push(`115 最低 ${worst.raw}，你 ${worst.mine}（${worst.diff}）`);
      }
    }
    if (cmp.unknown && tier !== '無資料') warnings.push('115 還有術科／APCS 篩選關卡，這裡沒算進去');

    // Caps: last year's data is a weaker guide when the rules changed or the match is not exact.
    const capReasons = [];
    if (r.chg) capReasons.push('116 篩選倍率或科目跟 115 不同');
    if (r.via) capReasons.push('用的是' + (r.via.startsWith('同系') ? r.via : '相近系組') + '的資料');
    const e115 = expected115(r);
    if (e115 && d.ei && d.ei < e115 * 0.85) capReasons.push(`預計甄試人數變少（115 約 ${e115} → 116 ${d.ei}）`);
    if (res.thRisk) capReasons.push('檢定邊緣');
    if (tier === '穩' && capReasons.length) { tier = '適中'; reasons.push('最多判「適中」：' + capReasons.join('；')); }
    else if (capReasons.length) warnings.push(capReasons.join('；'));
    if (e115 && d.ei && d.ei > e115 * 1.15) warnings.push(`預計甄試人數變多（115 約 ${e115} → 116 ${d.ei}），可能比 115 好進`);

    res.tier = tier;
    res.e115 = e115;
    return res;
  }

  /** Sort key: smaller = better chance. Used to order inside a tier. */
  function chanceKey(e) {
    if (!e.cmp || e.cmp.ratio == null) return e.cmp && e.cmp.minDiff != null ? -e.cmp.minDiff : 0;
    return e.cmp.ratio;
  }

  /** Average 級分 per subject of last year's binding (hardest-for-me) cut stage; a selectivity measure. */
  function selectivity(d) {
    const r = d.r115;
    if (!r || !r.cut || !r.cut.length) return null;
    const vals = r.cut.filter(c => c.s && !c.apcs).map(c => c.v / c.s.length);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  /** Estimated share of total score from 學測 (most schools: Σ級分×權重 / Σ15×權重). */
  function satShare(d, S) {
    const ws = d.sub.filter(s => s.w != null && s.p && s.k !== '聽');
    if (!ws.length || !d.sp) return null;
    let got = 0, max = 0, missing = false;
    for (const s of ws) {
      const { v } = sumOf(s.p, S);
      if (v == null) missing = true;
      got += (v || 0) * s.w;
      max += 15 * s.p.length * s.w;
    }
    return { pct: got / max, points: (got / max) * d.sp, of: d.sp, missing };
  }

  /** Minimum scores needed: 檢定 per subject and each 115 cut stage. For "what do I need" planning. */
  function targets(d, std) {
    const th = [];
    const math = d.sub.filter(s => (s.k === '數A' || s.k === '數B') && s.t);
    for (const s of d.sub) {
      if (!s.t) continue;
      if (s.k === '聽') th.push({ k: '聽', need: s.t });
      else if (s.apcs) th.push({ k: s.p[0], need: s.t + '級' });
      else if (s.p && s.p.length === 1) th.push({ k: s.k, need: stdLevel(std, s.k, s.t), label: s.t, either: math.length === 2 && (s.k === '數A' || s.k === '數B') });
    }
    const cuts = d.r115 && d.r115.cut ? d.r115.cut.map((c, i, a) => ({ raw: c.raw, s: c.s, v: c.v, last: i === a.length - 1 })) : [];
    return { th, cuts };
  }

  /** Parse 'MM-DD' interview days; find conflicts within a plan of departments. */
  function conflicts(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const da = a.idays || [], db = b.idays || [];
        const shared = da.filter(x => db.includes(x));
        if (!shared.length) continue;
        const sure = da.length === 1 && db.length === 1;
        out.push({ a: a.c, b: b.c, days: shared, sure });
      }
    }
    return out;
  }

  function fmtDay(md) {
    const [m, d] = md.split('-').map(Number);
    const wd = '日一二三四五六'[new Date(2027, m - 1, d).getDay()];
    return `${m}/${d}(${wd})`;
  }

  // ---------------------------------------------------------------- 第二階段 (116 校系分則)
  /** Split at top-level 、 only (the 分則's list separator), so "其他(R.推薦函2封(含導師)、S.小論文)" keeps its inner parentheses. */
  function splitTop(s) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '(' || ch === '（') depth++;
      else if (ch === ')' || ch === '）') depth = Math.max(0, depth - 1);
      else if (depth === 0 && ch === '、') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  /** 審查資料 as the 分則 lists it, e.g. "修課紀錄(A)、課程學習成果(B、C)、…、其他(R.自傳(限一頁)、S.小論文)"
   *  → [{ g: '修課紀錄', codes: ['A'] }, …, { g: '其他', codes: [], items: [{ c: 'R', t: '自傳(限一頁)' }, …] }]. */
  function reviewGroups(rv) {
    if (!rv) return [];
    return splitTop(rv).map(seg => {
      const m = /^([^(（]+)[(（]([\s\S]*)[)）]$/.exec(seg);
      if (!m) return { g: seg, codes: [], items: [] };
      const g = m[1].trim(), inner = splitTop(m[2]);
      if (g === '其他') {
        return { g, codes: [], items: inner.map(p => { const x = /^([A-Z])[.．]\s*([\s\S]+)$/.exec(p); return x ? { c: x[1], t: x[2].trim() } : { c: '', t: p }; }) };
      }
      return { g, codes: inner, items: [] };
    });
  }
  const INTERVIEW_RE = /面試|口試|面談|座談|晤談|訪談/;
  const WRITTEN_RE = /筆試|測驗|小論文|寫作|作文/;
  /** What an 二階 item is: review (審查資料), interview, written (筆試、測驗), or other (實作、術科、心得報告 …). */
  function stage2Kind(name) {
    if (/^審查資料/.test(name)) return 'review';
    if (INTERVIEW_RE.test(name)) return 'interview';
    if (WRITTEN_RE.test(name)) return 'written';
    return 'other';
  }
  /** The 二階 總成績 in the 分則's order: 學測, 術科, then each 指定項目. Items with 0% are left out. */
  function stage2(d) {
    const out = [];
    if (d.sp) out.push({ n: '學測', p: d.sp, kind: 'sat' });
    if (d.arts && d.arts.p) out.push({ n: '術科', p: d.arts.p, kind: 'arts' });
    for (const x of d.st2 || []) if (x.p) out.push({ n: x.i.replace(/^指定項目甄試[:：]?/, ''), p: x.p, t: x.t, kind: stage2Kind(x.i) });
    return out;
  }
  const hasInterview = d => (d.st2 || []).some(x => INTERVIEW_RE.test(x.i));
  const hasWritten = d => (d.st2 || []).some(x => WRITTEN_RE.test(x.i));
  /** 不用到校甄試: the 分則 gives no 甄試 date ("--"); every such 系 is judged on 審查資料 (and 學測 or APCS) only. */
  const noVisit = d => !(d.idays && d.idays.length);

  return {
    SUBJ, SUBJ_NAME, LEVELS, TIERS, SAFE_RATIO, REACH_RATIO,
    val, sumOf, checkThreshold, countAtOrAbove, topPercent, compareCuts, screenPlan, missingUse,
    expected115, thresholdRisk, evaluate, chanceKey, selectivity, satShare, targets, conflicts, fmtDay,
    splitTop, reviewGroups, stage2Kind, stage2, hasInterview, hasWritten, noVisit,
  };
});
