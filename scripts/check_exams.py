#!/usr/bin/env python3
"""Sanity checks on docs/exams (after parse_exams.py): every answer is one of its question's options,
選填 cells match their answers, and nothing is left with neither text nor a picture."""
import json
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'docs' / 'exams'


def main():
    bad = 0
    idx = json.loads((OUT / 'index.json').read_text(encoding='utf-8'))
    tot = {'q': 0, 'img': 0, 'auto': 0}
    for p in idx:
        s = (OUT / f"{p['id']}.js").read_text(encoding='utf-8')
        d = json.loads(s[s.index('(') + 1:s.rindex(')')])
        probs = []
        items = d['items']
        for i, q in enumerate(items):
            if q['k'] != 'q':
                continue
            tot['q'] += 1
            if q.get('img'):
                tot['img'] += 1
            if q.get('type') in ('single', 'multi', 'fill') and q.get('ans'):
                tot['auto'] += 1
            if not q.get('html') and not q.get('img') and not q.get('blank'):
                probs.append(f"{q['n']}: no text or picture")
            if q.get('type') in ('single', 'multi'):
                opts = q.get('opts') or (items[q['shared']].get('opts') if q.get('shared') is not None else None)
                labels = [o[0] for o in opts] if opts else q.get('labels') or []
                if q.get('ans') and labels and any(a not in labels for a in q['ans']):
                    probs.append(f"{q['n']}: answer {q['ans']} not in options {''.join(labels)}")
                if not q.get('ans'):
                    probs.append(f"{q['n']}: no answer")
                if opts and len(opts) < 3:
                    probs.append(f"{q['n']}: only {len(opts)} options")
                if not opts and not q.get('img') and not q.get('blank'):
                    probs.append(f"{q['n']}: text question without options")
            if q.get('type') == 'fill' and len(q.get('cells', [])) != len(q.get('ans', [])):
                probs.append(f"{q['n']}: cells/answers differ")
        if probs:
            bad += 1
            print(p['id'], '·', '; '.join(probs[:8]), f'(+{len(probs) - 8})' if len(probs) > 8 else '')
    print(f"{len(idx)} papers, {tot['q']} questions ({tot['auto']} graded automatically, {tot['img']} shown as pictures); {bad} papers with problems")
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
