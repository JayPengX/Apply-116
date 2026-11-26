// Browser tests for the built single-file page. Run after `npm run build`: node tests/e2e/run.mjs
// Uses Playwright's Chromium. Every network request is blocked to prove the page works offline.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL_ = process.env.URL || pathToFileURL(join(root, 'dist', 'index.html')).href;
const SHOTS = process.env.SHOTS || join(root, 'build', 'shots');
mkdirSync(SHOTS, { recursive: true });
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failures++; console.log('  ✗ ' + msg); } };
// 落點 labels as students see them (internal keys 穩 適中 衝 難 不符 無資料)
const TIER_ORDER = ['穩過', '應該過', '邊緣', '機會低', '過不了', '看不出'];

async function newPage(browser, ctxOpts = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...ctxOpts });
  const external = [];
  if (!process.env.URL) await ctx.route(/^https?:/, r => { external.push(r.request().url()); r.abort(); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, page, errors, external };
}
// Scores are entered on 15-cell sliders on the 我的成績 page: click (or tap) the cell for the wanted 級分.
async function setSlider(page, sel, v, touch) {
  const t = page.locator(sel);
  await t.evaluate(e => e.scrollIntoView({ block: 'center' }));
  const b = await t.boundingBox();
  const n = Number(await t.getAttribute('data-max'));
  const x = b.x + ((v - 0.5) * b.width) / n, y = b.y + b.height / 2;
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await page.waitForTimeout(80);
}
async function setScores(page, s, touch) {
  for (const [k, v] of Object.entries(s)) {
    if (k === '聽') await page.click(`#scorePanel [data-listen="${v}"]`);
    else await setSlider(page, `#scorePanel [data-slider="${k}"]`, v, touch);
  }
}
const scores = page => page.evaluate(() => window.__app.st().scores);

// Text that should never break: short labels (buttons, chips, pills, headings…) running onto a second line, and
// sentences whose last line is only 1–3 characters. Runs in the page.
function layoutIssues() {
  const out = [];
  // wider than the device: older Chromium then widens the layout viewport and fixed bars drift off the finger
  if (document.documentElement.scrollWidth > screen.width + 1) out.push(`page ${document.documentElement.scrollWidth}px wide on a ${screen.width}px screen`);
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden], dialog:not([open]), details:not([open]) > :not(summary)'); };
  const tops = node => { const rg = document.createRange(); rg.selectNodeContents(node); const t = []; for (const r of rg.getClientRects()) { if (r.width < 0.5) continue; const m = Math.round(r.top + r.height / 2); if (!t.some(x => Math.abs(x - m) < 6)) t.push(m); } return t; };
  for (const el of document.querySelectorAll('button, .chip, .pill, .tab, .lg, .afchip, .sg small, .tag, .delta, th, h1, h2, h3, summary, .sc-h b, .ctx-lab, .rv-k, .srow-l, .hc .to, .pt, .rm-facts span, .s-d span, .dn .nm')) {
    if (!vis(el)) continue;
    for (const t of el.childNodes) if (t.nodeType === 3 && t.textContent.trim().length > 1 && tops(t).length > 1) out.push('wrap "' + t.textContent.trim().slice(0, 20) + '"');
  }
  for (const el of document.querySelectorAll('p, li, dd, .hint, .sub, .step-d, .ctx-note')) {
    if (!vis(el) || /flex|grid/.test(getComputedStyle(el).display) || [...el.children].some(c => /block|flex|grid|table/.test(getComputedStyle(c).display))) continue;
    const rg = document.createRange(); rg.selectNodeContents(el);
    const rects = [...rg.getClientRects()].filter(r => r.width > 0.5);
    const t = tops(el); if (t.length < 2) continue;
    const last = Math.max(...t), w = rects.filter(r => Math.abs(r.top + r.height / 2 - last) < 6).reduce((a, r) => a + r.width, 0);
    if (w < parseFloat(getComputedStyle(el).fontSize) * 3.6) out.push('orphan "…' + el.innerText.trim().slice(-12) + '"');
  }
  return [...new Set(out)];
}

const browser = await chromium.launch();
try {
  console.log('desktop flow');
  {
    const { ctx, page, errors, external } = await newPage(browser, { viewport: { width: 1360, height: 900 } });
    const t0 = Date.now();
    await page.goto(URL_);
    await page.waitForSelector('.row');
    ok(Date.now() - t0 < 5000, `loads in ${Date.now() - t0} ms`);
    ok((await page.locator('#list .row[data-code]').count()) === 50, 'first page shows 50 departments before scores');
    ok(await page.locator('#overview .start').isVisible(), 'first visit shows the three steps');
    ok((await page.locator('#rail #scorePanel').count()) === 0 && (await page.locator('#rail #filterPanel').count()) === 1, '找校系 sidebar holds only the filters');
    ok(/另有 \d+ 個特殊組別/.test(await page.locator('#overview').innerText()), 'says how many special groups are left out');

    // scores live on their own page
    await page.click('#overview .start [data-tab="scores"]');
    await page.waitForSelector('#scorePanel [data-slider]');
    ok((await page.locator('.srccard[data-src="test"]').getAttribute('aria-pressed')) === 'true', '學測級分 is the source in use');
    await setScores(page, { 國: 12 });
    ok(await page.locator('#scores .result-card').isVisible(), 'the result shows on the scores page as soon as there is a score');
    await setScores(page, { 英: 15, 數B: 1, 社: 13, 聽: 'A' });
    const s = await scores(page);
    ok(s.國 === '12' && s.英 === '15' && s.數B === '1' && s.社 === '13' && s.聽 === 'A', 'sliders set the scores: ' + JSON.stringify(s));
    // keyboard: arrow keys move one 級分
    await page.locator('#scorePanel [data-slider="社"]').focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(450);
    ok((await scores(page)).社 === '12', 'arrow key lowers a score');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(450);
    ok((await scores(page)).社 === '13', 'arrow key raises a score');
    await page.click('#scores .result-card [data-tab="explore"]');
    await page.waitForSelector('#ctxExplore .ctxbar');
    ok((await page.locator('#ctxExplore .sg').count()) === 5, '找校系 shows which scores the 落點 use');

    await page.click('#filterPanel [data-group="法政"]');
    const ov = await page.locator('#overview').innerText();
    ok(ov.includes('法政') && /穩過\s*\d+/.test(ov) && /應該過\s*\d+/.test(ov), 'overview shows the scope and tier counts');
    const pills = (await page.locator('#list .row .pill').allTextContents()).map(x => x.trim()); // rows off screen skip layout, so read text, not innerText
    ok(pills.length > 10 && pills.every(p => TIER_ORDER.includes(p)), 'rows show the labels (穩過、應該過…): ' + [...new Set(pills)].join(' '));
    ok((await page.locator('#list .row .pill .sig').count()) === pills.length, 'every label carries its signal icon');
    // a row may carry two labels (申請一階, 分發); it is placed by the better one
    const BEST = ['穩過', '應該過', '邊緣', '機會低', '看不出', '過不了'];
    const rowBest = (await page.locator('#list .row').evaluateAll(rs => rs.map(r => [...r.querySelectorAll('.pill')].map(p => p.textContent.trim())))).map(ps => ps.map(p => BEST.indexOf(p)).reduce((a, b) => Math.min(a, b), 9));
    ok(!rowBest.includes(BEST.indexOf('過不了')), '過不了 hidden by default');
    const TI = ['穩過', '應該過', '邊緣', '機會低', '過不了', '看不出'];
    ok(rowBest.every((b, i) => i === 0 || TI.indexOf(BEST[rowBest[i - 1]]) <= TI.indexOf(BEST[b])), 'sorted by the better path');

    // 第二階段 filters: one 學測-share choice at a time, plus 甄試 chips whose counts match the list they produce
    const spOf = await page.evaluate(() => Object.fromEntries(window.__app.D.depts.map(d => [d.c, d.sp])));
    const listed = () => page.locator('#list .row[data-code]').evaluateAll(els => els.map(e => e.dataset.code));
    const ovCount = async () => Number((await page.locator('#overview h2 b').innerText()).replace(/,/g, ''));
    await page.click('#filterPanel [data-sat="light"]');
    let shown = await listed();
    ok(shown.length > 0 && shown.every(c => spOf[c] <= 20), `學測佔二階 20% 以下 keeps only those (${shown.length})`);
    ok((await page.locator('#activeFilters').innerText()).includes('學測佔二階 20% 以下'), 'the 學測-share choice shows as an active filter');
    await page.click('#filterPanel [data-sat="none"]');
    ok((await page.locator('#filterPanel [data-sat="light"]').getAttribute('aria-pressed')) === 'false', 'only one 學測-share choice at a time');
    shown = await listed();
    ok(shown.length > 0 && shown.every(c => spOf[c] === 0) && (await page.locator('#list .row .r-meta').first().innerText()).includes('不計學測'), '不計學測 rows say so');
    await page.click('#filterPanel [data-sat="none"]');
    ok((await page.evaluate(() => window.__app.st().f.sat)) === 'all', 'pressing the chosen share again clears it');
    for (const k of ['noVisit', 'noInterview']) {
      const n = Number(await page.locator(`#filterPanel [data-st2="${k}"] .n`).innerText());
      await page.click(`#filterPanel [data-st2="${k}"]`);
      ok(n > 0 && (await ovCount()) === n, `${k} chip count matches the result (${n})`);
    }
    await page.click('#filterPanel [data-st2="noVisit"]');
    await page.click('#filterPanel [data-st2="noInterview"]');
    ok((await page.evaluate(() => window.__app.st().f.st2.length)) === 0, '甄試 chips toggle off');

    // show 不符 and check NTU law is blocked by 數B 檢定
    await page.click('#overview [data-tier="不符"]');
    ok((await page.locator('#overview [data-tier="不符"]').getAttribute('aria-pressed')) === 'true', 'legend toggles a tier');
    await page.fill('#q', '臺灣大學 法律');
    await page.waitForTimeout(400);
    const why = await page.locator('#list .row').first().innerText();
    ok(why.includes('過不了') && why.includes('數學B'), 'NTU law blocked by 數B 檢定');
    // school names stuck to a 系, 台 for 臺, and 系 abbreviations
    for (const [q, want] of [['東吳法律', '東吳大學法律學系'], ['台大法律', '臺灣大學法律學系'], ['政大外交', '政治大學外交學系']]) {
      await page.fill('#q', q);
      await page.waitForTimeout(400);
      const first = await page.evaluate(() => { const r = document.querySelector('#list .row .r-title'); return r ? r.textContent : ''; });
      ok(first.includes(want), `search「${q}」finds ${want} first (${first})`);
    }
    await page.fill('#q', '');
    await page.waitForTimeout(400);

    // detail drawer
    await page.locator('#list .row .r-title').first().click();
    await page.waitForSelector('#detail[open]');
    const dtxt = await page.locator('#dBody').innerText();
    ok(dtxt.includes('第一階段') && dtxt.includes('第二階段'), 'detail shows both stages');
    ok(dtxt.includes('115'), 'detail labels the 115 reference year');
    const lead = (await page.locator('#dBody .s2lead').innerText()).replace(/\u00a0/g, ' ');
    ok(/學測佔二階總成績 [\d.]+%|二階總成績不計學測/.test(lead) && /約 [\d.]+ 取 1/.test(lead), 'detail sums up the 二階 total and people per seat: ' + lead.slice(0, 40));
    ok((await page.locator('#dBody .rg').count()) >= 3, '審查資料 grouped by type');
    await page.screenshot({ path: join(SHOTS, 'desktop-detail.png') });
    await page.click('#dClose');
    await page.waitForFunction(() => !document.querySelector('#detail').open);

    // build a plan of 6 with the first six results
    const codes = await page.locator('#list .row[data-code]').evaluateAll(els => els.slice(0, 7).map(e => e.dataset.code));
    for (const c of codes.slice(0, 6)) {
      await page.locator(`#list .row[data-code="${c}"] .r-title`).click();
      await page.click(`#dFoot [data-plan="${c}"]`);
      await page.click('#dClose');
    }
    await page.locator(`#list .row[data-code="${codes[6]}"] .r-title`).click();
    await page.click(`#dFoot [data-plan="${codes[6]}"]`);
    ok((await page.locator('#toast').innerText()).includes('6 個'), 'seventh choice is refused');
    await page.click('#dClose');
    ok((await page.locator('#tabs [data-plancount]').innerText()) === '6/6', 'plan counter 6/6');

    await page.click('#tabs [data-tab="plan"]');
    ok((await page.locator('#planList li[data-code]').count()) === 6, 'plan tab lists 6');
    ok((await page.locator('#plan .cal > li').count()) > 3, 'plan calendar rendered');
    ok((await page.locator('#plan .check').count()) > 2, 'plan checks rendered');
    ok((await page.locator('#prep .cbars li').count()) === 6, '二階準備 shows a score-mix bar per 志願');
    // each matrix row's count matches its dots, and the P row agrees with the 系' own 審查資料 lists
    const mx = await page.evaluate(() => {
      const D = window.__app.D;
      const by = Object.fromEntries(D.depts.map(d => [d.c, d]));
      const rows = [...document.querySelectorAll('#prep .rmx tbody tr:not(.gh)')];
      const pRow = rows.find(r => r.querySelector('.cd') && r.querySelector('.cd').textContent === 'P');
      const wantP = window.__app.st().plan.filter(c => /學習歷程自述\([^)]*P/.test(by[c].rv || '')).length;
      return { rows: rows.length, consistent: rows.every(r => +r.querySelector('.cnt').textContent === r.querySelectorAll('.dot').length), p: pRow ? +pRow.querySelector('.cnt').textContent : -1, wantP };
    });
    ok(mx.rows > 5 && mx.consistent, `審查資料 matrix counts match its dots (${mx.rows} rows)`);
    ok(mx.p === mx.wantP, `P 就讀動機 row matches the 系 lists (${mx.p} of 6)`);
    const first = await page.locator('#planList li[data-code]').first().getAttribute('data-code');
    await page.click(`#planList [data-down="${first}"]`);
    ok((await page.locator('#planList li[data-code]').nth(1).getAttribute('data-code')) === first, 'move down works');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="csvPlan"]')]);
    ok(dl.suggestedFilename().endsWith('.csv'), 'CSV downloads');
    await page.screenshot({ path: join(SHOTS, 'desktop-plan.png'), fullPage: true });

    // persistence
    await page.reload();
    await page.waitForSelector('#planList li[data-code]');
    ok((await page.locator('#tabs [data-plancount]').innerText()) === '6/6', 'plan survives reload (and the page reopens on the plan tab)');
    // 完整報告: one text with scores, 落點, each 志願's stages and what is missing, ready for an AI
    await page.click('#plan [data-act="reportOpen"]');
    await page.waitForSelector('#report .rp-text');
    const rep = await page.inputValue('#report .rp-text');
    ok(rep.includes('## 給 AI 的說明') && rep.includes('## 成績') && rep.includes('## 我的志願') && (rep.match(/^### [1-6]\. /gm) || []).length === 6 && rep.includes('115 最低'), `完整報告 has the AI prompt, scores and all 6 志願 with their 115 cuts (${rep.length} 字)`);
    await page.click('#report [data-rep="ai"]');
    await page.waitForFunction(() => !document.querySelector('#report .rp-text').value.includes('給 AI 的說明'));
    ok(true, 'the AI prompt can be left out');
    await page.click('#report [data-act="repClose"]');
    // 我的學習歷程: tick what you have, each 志願 says what is still missing
    await page.click('#haveSec [data-have="O"]');
    await page.waitForFunction(() => window.__app.st().have.includes('O'));
    ok((await page.locator('#haveSec .hv-list li').count()) === 6 && /還要寫|還沒有東西可以放|都已經有可以放的/.test(await page.locator('#haveSec').innerText()), '學習歷程 checklist lists the 6 志願 and what is missing');
    ok(/有了/.test(await page.locator('#prep').innerText()), 'the 審查資料 matrix marks what you have');
    await page.click('#tabs [data-tab="explore"]');
    await page.waitForSelector('.row');
    ok((await scores(page)).英 === '15' && /英\s*15/.test(await page.locator('#ctxExplore').innerText()), 'scores survive reload');

    // boost tab: the same filters as 找校系 (法政 is still on there)
    ok((await page.evaluate(() => window.__app.st().f.groups)).includes('法政'), '找校系 still filtered to 法政');
    await page.click('#tabs [data-tab="boost"]');
    await page.waitForSelector('#boost .gains');
    const btxt = await page.locator('#boost').innerText();
    ok(btxt.includes('擋住') && btxt.includes('數學B'), 'boost tab names the 數B blocker');
    const nOf = async () => Number((/共 ([\d,]+) 個/.exec(await page.locator('#boost .scopebar').innerText()) || [])[1].replace(/,/g, ''));
    const nLaw = await nOf();
    const nLawExplore = await page.evaluate(() => { const a = window.__app; return a.D.depts.filter(d => d.g.includes('法政')).length; });
    ok(nLaw > 0 && nLaw <= nLawExplore && (await page.locator('#boost .scopebar').innerText()).includes('法政'), `怎麼進步 uses 找校系's 法政 filter (${nLaw})`);
    await page.click('#boost .scopebar [data-act="resetFilters"]');
    await page.waitForSelector('#boost .gains');
    const nAll = await nOf();
    ok(nAll > 1000 && !(await page.evaluate(() => window.__app.st().f.groups.length)), `clearing it there clears it everywhere (${nAll})`);
    // each bar is a button: picking one shows what reaching that 級分 does
    const card = page.locator('#boost .gi').first();
    const bar = card.locator('button.gb').first();
    const to = (await bar.getAttribute('data-gsel')).split(':')[1];
    await bar.click();
    ok((await bar.getAttribute('aria-pressed')) === 'true' && (await card.locator('.gi-at').innerText()).includes(`考到 ${to} 級分`), `tapping a bar shows that 級分 (${to})`);
    await page.click('#boost [data-list="plan"]');
    await page.waitForSelector('#boost .gains');
    const nPlan = await nOf();
    ok(nPlan > 0 && nPlan <= 6 && (await page.evaluate(() => window.__app.st().f.list)) === 'plan', `怎麼進步 can be narrowed to the 志願 (${nPlan})`);
    await page.click('#boost [data-list="all"]');
    await page.waitForSelector('#boost .gains');
    // the filter sheet opens from here and filters 找校系 too
    await page.click('#boost .scopebar [data-act="openFilters"]');
    await page.waitForSelector('#sheet[open] #sheetBody [data-group="資訊"]');
    await page.click('#sheetBody [data-group="資訊"]');
    await page.waitForFunction(() => document.querySelector('#sheetBody [data-group="資訊"]').getAttribute('aria-pressed') === 'true');
    await page.click('#sheetDone');
    await page.waitForSelector('#boost .gains');
    const nInfo = await nOf();
    ok(nInfo > 0 && nInfo < nAll && (await page.evaluate(() => window.__app.st().f.groups)).join() === '資訊', `a 學群 picked from 怎麼進步 is 找校系's filter too (資訊 ${nInfo})`);
    ok(await page.evaluate(() => document.querySelector('#rail #filterPanel') != null), 'filter panel goes back to 找校系 after the sheet closes');
    await page.click('#boost .scopebar [data-act="resetFilters"]');
    await page.waitForSelector('#boost .gains');
    await setSlider(page, '#boost [data-try="數B"]', 6);
    await page.waitForTimeout(300);
    ok((await page.locator('#tryOut').innerText()).includes('→'), 'what-if lists improved departments');
    ok((await scores(page)).數B === '1', 'what-if does not change the saved scores');
    // subjects you have not taken stay out of 怎麼進步 unless you ask for them
    const trySubs = () => page.evaluate(() => [...document.querySelectorAll('#trySec [data-try]')].map(t => t.dataset.try));
    ok(!(await trySubs()).includes('數A') && !(await trySubs()).includes('自'), 'untaken subjects hidden in 怎麼進步 by default');
    await page.check('#boostAll');
    await page.waitForFunction(() => [...document.querySelectorAll('#trySec [data-try]')].some(t => t.dataset.try === '自'));
    ok(true, '「也看沒考的科目」 shows them');
    await page.uncheck('#boostAll');
    await page.screenshot({ path: join(SHOTS, 'desktop-boost.png'), fullPage: true });

    // 模考: pick 翰林第二次 (its 五標 come built in), type scores, see the 標, save, analysis appears
    await page.click('#tabs [data-tab="scores"]');
    await page.click('#scores [data-act="mfNew"]');
    await page.waitForSelector('#mockForm');
    await page.selectOption('#mfPreset', '第三次學測模擬考');
    await page.fill('[data-mf="社"]', '12');
    ok((await page.textContent('[data-mflv="社"]')).startsWith('前標'), '翰林 10月北北基 五標 built in (社會 12 = 前標, corrected table)');
    await page.fill('[data-mf="社"]', '');
    await page.selectOption('#mfPreset', '第二次學測模擬考');
    await page.fill('[data-mf="國"]', '13');
    await page.fill('[data-mf="英"]', '9');
    ok((await page.textContent('[data-mflv="國"]')).startsWith('前標') && (await page.textContent('[data-mflv="英"]')).startsWith('均標'), 'typed 模考 scores show 翰林第二次 標 (國 13 前標, 英 9 均標)');
    ok((await page.textContent('[data-mflv="國"]')).includes('學測約 12'), 'the form shows the 學測 級分 at the same rank (國 13 = 前標 → 115 前標 12)');
    await page.click('[data-act="mfSave"]');
    await page.waitForSelector('#srcSec');
    const saved = await page.evaluate(() => window.__app.st().mocks);
    ok(saved.length === 1 && saved[0].std && saved[0].std.國.均標 === 12 && saved[0].s.國 === '13', '模考 saved with its own 五標');
    ok((await page.evaluate(() => window.__app.st().src)) === saved[0].id, 'a saved 模考 becomes the scores in use');
    ok((await page.locator('#srcSec').innerText()).includes('再 1 到頂標'), 'the 模考 view says how far the next 標 is');
    ok(/^12\b/.test((await page.locator('#srcSec .mvt tbody tr').first().locator('td').nth(2).innerText()).trim()), '模考 view reads 國 13 (前標) as 學測 12');
    ok((await scores(page)).國 === '12', 'using a 模考 does not overwrite the typed 學測 級分');
    // 興趣測驗: 48 activities, one at a time; the code orders the 學群
    await page.click('#strengthSec [data-act="quizOpen"]');
    await page.waitForSelector('#quiz[open] .qz-item');
    const like = { R: 1, I: 2, A: 5, S: 4, E: 3, C: 1 };
    for (let i = 0; i < 48; i++) { await page.click(`#quiz [data-qans="${like['RIASEC'[i % 6]]}"]`); await page.waitForTimeout(320); }
    await page.waitForSelector('#quiz .qz-big');
    ok((await page.locator('#quiz .qz-big').innerText()).replace(/\s+/g, '').startsWith('A藝術型S社會型E企業型'), '興趣測驗 scores the 48 answers into a code (ASE)');
    await page.click('[data-act="quizApply"]');
    ok((await page.evaluate(() => window.__app.st().hol.join(''))) === 'ASE' && !(await page.locator('#quiz').evaluate(d => d.open)), 'the code is applied to the 學群 ordering');
    // 還不確定讀什麼: a 學群 opens 找校系 on its 穩過＋應該過, most sought-after first
    await page.waitForSelector('#strengthSec .gx');
    const g0 = await page.locator('#strengthSec .gx').first().getAttribute('data-gx');
    await page.locator('#strengthSec .gx').first().click();
    await page.waitForSelector('#view-explore:not([hidden]) .row');
    const fx = await page.evaluate(() => window.__app.st().f);
    ok(fx.groups.join() === g0 && fx.sort === 'select' && fx.tiers.join() === '穩,適中', `學群 explorer opens 找校系 on ${g0}: ${'穩過＋應該過'}, 最搶手 first`);
    await page.selectOption('#sort', 'selectLow');
    ok((await page.locator('#listbar').innerText()).includes('門檻低'), 'sort: 去年門檻低 → 高 says what it means');
    await page.evaluate(() => { const st = window.__app.st(); st.f = { ...st.f, groups: [], tiers: ['穩', '適中', '衝', '難', '無資料'], sort: 'chance' }; window.__app.render(); });
    // 分科 lives with 學測 in 我的成績; 落點分布 shows both paths; 找校系 lists both
    await page.click('#tabs [data-tab="scores"]');
    await page.waitForSelector('#astSec');
    // this 模考 has only 國、英: no 分科 can be estimated, so the 分發 lane asks for them
    ok((await page.locator('.result-card').innerText()).includes('還沒選要考的分科'), 'without 分科 the 分發 lane says what to do');
    const typeAst = async (k, v) => { if (!(await page.locator(`[data-astv="${k}"]`).count())) await page.click(`[data-astmode="${k}:n"]`); await page.fill(`[data-astv="${k}"]`, v); await page.locator(`[data-astv="${k}"]`).blur(); await page.waitForTimeout(150); };
    await typeAst('歷', '45');
    await typeAst('地', '45');
    ok((await page.locator('.result-card .rc-lane').count()) === 2 && (await page.locator('.result-card .pc-verdict').count()) === 1, '落點分布 compares 申請 and 分發 with a verdict');
    await page.click('#pathWhy summary');
    await page.waitForSelector('#pathWhy .pw-t tbody tr');
    ok((await page.locator('#pathWhy .pw-t tbody tr').count()) >= 2 && /申請：擋住/.test(await page.locator('#pathWhy').innerText()), '為什麼兩條路不一樣: blockers and ±1 級分 per subject for both paths');
    const ntu = await page.evaluate(() => window.__app.evaluateUac('0001'));
    ok(ntu && ntu.cut === 265.5 && ntu.total > 0, `臺大中文 judged against its 115 最低錄取 265.5 (you ${ntu && ntu.total})`);
    await typeAst('歷', '60');
    const after = await page.evaluate(() => window.__app.evaluateUac('0001').total);
    ok((await page.evaluate(() => window.__app.st().ast.歷)) === '60' && Math.abs(after - ntu.total - 15 * 1.25) < 1e-6, `typing 歷史 60 adds 15 × 1.25 to 臺大中文 (${ntu.total} → ${after})`);
    await page.click('#tabs [data-tab="explore"]');
    await page.waitForSelector('#list .row');
    ok((await page.locator('#list .r-uac').count()) > 0, '找校系 rows show the same 系 in 分發');
    await page.click('#overview [data-path="uac"]');
    await page.waitForSelector('#list .urow');
    ok((await page.locator('#list .row:not(.urow)').count()) === 0 && /分發系組/.test(await page.locator('#overview').innerText()), '只看分發 lists 分發 系組 only');
    await page.click('#tabs [data-tab="scores"]');
    ok((await page.locator('.result-card .rc-lane').count()) === 1 && /分發入學/.test(await page.locator('.result-card').innerText()), '只看分發 is shared: 我的成績 shows only the 分發 lane');
    await page.click('.result-card [data-path="both"]');
    await page.waitForSelector('.result-card .pc-verdict');
    await page.click('[data-astmode="歷:"]');
    ok((await page.evaluate(() => window.__app.evaluateUac('0001').tier)) === '不符', 'not taking 歷史 → 臺大中文 (uses 歷史) is 過不了');
    await page.click('[data-act="astReset"]');
    // with a 模考 in use, 試算 is on that 模考's own 級分 and 五標: unchanged, it gives exactly the current 落點
    await page.click('#tabs [data-tab="boost"]');
    await page.waitForSelector('#tryOut table');
    const rowsTry = await page.locator('#tryOut table tbody tr').allInnerTexts();
    ok(rowsTry.length === 2 && rowsTry[0].replace('現在', '') === rowsTry[1].replace('試算', ''), '試算 on the 模考 scale starts equal to the current 落點');
    ok(/這次/.test(await page.locator('#trySec .srow-v').first().innerText()), '試算 sliders show the 模考\'s own 標');
    await page.click('#tabs [data-tab="scores"]');
    await page.click('#tabs [data-tab="scores"]');

    // 看落點 with a 模考 judges 檢定 on that 模考's own 五標: 翰林第三次 英文均標 is 6 (115 學測 均標 is 8)
    await page.click('#scores [data-act="mfNew"]');
    await page.selectOption('#mfPreset', '第三次學測模擬考');
    for (const [k, v] of [['國', '12'], ['英', '6'], ['數B', '6'], ['社', '11'], ['自', '9']]) await page.fill(`[data-mf="${k}"]`, v);
    await page.click('[data-act="mfSave"]');
    await page.waitForSelector('#srcSec');
    const e3 = await page.evaluate(() => window.__app.evaluate('007022'));
    const it = e3.th.items.find(i => i.k === '英');
    ok(it && it.need === 6 && it.mine === 6 && it.ok, `檢定 uses the 模考's 五標 (英文均標 ${it && it.need}, 模考 ${it && it.mine})`);
    await page.goto(URL_ + '#d=007022');
    await page.waitForSelector('#detail[open]');
    const dd = await page.locator('#dBody').innerText();
    ok(dd.includes('翰林第三次') && /英文 均標\s*6 級分以上/.test(dd), 'the detail shows the 模考 and its 五標 in 檢定');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#detail').open);
    // switch back from the bar on 找校系
    await page.click('#tabs [data-tab="explore"]');
    await page.selectOption('#ctxExplore [data-srcsel]', 'test');
    ok((await page.evaluate(() => window.__app.st().src)) === 'test' && (await page.evaluate(() => window.__app.evaluate('007022').th.items.find(i => i.k === '英').need)) === 8, 'the 落點依據 switch goes back to 學測級分 and 115 五標');
    await page.click('#tabs [data-tab="scores"]');
    const ids = (await page.evaluate(() => window.__app.st().mocks)).map(m => m.id);
    for (const id of ids) {
      await page.click(`.srccard[data-src="${id}"]`);
      page.once('dialog', d => d.accept());
      await page.click(`[data-mockdel="${id}"]`);
    }
    ok((await page.evaluate(() => window.__app.st().mocks.length)) === 0 && (await page.evaluate(() => window.__app.st().src)) === 'test', '模考 can be deleted (the source falls back to 學測級分)');

    // guide
    await page.click('#tabs [data-tab="guide"]');
    ok((await page.locator('#guide').innerText()).includes('登記就讀志願序'), 'guide renders');

    // deep link
    await page.goto(URL_ + '#d=001012');
    await page.waitForSelector('#detail[open]');
    ok((await page.locator('#dTitle').innerText()) === '中國文學系', 'deep link opens a department');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#detail').open);
    // the dialog's close event is async, so give it a moment to tidy the URL
    const cleared = await page.waitForFunction(() => !/#d=/.test(location.hash), null, { timeout: 3000 }).then(() => true, () => false);
    ok(cleared, 'closing the drawer clears the link');

    ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    ok(external.length === 0, 'no network requests' + (external.length ? ': ' + external.join(', ') : ''));
    await ctx.close();
  }

  console.log('phone flow');
  {
    const { ctx, page, errors } = await newPage(browser, { ...devices['iPhone 13'] });
    await page.goto(URL_);
    await page.waitForSelector('.row');
    ok(await page.locator('#bottomnav').isVisible(), 'bottom tab bar on phone');
    await page.click('#bottomnav [data-tab="scores"]');
    await setScores(page, { 國: 12, 英: 15, 社: 13 }, true);
    const s = await scores(page);
    ok(s.國 === '12' && s.英 === '15' && s.社 === '13', 'taps set the scores: ' + JSON.stringify(s));
    await page.click('#bottomnav [data-tab="explore"]');
    await page.waitForSelector('#ctxExplore .ctxbar');
    await page.screenshot({ path: join(SHOTS, 'phone-list.png') });

    // filters live in a bottom sheet
    await page.click('#openFilters');
    await page.waitForSelector('#sheet[open]');
    await page.click('#sheetBody [data-group="法政"]');
    ok(/看 [\d,]+ 個結果/.test(await page.locator('#sheetDone').innerText()), 'sheet button shows the result count');
    await page.click('#sheetDone');
    await page.waitForFunction(() => !document.querySelector('#sheet').open);
    ok((await page.locator('#overview').innerText()).includes('法政'), 'filter from the sheet applies');
    // the panel moves back on the dialog's async close event
    const back = await page.waitForFunction(() => document.querySelector('#filterPanel').parentElement.id === 'rail', null, { timeout: 3000 }).then(() => true, () => false);
    ok(back, 'filter panel returns to the page');

    await page.locator('#list .row .r-title').first().click();
    await page.waitForSelector('#detail[open]');
    const box = await page.locator('#detail').boundingBox();
    ok(box.width <= 400, 'detail is full-screen on phone');
    await page.screenshot({ path: join(SHOTS, 'phone-detail.png') });
    await page.click('#dClose');
    await page.waitForFunction(() => !document.querySelector('#detail').open);

    // a full plan, so the 二階準備 matrix is on the page for the overflow check
    await page.evaluate(() => { const D = window.__app.D; window.__app.st().plan = D.depts.filter(d => d.g.includes('法政')).slice(0, 6).map(d => d.c); window.__app.render(); });
    for (const tab of ['scores', 'explore', 'plan', 'boost', 'guide']) {
      await page.click(`#bottomnav [data-tab="${tab}"]`);
      if (tab === 'plan') ok((await page.locator('#prep .rmx').count()) === 1, '二階準備 matrix on phone');
      if (tab === 'boost') await page.waitForSelector('#boost .gains');
      await page.waitForTimeout(100);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(sw <= 0, `no horizontal scroll on phone: ${tab} (overflow ${sw})`);
      const bad = await page.evaluate(layoutIssues);
      ok(!bad.length, `no wrapped labels or orphaned characters on phone: ${tab}` + (bad.length ? ' — ' + bad.slice(0, 4).join(' | ') : ''));
    }
    ok(errors.length === 0, 'no console errors on phone' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  console.log('dark mode');
  {
    const { ctx, page } = await newPage(browser, { colorScheme: 'dark', viewport: { width: 1200, height: 800 } });
    await page.goto(URL_);
    await page.waitForSelector('.row');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok(bg === 'rgb(14, 17, 22)', 'dark background ' + bg);
    await page.click('#themeBtn');
    const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok(bg2 !== bg, 'theme button switches to light ' + bg2);
    await page.screenshot({ path: join(SHOTS, 'dark.png') });
    await ctx.close();
  }

  console.log('saved filters from the previous version');
  {
    const { ctx, page, errors } = await newPage(browser);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('apply116-v1', JSON.stringify({ v: 1, scores: { 國: '12' }, f: { st2: ['satHeavy', 'noInterview'] }, fav: [], plan: [] })); } });
    await page.goto(URL_);
    await page.waitForSelector('.row');
    const f = await page.evaluate(() => window.__app.st().f);
    ok(f.sat === 'heavy' && JSON.stringify(f.st2) === '["noInterview"]', 'old「學測佔 50% 以上」chip becomes the 50% 以上 choice: ' + JSON.stringify({ sat: f.sat, st2: f.st2 }));
    ok((await page.locator('#filterPanel [data-sat="heavy"]').getAttribute('aria-pressed')) === 'true', 'and shows as chosen');
    ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  console.log('換裝置: link and code');
  {
    const A = await newPage(browser, devices['iPhone 13']);
    await A.page.goto(URL_);
    await A.page.waitForSelector('.row');
    await A.page.evaluate(() => { const st = window.__app.st(); st.scores.國 = '12'; st.plan = window.__app.D.depts.slice(0, 3).map(d => d.c); st.have = ['O']; window.__app.render(); });
    await A.page.click('#bottomnav [data-tab="plan"]');
    await A.page.click('[data-act="moveOpen"]');
    await A.page.waitForSelector('#mvCode');
    const code = await A.page.inputValue('#mvCode');
    ok(/^[zj][A-Za-z0-9_-]+$/.test(code) && code.length < 2000, `transfer code is short and URL-safe (${code.length})`);
    const B = await newPage(browser, devices['iPhone 13']);
    await B.page.goto(URL_ + '#import=' + code);
    await B.page.waitForSelector('[data-act="moveApply"]');
    ok(/3 個志願/.test(await B.page.locator('#mvBody').innerText()), 'opening the link says what will come in, before replacing anything');
    await B.page.click('[data-act="moveApply"]');
    const got = await B.page.evaluate(() => ({ p: window.__app.st().plan.length, g: window.__app.st().scores.國, h: window.__app.st().have.join(), hash: location.hash }));
    ok(got.p === 3 && got.g === '12' && got.h === 'O' && got.hash === '', 'the other device gets the 志願, scores and 學習歷程, and the link is cleared');
    // pasting the code works too
    await B.page.evaluate(() => { window.__app.st().plan = []; window.__app.render(); });
    await B.page.click('#bottomnav [data-tab="plan"]');
    await B.page.click('[data-act="moveOpen"]');
    await B.page.waitForSelector('#mvPaste');
    await B.page.fill('#mvPaste', code);
    await B.page.click('[data-act="movePaste"]');
    await B.page.click('[data-act="moveApply"]');
    ok((await B.page.evaluate(() => window.__app.st().plan.length)) === 3, 'a pasted code imports the same way');
    ok(A.errors.length === 0 && B.errors.length === 0, 'no console errors' + (A.errors.concat(B.errors).length ? ': ' + A.errors.concat(B.errors).join(' | ') : ''));
    await A.ctx.close(); await B.ctx.close();
  }

  console.log('考古題');
  {
    const { ctx, page, errors } = await newPage(browser, devices['iPhone 13']);
    await page.goto(URL_ + '#exam');
    await page.waitForSelector('#exam .xp-y');
    const papers = await page.locator('#exam .xp-y').count();
    ok(papers >= 50, `考古題 lists the 學測 and 分科 papers (${papers})`);
    // practice: choose, cross out, check
    await page.click('[data-xpaper="gsat-115-eng"]');
    await page.click('#xMode [data-xact="practice"]');
    await page.waitForSelector('#exam .xo-b');
    await page.click('#exam .xo-x[data-xx="A"]');
    ok(await page.locator('#exam .xo.crossed').count() === 1, 'an option can be crossed out');
    await page.click('#exam .xo-b[data-xa="B"]');
    await page.click('#exam [data-xact="check"]');
    ok(/答對/.test(await page.locator('#exam .xv').innerText()), '115 英文 1 is B: 對答案 says so');
    // 文意選填: a blank answered from the shared word bank, marked in the passage
    await page.click('#exam [data-xact="grid"]');
    await page.click('#exam [data-xgo="21"]');
    ok(await page.locator('#exam .xo-b').count() === 10 && await page.locator('#exam u.cur').count() === 1, '文意選填 22: 10 shared choices and the blank marked in the passage');
    await page.click('#exam [data-xact="home"]');
    // 選填: the keypad fills the cells
    await page.click('[data-xpaper="gsat-115-ma"]');
    await page.click('#xMode [data-xact="practice"]');
    await page.waitForSelector('#exam .xo-b, #exam .xc');
    await page.click('#exam [data-xact="grid"]');
    await page.click('#exam [data-xgo="12"]');
    await page.waitForSelector('#exam .xc');
    for (const k of ['9', '1', '0']) await page.click(`#exam [data-xkey="${k}"]`);
    await page.click('#exam [data-xact="check"]');
    ok(/答對/.test(await page.locator('#exam .xv').innerText()), '115 數學A 13 (選填 9、1、0) is graded right');
    ok(await page.locator('#exam math').count() > 0, 'formulas are MathML');
    await page.click('#exam [data-xact="home"]');
    // 模擬考 with 非選擇題: the AI prompt has the question, the 評分原則 and the answer
    await page.check('#xOpen');
    await page.click('[data-xpaper="gsat-115-eng"]');
    await page.click('#xMode [data-xact="full"]');
    await page.waitForSelector('#xTime');
    ok(/^(100|99):/.test(await page.locator('#xTime').innerText()), 'a mock exam counts down from the official 100 minutes');
    await page.click('#exam [data-xact="grid"]');
    const last = await page.locator('#exam .xgrid button').count();
    await page.click(`#exam [data-xgo="${last - 1}"]`);
    await page.waitForSelector('#xText');
    await page.fill('#xText', 'My essay.');
    await page.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; });
    await page.click('#exam [data-xact="ai"]');
    const prompt = await page.evaluate(() => window.__copied || '');
    ok(prompt.includes('評分原則') && prompt.includes('My essay.') && prompt.includes('得分'), '非選擇題: the copied AI prompt has the rubric and the answer');
    await page.fill('#xAi', '12');
    page.once('dialog', d => d.accept());
    await page.click('#exam [data-xact="submit"]');
    await page.waitForSelector('#exam .xres-big');
    ok(/／/.test(await page.locator('#exam .xres-big').innerText()) && await page.locator('#exam .xrt tbody tr').count() > 40, '交卷 shows the score and every question');
    ok((await page.evaluate(() => window.__app.st().ex.wrong.length)) > 0, 'wrong answers go to the 錯題本');
    ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  console.log('storage blocked');
  {
    const { ctx, page, errors } = await newPage(browser);
    await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await page.goto(URL_);
    await page.waitForSelector('.row');
    await page.click('#tabs [data-tab="scores"]');
    await setScores(page, { 國: 10 });
    ok((await scores(page)).國 === '10' && errors.length === 0, 'works when localStorage throws');
    await ctx.close();
  }

  console.log('模考 saved by an older version');
  {
    const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1280, height: 900 } });
    await page.goto(URL_);
    await page.waitForSelector('.row');
    await page.waitForTimeout(400); // let the app's own debounced save finish before writing old-format data
    await page.evaluate(() => {
      const st = JSON.parse(JSON.stringify(window.__app.st()));
      delete st.mockV;
      const lv = a => ({ 頂標: a[0], 前標: a[1], 均標: a[2], 後標: a[3], 底標: a[4] });
      // the old version prefilled a copy of the 115 學測 五標
      const T = { 國: lv([13, 12, 10, 9, 7]), 英: lv([13, 11, 8, 5, 3]), 數A: lv([12, 10, 8, 5, 4]), 數B: lv([11, 9, 5, 3, 2]), 社: lv([13, 12, 10, 8, 7]), 自: lv([13, 12, 9, 7, 5]) };
      const sc = { 國: '12', 英: '10', 數A: '', 數B: '8', 社: '13', 自: '', 聽: '' };
      const own = JSON.parse(JSON.stringify(T)); own.國 = lv([14, 13, 11, 9, 8]);
      st.mocks = [
        { id: 'a', n: '第二次學測模擬考', d: '2026-09-02', s: sc, std: null },
        { id: 'b', n: '第三次學測模擬考', d: '2026-10-28', s: sc, std: own },
        { id: 'c', n: '三模', d: '2026-10-28', s: sc, std: T },
        { id: 'd', n: '中區三模', d: '2026-10-28', s: sc, std: null },
      ];
      localStorage.setItem('apply116-v1', JSON.stringify(st));
    });
    await page.reload();
    await page.waitForSelector('.row');
    const ms = await page.evaluate(() => Object.fromEntries(window.__app.st().mocks.map(m => [m.id, m.std])));
    ok(ms.a && ms.a.國.均標 === 12, 'old 模考 without 五標 gets 翰林 9月北北基 五標');
    ok(ms.b.國.頂標 === 14 && ms.b.英.前標 === 9, 'a typed 五標 row is kept; copied 學測 rows become 翰林 10月北北基');
    ok(ms.c && ms.c.國.均標 === 11, '「三模」 is matched to 翰林 10月北北基');
    ok(ms.d === null, 'another exam (中區) never gets 翰林 五標');
    await page.goto(URL_ + '#mock');
    await page.waitForSelector('#trendSec');
    ok((await page.locator('.srccard[data-src]').count()) === 5 && (await page.locator('#trendSec').innerText()).includes('模考進退步'), 'upgraded 模考 render with analysis (old #mock link opens 我的成績)');
    // 沒考 on 學測級分 hides that subject in every 模考 too (第一、二次 數A、數B are one paper; many fill both)
    await page.evaluate(() => { const st = window.__app.st(); st.scores = { ...st.scores, 國: '12', 英: '10', 數A: '', 數B: '8', 社: '13', 自: '' }; st.mocks[0].s.數A = '7'; window.__app.render(); });
    ok(!(await page.locator('#scores .srccards').innerText()).includes('數A') && !(await page.locator('#trendSec').innerText()).includes('數學A'), 'a subject set to 沒考 is not listed for 模考 either');
    // saved after the 9月/10月 upgrade but before 7月全國 had every subject: only 數學 there, plus one typed row
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const st = JSON.parse(JSON.stringify(window.__app.st()));
      st.mockV = 2;
      const lv = a => ({ 頂標: a[0], 前標: a[1], 均標: a[2], 後標: a[3], 底標: a[4] });
      st.mocks = [
        { id: 'e', n: '第一次學測模擬考', d: '2026-07-29', s: { 國: '10', 英: '11', 數A: '', 數B: '7', 社: '12', 自: '', 聽: '' }, std: { 數A: lv([13, 11, 7, 4, 3]), 數B: lv([13, 11, 7, 4, 3]), 自: lv([15, 14, 13, 12, 11]) } },
        { id: 'f', n: '中區一模', d: '2026-07-29', s: { 國: '10', 英: '11', 數A: '', 數B: '7', 社: '12', 自: '', 聽: '' }, std: { 社: lv([13, 12, 10, 8, 7]) } },
      ];
      localStorage.setItem('apply116-v1', JSON.stringify(st));
    });
    await page.reload();
    await page.waitForSelector('.srccard[data-src="e"]');
    const m3 = await page.evaluate(() => Object.fromEntries(window.__app.st().mocks.map(m => [m.id, m.std])));
    ok(m3.e.國.均標 === 11 && m3.e.英.均標 === 7 && m3.e.社.均標 === 10 && m3.e.自.頂標 === 15, 'saved 第一次 gets 翰林 7月全國 國英社, keeps a typed 自然 row');
    ok(JSON.stringify(Object.keys(m3.f)) === '["社"]', 'another exam is not filled from 翰林');
    await page.click('[data-act="mfNew"]');
    await page.selectOption('#mfPreset', '第三次學測模擬考');
    ok(!(await page.locator('[data-mf="聽"]').count()), '第三次 form has no 英聽 (not tested)');
    await page.selectOption('#mfPreset', '第二次學測模擬考');
    ok((await page.locator('[data-mf="聽"]').count()) === 1, '第二次 form has 英聽');
    ok(errors.length === 0, 'no console errors after the upgrade');
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall browser checks passed');
process.exit(failures ? 1 : 0);
