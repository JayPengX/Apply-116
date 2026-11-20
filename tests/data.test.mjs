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

// ---------------------------------------------------------------- 116 stages first
test('every 116 stage borrows a 115 cut only for exactly the same subjects, each cut at most once', () => {
  const kinds = {};
  for (const d of D.depts) {
    const A = L.align116(d);
    const used = new Set();
    for (const s of A.stages) {
      kinds[s.kind] = (kinds[s.kind] || 0) + 1;
      if (!s.ref) continue;
      assert.deepEqual([...s.ref.parts].sort(), [...s.parts].sort(), `${d.c} stage ${s.k}`);
      assert.ok(!used.has(s.ref.i), `${d.c} reuses a 115 cut`);
      used.add(s.ref.i);
      assert.ok(s.kind === 'same' ? s.ref.m === s.m : s.ref.m !== s.m, `${d.c} kind`);
    }
    // the stages are the 116 rules: same subjects and multiples as the 116 校系分則, highest multiple first
    assert.deepEqual(A.stages.map(s => s.m), L.screenPlan(d).map(p => p.m));
  }
  // 2,661 stages screen like 115, 354 changed only the 倍率, 388 use subjects 115 never screened together (or screened
  // nobody with, at a 116 size that is now smaller), 23 screened nobody in 115 and let through at least as many in 116
  assert.deepEqual(kinds, { same: 2661, mult: 354, none: 384, open: 27 });
});

test('no tier is ever decided by a subject the 116 screening does not use', () => {
  const profiles = [{ 國: 12, 英: 15, 數B: 1, 社: 13, 聽: 'A' }, { 國: 13, 英: 13, 數A: 12, 自: 13, 聽: 'A' }, { 國: 10, 英: 9, 數B: 8, 社: 11, 聽: 'B' }];
  const O = { std: D.std['115'], stdByYear: D.std, stdYear: '115', pct: D.pct };
  for (const S of profiles) {
    for (const d of D.depts) {
      const e = L.evaluate(d, S, O);
      const screened = new Set(L.screenPlan(d).flatMap(p => p.parts));
      for (const s of (e.cmp && e.cmp.stages) || []) for (const p of s.parts) assert.ok(screened.has(p), `${d.c} judged on ${p}`);
      if ((e.tier === '難' || e.tier === '衝') && !(e.screenZero && e.screenZero.length)) assert.ok(e.cmp.stages.some(s => s.ref), `${d.c} ${e.tier} without a comparable 115 cut`);
    }
  }
});

test('116 vs 115 spot checks (校系分則 and 115 篩選標準一覽表)', () => {
  const by = Object.fromEntries(D.depts.map(d => [d.c, d]));
  const kinds = c => L.align116(by[c]).stages.map(s => `${s.k}×${s.m}:${s.kind}`);
  // 臺師大教育心理與輔導: 115 國+英+數B+社 ×3 ≥ 53 → 116 國+英+社 ×3
  assert.deepEqual(kinds('002022'), ['國+英+社×3:none']);
  // 臺大政治理論組: 115 (國+社) ×5 → 英 ×2.5; 116 國 ×5 → (英+社) ×3
  assert.deepEqual(kinds('001162'), ['國×5:none', '英+社×3:none']);
  // 高醫公共衛生: 115 英 ×10 ≥ 8 → 數A ×3 ≥ 10; 116 英 ×3 only
  assert.deepEqual(kinds('007102'), ['英×3:mult']);
  assert.deepEqual(L.align116(by['007102']).dropped.map(c => c.raw), ['數學A10']);
  // 270 → 78 people through 英: a change in people is structural, so it shows before any scores are typed in
  const s007 = L.compare116(by['007102'], {}, D.pct).stages[0];
  assert.equal(s007.n115, 270); assert.equal(s007.n116, 78); assert.equal(s007.scaled, true);
  const s017 = L.compare116(by['017522'], {}, D.pct).stages[0]; // 社 ×3 名額 16 → ×4 名額 12: 48 → 48 people
  assert.equal(s017.kind, 'mult'); assert.equal(s017.scaled, false);
  // 臺大藥學: 116 keeps (數A+自) ×3 ≥ 28 and drops 115's 國英 ×2.5
  assert.deepEqual(kinds('001272'), ['數A+自×3:same']);
  assert.equal(L.align116(by['001272']).stages[0].ref.v, 28);
  // 中原商業設計甲類: 115 screened 國英 21; 116 screens by 術科 only
  assert.equal(L.compare116(by['008432'], {}, D.pct).status, 'arts');
  // 彰師大揚鷹C組: 數B ×12 screened nobody in 115 and stays ×12 in 116
  assert.deepEqual(kinds('023262'), ['數B×12:open', '英×10:same']);
  // 淡江外交全英: 社 ×6 screened nobody in 115 (名額 30, 180 people); 116 名額 29 (174 people) is within 10%
  assert.equal(L.align116(by['014292']).stages.find(s => s.k === '社').kind, 'open');
  // 中華都計智慧城市組: 自 ×9 screened nobody (99 people); 116 自 ×4 lets 48 through: cannot tell
  const s373 = L.align116(by['017372']).stages.find(s => s.k === '自');
  assert.equal(s373.kind, 'none'); assert.equal(s373.open.n115, 99); assert.equal(s373.open.n116, 48);
  // 臺北大學財政飛鳶組: 115 分則 says its 組合 ×7 was 國英數A社, the same as 116; nobody was screened
  assert.deepEqual(kinds('099202'), ['國+英+數A+社×7:open', '數A×6:open', '英×5:open']);
  // 佛光應用經濟國際商務組: 115 社 ×7 screened nobody; 116 screens 國 ×6 instead
  const O = { std: D.std['115'], stdByYear: D.std, stdYear: '115', pct: D.pct };
  const e130 = L.evaluate(by['130192'], { 國: '13', 英: '13', 社: '13' }, O);
  assert.equal(e130.tier, '無資料');
  assert.match(e130.reasons.join('；'), /國文 ×6/);
  // A 115 組合 with no cut does not say its subjects: every such stage a 116 stage could match is filled from the 分則
  for (const d of D.depts) {
    const r = d.r115;
    if (!r || r.mult['組合'] == null || r.combo || r.cut.some(c => c.s && c.s.length > 1)) continue;
    assert.ok(!L.align116(d).stages.some(s => s.kind === 'none' && s.parts.length > 1), `${d.c}: 115 組合 subjects unknown`);
  }
});
