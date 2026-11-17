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

test('穩 is capped at 適中 when rules changed or the data is from a sibling group', () => {
  const base = { sub: [sub('國', null, 3)], cut: [{ raw: '國文8', s: ['國'], v: 8 }] };
  assert.equal(L.evaluate(dept(base), S({ 國: 15 }), O).tier, '穩');
  assert.equal(L.evaluate(dept({ ...base, chg: true }), S({ 國: 15 }), O).tier, '適中');
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
