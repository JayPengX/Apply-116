// Browser tests for the built single-file page. Run after `npm run build`: node tests/e2e/run.mjs
// Uses Playwright's Chromium. Every network request is blocked to prove the page works offline.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL_ = pathToFileURL(join(root, 'dist', 'index.html')).href;
const SHOTS = process.env.SHOTS || join(root, 'build', 'shots');
mkdirSync(SHOTS, { recursive: true });
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failures++; console.log('  ✗ ' + msg); } };

async function newPage(browser, ctxOpts = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...ctxOpts });
  const external = [];
  await ctx.route(/^https?:/, r => { external.push(r.request().url()); r.abort(); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, page, errors, external };
}
async function setScores(page, s) {
  for (const [k, v] of Object.entries(s)) await page.selectOption(`select[data-score="${k}"]`, String(v));
}

const browser = await chromium.launch();
try {
  console.log('desktop flow');
  {
    const { ctx, page, errors, external } = await newPage(browser, { viewport: { width: 1360, height: 900 } });
    const t0 = Date.now();
    await page.goto(URL_);
    await page.waitForSelector('.item');
    ok(Date.now() - t0 < 5000, `loads in ${Date.now() - t0} ms`);
    ok((await page.locator('#summary').innerText()).includes('2240') === false && (await page.locator('.item').count()) === 60, 'first page shows 60 departments before scores');
    ok(await page.locator('.banner').isVisible(), 'asks for scores first');

    await setScores(page, { 國: 12, 英: 15, 數B: 1, 社: 13, 聽: 'A' });
    await page.click('[data-group="法政"]');
    const summary = await page.locator('#summary').innerText();
    ok(/穩 \d+/.test(summary) && /適中 \d+/.test(summary), 'summary shows tier counts: ' + summary);
    const badges = await page.locator('.item .badge').allInnerTexts();
    ok(badges.length > 10 && !badges.includes('不符'), '不符 hidden by default');
    const order = ['穩', '適中', '衝', '難', '不符', '無資料'];
    ok(badges.every((b, i) => i === 0 || order.indexOf(badges[i - 1]) <= order.indexOf(b)), 'sorted by tier');

    // show 不符 and check NTU law is blocked by 數B 檢定
    await page.click('[data-tier="不符"]');
    await page.fill('#q', '臺灣大學 法律');
    await page.waitForTimeout(400);
    const why = await page.locator('.item').first().innerText();
    ok(why.includes('不符') && why.includes('數學B'), 'NTU law blocked by 數B 檢定');
    await page.fill('#q', '');
    await page.waitForTimeout(400);

    // detail dialog
    await page.locator('.item .i-main').first().click();
    await page.waitForSelector('#detail[open]');
    const dtxt = await page.locator('#dBody').innerText();
    ok(dtxt.includes('第一階段：檢定') && dtxt.includes('第二階段'), 'detail shows both stages');
    await page.screenshot({ path: join(SHOTS, 'desktop-detail.png') });
    await page.click('#dClose');

    // build a plan of 6 with the first six results
    const codes = await page.locator('.item').evaluateAll(els => els.slice(0, 7).map(e => e.dataset.code));
    for (const c of codes.slice(0, 6)) {
      await page.locator(`.item[data-code="${c}"] .i-main`).click();
      await page.click(`#dBody [data-plan="${c}"]`);
      await page.click('#dClose');
    }
    await page.locator(`.item[data-code="${codes[6]}"] .i-main`).click();
    await page.click(`#dBody [data-plan="${codes[6]}"]`);
    ok((await page.locator('#toast').innerText()).includes('6 個'), 'seventh choice is refused');
    await page.click('#dClose');
    ok((await page.locator('#planCount').innerText()) === '6/6', 'plan counter 6/6');

    await page.click('[data-tab="plan"]');
    ok((await page.locator('#planList li[data-code]').count()) === 6, 'plan tab lists 6');
    ok(await page.locator('#planAnalysis .timeline li').count() > 6, 'plan timeline rendered');
    // reorder
    const first = await page.locator('#planList li[data-code]').first().getAttribute('data-code');
    await page.click(`[data-down="${first}"]`);
    ok((await page.locator('#planList li[data-code]').nth(1).getAttribute('data-code')) === first, 'move down works');
    // CSV download
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csvPlan')]);
    ok(dl.suggestedFilename().endsWith('.csv'), 'CSV downloads');
    await page.screenshot({ path: join(SHOTS, 'desktop-plan.png'), fullPage: true });

    // persistence
    await page.reload();
    await page.waitForSelector('.item');
    ok((await page.locator('#planCount').innerText()) === '6/6', 'plan survives reload');
    ok((await page.inputValue('select[data-score="英"]')) === '15', 'scores survive reload');

    // boost tab
    await page.click('[data-tab="boost"]');
    await page.waitForSelector('.boost-table');
    const btxt = await page.locator('#boost').innerText();
    ok(btxt.includes('擋住') && btxt.includes('數學B'), 'boost tab names the 數B blocker');
    await page.selectOption('select[data-try="數B"]', '6');
    ok((await page.locator('#tryOut').innerText()).includes('→'), 'what-if lists improved departments');
    await page.screenshot({ path: join(SHOTS, 'desktop-boost.png'), fullPage: true });

    // guide
    await page.click('[data-tab="guide"]');
    ok((await page.locator('#guide').innerText()).includes('登記就讀志願序'), 'guide renders');

    // deep link
    await page.goto(URL_ + '#d=001012');
    await page.waitForSelector('#detail[open]');
    ok((await page.locator('#dTitle').innerText()) === '中國文學系', 'deep link opens a department');

    ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    ok(external.length === 0, 'no network requests' + (external.length ? ': ' + external.join(', ') : ''));
    await ctx.close();
  }

  console.log('phone flow');
  {
    const { ctx, page, errors } = await newPage(browser, { ...devices['iPhone 13'] });
    await page.goto(URL_);
    await page.waitForSelector('.item');
    await setScores(page, { 國: 12, 英: 15, 社: 13 });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(sw <= 0, 'no horizontal scroll on phone (overflow ' + sw + ')');
    await page.screenshot({ path: join(SHOTS, 'phone-list.png') });
    await page.locator('.item .i-main').first().click();
    await page.waitForSelector('#detail[open]');
    const box = await page.locator('#detail').boundingBox();
    ok(box.width <= 400, 'detail is full-screen on phone');
    await page.screenshot({ path: join(SHOTS, 'phone-detail.png') });
    ok(errors.length === 0, 'no console errors on phone');
    await ctx.close();
  }

  console.log('dark mode');
  {
    const { ctx, page } = await newPage(browser, { colorScheme: 'dark', viewport: { width: 1200, height: 800 } });
    await page.goto(URL_);
    await page.waitForSelector('.item');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok(bg === 'rgb(15, 20, 24)', 'dark background ' + bg);
    await page.screenshot({ path: join(SHOTS, 'dark.png') });
    await ctx.close();
  }

  console.log('storage blocked');
  {
    const { ctx, page, errors } = await newPage(browser);
    await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await page.goto(URL_);
    await page.waitForSelector('.item');
    await setScores(page, { 國: 10 });
    ok(errors.length === 0, 'works when localStorage throws');
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall browser checks passed');
process.exit(failures ? 1 : 0);
