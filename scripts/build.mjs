// Inline CSS, JS and data into one self-contained HTML file: dist/index.html (also copied to docs/ for GitHub Pages).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = p => readFileSync(join(root, p), 'utf8');
const data = r('build/app-data.json').replace(/<\//g, '<\\/').replace(/<!--/g, '<\\u0021--');
const noClose = (s, name) => { if (/<\/script/i.test(s)) throw new Error(name + ' contains </script'); return s; };
let html = r('src/index.html');
const parts = { '/*__CSS__*/': r('src/styles.css'), '/*__DATA__*/': data, '/*__LOGIC__*/': noClose(r('src/logic.js'), 'logic.js'), '/*__APP__*/': noClose(r('src/app.js'), 'app.js') };
for (const [k, v] of Object.entries(parts)) {
  if (!html.includes(k)) throw new Error('placeholder missing: ' + k);
  html = html.split(k).join(v);
}
mkdirSync(join(root, 'dist'), { recursive: true });
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
copyFileSync(join(root, 'dist/index.html'), join(root, 'docs/index.html'));
console.log('dist/index.html', (html.length / 1024 / 1024).toFixed(2), 'MB (chars)');
