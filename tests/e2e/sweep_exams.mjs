// 考古題 sweep: open every paper on a phone screen, visit every question (practice, 非選擇題 included) and report
// broken pictures, questions with no text, empty options, no way to answer, or a page wider than the screen.
// npm run test:exams (a few minutes; not part of CI)
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(pathToFileURL(join(root, 'dist', 'index.html')).href + '#exam'); await p.waitForSelector('#exam .xp-y');
await p.evaluate(() => { window.__app.st().ex = { open: true, wrong: [], hist: {} }; });
const ids = await p.evaluate(() => window.EXAM_INDEX.map(x => x.id));
const problems = [];
for (const id of ids) {
  await p.evaluate(() => { window.__app.st().ex.s = null; });
  await p.click('[data-xact="home"]').catch(() => {});
  await p.evaluate(() => window.__app.render());
  await p.click(`[data-xpaper="${id}"]`); await p.click('#xMode [data-xact="practice"]');
  await p.waitForSelector('#exam .xq');
  const n = await p.evaluate(() => window.__app.st().ex.s.qs.length);
  for (let i = 0; i < n; i++) {
    if (i) { await p.evaluate(i => { window.__app.st().ex.s.i = i; }, i); await p.evaluate(() => window.__app.render()); }
    const r = await p.evaluate(async () => {
      const q = document.querySelector('#exam .xq');
      const imgs = [...document.querySelectorAll('#exam img')];
      await Promise.all(imgs.map(im => im.complete ? 0 : new Promise(res => { im.onload = im.onerror = res; })));
      const broken = imgs.filter(im => !im.naturalWidth).map(im => im.getAttribute('src'));
      const stem = q.querySelector('.xq-stem');
      const hasStem = stem && (stem.textContent.trim() || stem.querySelector('img,math,table'));
      const opts = [...q.querySelectorAll('.xo-b')];
      const emptyOpts = opts.filter(o => !o.querySelector('.xo-t').textContent.trim() && !o.querySelector('.xo-t img,.xo-t math') && !q.parentElement.querySelector('.compact')).length;
      const ans = q.querySelectorAll('.xo-b, .xc, #xText').length;
      const wide = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      return { n: q.querySelector('.xq-n').textContent, broken, hasStem: !!hasStem, emptyOpts, ans, wide };
    });
    const bad = [];
    if (r.broken.length) bad.push('broken ' + r.broken.join(','));
    if (!r.hasStem) bad.push('no stem');
    if (r.emptyOpts) bad.push(r.emptyOpts + ' empty options');
    if (!r.ans) bad.push('no way to answer');
    if (r.wide) bad.push('page wider than screen');
    if (bad.length) problems.push(`${id} ${r.n} ${bad.join('; ')}`);
  }
  process.stdout.write('.');
}
console.log('\n' + problems.length + ' problems'); problems.forEach(x => console.log(x));
console.log('errors', errs.slice(0, 10));
await b.close();
process.exit(problems.length || errs.length ? 1 : 0);
