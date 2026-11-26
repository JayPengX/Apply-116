#!/usr/bin/env python3
"""Download 大考中心 past papers (學測 and 分科, 111 學年度 on: the 108 課綱 papers) for the 歷屆試題 tab.

For each paper: the question booklet (.docx, which keeps text, tables, pictures and MathType equations; and
its .pdf, cropped for questions whose diagrams are drawn with Word shapes),
the 選擇(填)題答案 (.pdf) and the 非選擇題參考答案與評分原則 (.pdf, for 非選擇題 graded with the student's own AI). Files go to data/raw/exams/ (not committed: ~300 MB); parse_exams.py turns
them into the small per-paper files the site loads.

Source: https://www.ceec.edu.tw 「歷年試題及答題卷」. 試題著作權屬財團法人大學入學考試中心基金會；
本專案非營利使用並註明出處。
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'raw' / 'exams'
BASE = 'https://www.ceec.edu.tw'
LISTS = {'gsat': '0J052424829869345634', 'ast': '0J052427633128416650'}
FIRST_YEAR = 111
SKIP = {'國寫'}  # an essay paper: nothing to practise as a quiz


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'apply116-exams'}), timeout=60) as r:
                return r.read()
        except Exception as e:  # network hiccup: back off and retry
            if i == tries - 1:
                raise
            print('  retry', url, e, file=sys.stderr)
            time.sleep(2 * (i + 1))


def papers():
    seen = {}
    for kind, sid in LISTS.items():
        for page in range(1, 12):
            s = get(f'{BASE}/xmfile?xsmsid={sid}&page={page}').decode('utf-8')
            rows = re.findall(r'<tr.*?</tr>', s, re.S)
            older = False
            for r in rows:
                t = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', r)))
                m = re.search(r'(\d{3})學年度(學科能力測驗|分科測驗)－(\S+)', t)
                if not m:
                    continue
                y, subj = int(m[1]), m[3]
                if y < FIRST_YEAR:
                    older = True
                    continue
                if subj in SKIP:
                    continue
                links = [(html.unescape(a), b.strip()) for a, b in re.findall(r'href="([^"]+)"[^>]*>([^<]*)', r)]
                q = next((a for a, b in links if b == '試題內容' and a.lower().endswith('.docx')), None)
                pdf = next((a for a, b in links if b == '試題內容' and a.lower().endswith('.pdf')), None)
                ans = next((a for a, b in links if '答案' in b and a.lower().endswith('.pdf')), None)
                rub = next((a for a, b in links if '評分原則' in b and a.lower().endswith('.pdf')), None)
                seen.setdefault((kind, y, subj), {'kind': kind, 'y': y, 'subj': subj, 'q': q, 'pdf': pdf, 'ans': ans, 'rubric': rub})
            if older or not rows:
                break
    return sorted(seen.values(), key=lambda p: (p['kind'], -p['y'], p['subj']))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ps = papers()
    for p in ps:
        stem = f"{p['kind']}-{p['y']}-{p['subj']}"
        for key, ext in (('q', 'docx'), ('pdf', 'pdf'), ('ans', 'pdf'), ('rubric', 'pdf')):
            if not p[key]:
                print('missing', key, stem, file=sys.stderr)
                continue
            f = OUT / f'{stem}-{key}.{ext}'
            if f.exists() and f.stat().st_size > 1000:
                continue
            f.write_bytes(get(BASE + urllib.parse.quote(p[key], safe='/%')))
            print('saved', f.name, f.stat().st_size)
    (OUT / 'index.json').write_text(json.dumps(ps, ensure_ascii=False, indent=1), encoding='utf-8')
    print(len(ps), 'papers')


if __name__ == '__main__':
    main()
