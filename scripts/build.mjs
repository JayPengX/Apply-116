// One self-contained HTML file: dist/index.html (also copied to docs/ for GitHub Pages).
// JS and CSS are minified; the data is gzipped and base64-encoded (the page unpacks it with DecompressionStream,
// or the bundled tiny-inflate on older browsers). Same bytes over the wire, a ~4× smaller file, faster to open.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { transformSync } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = p => readFileSync(join(root, p), 'utf8');
const target = ['chrome100', 'safari15', 'firefox100'];
const js = (p, name) => {
  const out = transformSync(r(p), { loader: 'js', minify: true, target, legalComments: 'inline' }).code;
  if (/<\/script/i.test(out)) throw new Error(name + ' contains </script');
  return out;
};
const css = transformSync(r('src/styles.css'), { loader: 'css', minify: true, target }).code;
const data = gzipSync(readFileSync(join(root, 'build/app-data.json')), { level: 9 }).toString('base64');
let html = r('src/index.html');
const parts = { '/*__CSS__*/': css, '/*__DATA__*/': data, '/*__INFLATE__*/': js('src/vendor/tiny-inflate.js', 'tiny-inflate'), '/*__LOGIC__*/': js('src/logic.js', 'logic.js'), '/*__APP__*/': js('src/app.js', 'app.js') };
for (const [k, v] of Object.entries(parts)) {
  if (!html.includes(k)) throw new Error('placeholder missing: ' + k);
  html = html.split(k).join(v);
}
mkdirSync(join(root, 'dist'), { recursive: true });
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
copyFileSync(join(root, 'dist/index.html'), join(root, 'docs/index.html'));
const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log('dist/index.html', kb(Buffer.byteLength(html)), '· gzipped', kb(gzipSync(html, { level: 9 }).length));
