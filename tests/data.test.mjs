// Data integrity tests: the embedded data must agree with official published facts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../build/app-data.json');
const L = require('../src/logic.js');
const combos = JSON.parse(readFileSync(new URL('./fixtures_cac116_subject_combos.json', import.meta.url)));
const entr = require('../data/official/cac115_entrance.json').depts;

test('2,240 departments, 64 schools, unique codes', () => {
  assert.equal(D.depts.length, 2240);
  assert.equal(D.schools.length, 64);
  assert.equal(new Set(D.depts.map(d => d.c)).size, 2240);
});

test('116 參採科目 per department match the official CAC 2026-10-27 table exactly', () => {
  const N = { 國: '國文', 英: '英文', 數A: '數學A', 數B: '數學B', 社: '社會', 自: '自然' };
  const counts = {};
  for (const d of D.depts) {
    const s = new Set();
    for (const e of d.sub) if (e.k !== '聽' && !e.apcs && (e.t || e.m != null || e.w != null)) e.p.forEach(x => s.add(x));
    const key = L.SUBJ.filter(k => s.has(k)).map(k => N[k]).join('、') || '未參採任何科目';
    counts[key] = (counts[key] || 0) + 1;
  }
  const official = Object.fromEntries(Object.entries(combos).filter(([, n]) => n > 0));
  assert.deepEqual(counts, official);
});

test('115 五標 match the CEEC table', () => {
  const s = D.std['115'];
  assert.deepEqual(['頂標', '前標', '均標', '後標', '底標'].map(l => s.國[l]), [13, 12, 10, 9, 7]);
  assert.deepEqual(['頂標', '前標', '均標', '後標', '底標'].map(l => s.英[l]), [13, 11, 8, 5, 3]);
  assert.deepEqual(['頂標', '前標', '均標', '後標', '底標'].map(l => s.數A[l]), [12, 10, 8, 5, 4]);
  assert.deepEqual(['頂標', '前標', '均標', '後標', '底標'].map(l => s.數B[l]), [11, 9, 5, 3, 2]);
  assert.deepEqual(['頂標', '前標', '均標', '後標', '底標'].map(l => s.社[l]), [13, 12, 10, 8, 7]);
  assert.deepEqual(['頂標', '前標', '均標', '後標', '底標'].map(l => s.自[l]), [13, 12, 9, 7, 5]);
  assert.deepEqual(Object.keys(D.std).sort(), ['113', '114', '115']);
});

test('percentile tables are cumulative and consistent', () => {
  for (const [k, tab] of Object.entries(D.pct)) {
    const n = k.match(/數A|數B|國|英|社|自/g).length;
    let prev = -1;
    for (let v = 15 * n; v >= 0; v--) {
      const row = tab[String(v)];
      assert.ok(row, `${k} missing level ${v}`);
      assert.ok(row[1] >= prev, `${k} not cumulative at ${v}`);
      assert.equal(row[1] - (prev < 0 ? 0 : prev), row[0], `${k} count mismatch at ${v}`);
      prev = row[1];
    }
  }
});

test('every 115 cut stage is well-formed', () => {
  for (const d of D.depts) {
    if (!d.r115) continue;
    for (const c of d.r115.cut) {
      if (!c.s) continue; // 術科
      const max = c.apcs ? 5 * c.s.length : 15 * c.s.length;
      assert.ok(c.v >= 0 && c.v <= max, `${d.c} ${c.raw}`);
      assert.ok(c.raw.endsWith(String(c.v)), `${d.c} raw/value mismatch ${c.raw} ${c.v}`);
    }
  }
});

test('every 115 reference points at a real 115 department (official 分發標準一覽表)', () => {
  const norm = s => s.normalize('NFKC').replace(/[\s\-_–．‧.・()]/g, '').replace(/學系/g, '系').replace(/覧/g, '覽');
  for (const d of D.depts) {
    if (!d.r115) continue;
    const e = entr[d.r115.code];
    assert.ok(e, `${d.c}: 115 code ${d.r115.code} not in official list`);
    assert.equal(norm(e.name), norm(d.r115.name), `${d.c}: 115 name mismatch`);
    if (norm(d.r115.name) !== norm(d.n)) assert.ok(d.r115.via, `${d.c} ${d.n} matched to differently named ${d.r115.name} without a label`);
  }
});

test('reviewed wrong matches are removed', () => {
  const by = Object.fromEntries(D.depts.map(d => [d.c, d]));
  for (const c of ['033282', '035022', '056092']) {
    assert.equal(by[c].r115, null, c);
    assert.ok(by[c].why.includes('已移除'), c);
  }
});

test('no unexplained gaps: departments without 115 data always carry a reason', () => {
  for (const d of D.depts) if (!d.r115) assert.ok(d.why && d.why.length > 5, d.c);
  assert.ok(D.depts.filter(d => !d.r115).length < 120);
});

test('spot checks against the official 116 校系分則', () => {
  const by = Object.fromEntries(D.depts.map(d => [d.c, d]));
  const ntuCl = by['001012'];
  assert.equal(ntuCl.n, '中國文學系');
  assert.equal(ntuCl.q, 23);
  assert.deepEqual(ntuCl.sub.filter(s => s.m != null).map(s => [s.k, s.m]), [['國', 3], ['英', 6], ['社', 8]]);
  assert.deepEqual(ntuCl.r115.cut.map(c => c.raw), ['社會10', '英文10', '國文15']);
  assert.deepEqual(ntuCl.idays, ['05-14']);
  assert.equal(by['001592'].sub.find(s => s.k === 'APCS實').t, 4);
});

test('interview day parsing covers every dated department', () => {
  for (const d of D.depts) {
    if (/116\.\d+\.\d+/.test(d.idate)) assert.ok(d.idays.length >= 1, d.c + ' ' + d.idate);
    for (const x of d.idays) assert.match(x, /^(0[1-9]|1[0-2])-\d{2}$/);
  }
});

test('115 分發 depth is attached for matched departments', () => {
  const withEntr = D.depts.filter(d => d.r115 && d.r115.entr && d.r115.entr.length);
  assert.ok(withEntr.length > 2000);
  for (const d of withEntr) for (const x of d.r115.entr) assert.match(x.s, /^(正取|無|備\d+)$/);
});

// 116 簡章總則「審查資料項目內容對照表」: A 修課紀錄; B–E 課程學習成果; F–N 多元表現; O–Q 學習歷程自述; R–T 其他.
const REVIEW_GROUP = { A: '修課紀錄' };
for (const c of 'BCDE') REVIEW_GROUP[c] = '課程學習成果';
for (const c of 'FGHIJKLMN') REVIEW_GROUP[c] = '多元表現';
for (const c of 'OPQ') REVIEW_GROUP[c] = '學習歷程自述';

test('every department\'s 審查資料 list parses into the official groups and codes', () => {
  for (const d of D.depts) {
    const gs = L.reviewGroups(d.rv);
    assert.ok(gs.length >= 1, d.c);
    for (const g of gs) {
      assert.ok(['修課紀錄', '課程學習成果', '多元表現', '學習歷程自述', '其他'].includes(g.g), d.c + ' group ' + g.g);
      if (g.g === '其他') for (const it of g.items) { assert.match(it.c, /^[RST]$/, d.c); assert.ok(it.t.length > 0, d.c); }
      else for (const c of g.codes) assert.equal(REVIEW_GROUP[c], g.g, `${d.c} ${c} in ${g.g}`);
    }
  }
});

test('二階 parts add up to 100% for every department', () => {
  for (const d of D.depts) {
    const parts = L.stage2(d);
    const total = parts.reduce((a, x) => a + x.p, 0);
    assert.ok(Math.abs(total - 100) < 0.01, `${d.c} sums to ${total}`);
    assert.ok(parts.some(x => x.kind === 'review'), d.c + ' has 審查資料');
  }
});

test('不用到校甄試 departments have no interview or written test', () => {
  const none = D.depts.filter(L.noVisit);
  assert.ok(none.length > 300);
  for (const d of none) { assert.ok(!L.hasInterview(d), d.c); assert.ok(!L.hasWritten(d), d.c); }
});

test('二階 spot checks against the official 116 校系分則', () => {
  const by = Object.fromEntries(D.depts.map(d => [d.c, d]));
  // 臺大中文: 學測 40%, 審查資料 25%, 語文測驗筆試 20%, 寫作筆試 15%
  assert.deepEqual(L.stage2(by['001012']).map(x => [x.n, x.p, x.kind]), [['學測', 40, 'sat'], ['審查資料', 25, 'review'], ['語文測驗筆試', 20, 'written'], ['寫作筆試', 15, 'written']]);
  // 臺大數學: 二階不計學測 (審查資料 45%, 數學筆試 55%)
  assert.equal(by['001092'].sp, 0);
  assert.deepEqual(L.stage2(by['001092']).map(x => x.kind), ['review', 'written']);
  assert.deepEqual(L.reviewGroups(by['001012'].rv).map(g => [g.g, g.codes.join('')]), [['修課紀錄', 'A'], ['課程學習成果', 'BC'], ['多元表現', 'FJKN'], ['學習歷程自述', 'OPQ']]);
});
