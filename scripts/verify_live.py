"""Compare the app's 116 一階 data with the live 甄選會 校系分則 pages.

Usage:
  npm run build
  mkdir -p /tmp/live && node -e "for(const d of require('./build/app-data.json').depts)console.log(d.url)" \
    | (cd /tmp/live && xargs -P 6 -n 1 curl -s -m 30 -O --retry 2)
  python3 scripts/verify_live.py /tmp/live build/app-data.json

Checks every department's 學測/英聽 科目, 檢定, 篩選倍率 and 採計 against the page.
Prints mismatches; "mismatch 0" means the data equals the published 校系分則.
"""
import re, html, json, sys, os
live, appdata = sys.argv[1], sys.argv[2]
D = json.load(open(appdata))
NAME = {'國文':'國','英文':'英','數學A':'數A','數學B':'數B','社會':'社','自然':'自','英聽':'聽'}
ABBR = ['數A','數B','國','英','社','自']
def parts(name):
    if name in NAME: return [NAME[name]]
    out=[]; s=name
    while s:
        for a in ABBR:
            if s.startswith(a): out.append(a); s=s[len(a):]; break
        else: return None
    return out
def cells(t):
    t = re.sub(r'<br\s*/?>', '\n', t, flags=re.I)
    tds = re.findall(r'<td[^>]*>(.*?)</td>', t, flags=re.S|re.I)
    return [html.unescape(re.sub(r'<[^>]+>', '', x)).strip() for x in tds]
bad = 0; checked = 0; skipped = []
for d in D['depts']:
    fn = os.path.join(live, os.path.basename(d['url']))
    t = open(fn, encoding='utf-8', errors='replace').read()
    c = cells(t)
    try: i = c.index(d['c'])
    except ValueError: skipped.append(d['c']); continue
    lines = lambda x: [y.strip() for y in x.split('\n') if y.strip()]
    subj, chk, mul, wt = (lines(c[i+1]), lines(c[i+2]), lines(c[i+3]), lines(c[i+4]))
    live_rows = []
    for j, n in enumerate(subj):
        if n.startswith('APCS') or n in ('學測科目','--'): continue
        p = parts(n)
        if p is None: live_rows.append(('?', n)); continue
        g = lambda arr: arr[j] if j < len(arr) else '--'
        tv, mv, wv = g(chk), g(mul), g(wt)
        live_rows.append((tuple(p), None if tv in ('--','') else tv, None if mv in ('--','') else float(mv), None if wv in ('--','') else float(re.sub(r'[^0-9.]','',wv))))
    mine = []
    for s in d['sub']:
        if s.get('apcs'): continue
        p = tuple(s['p']) if s.get('p') else ('聽',)
        mine.append((p, s.get('t'), None if s.get('m') is None else float(s['m']), None if s.get('w') is None else float(s['w'])))
    checked += 1
    if sorted(map(str,live_rows)) != sorted(map(str,mine)):
        bad += 1
        if bad <= 25: print(d['c'], d['n'], '\n  live', live_rows, '\n  app ', mine)
print('checked', checked, 'mismatch', bad, 'skipped', len(skipped), skipped[:10])
