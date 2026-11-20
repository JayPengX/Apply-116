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
const TIER_ORDER = ['穩', '適中', '衝', '難', '不符', '無資料'];

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
// Scores are entered on 15-cell sliders: click (or tap) the cell for the wanted 級分.
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
    ok(await page.locator('#overview .cta').isVisible(), 'asks for scores first');
    ok(/另有 \d+ 個特殊組別/.test(await page.locator('#overview').innerText()), 'says how many special groups are left out');

    // the editor must stay open while the first scores go in (regression: it collapsed after the first click)
    await setScores(page, { 國: 12 });
    ok(await page.locator('#scorePanel.editing [data-listen]').count() > 0, 'score editor stays open after the first score');
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
    await page.click('[data-act="doneScores"]');
    ok((await page.locator('#scorePanel .tile').count()) === 8, 'done collapses the editor to score tiles');

    await page.click('#filterPanel [data-group="法政"]');
    const ov = await page.locator('#overview').innerText();
    ok(ov.includes('法政') && /穩\s*\d+/.test(ov) && /適中\s*\d+/.test(ov), 'overview shows the scope and tier counts');
    const pills = await page.locator('#list .row .pill').allInnerTexts();
    ok(pills.length > 10 && !pills.includes('不符'), '不符 hidden by default');
    ok(pills.every((b, i) => i === 0 || TIER_ORDER.indexOf(pills[i - 1]) <= TIER_ORDER.indexOf(b)), 'sorted by tier');

    // 第二階段 filters: one 學測-share choice at a time, plus 甄試 chips whose counts match the list they produce
    const spOf = await page.evaluate(() => Object.fromEntries(JSON.parse(document.getElementById('app-data').textContent).depts.map(d => [d.c, d.sp])));
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
    ok(why.includes('不符') && why.includes('數學B'), 'NTU law blocked by 數B 檢定');
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
      const D = JSON.parse(document.getElementById('app-data').textContent);
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
    await page.click('#tabs [data-tab="explore"]');
    await page.waitForSelector('.row');
    ok((await page.locator('#scorePanel [data-focus="英"] .v').innerText()) === '15', 'scores survive reload');

    // boost tab
    await page.click('#tabs [data-tab="boost"]');
    await page.waitForSelector('#boost .heat');
    const btxt = await page.locator('#boost').innerText();
    ok(btxt.includes('擋住') && btxt.includes('數學B'), 'boost tab names the 數B blocker');
    await setSlider(page, '#boost [data-try="數B"]', 6);
    await page.waitForTimeout(300);
    ok((await page.locator('#tryOut').innerText()).includes('→'), 'what-if lists improved departments');
    ok((await scores(page)).數B === '1', 'what-if does not change the saved scores');
    await page.screenshot({ path: join(SHOTS, 'desktop-boost.png'), fullPage: true });

    // 模考: pick 翰林第二次 (its 五標 come built in), type scores, see the 標, save, analysis appears
    await page.click('#tabs [data-tab="mock"]');
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
    await page.waitForSelector('.mcard');
    const saved = await page.evaluate(() => window.__app.st().mocks);
    ok(saved.length === 1 && saved[0].std && saved[0].std.國.均標 === 12 && saved[0].s.國 === '13', '模考 saved with its own 五標');
    ok((await page.locator('#trendSec').innerText()).includes('再 1 級分到這次的頂標'), 'analysis says how far the next 標 is');
    ok(/學測約\s*12/.test(await page.locator('.lt .eqv').first().innerText()), '模考 analysis reads 國 13 (前標) as 學測約 12');
    page.once("dialog", d => d.accept());
    await page.click(`[data-mockdel="${saved[0].id}"]`);
    ok((await page.evaluate(() => window.__app.st().mocks.length)) === 0, '模考 can be deleted');

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
    await setScores(page, { 國: 12, 英: 15, 社: 13 }, true);
    const s = await scores(page);
    ok(s.國 === '12' && s.英 === '15' && s.社 === '13', 'taps set the scores: ' + JSON.stringify(s));
    await page.click('[data-act="doneScores"]');
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
    await page.evaluate(() => { const D = JSON.parse(document.getElementById('app-data').textContent); window.__app.st().plan = D.depts.filter(d => d.g.includes('法政')).slice(0, 6).map(d => d.c); window.__app.render(); });
    for (const tab of ['explore', 'plan', 'boost', 'guide']) {
      await page.click(`#bottomnav [data-tab="${tab}"]`);
      if (tab === 'plan') ok((await page.locator('#prep .rmx').count()) === 1, '二階準備 matrix on phone');
      if (tab === 'boost') await page.waitForSelector('#boost .heat');
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(sw <= 0, `no horizontal scroll on phone: ${tab} (overflow ${sw})`);
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

  console.log('storage blocked');
  {
    const { ctx, page, errors } = await newPage(browser);
    await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await page.goto(URL_);
    await page.waitForSelector('.row');
    await setScores(page, { 國: 10 });
    ok((await scores(page)).國 === '10' && errors.length === 0, 'works when localStorage throws');
    await ctx.close();
  }

  console.log('模考 saved by an older version');
  {
    const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1280, height: 900 } });
    await page.goto(URL_);
    await page.waitForSelector('.row');
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
    await page.click('#tabs [data-tab="mock"]');
    await page.waitForSelector('#trendSec');
    ok((await page.locator('.mcard').count()) === 4 && (await page.locator('#trendSec').innerText()).includes('最近一次'), 'upgraded 模考 render with analysis');
    // saved after the 9月/10月 upgrade but before 7月全國 had every subject: only 數學 there, plus one typed row
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
    await page.waitForSelector('.mcard');
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
