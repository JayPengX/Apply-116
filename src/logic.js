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
  const SCALE_TOL = 0.1; // a 116 stage that lets through more than 10% more or fewer people than 115 is scaled (compare116)

  /** A score is "not taken" when blank, missing, or 0 (project rule: blank or 0 = 沒考). */
  function val(S, k) {
    const v = S ? S[k] : null;
    if (v === '' || v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  /** Sum of a stage. `zero` = untaken subjects to count as 0 級分 (official: 缺考、未報考 以零級分計). */
  function sumOf(parts, S, zero) {
    let t = 0;
    const missing = [];
    for (const k of parts) {
      const v = val(S, k);
      if (v == null) { if (!(zero && zero.includes(k))) missing.push(k); }
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

  // ------------------------------------------------------------ 116 stages first, 115 cuts only where they apply
  const STAGE_SUBJ = ['國', '英', '數A', '數B', '社', '自', '識', '實'];
  const APCS_MULT = { 識: 'APCS識讀', 實: 'APCS實作' };
  const setKey = ps => STAGE_SUBJ.filter(s => ps.includes(s)).join('+');
  const numOrNull = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  /** 國文 / 國文+社會 / 國+英+社 (APCS keeps its full name). */
  function partsText(ps) {
    if (ps.length <= 2) return ps.map(p => SUBJ_NAME[p] || p).join('+');
    return ps.map(p => (APCS_MULT[p] ? SUBJ_NAME[p] : p)).join('+');
  }

  /** The 115 multiple of one 115 cut stage: a single subject, subjects with equal multiples (summed), or the 組合 row. */
  function mult115(r, s) {
    const m = r.mult || {};
    const one = p => numOrNull(m[p] ?? m[APCS_MULT[p]]);
    if (!s || !s.length) return null;
    if (s.length === 1) return one(s[0]);
    const ms = s.map(one);
    if (ms.every(v => v != null && v === ms[0])) return ms[0];
    return numOrNull(m['組合']);
  }

  /** 115 stages that screened nobody: listed in the 115 multiples but without a cut. Single subjects say which; a
   *  combination (組合) says which only through r.combo, taken from the official 115 校系分則. */
  function openStages115(r, cutKeys) {
    const by = new Map(), out = [];
    for (const [k, v] of Object.entries(r.mult || {})) {
      const m = numOrNull(v);
      if (m == null) continue;
      if (k === '組合') { if (r.combo && r.combo.length) out.push({ m, parts: r.combo.slice(), k: setKey(r.combo) }); continue; }
      const p = STAGE_SUBJ.includes(k) ? k : Object.keys(APCS_MULT).find(x => APCS_MULT[x] === k);
      if (!p) continue;
      if (!by.has(m)) by.set(m, []);
      by.get(m).push(p);
    }
    for (const [m, ps] of by) out.push({ m, parts: ps, k: setKey(ps) });
    return out.filter(x => !cutKeys.includes(x.k));
  }

  /**
   * Line up the 116 一階 stages with 115. The 116 分則 is the rule: stages, subjects, multiples and order all come from
   * 116, and a 116 stage borrows a 115 cut only when 115 screened exactly the same subjects. kind:
   *   same  same subjects and multiple in 115
   *   mult  same subjects, different multiple (the cut moves; 116 lets more people through when its multiple is bigger)
   *   open  115 screened these subjects but nobody was cut, and 116 lets about as many people through or more
   *         (倍率 × 名額, at most 10% fewer)
   *   none  no 115 cut applies: 115 never screened these subjects together, or it cut nobody but 116 lets clearly
   *         fewer through (st.open says so), or the 115 data is a sibling group's
   */
  function align116(d) {
    const r = d.r115;
    const plan = screenPlan(d);
    const artsM = d.arts ? d.arts.items.filter(i => i.m != null) : [];
    const minM = plan.length ? plan[plan.length - 1].m : null;
    const artsAfter = artsM.some(i => numOrNull(i.m) != null && minM != null && i.m < minM);
    const cuts = r ? (r.cut || []).map((c, i) => ({ i, raw: c.raw, parts: c.s, v: c.v, apcs: !!c.apcs, m: c.s ? mult115(r, c.s) : null, k: c.s ? setKey(c.s) : null })) : [];
    const open = r ? openStages115(r, cuts.filter(c => c.k).map(c => c.k)) : [];
    // People let through a stage = 倍率 × 招生名額. Quotas compare only for the same 系 (not a sibling group's data).
    const qk = r && !r.via && d.q && r.q ? d.q / r.q : null;
    const used = new Set();
    const stages = plan.map((p, i) => {
      const k = setKey(p.parts);
      const st = { parts: p.parts, m: p.m, k, last: i === plan.length - 1 && !artsAfter, apcs: p.parts.some(x => APCS_MULT[x]), kind: 'none', ref: null, open: null, scaled: false };
      const cands = cuts.filter(c => c.k === k && !used.has(c.i));
      if (cands.length) {
        const gap = c => (c.m == null ? Infinity : Math.abs(c.m - p.m));
        const ref = cands.find(c => c.m === p.m) || cands.slice().sort((a, b) => gap(a) - gap(b))[0];
        used.add(ref.i);
        st.ref = ref;
        st.kind = ref.m == null || ref.m === p.m ? 'same' : 'mult';
        if (ref.m != null && qk != null) { // 116 people through this stage ÷ 115's
          st.scale = (p.m * d.q) / (ref.m * r.q);
          st.n115 = Math.round(ref.m * r.q); st.n116 = Math.round(p.m * d.q); st.q115 = r.q; st.q116 = d.q;
          st.scaled = Math.abs(st.scale - 1) > SCALE_TOL; // structural: holds with or without scores
        }
      } else {
        const o = open.find(x => x.k === k);
        if (o) {
          // 115 cut nobody here. 116 still cuts nobody if it lets through about as many people or more.
          st.open = qk == null ? { ...o } : { ...o, n115: Math.round(o.m * r.q), n116: Math.round(p.m * d.q) };
          if (qk != null && p.m * d.q >= o.m * r.q * (1 - SCALE_TOL)) st.kind = 'open';
        }
      }
      return st;
    });
    return { stages, dropped: cuts.filter(c => c.k && !used.has(c.i)), cuts, arts116: artsM, artsAfter };
  }

  /**
   * Compare my scores with the 116 stages (see align116). Each stage with a 115 cut gets res:
   *   pass / edge (tied at the last stage) / fail (below the cut)
   *   short  116 lets fewer people through: you reach the 115 cut, but not within the smaller 116 group
   *   maybe  116 lets more people through: you miss the 115 cut, but would be within the bigger 116 group
   * A stage is scaled when it lets through more than 10% more or fewer people than in 115 (倍率 × 招生名額). On the
   * official 115 級分人數累計表 (the same table the 穩/衝 thresholds use) you are within the 116 group if
   * (115 考生 at or above you) ≤ scale × (115 考生 at or above the 115 cut), scale = 116 people ÷ 115 people.
   * status: free (116 has no 學測 倍率) | arts (116 screens only by 術科) | fail | unknown (a stage has no 115 cut)
   *         | maybe | edge | pass
   */
  function compare116(d, S, pct, zero) {
    const A = align116(d);
    const stages = A.stages.map(st => {
      const { v: mine, missing } = sumOf(st.parts, S, zero);
      const o = Object.assign({}, st, { mine, missing });
      if (st.ref) o.v = st.ref.v;
      if (mine == null) return o;
      o.topMine = topPercent(pct, st.parts, mine);
      if (!st.ref) { if (st.kind === 'open') o.res = 'pass'; return o; }
      o.diff = mine - st.ref.v;
      const nm = countAtOrAbove(pct, st.parts, mine), nc = countAtOrAbove(pct, st.parts, st.ref.v);
      if (nm != null && nc) { o.ratio = nm / nc; o.topCut = topPercent(pct, st.parts, st.ref.v); }
      if (o.scaled) {
        if (o.ratio != null) o.adj = o.ratio / st.scale;
        if (st.scale < 1) o.res = o.diff < 0 ? 'fail' : o.adj == null ? 'unsure' : o.adj <= 1 ? 'pass' : 'short';
        else if (o.diff < 0) o.res = o.adj != null && o.adj <= 1 ? 'maybe' : 'fail';
        else o.res = st.last && o.diff === 0 && !(o.adj != null && o.adj <= SAFE_RATIO) ? 'edge' : 'pass';
      } else {
        o.res = o.diff < 0 ? 'fail' : st.last && o.diff === 0 ? 'edge' : 'pass';
      }
      return o;
    });
    const res = { stages, dropped: A.dropped, cuts: A.cuts, arts116: A.arts116, artsAfter: A.artsAfter };
    res.unknown = stages.filter(s => s.kind === 'none' || s.res === 'unsure');
    if (!stages.length) { res.status = A.arts116.length ? 'arts' : 'free'; return res; }
    if (stages.some(s => s.mine == null)) {
      res.status = 'fail';
      res.missing = [...new Set(stages.flatMap(s => s.missing || []))];
      return res;
    }
    const evals = stages.filter(s => s.ref);
    const rel = s => (s.adj != null ? s.adj : s.ratio); // people ahead of you relative to the 116-sized group
    res.minDiff = evals.length ? Math.min(...evals.map(s => s.diff)) : null;
    const ratios = evals.map(rel).filter(x => x != null);
    res.ratio = ratios.length ? Math.max(...ratios) : null;
    res.binding = evals.reduce((a, b) => {
      if (a == null) return b;
      if (rel(b) != null && rel(a) != null) return rel(b) > rel(a) ? b : a;
      return b.diff < a.diff ? b : a;
    }, null);
    const bad = evals.filter(s => s.res === 'fail' || s.res === 'short');
    if (bad.length) {
      res.status = 'fail';
      res.worst = bad.reduce((a, b) => (rel(a) != null && rel(b) != null ? (rel(b) > rel(a) ? b : a) : b.diff < a.diff ? b : a));
    } else if (res.unknown.length) res.status = 'unknown';
    else if (evals.some(s => s.res === 'maybe')) res.status = 'maybe';
    else if (evals.some(s => s.res === 'edge')) res.status = 'edge';
    else res.status = 'pass';
    return res;
  }

  const stageText = s => `${partsText(s.parts)} ×${s.m}`;
  /** People let through a stage, 115 → 116: "115 ×4 約 48 人 → 116 ×3.5 約 49 人" (multiples only when quotas do not compare). */
  function flowText(s) {
    const mm = s.ref.m !== s.m;
    if (s.n115 == null) return `115 ×${s.ref.m} → 116 ×${s.m}`;
    return `115 ${mm ? `×${s.ref.m} ` : ''}約 ${s.n115} 人 → 116 ${mm ? `×${s.m} ` : ''}約 ${s.n116} 人`;
  }
  /** How the 116 screening differs from 115 in ways that move the cuts (empty when it screens the same way). */
  function screenChanges(cmp) {
    const out = [];
    for (const s of cmp.stages) {
      if (s.kind !== 'mult' || (s.scale != null && !s.scaled)) continue;
      out.push(`${partsText(s.parts)} ${flowText(s)}${s.scale == null ? '' : s.scale < 1 ? '（收的人變少，門檻可能比 115 高）' : '（收的人變多，門檻可能比 115 低）'}`);
    }
    const order = cmp.stages.filter(s => s.ref).map(s => s.ref.i);
    if (order.some((x, i) => i > 0 && x < order[i - 1])) out.push('篩選順序跟 115 不同');
    for (const c of cmp.dropped) out.push(`116 拿掉了 115 的 ${partsText(c.parts)}${c.m != null ? ' ×' + c.m : ''} 這一關`);
    return out;
  }
  /** Why a 116 stage has no usable 115 cut, for the stages in cmp.unknown. */
  function unknownText(cmp) {
    const out = [];
    const fresh = cmp.unknown.filter(s => s.kind === 'none' && !s.open);
    if (fresh.length) out.push(`116 用${fresh.map(s => `「${stageText(s)}」`).join('和')}篩選，115 沒有同樣科目的門檻`);
    for (const s of cmp.unknown.filter(x => x.kind === 'none' && x.open)) {
      const why = s.open.n115 != null ? ` 116 收的人從約 ${s.open.n115} 減到約 ${s.open.n116}` : '那是同系別組的資料，人數沒辦法比';
      out.push(`116 用「${stageText(s)}」篩選：115 ${partsText(s.parts)} ×${s.open.m} 沒有篩掉人，但${why}，看不出 116 會不會篩人`);
    }
    const unsure = cmp.unknown.filter(s => s.res === 'unsure');
    if (unsure.length) out.push(unsure.map(s => `116 ${stageText(s)} 比 115 的 ×${s.ref.m} 收得少，115 最低 ${s.v} 只是下限`).join('；'));
    return out.join('；');
  }
  /** One stage against its 115 cut, in words; when 116 lets through a different number of people, says so. */
  function cutReason(s) {
    const base = `115 最低 ${partsText(s.parts)} ${s.v}，你 ${s.mine}（${s.diff > 0 ? '+' : ''}${s.diff}）`;
    if (!s.scaled) return s.kind === 'mult' ? `${base}（116 倍率 ×${s.ref.m} → ×${s.m}，${s.n115 != null ? '名額也改了，收的人數差不多' : '人數沒辦法比'}）` : base;
    const flow = `116 這一關收的人${s.scale < 1 ? '變少' : '變多'}（${flowText(s)}）`;
    if (s.res === 'short') return `${base}；但 ${flow}，照 115 級分人數換算你還不夠`;
    if (s.res === 'maybe') return `${base}；但 ${flow}，照 115 級分人數換算你有機會`;
    if (s.res === 'fail') return s.scale > 1 ? `${base}；${flow}，但換算後還是不夠` : `${base}；${flow}`;
    return `${base}；${flow}${s.scale < 1 ? '，換算後你還在範圍內' : ''}`;
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

  /**
   * 學測 subjects a 系 needs in 一階 (檢定 or 倍率篩選), as groups of alternatives: [['國'], ['數A', '數B'], …].
   * A group is needed unless one of its subjects is still allowed; 數A and 數B both set as 檢定 = pass either one.
   */
  function stage1Groups(d) {
    const out = [], seen = new Set();
    const add = g => { const key = g.join('|'); if (!seen.has(key)) { seen.add(key); out.push(g); } };
    const mathT = d.sub.filter(s => (s.k === '數A' || s.k === '數B') && s.t && !s.apcs);
    const mathEither = mathT.length === 2;
    for (const s of d.sub) {
      if (s.k === '聽') { if (s.t) add(['聽']); continue; }
      if (!s.p) continue;
      if (s.m != null) s.p.forEach(k => add([k]));
      if (s.t) {
        if (mathEither && (s.k === '數A' || s.k === '數B')) add(['數A', '數B']);
        else s.p.forEach(k => add([k]));
      }
    }
    return out;
  }
  /** True when the 系 needs one of these subjects in 一階 (no alternative left). */
  function stage1Uses(d, subjects) {
    if (!subjects || !subjects.length) return false;
    return stage1Groups(d).some(g => g.every(k => subjects.includes(k)));
  }

  /** The subjects a 系 screens on by 倍率 in 一階 (all stages together), in fixed order; [] when it has no 倍率篩選. */
  function screenSubjects(d) {
    const ps = new Set(d.sub.filter(s => s.m != null && s.k !== '聽').flatMap(s => s.p || []));
    return STAGE_SUBJ.filter(s => ps.has(s));
  }
  /** Key of that combination, e.g. "國+英+社" ('' when none). */
  const comboKey = d => screenSubjects(d).join('+');
  /** Your 級分 total and 115 rank on a combination ({sum, top} or null when you did not take one of them). */
  function comboRank(parts, S, pct) {
    const { v } = sumOf(parts, S);
    if (v == null) return null;
    return { sum: v, top: topPercent(pct, parts, v), max: 15 * parts.length };
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

    // 簡章 九(一)1: 檢定、倍率篩選及採計的學測科目總和為零級分 → 不得參加篩選.
    const used = [...new Set(d.sub.filter(s => s.k !== '聽' && !s.apcs && s.p && (s.t || s.m != null || s.w != null)).flatMap(s => s.p))].filter(k => SUBJ.includes(k));
    if (used.length && used.every(k => val(S, k) == null)) {
      res.tier = '不符';
      reasons.push('這個系用到的學測科目（' + used.map(k => SUBJ_NAME[k]).join('、') + '）你都沒考，總和 0 級分不能參加篩選');
      return res;
    }
    if (!th.ok) {
      res.tier = '不符';
      reasons.push('未通過檢定：' + th.fails.join('、'));
      return res;
    }
    res.screenZero = screenMissing;
    if (screenMissing.length) warnings.push('沒考 ' + screenMissing.map(k => SUBJ_NAME[k]).join('、') + '，116 倍率篩選這科以 0 級分計');
    if (miss.weight.length) warnings.push('沒考 ' + miss.weight.map(k => SUBJ_NAME[k]).join('、') + '，二階學測成績這科以 0 計');

    const risk = thresholdRisk(d, S, o.stdByYear, o.stdYear);
    if (risk.length) {
      res.thRisk = risk;
      warnings.push('檢定邊緣：如果 116 五標跟 ' + risk.map(r => r.year).join('、') + ' 年一樣，你會卡在 ' + risk[0].fails.join('、'));
    }

    // 116 is the rule: its stages decide what is compared, and a 115 cut is used only for the same subjects.
    const cmp = compare116(d, S, o.pct, screenMissing);
    res.cmp = cmp;
    if (cmp.status === 'free') {
      res.tier = '穩';
      reasons.push('116 沒有倍率篩選：通過檢定就能進二階');
      return res;
    }
    if (cmp.status === 'arts') {
      res.tier = '無資料';
      reasons.push('116 一階只用術科篩選，要看你的術科成績');
      return res;
    }
    const r = d.r115;
    if (!r) {
      res.tier = '無資料';
      reasons.push(d.why || '116 新設或改名，115 沒有可對應的校系');
      return res;
    }

    let tier;
    const withCut = cmp.stages.filter(s => s.ref);
    if (!r.cut.length && cmp.status === 'unknown') {
      // 115 screened nobody, but 116 screens other subjects or lets fewer people through: 115 cannot say.
      tier = '無資料';
      reasons.push(unknownText(cmp));
      if (!cmp.unknown.some(s => s.open)) reasons.push('115 一階沒有篩掉人（通過檢定的人都進了二階）');
    } else if (!r.cut.length) {
      tier = '適中';
      reasons.push('115 一階沒有篩掉人（通過檢定的人都進了二階），116 不一定一樣');
    } else if (cmp.status === 'fail') {
      if (cmp.missing && cmp.missing.length) {
        tier = '難';
        reasons.push('116 用 ' + cmp.missing.map(k => SUBJ_NAME[k]).join('、') + ' 篩選，你沒有這科成績');
      } else {
        const w = cmp.worst, rr = w.adj != null ? w.adj : w.ratio;
        tier = (rr != null ? rr <= REACH_RATIO : w.diff >= -1) ? '衝' : '難';
        reasons.push(cutReason(w));
        if (cmp.unknown.length) warnings.push(unknownText(cmp) + '，這一關沒算進去');
      }
    } else if (cmp.status === 'maybe') {
      tier = '衝';
      reasons.push(cutReason(cmp.stages.find(s => s.res === 'maybe')));
    } else if (cmp.status === 'unknown') {
      // A stage on subjects 115 never screened together: last year's cuts cannot say whether you pass it.
      tier = '無資料';
      reasons.push(unknownText(cmp));
      const ok = withCut.filter(s => s.res === 'pass' || s.res === 'edge');
      if (ok.length) reasons.push(`${ok.map(s => partsText(s.parts)).join('、')}${ok.length > 1 ? '這幾關' : '這一關'}你達到 115 最低`);
    } else if (cmp.status === 'edge') {
      tier = '衝';
      const b = cmp.stages.find(s => s.res === 'edge');
      reasons.push(`剛好等於 115 最後一關 ${partsText(b.parts)} ${b.v}：要看同級分超額篩選`);
    } else {
      // 穩 = still passes even if every cut rises by 1 級分 (ties pass except at the last stage),
      // and (where the official percentile table exists) clearly fewer people ahead of you than ahead of the cut.
      const robust = withCut.every(s => s.diff >= (s.last ? 2 : 1));
      tier = robust && (cmp.ratio == null || cmp.ratio <= SAFE_RATIO) ? '穩' : '適中';
      reasons.push(cmp.binding ? cutReason(cmp.binding) : '116 的每一關，115 都沒有篩掉人');
    }
    if (screenMissing.length && tier === '無資料') {
      // 115 cannot say, but a stage you enter with 0 級分 puts you at the very bottom.
      tier = '難';
      reasons.push('你以 0 級分參加 ' + screenMissing.map(k => SUBJ_NAME[k]).join('、') + ' 的篩選，幾乎一定排在最後');
    }
    if (cmp.arts116.length && tier !== '無資料') warnings.push('116 還有術科篩選，這裡沒算進去');

    // Caps: 115 is a weaker guide when the 116 screening changed or the match is not exact.
    const capReasons = [];
    const changes = r.cut.length && tier !== '無資料' ? screenChanges(cmp) : [];
    if (changes.length) capReasons.push('116 篩選跟 115 不同：' + changes.join('；'));
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
    val, sumOf, checkThreshold, countAtOrAbove, topPercent, compareCuts, screenPlan, missingUse, stage1Groups, stage1Uses,
    screenSubjects, comboKey, comboRank,
    partsText, align116, compare116, screenChanges, unknownText, cutReason, flowText,
    expected115, thresholdRisk, evaluate, chanceKey, selectivity, satShare, targets, conflicts, fmtDay,
    splitTop, reviewGroups, stage2Kind, stage2, hasInterview, hasWritten, noVisit,
  };
});
