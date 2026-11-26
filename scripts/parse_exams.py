#!/usr/bin/env python3
"""大考中心 past papers (data/raw/exams, from fetch_exams.py) → small per-paper files for the 歷屆試題 tab.

Each paper's .docx becomes questions with their text, options, tables, pictures and MathML formulas
(MathType objects via mtef.py; Word EQ fields such as 選填 answer boxes via eq_field()). A question
or passage that needs a diagram drawn with Word shapes, a chart, or anything else this cannot rebuild
exactly is cropped from the official PDF instead, so nothing is shown wrong. Answers come from the
選擇(填)題答案 PDF; 非選擇題 keep the official 評分原則 text for grading with the student's own AI.

Output: docs/exams/index.json (the list) and docs/exams/<id>.js (one paper, loaded on demand; a script
file so it also works from a downloaded copy opened as file://) with its pictures in docs/exams/img/.
"""
import hashlib
import io
import json
import re
import subprocess
import sys
import tempfile
import zipfile
from html import escape
from pathlib import Path

from lxml import etree
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mtef  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data' / 'raw' / 'exams'
OUT = ROOT / 'docs' / 'exams'
IMG = OUT / 'img'

NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'v': 'urn:schemas-microsoft-com:vml',
    'o': 'urn:schemas-microsoft-com:office:office',
    'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
}
W = '{%s}' % NS['w']
q = lambda tag: '{%s}%s' % (NS[tag.split(':')[0]], tag.split(':')[1])

# Symbol-font characters (w:sym) seen in the papers
SYM = {0xB4: '×', 0xB0: '°', 0xAE: '→', 0xAC: '←', 0xDE: '⇒', 0xDB: '⇔', 0xA3: '≤', 0xB3: '≥', 0xB9: '≠', 0xB1: '±', 0xD0: '∠', 0xB8: '÷',
       0xBB: '≈', 0xB7: '•', 0xA2: '′', 0xB2: '″', 0x2D: '−', 0x3D: '=', 0x2B: '+', 0x70: 'π', 0x71: 'θ', 0x61: 'α', 0x62: 'β', 0x67: 'γ', 0x44: 'Δ',
       0x6C: 'λ', 0x6D: 'μ', 0x77: 'ω', 0x57: 'Ω', 0x72: 'ρ', 0x73: 'σ', 0x66: 'φ', 0x64: 'δ', 0x65: 'ε', 0xC6: '∅', 0xCE: '∈', 0xCF: '∉', 0xC7: '∩',
       0xC8: '∪', 0xCC: '⊂', 0xCD: '⊆', 0xA5: '∞', 0x5E: '⊥', 0xBA: '≡', 0x7E: '∼', 0xBC: '…', 0xD6: '√', 0xE5: '∑', 0x5C: '∴', 0xB5: '∝', 0xA1: 'ϒ'}
WINGDINGS = {0xFC: '✓', 0xFB: '✗', 0x6C: '●', 0x6E: '■', 0xA8: '◻', 0x6F: '□', 0xA1: '○', 0x9F: '•', 0xD8: '➢', 0xE0: '→', 0x81: '①', 0x82: '②',
             0x83: '③', 0x84: '④', 0x85: '⑤', 0x8C: '①', 0x8D: '②', 0x8E: '③', 0x8F: '④', 0x90: '⑤'}


class Complex(Exception):
    """Something this cannot rebuild exactly: the item is cropped from the PDF instead."""


# ------------------------------------------------------------------ Word EQ fields (選填 answer boxes, circled numbers, simple fractions)
def eq_field(code):
    """A Word EQ field code → MathML. \\o\\ac(○,13-1) is an answer cell (box with its label)."""
    s = re.sub(r'^\s*eq\s+', '', code.strip(), flags=re.I)
    s = re.sub(r'![^,()!]*(?:錯誤|Error)[^,()!]*,\s*\d+', '', s)  # Word's own "!語法錯誤, 50" left in the code
    s = re.sub(r'\\d\\fo-?\d*\s*\(\s*\)', '', s)  # nudges
    s = re.sub(r'\\d\\(?:li|ba)-?\d*\s*\(\s*\)', '', s)
    pos = 0

    def parse_list(end=')'):
        nonlocal pos
        items, cur = [], []
        while pos < len(s):
            c = s[pos]
            if c == end:
                pos += 1
                items.append(cur)
                return items
            if c == ',' or c == '，' and end == ')':
                pos += 1
                items.append(cur)
                cur = []
                continue
            cur.append(parse_one())
        items.append(cur)
        return items

    def parse_one():
        nonlocal pos
        c = s[pos]
        if c == '\\':
            m = re.match(r'((?:\\[a-zA-Z]+-?\d*(?:\\[\\{}\[\]()]|\\[\(\)])?)+)\s*\(', s[pos:])
            if not m:
                pos += 1
                return ('t', s[pos - 1:pos])
            sw = m.group(1)
            pos += len(m.group(0))
            args = parse_list()
            return ('sw', sw, args)
        pos += 1
        return ('t', c)

    def mml(nodes):
        out, buf = [], ''
        for n in nodes:
            if n[0] == 't':
                buf += n[1]
                continue
            if buf:
                out.append(tok(buf))
                buf = ''
            out.append(sw_mml(n[1], n[2]))
        if buf:
            out.append(tok(buf))
        return out[0] if len(out) == 1 else '<mrow>' + ''.join(out) + '</mrow>'

    def tok(t):
        t = t.strip()
        if not t:
            return '<mrow></mrow>'
        if re.fullmatch(r'[\d.]+', t):
            return f'<mn>{escape(t)}</mn>'
        if re.fullmatch(r'[A-Za-z]', t):
            return f'<mi>{escape(t)}</mi>'
        if len(t) == 1 and not t.isalnum():
            return f'<mo>{escape(t)}</mo>'
        return f'<mtext>{escape(t)}</mtext>'

    def plain(nodes):
        return ''.join(n[1] if n[0] == 't' else plain([x for a in n[2] for x in a]) for n in nodes).strip()

    def sw_mml(sw, args):
        k = sw.lower()
        a = [mml(x) for x in args]
        if k.startswith('\\o\\ac'):
            # overlay: (○, label) → an answer cell or a circled number
            texts = [plain(x) for x in args]
            label = next((t for t in texts if t and t not in '○◯□'), '')
            # (MathML <menclose> is not drawn by Chrome: the boxes and circles are CSS on an mrow)
            if re.fullmatch(r'\d+-\d+', label):
                return f'<mrow class="cell"><mtext>{escape(label)}</mtext></mrow>'
            if label.isdigit() and 1 <= int(label) <= 20:
                return f'<mtext>{chr(0x245F + int(label))}</mtext>'
            return f'<mrow class="circ"><mtext>{escape(label)}</mtext></mrow>'
        if k.startswith('\\f'):
            if len(a) != 2:
                raise Complex('eq \\f')
            return f'<mfrac>{a[0]}{a[1]}</mfrac>'
        if k.startswith('\\r'):
            return f'<msqrt>{a[-1]}</msqrt>' if len(a) == 1 or not plain(args[0]) else f'<mroot>{a[1]}{a[0]}</mroot>'
        if k.startswith('\\s\\up'):
            return f'<msup><mrow></mrow>{a[0]}</msup>'
        if k.startswith('\\s\\do'):
            return f'<msub><mrow></mrow>{a[0]}</msub>'
        if k.startswith('\\x'):
            return f'<mrow class="bx">{"".join(a)}</mrow>'
        if k.startswith('\\b'):
            m = re.search(r'\\b(?:\\bc\\?(.))?', sw)
            l = m.group(1) if m and m.group(1) else '('
            r = {'(': ')', '[': ']', '{': '}', '|': '|', '<': '>'}.get(l, l)
            return f'<mrow><mo>{escape(l)}</mo>{a[0]}<mo>{escape(r)}</mo></mrow>'
        if k.startswith('\\a'):
            return '<mtable>' + ''.join(f'<mtr><mtd>{x}</mtd></mtr>' for x in a) + '</mtable>'
        raise Complex('eq ' + sw)

    nodes = []
    while pos < len(s):
        nodes.append(parse_one())
    return '<math>' + mml(nodes) + '</math>'


# ------------------------------------------------------------------ one .docx → blocks of inline tokens
class Doc:
    def __init__(self, path, media):
        self.z = zipfile.ZipFile(path)
        self.x = etree.fromstring(self.z.read('word/document.xml'))
        rels = etree.fromstring(self.z.read('word/_rels/document.xml.rels'))
        self.rels = {r.get('Id'): r.get('Target') for r in rels}
        self.media = media
        self.math_ok = self.math_img = 0
        self.num_init()

    # --- Word's automatic list numbering (英文 numbers its questions this way)
    def num_init(self):
        self.nums, self.abstract, self.style_num = {}, {}, {}
        self.counters, self.started = {}, set()
        try:
            n = etree.fromstring(self.z.read('word/numbering.xml'))
        except KeyError:
            return
        for a in n.findall(W + 'abstractNum'):
            lv = {}
            for l in a.findall(W + 'lvl'):
                g = lambda t: (l.find(W + t).get(W + 'val') if l.find(W + t) is not None else None)
                lv[int(l.get(W + 'ilvl'))] = {'start': int(g('start') or 1), 'fmt': g('numFmt') or 'decimal', 'text': g('lvlText') or '%1.'}
            self.abstract[a.get(W + 'abstractNumId')] = lv
        for m in n.findall(W + 'num'):
            ov = {}
            for o in m.findall(W + 'lvlOverride'):
                so = o.find(W + 'startOverride')
                if so is not None:
                    ov[int(o.get(W + 'ilvl'))] = int(so.get(W + 'val'))
            self.nums[m.get(W + 'numId')] = (m.find(W + 'abstractNumId').get(W + 'val'), ov)
        try:
            st = etree.fromstring(self.z.read('word/styles.xml'))
            for sdef in st.findall(W + 'style'):
                npr = sdef.find(W + 'pPr/' + W + 'numPr')
                if npr is not None and npr.find(W + 'numId') is not None:
                    il = npr.find(W + 'ilvl')
                    self.style_num[sdef.get(W + 'styleId')] = (npr.find(W + 'numId').get(W + 'val'), int(il.get(W + 'val')) if il is not None else 0)
        except KeyError:
            pass

    def list_label(self, p):
        ppr = p.find(W + 'pPr')
        if ppr is None:
            return ''
        npr = ppr.find(W + 'numPr')
        nid, ilvl = None, 0
        if npr is not None and npr.find(W + 'numId') is not None:
            nid = npr.find(W + 'numId').get(W + 'val')
            il = npr.find(W + 'ilvl')
            ilvl = int(il.get(W + 'val')) if il is not None else 0
        else:
            ps = ppr.find(W + 'pStyle')
            if ps is not None and ps.get(W + 'val') in self.style_num:
                nid, ilvl = self.style_num[ps.get(W + 'val')]
        if not nid or nid == '0' or nid not in self.nums:
            return ''
        aid, ov = self.nums[nid]
        lv = self.abstract.get(aid, {})
        if ilvl not in lv:
            return ''
        key = aid
        cs = self.counters.setdefault(key, {})
        if (nid, ilvl) not in self.started and ilvl in ov:
            cs[ilvl] = ov[ilvl] - 1
        self.started.add((nid, ilvl))
        cs[ilvl] = cs.get(ilvl, lv[ilvl]['start'] - 1) + 1
        for deeper in [k for k in cs if k > ilvl]:
            del cs[deeper]

        def fmt(v, f):
            if f == 'upperLetter':
                return chr(64 + v)
            if f == 'lowerLetter':
                return chr(96 + v)
            if f in ('ideographTraditional', 'taiwaneseCountingThousand', 'chineseCounting'):
                return '一二三四五六七八九十'[v - 1] if 0 < v <= 10 else str(v)
            if f == 'none':
                return ''
            return str(v)
        text = lv[ilvl]['text']
        return re.sub(r'%(\d)', lambda m: fmt(cs.get(int(m.group(1)) - 1, lv.get(int(m.group(1)) - 1, {'start': 1})['start']), lv.get(int(m.group(1)) - 1, {'fmt': 'decimal'})['fmt']), text)

    def part(self, rid):
        t = self.rels.get(rid)
        if not t:
            raise Complex('missing rel')
        t = t.lstrip('/')
        return self.z.read(t if t.startswith('word/') else 'word/' + t), t

    def image(self, rid, width_emu=None):
        data, name = self.part(rid)
        return self.media.add(data, name, width_emu)

    # --- a paragraph's runs → tokens
    def para_tokens(self, p):
        toks = []
        fields = []  # stack of {'instr': str, 'phase': 'instr'|'result'}

        def emit(t):
            if fields and fields[-1]['phase'] == 'instr':
                return  # inside a field code: only instrText matters
            toks.append(t)

        for el in p.iter():
            tag = el.tag
            if tag == W + 'fldChar':
                kind = el.get(W + 'fldCharType')
                if kind == 'begin':
                    fields.append({'instr': '', 'phase': 'instr'})
                elif kind == 'separate' and fields:
                    f = fields[-1]
                    f['phase'] = 'result'
                    if re.match(r'\s*eq\b', f['instr'], re.I) and not (len(fields) > 1 and fields[-2]['phase'] == 'instr'):
                        f['done'] = True
                        toks.append(('math', eq_field(f['instr'])))
                elif kind == 'end' and fields:
                    f = fields.pop()
                    if fields and fields[-1]['phase'] == 'instr':
                        fields[-1]['instr'] += re.sub(r'^\s*eq\s+', '', f['instr'], flags=re.I)
                    elif re.match(r'\s*eq\b', f['instr'], re.I) and not f.get('done'):
                        toks.append(('math', eq_field(f['instr'])))
                continue
            if tag == W + 'instrText':
                if fields:
                    fields[-1]['instr'] += el.text or ''
                continue
            if fields and fields[-1].get('done'):
                continue  # the shown result of an EQ field we already wrote
            if tag == W + 't':
                if self.in_deleted(el) or self.in_textbox(el, p):
                    continue
                emit(('t', el.text or '', self.fmt(el)))
            elif tag == W + 'tab' and el.getparent().tag == W + 'r':
                if not self.in_textbox(el, p):
                    emit(('tab',))
            elif tag == W + 'br' and not self.in_textbox(el, p):
                emit(('br',))
            elif tag == W + 'sym':
                if self.in_textbox(el, p):
                    continue
                font = (el.get(W + 'font') or '').lower()
                code = int(el.get(W + 'char'), 16) & 0xFF
                table = WINGDINGS if 'wingding' in font else SYM
                if code not in table:
                    raise Complex('sym %s %x' % (font, code))
                emit(('t', table[code], self.fmt(el)))
            elif tag == W + 'object':
                if self.in_textbox(el, p):
                    continue
                emit(self.ole(el))
            elif tag == W + 'drawing':
                if self.in_textbox(el, p) or self.in_fallback(el):
                    continue
                emit(self.drawing(el))
            elif tag == W + 'pict':
                if self.in_textbox(el, p) or self.in_fallback(el):
                    continue
                emit(self.vml(el))
        return toks

    def in_deleted(self, el):
        a = el.getparent()
        while a is not None:
            if a.tag in (W + 'del', W + 'moveFrom'):
                return True
            a = a.getparent()
        return False

    def in_textbox(self, el, p):
        a = el.getparent()
        while a is not None and a is not p:
            if a.tag in (W + 'txbxContent',):
                return True
            a = a.getparent()
        return False

    def in_fallback(self, el):
        a = el.getparent()
        while a is not None:
            if a.tag == q('mc:Fallback'):
                return True
            a = a.getparent()
        return False

    def fmt(self, el):
        r = el.getparent()
        rp = r.find(W + 'rPr') if r is not None else None
        f = ''
        if rp is not None:
            if rp.find(W + 'b') is not None and rp.find(W + 'b').get(W + 'val') not in ('0', 'false'):
                f += 'b'
            if rp.find(W + 'i') is not None and rp.find(W + 'i').get(W + 'val') not in ('0', 'false'):
                f += 'i'
            u = rp.find(W + 'u')
            if u is not None and u.get(W + 'val') not in (None, 'none'):
                f += 'u'
            va = rp.find(W + 'vertAlign')
            if va is not None:
                f += {'superscript': '^', 'subscript': '_'}.get(va.get(W + 'val'), '')
            if rp.find(W + 'em') is not None and rp.find(W + 'em').get(W + 'val') not in (None, 'none'):
                f += '.'
        return f

    def ole(self, el):
        ole = el.find('.//' + q('o:OLEObject'))
        prog = ole.get('ProgID') if ole is not None else ''
        if prog and prog.startswith('Equation.DSMT') or prog == 'Equation.3':
            try:
                data, _ = self.part(ole.get(q('r:id')))
                m = mtef.to_mathml(data)
                self.math_ok += 1
                return ('math', m)
            except (mtef.Unsupported, Complex, Exception):
                pass
        img = el.find('.//' + q('v:imagedata'))
        if img is None:
            raise Complex('ole without picture')
        self.math_img += 1
        return ('img', self.image(img.get(q('r:id'))), 'eq')

    def drawing(self, el):
        g = el.find('.//' + q('a:graphicData'))
        uri = g.get('uri') if g is not None else ''
        ext = el.find('.//' + q('wp:extent'))
        cx = int(ext.get('cx')) if ext is not None else None
        if uri.endswith('/picture'):
            blip = el.find('.//' + q('a:blip'))
            if blip is None or not blip.get(q('r:embed')):
                raise Complex('picture without blip')
            return ('img', self.image(blip.get(q('r:embed')), cx), 'fig')
        if uri.endswith('wordprocessingShape'):
            shp = g.find(q('wps:wsp'))
            box = shp.find('.//' + W + 'txbxContent') if shp is not None else None
            geom = shp.find('.//' + q('a:prstGeom')) if shp is not None else None
            if box is not None and (geom is None or geom.get('prst') in ('rect', 'roundRect')):
                return ('box', self.blocks_html(box), bool(shp.find('.//' + q('a:ln')) is not None and shp.find('.//' + q('a:ln') + '/' + q('a:noFill')) is None))
            raise Complex('shape')
        raise Complex('drawing ' + uri.rsplit('/', 1)[-1])

    def vml(self, el):
        if el.find('.//' + q('v:group')) is not None:
            raise Complex('vml group')
        box = el.find('.//' + W + 'txbxContent')
        if box is not None:
            return ('box', self.blocks_html(box), True)
        img = el.find('.//' + q('v:imagedata'))
        if img is not None:
            return ('img', self.image(img.get(q('r:id'))), 'fig')
        raise Complex('vml')

    # --- block structure
    def blocks(self, parent):
        out = []
        for el in parent:
            tag = el.tag
            if tag == W + 'p':
                label = self.list_label(el)
                try:
                    toks = self.para_tokens(el)
                    if label:
                        toks.insert(0, ('t', label + ' ', ''))
                    out.append({'k': 'p', 'toks': toks, 'text': tokens_text(toks), 'el': el})
                except Complex as e:
                    # keep its plain text, so question numbers and headings are still found
                    out.append({'k': 'p', 'toks': [], 'text': (label + ' ' if label else '') + self.plain(el), 'el': el, 'complex': str(e)})
            elif tag == W + 'tbl':
                try:
                    html_, text = self.table(el)
                    out.append({'k': 'tbl', 'html': html_, 'text': text, 'el': el})
                except Complex as e:
                    out.append({'k': 'tbl', 'html': '', 'text': self.plain(el), 'el': el, 'complex': str(e)})
            elif tag in (W + 'sdt',):
                c = el.find(W + 'sdtContent')
                if c is not None:
                    out += self.blocks(c)
            elif tag == q('mc:AlternateContent'):
                c = el.find(q('mc:Choice'))
                if c is not None:
                    out += self.blocks(c)
        return out

    def plain(self, el):
        return ''.join(t.text or '' for t in el.iter(W + 't') if not self.in_textbox(t, el) and not self.in_fallback(t))

    def blocks_html(self, parent):
        bs = self.blocks(parent)
        bad = next((b['complex'] for b in bs if b.get('complex')), None)
        if bad:
            raise Complex(bad)
        return ''.join(block_html(b) for b in bs)

    def table(self, tbl):
        rows, texts = [], []
        for tr in tbl.findall(W + 'tr'):
            cells = []
            for tc in tr.findall(W + 'tc'):
                pr = tc.find(W + 'tcPr')
                span = 1
                if pr is not None:
                    gs = pr.find(W + 'gridSpan')
                    if gs is not None:
                        span = int(gs.get(W + 'val'))
                    vm = pr.find(W + 'vMerge')
                    if vm is not None and vm.get(W + 'val') != 'restart':
                        continue
                bs = self.blocks(tc)
                bad = next((b['complex'] for b in bs if b.get('complex')), None)
                if bad:
                    raise Complex(bad)
                texts.append(' '.join(b['text'] for b in bs))
                cells.append(f'<td{f" colspan={span}" if span > 1 else ""}>{"".join(block_html(b) for b in bs)}</td>')
            rows.append('<tr>' + ''.join(cells) + '</tr>')
        return '<table>' + ''.join(rows) + '</table>', ' | '.join(texts)


def tokens_text(toks):
    out = []
    for t in toks:
        if t[0] == 't':
            out.append(t[1])
        elif t[0] == 'tab':
            out.append('\t')
        elif t[0] == 'br':
            out.append('\n')
        elif t[0] == 'math':
            out.append('\x01')
        elif t[0] in ('img', 'box'):
            out.append('\x02')
    return ''.join(out)


def tokens_html(toks):
    out = []
    for t in toks:
        k = t[0]
        if k == 't':
            s = escape(t[1])
            f = t[2]
            if '^' in f:
                s = f'<sup>{s}</sup>'
            if '_' in f:
                s = f'<sub>{s}</sub>'
            if 'b' in f:
                s = f'<b>{s}</b>'
            if 'i' in f:
                s = f'<i>{s}</i>'
            if 'u' in f:
                s = f'<u>{s}</u>'
            if '.' in f:
                s = f'<em>{s}</em>'
            out.append(s)
        elif k == 'tab':
            out.append('<span class="tb"> </span>')
        elif k == 'br':
            out.append('<br>')
        elif k == 'math':
            out.append(t[1])
        elif k == 'img':
            out.append(f'<img src="{t[1]}" class="{t[2]}" alt="">')
        elif k == 'box':
            out.append(f'<div class="xbox{" ln" if t[2] else ""}">{t[1]}</div>')
    # merge adjacent same tags produced run by run
    h = ''.join(out)
    for tag in ('b', 'i', 'u', 'em', 'sup', 'sub'):
        h = h.replace(f'</{tag}><{tag}>', '')
    return h.strip()


def block_html(b):
    if b['k'] == 'tbl':
        return b['html']
    h = tokens_html(b['toks'])
    return f'<p>{h}</p>' if h else ''


# ------------------------------------------------------------------ pictures: deduplicated, made small (WebP, or PNG for line art)
class Media:
    def __init__(self):
        self.files = {}
        self.pending_vector = []

    def add(self, data, name, width_emu=None):
        ext = name.rsplit('.', 1)[-1].lower()
        if ext in ('emf', 'wmf'):
            data = vector_to_png(data, ext)
        elif ext not in ('png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff'):
            raise Complex('picture ' + ext)
        im = Image.open(io.BytesIO(data))
        im.load()
        if ext in ('emf', 'wmf'):
            # LibreOffice draws it on a whole page: keep only the drawing
            im = trim_white(im)
        # shown no wider than it was on the page (EMU → px at 2× for sharp screens)
        maxw = 1100
        if width_emu:
            maxw = min(maxw, max(120, int(width_emu / 9525 * 2)))
        if im.width > maxw:
            im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
        if im.mode in ('P', 'LA', 'RGBA'):
            bg = Image.new('RGB', im.size, 'white')
            rgba = im.convert('RGBA')
            bg.paste(rgba, mask=rgba.split()[-1])
            im = bg
        else:
            im = im.convert('RGB')
        return self.save(im)

    def save(self, im, crop=False):
        buf = io.BytesIO()
        if crop:
            # a cropped PDF region: black text and grey shading, so a grey WebP
            im.convert('L').save(buf, 'WEBP', quality=55, method=6)
            return self.keep(buf.getvalue(), 'webp')
        # few colours (line art, text) → palette PNG; photos → WebP
        small = im.copy()
        small.thumbnail((200, 200))
        colors = small.getcolors(256)
        if colors is not None and len(colors) <= 64:
            g = im.convert('L') if all(abs(c[1][0] - c[1][1]) < 8 and abs(c[1][1] - c[1][2]) < 8 for c in colors) else im
            g.quantize(colors=16 if g.mode == 'L' else 32).save(buf, 'PNG', optimize=True)
            ext = 'png'
        else:
            im.save(buf, 'WEBP', quality=72, method=6)
            ext = 'webp'
        return self.keep(buf.getvalue(), ext)

    def keep(self, data, ext):
        h = hashlib.sha1(data).hexdigest()[:12]
        fn = f'{h}.{ext}'
        self.files[fn] = data
        return 'img/' + fn


_vec_cache = {}


def vector_to_png(data, ext):
    """EMF/WMF (Word's drawings and equation previews) → PNG, through LibreOffice."""
    key = hashlib.sha1(data).hexdigest()
    if key in _vec_cache:
        return _vec_cache[key]
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / f'v.{ext}'
        src.write_bytes(data)
        subprocess.run(['soffice', f'-env:UserInstallation=file://{d}/lo', '--headless', '--convert-to', 'png', '--outdir', d, str(src)],
                       capture_output=True, timeout=120)
        out = Path(d) / 'v.png'
        if not out.exists():
            raise Complex('vector picture')
        png = out.read_bytes()
    _vec_cache[key] = png
    return png


# ------------------------------------------------------------------ answers and 評分原則
def pdf_text(path, layout=True):
    r = subprocess.run(['pdftotext'] + (['-layout'] if layout else []) + [str(path), '-'], capture_output=True, text=True)
    return r.stdout


def answers(path):
    """{'1': '2', '7': '3,4', '13-1': '9', '19': '／', '21': 'A'}"""
    t = pdf_text(path)
    # a voided question (無答案, 送分): everyone gets its points; drop its footnote mark so it is not read as a number
    t = re.sub(r'無答案\s*(?:※\s*\d+)?|送分\s*(?:※\s*\d+)?', '＊', t)
    out = {}
    for m in re.finditer(r'(?<![\d-])(\d{1,2}(?:-\d{1,2})?)[ \t]+([A-L0-9][A-L0-9,]*|／|/|-|±|－|＊)(?=\s|$)', t):
        out.setdefault(m.group(1), m.group(2).replace('/', '／').replace('－', '-'))
    return out


def rubric_parts(path):
    """The 評分原則 text, split by question number where it can be."""
    t = pdf_text(path, layout=False)
    t = re.sub(r'[ 　]+\n', '\n', t)
    parts = {}
    for m in re.finditer(r'(?m)^\s*(?:第\s*)?(\d{1,2})(?:\s*題|[.．、])', t):
        parts.setdefault(m.group(1), m.start())
    keys = sorted(parts.items(), key=lambda x: x[1])
    out = {}
    for i, (n, s) in enumerate(keys):
        e = keys[i + 1][1] if i + 1 < len(keys) else len(t)
        out[n] = t[s:e].strip()[:4000]
    return t.strip()[:20000], out


# ------------------------------------------------------------------ PDF crops for what cannot be rebuilt
def norm_text(t):
    """For matching Word text against PDF text: no spaces or symbols, ASCII digits and dashes."""
    t = t.translate(str.maketrans('０１２３４５６７８９－—–～', '0123456789----'))
    return re.sub(r'[\s◎※○●■□\x01\x02\x03]+', '', t)


class Pdf:
    def __init__(self, path):
        import pdfplumber
        self.path = path
        self.pdf = pdfplumber.open(str(path))
        self.marks = None
        self._words = {}

    def words(self, pi):
        if pi not in self._words:
            self._words[pi] = self.pdf.pages[pi].extract_words()
        return self._words[pi]

    def question_marks(self):
        """(page, top, n) of every 'n.' that starts a question at the left margin."""
        if self.marks is not None:
            return self.marks
        marks = []
        for pi, page in enumerate(self.pdf.pages):
            for w in page.extract_words(keep_blank_chars=False, use_text_flow=True):
                m = re.match(r'^(\d{1,2})\.', w['text'])
                if m and w['x0'] < page.width * 0.2:
                    marks.append((pi, w['top'], int(m.group(1)), w['x0']))
        if marks:
            x = min(m[3] for m in marks)
            marks = [m for m in marks if m[3] < x + 12]
        self.marks = marks
        return marks

    def body_bottom(self, pi):
        page = self.pdf.pages[pi]
        # the footer is the page number line (第 n 頁, 共 n 頁, - n -), not a figure's labels near the bottom
        foot = [w['top'] for w in self.words(pi) if w['top'] > page.height * 0.9 and re.search(r'第|頁|共|^-?\s*\d+\s*-?$|考科', w['text'])]
        return (min(foot) - 4) if foot else page.height - 30

    def find_text(self, needle, after=None):
        """(page, top) of the first line containing needle (spaces ignored), after (page, top)."""
        nd = norm_text(needle)[:12]
        for pi, page in enumerate(self.pdf.pages):
            # one line per baseline, within 3 pt (numbers sit a little lower than the text beside them)
            lines = {}
            for w in sorted(self.words(pi), key=lambda w: w['top']):
                key = next((k for k in lines if abs(k - w['top']) <= 3), None)
                lines.setdefault(w['top'] if key is None else key, []).append(w)
            for top in sorted(lines):
                if after and (pi, top) <= after:
                    continue
                s = norm_text(''.join(w['text'] for w in sorted(lines[top], key=lambda w: w['x0'])))
                if nd and nd in s:
                    return (pi, top)
        return None

    def crop(self, start, end, media):
        """Image of the region from start (page, top) to end (page, top) or the end of the page; may span pages."""
        pieces = []
        pi, top = start
        while True:
            page = self.pdf.pages[pi]
            bottom = end[1] if end and end[0] == pi else self.body_bottom(pi)
            if bottom - top > 6:
                pieces.append(self.render(pi, max(0, top - 4), bottom - 2))
            if end and end[0] <= pi or pi + 1 >= len(self.pdf.pages):
                break
            pi += 1
            heads = [w['top'] for w in self.words(pi) if w['top'] < self.pdf.pages[pi].height * 0.1]
            top = (max(heads) + 14) if heads else 40
        return [media.save(trim(im), crop=True) for im in pieces if im is not None]

    def render(self, pi, top, bottom):
        page = self.pdf.pages[pi]
        res = 150
        sc = res / 72
        with tempfile.TemporaryDirectory() as d:
            subprocess.run(['pdftoppm', '-r', str(res), '-f', str(pi + 1), '-l', str(pi + 1), '-x', '0', '-y', str(int(top * sc)),
                            '-W', str(int(page.width * sc)), '-H', str(int((bottom - top) * sc)), '-gray', '-png', str(self.path), f'{d}/c'], check=True)
            f = next(Path(d).glob('c*.png'), None)
            return Image.open(f).convert('RGB') if f else None


def trim_white(im):
    rgba = im.convert('RGBA')
    bg = Image.new('RGBA', rgba.size, (255, 255, 255, 255))
    bg.alpha_composite(rgba)
    g = bg.convert('L').point(lambda v: 255 if v < 245 else 0)
    box = g.getbbox()
    return bg.convert('RGB').crop((max(0, box[0] - 2), max(0, box[1] - 2), min(im.width, box[2] + 2), min(im.height, box[3] + 2))) if box else im


def trim(im):
    """Cut the white margins of a crop."""
    g = im.convert('L').point(lambda v: 255 if v < 235 else 0)
    box = g.getbbox()
    if not box:
        return im
    l, t, r, b = box
    return im.crop((max(0, l - 8), max(0, t - 6), min(im.width, r + 8), min(im.height, b + 6)))


# ------------------------------------------------------------------ the paper's structure: sections, passages, questions, options
SEC_RE = re.compile(r'^\s*([一二三四五六七八九十]{1,3})、\s*([^（(]+?)\s*[（(]\s*占\s*(\d+)\s*分\s*[)）]')
PART_RE = re.compile(r'^\s*第[壹貳參肆伍]部分')
NOTE_RE = re.compile(r'^\s*說明\s*[:：︰]')
Q_RE = re.compile(r'^\s*(\d{1,2})\s*[.．]\s*')
GROUP_RE = re.compile(r'^\s*(?:第\s*)?(\d{1,2})\s*[至\-－~～—–]\s*(?:第\s*)?(\d{1,2})\s*題?\s*(?:為|是)?\s*題組')
OPT_RE = re.compile(r'\(([A-L]|[1-9])\)\s*|（([A-L]|[1-9])）\s*')
INLINE_TYPE = re.compile(r'[（(]\s*(單選|多選|選填|非選擇)題?\s*[)）]?\s*[，,、]?\s*[（(]?\s*(\d+)?\s*分?\s*[)）]')
PTS_RE = re.compile(r'[（(]\s*(\d+)\s*分\s*[)）]')


def sec_type(name):
    if '多選' in name:
        return 'multi'
    if '選填' in name:
        return 'fill'
    if '非選' in name or '譯' in name or '作文' in name or '寫作' in name:
        return 'open'
    if '混合' in name:
        return 'mixed'
    return 'single'


def next_label(lab):
    return str(int(lab) + 1) if lab.isdigit() else chr(ord(lab) + 1)


def split_options(toks, start=None, min_marks=2):
    """Tokens of a question → (stem tokens, [(label, option tokens)]) at the (A)/(1) markers.

    Works on the joined text, so a marker split over several runs is still found. Labels must run in
    order from `start` ((A) or (1) by default)."""
    text, owner = [], []
    for ti, t in enumerate(toks):
        if t[0] == 't':
            for ci, ch in enumerate(t[1]):
                text.append(ch)
                owner.append((ti, ci))
        else:
            text.append('\x00')
            owner.append((ti, -1))
    text = ''.join(text)
    seq = []
    for m in OPT_RE.finditer(text):
        lab = m.group(1) or m.group(2)
        if not seq:
            if lab == start or start is None and lab in ('A', '1'):
                seq.append((m.start(), m.end(), lab))
        elif lab == next_label(seq[-1][2]):
            seq.append((m.start(), m.end(), lab))
    if len(seq) < min_marks:
        return toks, []

    def piece(a, b):
        out = []
        for pos in range(a, b):
            ti, ci = owner[pos]
            t = toks[ti]
            if ci < 0:
                out.append(t)
            elif out and out[-1][0] == 't' and out[-1][3] == ti:
                out[-1] = ('t', out[-1][1] + t[1][ci], t[2], ti)
            else:
                out.append(('t', t[1][ci], t[2], ti))
        out = [x[:3] if x[0] == 't' else x for x in out]
        while out and (out[-1][0] in ('tab', 'br') or out[-1][0] == 't' and not out[-1][1].strip()):
            out.pop()
        while out and (out[0][0] in ('tab', 'br') or out[0][0] == 't' and not out[0][1].strip()):
            out.pop(0)
        return out

    stem = piece(0, seq[0][0])
    opts = [(seq[i][2], piece(seq[i][1], seq[i + 1][0] if i + 1 < len(seq) else len(text))) for i in range(len(seq))]
    return stem, opts


def build(stem):
    """One paper → {meta, items} where items are passages ('g') and questions ('q') in order."""
    kind, y, subj = stem.split('-', 2)
    m = {'kind': kind, 'y': int(y), 'subj': subj}
    media = Media()
    doc = Doc(RAW / f'{stem}-q.docx', media)
    pdf = Pdf(RAW / f'{stem}-pdf.pdf') if (RAW / f'{stem}-pdf.pdf').exists() else None
    ans = answers(RAW / f'{stem}-ans.pdf') if (RAW / f'{stem}-ans.pdf').exists() else {}
    rub_all, rub = rubric_parts(RAW / f'{stem}-rubric.pdf') if (RAW / f'{stem}-rubric.pdf').exists() else ('', {})
    body = doc.x.find(W + 'body')
    raw_blocks = []
    try:
        raw_blocks = doc.blocks(body)
    except Complex:
        raise
    # cover page: the time limit and the scoring rules, then everything from the first section on
    minutes = None
    rules = []
    start = 0
    for i, b in enumerate(raw_blocks):
        t = b['text']
        mm = re.search(r'考試時間\s*[:：]?\s*(\d+)\s*分鐘', t)
        if mm:
            minutes = int(mm.group(1))
        if PART_RE.match(t) or SEC_RE.match(t):
            start = i
            break
        if re.search(r'單選題|多選題|選填題|題組', t) and '˙' in t:
            rules.append(t.replace('˙', '').strip())
    items, secs = [], []
    sec = None
    cur = None  # the open question or passage
    expect = 1
    ref = []
    in_ref = False

    def close():
        nonlocal cur
        if cur:
            items.append(cur)
        cur = None

    for b in raw_blocks[start:]:
        t = b['text'].strip()
        if in_ref:
            ref.append(b)
            continue
        if re.match(r'^\s*參考(公式|資料)', t) or re.match(r'^\s*附表', t) and expect > 3:
            close()
            in_ref = True
            ref.append(b)
            continue
        if PART_RE.match(t) and not SEC_RE.match(t):
            close()
            mm = re.search(r'[（(]占\s*(\d+)\s*分[)）]', t)
            secs.append({'name': re.sub(r'[（(].*$', '', t).strip(), 'type': sec_type(t), 'pts': int(mm.group(1)) if mm else None, 'note': '', 'part': True})
            sec = len(secs) - 1
            continue
        sm = SEC_RE.match(t)
        if sm:
            close()
            secs.append({'name': f'{sm.group(1)}、{sm.group(2).strip()}', 'type': sec_type(sm.group(2)), 'pts': int(sm.group(3)), 'note': ''})
            sec = len(secs) - 1
            continue
        if NOTE_RE.match(t) and sec is not None and (not cur or cur['k'] == 'g' and not cur['blocks']):
            secs[sec]['note'] += t
            rm = re.search(r'第\s*(\d+)\s*題至第\s*(\d+)\s*題', t)
            if rm:
                expect = int(rm.group(1))
            continue
        gm = GROUP_RE.match(t)
        if gm:
            close()
            cur = {'k': 'g', 'from': int(gm.group(1)), 'to': int(gm.group(2)), 'blocks': [], 'sec': sec, 'head': t}
            expect = int(gm.group(1))
            continue
        # a question can start with a picture or a boxed table anchored before its number
        qm = Q_RE.match(t.lstrip('\x01\x02 \t\u3000')) if b['k'] == 'p' else None
        if qm and expect <= int(qm.group(1)) <= expect + 12 and not (cur and cur['k'] == 'q' and int(qm.group(1)) != expect and b['k'] != 'p'):
            close()
            n = int(qm.group(1))
            cur = {'k': 'q', 'n': n, 'blocks': [b], 'sec': sec}
            expect = n + 1
            continue
        if cur is None:
            # a passage without a 題組 line (英文 綜合測驗, 文意選填, 篇章結構, 閱讀測驗 put the text first)
            if not t and b['k'] == 'p' and not b['toks']:
                continue
            cur = {'k': 'g', 'from': expect, 'to': None, 'blocks': [], 'sec': sec, 'head': ''}
        cur['blocks'].append(b)
    close()
    return m, items, secs, minutes, rules, ref, ans, (rub_all, rub), media, doc, pdf


def rub_for(text, name):
    """The part of the 評分原則 about a named writing section (中譯英, 英文作文)."""
    i = text.find(name)
    if i < 0:
        return ''
    nxt = [text.find(k, i + len(name)) for k in ('中譯英', '英文作文', '作文', '第貳部分', '第參部分') if text.find(k, i + len(name)) > 0]
    return text[i:min(nxt) if nxt else i + 4000][:4000].strip()


def table_options(h):
    """(A) … options laid out in table cells (several per cell is fine)."""
    cells = re.findall(r'<td[^>]*>(.*?)</td>', h, re.S)
    out = []
    for c in cells:
        parts = re.split(r'(?:<p>)?\s*[(（]([A-L1-9])[)）]\s*', c)
        if len(parts) < 3:
            continue
        for i in range(1, len(parts) - 1, 2):
            body = re.sub(r'^(</p>)+|(<p>)+$', '', parts[i + 1].strip()).strip()
            out.append((parts[i], body))
    labs = [x[0] for x in out]
    ok = len(out) >= 2 and (labs == [chr(65 + i) for i in range(len(labs))] or labs == [str(i + 1) for i in range(len(labs))])
    return out if ok else None


def clean_q_toks(toks, n):
    """Drop the 'n.' (and the space or tab after it) from a question's first paragraph, across runs.
    Pictures or boxes anchored before the number stay in front."""
    lead = []
    toks = list(toks)
    while toks and toks[0][0] in ('img', 'box', 'math', 'tab') or toks and toks[0][0] == 't' and not toks[0][1].strip():
        lead.append(toks.pop(0))
    lead = [x for x in lead if x[0] in ('img', 'box', 'math')]
    return lead + _clean_num(toks, n)


def _clean_num(toks, n):
    out = list(toks)
    pat = re.compile(r'^\s*%d\s*[.．]\s*' % n)
    acc = ''
    for i, t in enumerate(out):
        if t[0] == 'tab':
            acc += '\t'
            continue
        if t[0] != 't':
            break
        acc += t[1]
        m = pat.match(acc)
        if m and (m.end() < len(acc) or i + 1 < len(out)):
            # remove the matched prefix from tokens 0..i
            cut = m.end()
            new = []
            used = 0
            for j, u in enumerate(out[:i + 1]):
                ln = 1 if u[0] == 'tab' else len(u[1])
                if used + ln <= cut:
                    used += ln
                    continue
                if u[0] == 't':
                    new.append(('t', u[1][max(0, cut - used):], u[2]))
                else:
                    new.append(u)
                used += ln
            out = new + out[i + 1:]
            break
        if len(acc) > 8:
            break
    while out and (out[0][0] == 'tab' or out[0][0] == 't' and not out[0][1].strip()):
        out.pop(0)
    return out


def paper(stem):
    m, items, secs, minutes, rules, ref, ans, (rub_all, rub), media, doc, pdf = build(stem)
    out_items = []
    shared_opts = {}  # passage index → options listed after it (文意選填 word bank, 篇章結構 sentences)
    complex_n = 0
    for idx, it in enumerate(items):
        sec = secs[it['sec']] if it['sec'] is not None and it['sec'] < len(secs) else {'type': 'single', 'name': ''}
        try:
            bad = next((b['complex'] for b in it['blocks'] if b.get('complex')), None)
            if bad:
                raise Complex(bad)
            if it['k'] == 'g':
                # a passage can end with a shared option list ((A)…(J))
                blocks = it['blocks']
                opts = []
                html_parts = []
                for b in blocks:
                    if b['k'] == 'tbl':
                        to = table_options(b['html'])
                        if to and len(to) >= 4:
                            opts += to
                            continue
                    if b['k'] == 'p':
                        # a shared option list: (A)…(J), maybe one per paragraph or continued on the next line
                        st, op = split_options(b['toks'], start=next_label(opts[-1][0]) if opts else None, min_marks=1)
                        if op and not tokens_text(st).strip():
                            opts += [(lab, tokens_html(o)) for lab, o in op]
                            continue
                    if opts and b['k'] == 'p' and not b['text'].strip():
                        continue
                    html_parts.append(block_html(b))
                out_items.append({'k': 'g', 'from': it['from'], 'to': it['to'], 'html': ''.join(html_parts), 'head': it['head'], 'sec': it['sec']})
                if opts:
                    out_items[-1]['opts'] = opts
                    shared_opts[len(out_items) - 1] = opts
                continue
            n = it['n']
            first = dict(it['blocks'][0])
            first['toks'] = clean_q_toks(first['toks'], n)
            toks = []
            extra_html = []
            for i, b in enumerate([first] + it['blocks'][1:]):
                if b['k'] == 'p':
                    if toks and b['toks']:
                        toks.append(('br',))
                    toks += b['toks']
                else:
                    # a table of options or a table in the stem
                    toks.append(('t', '\x03%d' % len(extra_html), ''))
                    extra_html.append(b['html'])
            stem_t, opts = split_options(toks)
            a0 = ans.get(str(n))
            if opts and a0 and a0 != '／' and re.fullmatch(r'[A-L,]+', a0) and not opts[0][0].isalpha():
                # a numbered list of statements in the stem, the real options are lettered
                stem_t, opts = split_options(toks, start='A')
            if not opts:
                # options laid out in a table: (A) … in cells
                for i, h in enumerate(extra_html):
                    to = table_options(h)
                    if to:
                        opts = to
                        extra_html[i] = ''
                        stem_t = toks
                        break
            else:
                # a table after the last option is the question's own (表4 …), not part of that option
                lab, last = opts[-1]
                cut = next((i for i, t in enumerate(last) if t[0] == 't' and '\x03' in t[1]), None)
                if cut is not None:
                    tok = last[cut]
                    j = tok[1].index('\x03')
                    keep = last[:cut] + ([('t', tok[1][:j], tok[2])] if tok[1][:j].strip() else [])
                    stem_t = list(stem_t) + [('br',), ('t', tok[1][j:], tok[2])] + last[cut + 1:]
                    opts[-1] = (lab, keep)
                opts = [(lab, tokens_html(o)) for lab, o in opts]

            def fill_tables(h):
                return re.sub('\x03(\\d+)', lambda mm: extra_html[int(mm.group(1))], h)
            stem_h = fill_tables(tokens_html(stem_t))
            opts = [(lab, fill_tables(h)) for lab, h in opts]
            if sum(1 for _, h in opts if not re.sub(r'\s', '', h)) >= 2:
                raise Complex('options are pictures')  # the labels and the pictures did not line up: show the page
            text = tokens_text(stem_t)
            itype, ipts = None, None
            im = INLINE_TYPE.search(text)
            if im:
                itype = {'單選': 'single', '多選': 'multi', '選填': 'fill', '非選擇': 'open'}[im.group(1)]
                ipts = int(im.group(2)) if im.group(2) else None
            if not ipts:
                ps = [int(x) for x in PTS_RE.findall(text + ' ' + ' '.join(re.sub('<[^>]+>', '', h) for _, h in opts))]
                if ps:
                    ipts = sum(ps)
            a = ans.get(str(n))
            cells = sorted([k for k in ans if k.startswith(f'{n}-')], key=lambda k: int(k.split('-')[1]))
            if cells:
                qtype = 'fill'
            elif itype:
                qtype = itype
            elif a in (None, '／', '-'):
                qtype = 'open' if sec['type'] in ('open', 'mixed') or a == '／' else sec['type']
            elif ',' in a or len(a) > 1 and a.isalpha():
                qtype = 'multi'
            else:
                qtype = 'multi' if sec['type'] == 'multi' else 'single'
            qi = {'k': 'q', 'n': n, 'type': qtype, 'html': stem_h, 'sec': it['sec']}
            if not opts and qtype in ('single', 'multi'):
                # options laid out as a table (a row per option) or as pictures: the buttons take their labels
                plain = re.sub(r'<[^>]+>', ' ', stem_h)
                rng = re.search(r'[(（]([A-L])[)）]\s*(?:to|至|～|~|-|—)\s*[(（]([A-L])[)）]', plain)
                seq = []
                for mm in re.finditer(r'[(（]([A-L])[)）]', plain):
                    lab = mm.group(1)
                    if not seq and lab == 'A' or seq and lab == chr(ord(seq[-1]) + 1):
                        seq.append(lab)
                if rng:
                    qi['labels'] = [chr(c) for c in range(ord(rng.group(1)), ord(rng.group(2)) + 1)]
                elif len(seq) >= 2:
                    qi['labels'] = seq
            if not re.sub(r'<[^>]+>|\s', '', stem_h) and opts:
                qi['blank'] = True  # 綜合測驗: the question is a numbered blank in the passage
            if opts:
                qi['opts'] = opts
            if qtype == 'fill' and not cells and a and a != '／':
                cells, ans[str(n) + '-1'] = [str(n) + '-1'], a  # a 選填 with one cell, keyed by the question number alone
            if qtype == 'fill':
                qi['cells'] = cells
                qi['ans'] = [ans[k] for k in cells]
            elif qtype in ('single', 'multi') and a and a != '／':
                qi['ans'] = a.replace(',', '')
            if qtype == 'open':
                qi['rubric'] = rub.get(str(n), '')
            if ipts:
                qi['pts'] = ipts
            out_items.append(qi)
        except Complex as e:
            complex_n += 1
            text = '\n'.join(b['text'] for b in it['blocks'])
            ci = {'k': it['k'], 'n': it.get('n'), 'from': it.get('from'), 'to': it.get('to'), 'sec': it['sec'], 'complex': str(e), 'head': it.get('head', ''), 'text': text}
            if it['k'] == 'q':
                n = it['n']
                a = ans.get(str(n))
                cells = sorted([k for k in ans if k.startswith(f'{n}-')], key=lambda k: int(k.split('-')[1]))
                labs = sorted(set(re.findall(r'[(（]([A-L])[)）]', text))) or sorted(set(re.findall(r'[(（]([1-9])[)）]', text)))
                im = INLINE_TYPE.search(text)
                itype = {'單選': 'single', '多選': 'multi', '選填': 'fill', '非選擇': 'open'}[im.group(1)] if im else None
                if itype == 'fill' and not cells and a and a != '／':
                    cells, ans[f'{n}-1'] = [f'{n}-1'], a
                ci['type'] = 'fill' if cells else itype or ('open' if a in (None, '／') else 'multi' if ',' in a or sec['type'] == 'multi' else 'single')
                if cells:
                    ci['cells'], ci['ans'] = cells, [ans[k] for k in cells]
                elif a and a != '／':
                    ci['ans'] = a.replace(',', '')
                if ci['type'] in ('single', 'multi'):
                    ci['labels'] = labs if len(labs) >= 2 else None
                if ci['type'] == 'open':
                    ci['rubric'] = rub.get(str(n), '')
                ps = [int(x) for x in PTS_RE.findall(text)]
                if ps:
                    ci['pts'] = sum(ps) if ci['type'] == 'open' else ps[0]
            out_items.append(ci)
    # a writing section (中譯英, 英文作文) has no question number: its text becomes one open question
    for si, sc in enumerate(secs):
        if sc['type'] != 'open' or sc.get('part') or any(x['k'] == 'q' and x.get('sec') == si for x in out_items):
            continue
        gs = [i for i, x in enumerate(out_items) if x['k'] == 'g' and x.get('sec') == si]
        if not gs:
            continue
        name = re.sub(r'^[一二三四五六七八九十]+、', '', sc['name'])
        first = out_items[gs[0]]
        qi = {'k': 'q', 'n': name, 'type': 'open', 'html': ''.join(out_items[i].get('html', '') for i in gs), 'sec': si, 'rubric': rub_for(rub_all, name)}
        if any(out_items[i].get('complex') for i in gs):
            qi = {'k': 'q', 'n': name, 'type': 'open', 'sec': si, 'complex': 'writing', 'head': first.get('head', ''), 'rubric': rub_for(rub_all, name)}
        for i in reversed(gs[1:]):
            del out_items[i]
        out_items[gs[0]] = qi
    out_items = [x for x in out_items if not (x['k'] == 'g' and 'html' in x and not re.sub(r'<[^>]+>|\s', '', x['html']) and not x.get('opts'))]
    # numbers a section declares but that have no paragraph of their own: blanks in the passage, answered from its shared options
    have = {x['n'] for x in out_items if x['k'] == 'q'}
    ranges = []
    for si, sc in enumerate(secs):
        mm = re.search(r'第\s*(\d+)\s*題至第\s*(\d+)\s*題', sc['note'])
        if mm:
            ranges.append((si, int(mm.group(1)), int(mm.group(2))))
    # a 題組 shown as a picture holds its own questions too (英文 混合題 47–50)
    for x in out_items:
        if x['k'] == 'g' and x.get('from') and x.get('to'):
            ranges.append((x.get('sec'), x['from'], x['to']))
    # and any number in the answer key still without a question, under the passage before it
    keyed = sorted({int(k.split('-')[0]) for k in ans if k.split('-')[0].isdigit()})
    have0 = {x['n'] for x in out_items if x['k'] == 'q'}
    for n in keyed:
        if n not in have0:
            prev = [x for x in out_items if x['k'] == 'q' and isinstance(x['n'], int) and x['n'] < n]
            ranges.append((prev[-1]['sec'] if prev else None, n, n))
    for si, lo, hi in ranges:
        for n in range(lo, hi + 1):
            if n in have:
                continue
            # the passage that covers it: the last one starting at or before n
            gi = max((i for i, x in enumerate(out_items) if x['k'] == 'g' and (x.get('from') or 0) <= n), default=None)
            a = ans.get(str(n))
            qi = {'k': 'q', 'n': n, 'type': 'open' if a in (None, '／') else ('multi' if ',' in a else 'single'), 'html': '', 'sec': si, 'blank': True}
            if a and a != '／':
                qi['ans'] = a.replace(',', '')
            cells = sorted([k for k in ans if k.startswith(f'{n}-')], key=lambda k: int(k.split('-')[1]))
            if cells:
                qi.update(type='fill', cells=cells, ans=[ans[k] for k in cells])
            if qi['type'] == 'open':
                qi['rubric'] = rub.get(str(n), '')
            if gi is not None and out_items[gi].get('opts'):
                qi['shared'] = gi
            pos = (gi + 1) if gi is not None else len(out_items)
            while pos < len(out_items) and out_items[pos]['k'] == 'q' and isinstance(out_items[pos]['n'], int) and out_items[pos]['n'] < n:
                pos += 1
            out_items.insert(pos, qi)
            have.add(n)
    return m, out_items, secs, minutes, rules, ref, ans, rub_all, media, doc, pdf, complex_n


# 題目分類（關鍵字估計）: 社會 → 歷史/地理/公民, 自然 → 物理/化學/生物/地科, 數學 → 單元
TOPICS = {
    '社會': {
        '歷史': '王朝 帝國 皇帝 世紀 清代 清朝 清廷 明代 明朝 宋代 唐代 漢代 秦 日治 日本統治 殖民 革命 戰爭 大戰 條約 史料 史家 古代 中古 文藝復興 宗教改革 鄭氏 荷蘭 西班牙 鴉片 甲午 冷戰 歷史 史學 王國 朝廷 科舉 拿破崙 羅馬 希臘 蒙古 鄂圖曼 君主 時期 統治 戰後 國民政府 總督 傳教士 改革 啟蒙 工業革命',
        '地理': '地形 氣候 降水 雨量 氣溫 緯度 經度 等高線 地圖 比例尺 人口 都市 聚落 產業 農業 工業 區位 河川 流域 海岸 季風 板塊 火山 地震帶 土壤 植被 遙測 GIS 地理資訊 坡度 颱風 盛行風 洋流 島嶼 沙漠 熱帶 溫帶 高原 盆地 平原 交通 觀光 能源 礦產',
        '公民': '法律 憲法 民法 刑法 行政程序 法院 法官 權利 義務 人權 國會 立法院 選舉 政黨 民主 公民 市場 需求 供給 價格 GDP 失業 通膨 貨幣 利率 稅 契約 損害賠償 訴訟 國際組織 全球化 性別 機會成本 比較利益 外部性 大法官 釋憲 公投 社會福利 社會流動 偏見 刻板印象 公共財 生產者 消費者 均衡',
    },
    '自然': {
        '物理': '速度 加速度 力 動量 能量 功 功率 電流 電壓 電阻 磁場 電場 波長 頻率 折射 反射 透鏡 光子 光電 原子核 衰變 半衰期 重力 摩擦 簡諧 單擺 熱量 溫度 壓力 浮力 電路 電荷 庫侖 牛頓 都卜勒 干涉 繞射',
        '化學': '分子 原子 莫耳 濃度 溶液 溶解 反應 化合物 元素 週期表 酸 鹼 pH 氧化 還原 電子組態 鍵結 離子 沉澱 平衡 催化 有機 聚合 碳 氫氧 燃燒 化學 試劑 滴定 同位素 混合物 晶體',
        '生物': '細胞 基因 DNA RNA 蛋白質 酵素 染色體 遺傳 演化 物種 生態 族群 群落 植物 動物 光合 呼吸作用 激素 荷爾蒙 神經 免疫 抗體 病毒 細菌 器官 組織 消化 血液 生殖 突變 微生物 生物',
        '地科': '地震 板塊 岩石 礦物 地層 化石 火山 大氣 颱風 鋒面 氣團 雲 降雨 海洋 洋流 潮汐 恆星 行星 星系 月球 太陽 日食 月食 天文 宇宙 地球 地殼 地函 斷層 冰河 溫室 臭氧',
    },
    '數學': {
        '機率統計': '機率 期望值 統計 平均 標準差 變異數 相關係數 迴歸 抽樣 信賴 骰子 抽籤 排列 組合 二項',
        '三角函數': 'sin cos tan 正弦 餘弦 正切 三角函數 弧度 角度 週期',
        '向量與坐標': '向量 內積 外積 坐標 直線 平面方程式 空間 投影 法向量 行列式',
        '數列與級數': '數列 級數 等差 等比 遞迴 公比 公差',
        '指數與對數': '指數 對數 log',
        '多項式與方程式': '多項式 方程式 根 因式 不等式 函數圖形 二次函數 拋物線',
        '矩陣': '矩陣 方陣 轉移矩陣',
        '圓錐曲線': '橢圓 雙曲線 拋物線 焦點 準線',
        '微積分': '極限 導數 微分 積分 切線斜率 反導函數',
        '幾何': '三角形 圓 面積 體積 相似 全等 外接圓 內切圓 多邊形 角平分線',
    },
}


def topic_of(subj, text):
    group = '社會' if subj in ('社會',) else '自然' if subj == '自然' else '數學' if subj.startswith('數學') else None
    if not group:
        return None
    t = text or ''
    scores = {k: sum(t.count(w) for w in ws.split()) for k, ws in TOPICS[group].items()}
    if group == '社會':
        # a year or a century is the surest sign of a history question
        scores['歷史'] += len(re.findall(r'1[0-9]{3}\s*年|西元|[一二三四五六七八九十]+\s*世紀|\d+\s*世紀', t))
    best = sorted(scores.items(), key=lambda x: -x[1])
    if not best or best[0][1] == 0 or len(best) > 1 and best[0][1] == best[1][1]:
        return None
    return best[0][0]


SUBJ_ID = {'國綜': 'chi', '英文': 'eng', '數學A': 'ma', '數學B': 'mb', '社會': 'soc', '自然': 'sci', '數學甲': 'mj', '數學乙': 'my',
           '歷史': 'his', '地理': 'geo', '公民與社會': 'civ', '物理': 'phy', '化學': 'che', '生物': 'bio'}
KIND_NAME = {'gsat': '學測', 'ast': '分科'}


def locate(pdf, items, ref_text):
    """(page, top) where each item starts in the PDF, in order."""
    marks = pdf.question_marks()
    pos, last = [], (0, 0)
    for it in items:
        p = None
        if it['k'] == 'q' and isinstance(it.get('n'), int) and not it.get('blank'):
            p = next(((m[0], m[1]) for m in marks if m[2] == it['n'] and (m[0], m[1]) > last), None)
        body = norm_text(it.get('text', '') or re.sub(r'<[^>]+>', '', it.get('html', '')))
        for probe in ([it.get('head'), body[:14], body[6:20], body[20:34]] if p is None else []):
            probe = norm_text(probe or '')[:14]
            p = pdf.find_text(probe, last) if len(probe) >= 4 else None
            if p:
                break
        if p is None and it['k'] == 'q' and isinstance(it.get('n'), str):
            p = pdf.find_text(it['n'], last)
        pos.append(p)
        if p:
            last = p
    end = pdf.find_text(ref_text, last) if ref_text else None
    return pos, end


def write(stems):
    OUT.mkdir(parents=True, exist_ok=True)
    IMG.mkdir(parents=True, exist_ok=True)
    index = json.loads((OUT / 'index.json').read_text(encoding='utf-8')) if (OUT / 'index.json').exists() else []
    index = [x for x in index if x['stem'] not in stems]
    for stem in stems:
        try:
            m, items, secs, minutes, rules, ref, ans, rub_all, media, doc, pdf, cx = paper(stem)
        except Exception as e:  # one broken paper must not stop the others
            import traceback
            print(f'{stem}: FAILED {e!r}')
            traceback.print_exc()
            continue
        ref_html = ''
        if ref and not any(b.get('complex') for b in ref):
            ref_html = ''.join(block_html(b) for b in ref)
        crops = 0
        need = [i for i, it in enumerate(items) if it.get('complex')] + ([-1] if ref and not ref_html else [])
        if need and pdf:
            pos, end = locate(pdf, items, ref[0]['text'] if ref else '')
            for i in need:
                if i == -1:
                    if end:
                        ref_imgs = pdf.crop(end, None, media)
                        ref_html = ''.join(f'<img src="{x}" class="crop" alt="">' for x in ref_imgs)
                    continue
                if not pos[i]:
                    continue
                nxt = next((p for p in pos[i + 1:] if p and p > pos[i]), end)
                imgs = pdf.crop(pos[i], nxt, media)
                if imgs:
                    items[i]['img'] = imgs
                    crops += 1
        for it in items:
            if it['k'] == 'q':
                i0 = items.index(it)
                g = next((x for x in reversed(items[:i0]) if x['k'] == 'g' and x.get('sec') == it.get('sec') and (not x.get('to') or isinstance(it['n'], int) and x.get('from', 0) <= it['n'] <= x['to'])), None)
                plain = re.sub(r'<[^>]+>', ' ', (g or {}).get('html', '') + ' ' + (g or {}).get('text', '') + ' ' + it.get('html', '')) + ' ' + ' '.join(re.sub(r'<[^>]+>', ' ', h) for _, h in it.get('opts', [])) + ' ' + it.get('text', '')
                tp = topic_of(m['subj'], plain)
                if not tp and m['subj'] in ('英文', '國綜') and it.get('sec') is not None and it['sec'] < len(secs) and not secs[it['sec']].get('part'):
                    tp = re.sub(r'^[一二三四五六七八九十]+、', '', secs[it['sec']]['name'])
                if tp:
                    it['topic'] = tp
        for it in items:
            # plain text only where it is needed: the AI prompt of a 非選擇題 shown as a picture
            if it['k'] == 'g' or it.get('type') != 'open':
                it.pop('text', None)
        missing = [it.get('n') or it.get('from') for it in items if it.get('complex') and not it.get('img')]
        sid = f"{m['kind']}-{m['y']}-{SUBJ_ID.get(m['subj'], m['subj'])}"
        data = {'id': sid, 'kind': m['kind'], 'y': m['y'], 'subj': m['subj'], 'min': minutes, 'rules': rules, 'secs': secs,
                'items': items, 'ref': ref_html, 'rubric': rub_all}
        (OUT / f'{sid}.js').write_text('window.examLoaded(' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ');\n', encoding='utf-8')
        for fn, b in media.files.items():
            f = IMG / fn
            if not f.exists():
                f.write_bytes(b)
        qs = [it for it in items if it['k'] == 'q']
        cats = {}
        for x in qs:
            if x.get('topic') and x.get('type') != 'open':
                cats[x['topic']] = cats.get(x['topic'], 0) + 1
        index.append({'stem': stem, 'id': sid, 'kind': m['kind'], 'y': m['y'], 'subj': m['subj'], 'min': minutes, 'n': len(qs), 'cats': cats,
                      'auto': sum(1 for x in qs if x.get('type') in ('single', 'multi', 'fill') and x.get('ans')), 'open': sum(1 for x in qs if x.get('type') == 'open')})
        # every number in the answer key must be a question here
        keyed = {int(k.split('-')[0]) for k in ans if k.split('-')[0].isdigit()}
        found = {x['n'] for x in qs if isinstance(x.get('n'), int)}
        lost = sorted(keyed - found)
        print(f"{stem}: {len(qs)} questions, {cx} complex → {crops} cropped, no picture {missing}, not found {lost}, math {doc.math_ok}/{doc.math_ok + doc.math_img}, {len(media.files)} pictures")
    index.sort(key=lambda x: (x['kind'] != 'gsat', -x['y'], list(SUBJ_ID).index(x['subj']) if x['subj'] in SUBJ_ID else 99))
    (OUT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=0), encoding='utf-8')


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--debug':
        for stem in args[1:]:
            m, items, secs, *_ = paper(stem)
            for i in items:
                print(i.get('k'), i.get('n') or i.get('from'), i.get('type'), i.get('ans'), i.get('complex', ''), re.sub('<[^>]+>', '', i.get('html', ''))[:60])
    else:
        stems = args or sorted({f.name.rsplit('-', 1)[0] for f in RAW.glob('*-q.docx')})
        write(stems)
