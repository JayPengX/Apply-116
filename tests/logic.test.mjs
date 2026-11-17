// Unit tests for the scoring rules. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../src/logic.js');
const D = require('../build/app-data.json');

const STD = D.std['115'];
const O = { std: STD, stdByYear: { 115: STD }, stdYear: '115', pct: D.pct };
// A department factory: sub = 116 subjects, cut = 115 一階 stages.
function dept({ sub = [], cut = [], mult = { 國: 3 }, chg = false, via = null, q = 10, ei = 30, r115 = true } = {}) {
  return {
    c: '999999', n: 'test', sub, ei, q,
    r115: r115 ? { cut, mult, chg, via, q, name: 'test' } : null,
    why: r115 ? null : '116 新設', idays: [],
  };
}
const S = (o) => ({ 國: '', 英: '', 數A: '', 數B: '', 社: '', 自: '', 聽: '', ...o });
const sub = (k, t, m, w) => ({ k, p: [k], t: t || null, m: m ?? null, w: w ?? null });

test('every screening stage must be met (regression: old tool only looked at the first stage)', () => {
  // 115 台大中文: 社會10 > 英文10 > 國文15
  const d = dept({ sub: [sub('國', null, 3), sub('英', null, 6), sub('社', null, 8)], cut: [
    { raw: '社會10', s: ['社'], v: 10 }, { raw: '英文10', s: ['英'], v: 10 }, { raw: '國文15', s: ['國'], v: 15 }] });
  const e = L.evaluate(d, S({ 國: 14, 英: 15, 社: 15 }), O);
  assert.equal(e.cmp.status, 'fail');
  assert.notEqual(e.tier, '穩');
  assert.notEqual(e.tier, '適中');
});

test('a tie at an intermediate stage passes; a tie at the last stage is a coin flip (衝)', () => {
  const cut = [{ raw: '英文12', s: ['英'], v: 12 }, { raw: '國文12', s: ['國'], v: 12 }];
  const d = dept({ sub: [sub('英', null, 5), sub('國', null, 3)], cut });
  assert.equal(L.evaluate(d, S({ 英: 12, 國: 15 }), O).cmp.status, 'pass');
  const edge = L.evaluate(d, S({ 英: 15, 國: 12 }), O);
  assert.equal(edge.cmp.status, 'edge');
  assert.equal(edge.tier, '衝');
});

test('穩 requires surviving a 1-級分 rise at the last stage', () => {
  const d = dept({ sub: [sub('國', null, 3)], cut: [{ raw: '國文11', s: ['國'], v: 11 }] });
  assert.equal(L.evaluate(d, S({ 國: 12 }), O).tier, '適中');
  assert.equal(L.evaluate(d, S({ 國: 14 }), O).tier, '穩');
});

test('數A/數B: when both are 檢定 subjects, passing either one is enough', () => {
  const d = dept({ sub: [sub('數A', '均標'), sub('數B', '均標'), sub('國', null, 3)], cut: [] });
  assert.equal(L.checkThreshold(d, S({ 數B: STD.數B.均標 }), STD).ok, true);
  assert.equal(L.checkThreshold(d, S({ 數A: STD.數A.均標 }), STD).ok, true);
  assert.equal(L.checkThreshold(d, S({ 數A: STD.數A.均標 - 1, 數B: STD.數B.均標 - 1 }), STD).ok, false);
  assert.equal(L.checkThreshold(d, S({ 國: 15 }), STD).ok, false);
});

test('only 數A listed: a 數B-only student fails 檢定', () => {
  const d = dept({ sub: [sub('數A', '後標')], cut: [] });
  assert.equal(L.evaluate(d, S({ 數B: 15 }), O).tier, '不符');
});

test('blank and 0 both mean "not taken"', () => {
  const d = dept({ sub: [sub('自', '底標')], cut: [] });
  assert.equal(L.checkThreshold(d, S({ 自: 0 }), STD).ok, false);
  assert.equal(L.checkThreshold(d, S({ 自: '' }), STD).ok, false);
  assert.equal(L.checkThreshold(d, S({ 自: STD.自.底標 }), STD).ok, true);
});

test('英聽 grade comparison', () => {
  const d = dept({ sub: [{ k: '聽', p: null, t: 'B級', m: null, w: null }], cut: [] });
  assert.equal(L.checkThreshold(d, S({ 聽: 'A' }), STD).ok, true);
  assert.equal(L.checkThreshold(d, S({ 聽: 'B' }), STD).ok, true);
  assert.equal(L.checkThreshold(d, S({ 聽: 'C' }), STD).ok, false);
  assert.equal(L.checkThreshold(d, S({}), STD).ok, false);
});

test('116 screens with a subject you did not take → 不符', () => {
  const d = dept({ sub: [sub('國', null, 3), sub('自', null, 5)], cut: [{ raw: '國文8', s: ['國'], v: 8 }] });
  const e = L.evaluate(d, S({ 國: 15 }), O);
  assert.equal(e.tier, '不符');
});

test('weight-only subject not taken → warning, not 不符', () => {
  const d = dept({ sub: [sub('國', null, 3, 1), sub('自', null, null, 1)], cut: [{ raw: '國文8', s: ['國'], v: 8 }] });
  const e = L.evaluate(d, S({ 國: 15 }), O);
  assert.notEqual(e.tier, '不符');
  assert.ok(e.warnings.some(w => w.includes('自然')));
});

test('no cuts last year: 穩 only when 116 also has no 倍率', () => {
  assert.equal(L.evaluate(dept({ sub: [sub('國', '均標')], cut: [] }), S({ 國: 15 }), O).tier, '穩');
  assert.equal(L.evaluate(dept({ sub: [sub('國', '均標', 3)], cut: [] }), S({ 國: 15 }), O).tier, '適中');
});

test('new department without 115 data → 無資料 with a reason', () => {
  const e = L.evaluate(dept({ sub: [sub('國', null, 3)], r115: false }), S({ 國: 15 }), O);
  assert.equal(e.tier, '無資料');
  assert.ok(e.reasons[0].length > 0);
});

test('穩 is capped at 適中 when the 116 倍率 changed or the data is from a sibling group', () => {
  const base = { sub: [sub('國', null, 3)], cut: [{ raw: '國文8', s: ['國'], v: 8 }] };
  assert.equal(L.evaluate(dept(base), S({ 國: 15 }), O).tier, '穩');
  assert.equal(L.evaluate(dept({ ...base, mult: { 國: 2.5 } }), S({ 國: 15 }), O).tier, '適中'); // 115 ×2.5 → 116 ×3
  assert.equal(L.evaluate(dept({ ...base, via: '同系去年的「X」' }), S({ 國: 15 }), O).tier, '適中');
  assert.equal(L.evaluate(dept({ ...base, ei: 10, q: 10, mult: { 國: 3 } }), S({ 國: 15 }), O).tier, '適中'); // 30 → 10 interviewees
});

test('threshold risk: passing with 115 五標 but failing with another year caps 穩', () => {
  const other = JSON.parse(JSON.stringify(STD));
  other.國.均標 = STD.國.均標 + 1;
  const d = dept({ sub: [sub('國', '均標', 3)], cut: [{ raw: '國文5', s: ['國'], v: 5 }] });
  const e = L.evaluate(d, S({ 國: STD.國.均標 }), { ...O, stdByYear: { 114: other, 115: STD } });
  assert.ok(e.thRisk && e.thRisk.length === 1);
  assert.equal(e.tier, '適中');
});

test('below the cut: 衝 when close, 難 when far', () => {
  const d = dept({ sub: [sub('國', null, 3), sub('英', null, 3), sub('社', null, 3)], cut: [{ raw: '國英社40', s: ['國', '英', '社'], v: 40 }] });
  assert.equal(L.evaluate(d, S({ 國: 13, 英: 13, 社: 13 }), O).tier, '衝'); // 39 vs 40
  assert.equal(L.evaluate(d, S({ 國: 10, 英: 10, 社: 10 }), O).tier, '難'); // 30 vs 40
});

test('official 115 percentile tables are wired correctly', () => {
  // values copied from CEEC 115 各科級分人數百分比累計表 / 組合累計表
  assert.equal(L.countAtOrAbove(D.pct, ['國'], 15), 2563);
  assert.equal(L.countAtOrAbove(D.pct, ['國'], 12), 37654);
  assert.equal(L.countAtOrAbove(D.pct, ['英'], 15), 3261);
  assert.equal(L.countAtOrAbove(D.pct, ['國', '英'], 30), 729);
  assert.equal(L.countAtOrAbove(D.pct, ['英', '國'], 29), 2319); // order-independent
  assert.equal(L.countAtOrAbove(D.pct, ['國'], 16), 0);
  assert.equal(Math.round(L.topPercent(D.pct, ['國'], 13)), 17); // 頂標 13 = 17.18%
});

test('APCS stages are evaluated from APCS levels', () => {
  const d = dept({ sub: [sub('數A', null, 10), { k: 'APCS實', p: ['實'], t: 3, m: 5, w: null, apcs: 1 }],
    cut: [{ raw: '數學A11', s: ['數A'], v: 11 }, { raw: 'APCS實作4', s: ['實'], v: 4, apcs: 1 }] });
  assert.equal(L.evaluate(d, S({ 數A: 13, 實: 5 }), O).cmp.status, 'pass');
  assert.equal(L.evaluate(d, S({ 數A: 13, 實: 2 }), O).tier, '不符'); // 檢定 3級
});

test('interview conflicts', () => {
  const a = { c: 'a', idays: ['05-14'] }, b = { c: 'b', idays: ['05-14'] }, c = { c: 'c', idays: ['05-14', '05-15'] }, d = { c: 'd', idays: ['05-20'] };
  const cf = L.conflicts([a, b, c, d]);
  assert.equal(cf.length, 3);
  assert.equal(cf.find(x => x.a === 'a' && x.b === 'b').sure, true);
  assert.equal(cf.find(x => x.a === 'a' && x.b === 'c').sure, false);
});

test('screen plan groups equal multiples, highest first', () => {
  const d = dept({ sub: [sub('國', null, 3), sub('英', null, 5), sub('社', null, 3)] });
  const p = L.screenPlan(d);
  assert.deepEqual(p.map(x => x.m), [5, 3]);
  assert.deepEqual(p[1].parts.sort(), ['國', '社'].sort());
});

test('fmtDay gives 2027 weekdays', () => {
  assert.equal(L.fmtDay('05-14'), '5/14(五)'); // 116.5.14 is a Friday per 校系分則 text
  assert.equal(L.fmtDay('01-22'), '1/22(五)'); // 學測 1/22（五）
});

test('審查資料 parsing keeps nested parentheses and commas inside 其他', () => {
  const gs = L.reviewGroups('修課紀錄(A)、課程學習成果(B、D)、多元表現(F、H、K、M、N)、學習歷程自述(O、P、Q)、其他(R.經濟與文化不利證明、S.推薦函2封(含導師)、T.學系志願表(B組))');
  assert.deepEqual(gs.map(g => g.g), ['修課紀錄', '課程學習成果', '多元表現', '學習歷程自述', '其他']);
  assert.deepEqual(gs[1].codes, ['B', 'D']);
  assert.deepEqual(gs[4].items, [{ c: 'R', t: '經濟與文化不利證明' }, { c: 'S', t: '推薦函2封(含導師)' }, { c: 'T', t: '學系志願表(B組)' }]);
  assert.deepEqual(L.reviewGroups('其他(R.作品集，須附說明。)')[0].items, [{ c: 'R', t: '作品集，須附說明。' }]);
  assert.deepEqual(L.reviewGroups(''), []);
});

test('二階 items are sorted into kinds', () => {
  const kinds = ['審查資料', '面試', '團體訪談', '英文口試', '語文測驗筆試', '小論文', '術科：創意設計', '認識本系與心得報告'].map(L.stage2Kind);
  assert.deepEqual(kinds, ['review', 'interview', 'interview', 'interview', 'written', 'written', 'other', 'other']);
  const d = { sp: 0, st2: [{ i: '審查資料', p: 45 }, { i: '數學筆試', p: 55 }], idays: ['05-14'] };
  assert.deepEqual(L.stage2(d).map(x => x.n), ['審查資料', '數學筆試']);
  assert.equal(L.hasWritten(d), true);
  assert.equal(L.hasInterview(d), false);
  assert.equal(L.noVisit(d), false);
  assert.equal(L.noVisit({ idays: [] }), true);
});

// ---------------------------------------------------------------- 116 rules first (115 cuts only for the same subjects)
test('116 screens a combination 115 never used → 無資料, not judged on 115 subjects', () => {
  // 115 教育心理與輔導: 國+英+數B+社 ×3 ≥ 53; 116: 國+英+社 ×3
  const d = dept({ sub: [sub('國', null, 3), sub('英', null, 3), sub('社', null, 3)], mult: { 組合: 3 },
    cut: [{ raw: '國英數B社53', s: ['國', '英', '數B', '社'], v: 53 }] });
  const e = L.evaluate(d, S({ 國: 14, 英: 14, 數B: 1, 社: 14 }), O);
  assert.equal(e.cmp.status, 'unknown');
  assert.equal(e.tier, '無資料');
  assert.match(e.reasons[0], /國\+英\+社 ×3/);
  assert.equal(e.cmp.stages[0].kind, 'none');
  assert.equal(e.cmp.dropped.length, 1);
});

test('a subject 115 screened but 116 does not is ignored (no 難 for a subject you did not take)', () => {
  // 115: 英 ×10 ≥ 8 → 數A ×3 ≥ 10; 116: 英 ×3 only
  const d = dept({ sub: [sub('英', null, 3)], mult: { 英: 10, 數A: 3 }, cut: [{ raw: '英文8', s: ['英'], v: 8 }, { raw: '數學A10', s: ['數A'], v: 10 }] });
  const top = L.evaluate(d, S({ 英: 15 }), O);
  assert.notEqual(top.tier, '難');
  assert.equal(top.tier, '適中'); // 倍率 changed: never 穩
  assert.ok(top.reasons.some(r => r.includes('拿掉了')));
  // 英 9 passes 115's ×10 cut but 116 keeps only 3 × quota: not inside the smaller group
  const low = L.evaluate(d, S({ 英: 9 }), O);
  assert.equal(low.cmp.stages[0].res, 'short');
  assert.ok(['衝', '難'].includes(low.tier));
});

test('missing a stage that does match still counts when another stage is new', () => {
  const d = dept({ sub: [sub('英', null, 8), sub('國', null, 3), sub('社', null, 3)], mult: { 英: 8, 組合: 3 },
    cut: [{ raw: '英文13', s: ['英'], v: 13 }, { raw: '國英數B社53', s: ['國', '英', '數B', '社'], v: 53 }] });
  const e = L.evaluate(d, S({ 國: 15, 英: 9, 社: 15 }), O);
  assert.equal(e.cmp.status, 'fail');
  assert.equal(e.tier, '難');
  assert.ok(e.warnings.some(w => w.includes('國文+社會 ×3')));
  assert.equal(L.evaluate(d, S({ 國: 15, 英: 14, 社: 15 }), O).tier, '無資料');
});

test('a bigger 116 倍率 can turn a miss into 衝; a smaller one needs room above the 115 cut', () => {
  const lenient = dept({ sub: [sub('英', null, 3)], mult: { 英: 2 }, cut: [{ raw: '英文13', s: ['英'], v: 13 }] });
  const e = L.evaluate(lenient, S({ 英: 12 }), O);
  assert.equal(e.cmp.stages[0].kind, 'mult');
  assert.ok(['maybe', 'fail'].includes(e.cmp.stages[0].res));
  assert.notEqual(L.evaluate(lenient, S({ 英: 13 }), O).tier, '穩');
  assert.equal(L.evaluate(lenient, S({ 英: 13 }), O).cmp.stages[0].res, 'pass');
  const strict = dept({ sub: [sub('國', null, 3), sub('英', null, 3), sub('社', null, 3)], mult: { 組合: 4 }, cut: [{ raw: '國英社38', s: ['國', '英', '社'], v: 38 }] });
  assert.equal(L.evaluate(strict, S({ 國: 13, 英: 13, 社: 12 }), O).cmp.stages[0].res, 'short'); // just at the 115 cut
  assert.equal(L.evaluate(strict, S({ 國: 15, 英: 15, 社: 15 }), O).tier, '適中');
});

test('116 order and grouping decide the stages: equal multiples are summed and matched to the same 115 sum', () => {
  // 115 臺大政治理論: (國+社) ×5 ≥ 28 → 英 ×2.5 ≥ 14; 116 國際關係組: 國 ×5, 社 ×5, 英 ×3
  const d = dept({ sub: [sub('國', null, 5), sub('英', null, 3), sub('社', null, 5)], mult: { 國: 5, 英: 2.5, 社: 5 },
    cut: [{ raw: '(國文+社會)28', s: ['國', '社'], v: 28 }, { raw: '英文14', s: ['英'], v: 14 }] });
  const A = L.align116(d);
  assert.deepEqual(A.stages.map(s => [s.k, s.kind]), [['國+社', 'same'], ['英', 'mult']]);
  assert.equal(A.stages[1].last, true);
});

test('115 stages that screened nobody, 術科-only screening, and no 倍率 at all', () => {
  // 115: 數B ×12 (nobody cut) → 英 ×10 ≥ 9
  const open = dept({ sub: [sub('數B', null, 12), sub('英', null, 10)], mult: { 數B: 12, 英: 10 }, cut: [{ raw: '英文9', s: ['英'], v: 9 }] });
  const e = L.evaluate(open, S({ 數B: 5, 英: 13 }), O);
  assert.deepEqual(e.cmp.stages.map(s => s.kind), ['open', 'same']);
  assert.notEqual(e.tier, '無資料');
  const stricter = dept({ sub: [sub('數B', null, 6), sub('英', null, 3)], mult: { 數B: 12, 英: 3 }, cut: [{ raw: '英文9', s: ['英'], v: 9 }] });
  assert.equal(L.evaluate(stricter, S({ 數B: 5, 英: 13 }), O).tier, '無資料');
  const artsOnly = dept({ sub: [sub('國', '均標')], mult: { 組合: 3 }, cut: [{ raw: '國英21', s: ['國', '英'], v: 21 }] });
  artsOnly.arts = { items: [{ i: '彩繪技法', t: null, m: 10, w: 1 }] };
  assert.equal(L.evaluate(artsOnly, S({ 國: 15, 英: 15 }), O).tier, '無資料');
  assert.equal(L.evaluate(dept({ sub: [sub('國', '均標')], r115: false }), S({ 國: 15 }), O).tier, '穩'); // new 系, no 倍率
});

test('115 screened nobody, but 116 screens other subjects or fewer people → 無資料, not 適中', () => {
  // 115: 社 ×7 screened nobody; 116: 國 ×6
  const moved = dept({ sub: [sub('國', null, 6)], mult: { 社: 7 }, cut: [], q: 7 });
  const e = L.evaluate(moved, S({ 國: 15 }), O);
  assert.equal(e.tier, '無資料');
  assert.match(e.reasons.join('；'), /國文 ×6/);
  assert.match(e.reasons.join('；'), /115 一階沒有篩掉人/);
  // 115: 自 ×4.5, 名額 11 (about 50 people) screened nobody; 116: 自 ×3.5, 名額 13 (about 46): fewer people
  const fewer = dept({ sub: [sub('自', null, 3.5)], mult: { 自: 4.5 }, cut: [], q: 11 });
  fewer.q = 13;
  assert.equal(L.evaluate(fewer, S({ 自: 15 }), O).tier, '無資料');
  // a 115 combination that screened nobody: its subjects come only from the 115 分則 (r115.combo)
  const combo = dept({ sub: [{ k: '國英社', p: ['國', '英', '社'], t: null, m: 7, w: null }], mult: { 組合: 7 }, cut: [], q: 1 });
  assert.equal(L.evaluate(combo, S({ 國: 12, 英: 12, 社: 12 }), O).tier, '無資料');
  combo.r115.combo = ['國', '英', '社'];
  const ec = L.evaluate(combo, S({ 國: 12, 英: 12, 社: 12 }), O);
  assert.deepEqual(ec.cmp.stages.map(s => s.kind), ['open']);
  assert.equal(ec.tier, '適中');
});
