"""MathType equations (OLE "Equation.DSMT4" objects in .docx) → MathML.

The 大考中心 papers write every formula with MathType. Each one is an OLE compound file whose
"Equation Native" stream holds MTEF 5 (MathType's documented binary format). This reads it and
writes MathML, which browsers render as real text (small, sharp, zoomable). Anything it does not
understand raises Unsupported, and the caller uses the equation's picture instead.

MTEF 5 reference: MathType SDK, "MTEF v.5 (MathType 4.0 and later)".
"""
import struct
from html import escape


class Unsupported(Exception):
    pass


# ------------------------------------------------------------------ OLE compound file (just enough to read one stream)
def cfb_stream(data, want):
    if data[:8] != b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        raise Unsupported('not an OLE file')
    ss = 1 << struct.unpack_from('<H', data, 0x1E)[0]
    mss = 1 << struct.unpack_from('<H', data, 0x20)[0]
    nfat, dir_start = struct.unpack_from('<II', data, 0x2C)
    cutoff, mf_start, n_mf, di_start, n_di = struct.unpack_from('<IIIII', data, 0x38)
    difat = list(struct.unpack_from('<109I', data, 0x4C))
    sec = lambda i: data[(i + 1) * ss:(i + 2) * ss]
    while n_di and di_start < 0xFFFFFFFA:
        v = struct.unpack('<%dI' % (ss // 4), sec(di_start))
        difat += v[:-1]
        di_start = v[-1]
        n_di -= 1
    fat = []
    for s in difat[:nfat]:
        fat += struct.unpack('<%dI' % (ss // 4), sec(s))

    def chain(start, table):
        out, seen = [], set()
        while start < 0xFFFFFFFA and start not in seen and start < len(table):
            seen.add(start)
            out.append(start)
            start = table[start]
        return out

    d = b''.join(sec(i) for i in chain(dir_start, fat))
    entries = []
    for o in range(0, len(d), 128):
        n = struct.unpack_from('<H', d, o + 64)[0]
        name = d[o:o + max(0, n - 2)].decode('utf-16le', 'replace')
        start, size = struct.unpack_from('<II', d, o + 116)
        entries.append((name, d[o + 66], start, size))
    root = entries[0]
    mini = b''.join(sec(i) for i in chain(root[2], fat))
    minifat = []
    for s in chain(mf_start, fat):
        minifat += struct.unpack('<%dI' % (ss // 4), sec(s))
    for name, typ, start, size in entries:
        if typ == 2 and name == want:
            if size < cutoff:
                return b''.join(mini[i * mss:(i + 1) * mss] for i in chain(start, minifat))[:size]
            return b''.join(sec(i) for i in chain(start, fat))[:size]
    raise Unsupported('no stream ' + want)


# ------------------------------------------------------------------ MTEF 5 records → a small tree
class R:
    def __init__(self, b):
        self.b, self.i = b, 0

    def u8(self):
        if self.i >= len(self.b):
            raise Unsupported('truncated')
        v = self.b[self.i]
        self.i += 1
        return v

    def u16(self):
        v = struct.unpack_from('<H', self.b, self.i)[0]
        self.i += 2
        return v

    def cstr(self):
        j = self.b.index(b'\0', self.i)
        s = self.b[self.i:j]
        self.i = j + 1
        return s

    def nudge(self, opts):
        if opts & 0x08:
            dx, dy = self.u8(), self.u8()
            if dx == 128 and dy == 128:
                self.i += 4


def parse(eq_native):
    hdr = struct.unpack_from('<H', eq_native, 0)[0]
    r = R(eq_native[hdr:])
    if r.u8() != 5:
        raise Unsupported('MTEF version')
    r.i += 4  # platform, product, version, subversion
    r.cstr()  # application key
    r.u8()  # equation options
    return objlist(r)


def skip_nibbles(r, count):
    """EQN_PREFS sizes/spaces: `count` dimensions, each nibbles ending in 0xF."""
    done, hi = 0, True
    cur = None
    while done < count:
        if hi:
            cur = r.u8()
            n = cur >> 4
        else:
            n = cur & 0xF
        hi = not hi
        if n == 0xF:
            done += 1


def objlist(r):
    out = []
    while True:
        tag = r.u8()
        if tag == 0:
            return out
        node = record(r, tag)
        if node is not None:
            out.append(node)


def record(r, tag):
    if tag == 1:  # LINE
        o = r.u8()
        r.nudge(o)
        if o & 0x04:
            r.u16()
        if o & 0x02:
            if r.u8() != 7:
                raise Unsupported('ruler')
            record(r, 7)
        if o & 0x01:
            return {'t': 'line', 'items': []}
        return {'t': 'line', 'items': objlist(r)}
    if tag == 2:  # CHAR
        o = r.u8()
        r.nudge(o)
        tf = r.u8() - 128
        code = None if o & 0x20 else r.u16()
        if o & 0x04:
            r.u8()
        if o & 0x10:
            r.u16()
        emb = []
        if o & 0x01:
            for e in objlist(r):
                if e.get('t') == 'emb':
                    emb.append(e['k'])
        return {'t': 'char', 'tf': tf, 'c': code, 'emb': emb, 'fn': bool(o & 0x02)}
    if tag == 3:  # TMPL
        o = r.u8()
        r.nudge(o)
        sel = r.u8()
        v = r.u8()
        if v & 0x80:
            v = (v & 0x7F) | (r.u8() << 8)
        r.u8()  # template-specific options
        return {'t': 'tmpl', 'sel': sel, 'var': v, 'subs': objlist(r)}
    if tag == 4:  # PILE
        o = r.u8()
        r.nudge(o)
        r.u8(); r.u8()
        if o & 0x02:
            if r.u8() != 7:
                raise Unsupported('ruler')
            record(r, 7)
        return {'t': 'pile', 'lines': [x for x in objlist(r) if x['t'] in ('line', 'pile')]}
    if tag == 5:  # MATRIX
        o = r.u8()
        r.nudge(o)
        r.u8(); r.u8(); r.u8()
        rows, cols = r.u8(), r.u8()
        r.i += ((rows + 1) * 2 + 7) // 8 + ((cols + 1) * 2 + 7) // 8
        return {'t': 'matrix', 'rows': rows, 'cols': cols, 'items': objlist(r)}
    if tag == 6:  # EMBELL
        o = r.u8()
        r.nudge(o)
        return {'t': 'emb', 'k': r.u8()}
    if tag == 7:  # RULER
        n = r.u8()
        r.i += 3 * n
        return None
    if tag == 8:  # FONT_STYLE_DEF
        r.u8(); r.u8()
        return None
    if tag == 9:  # SIZE
        a = r.u8()
        if a == 101:
            r.u16()
        elif a == 100:
            r.u8(); r.u16()
        else:
            r.u8()
        return None
    if 10 <= tag <= 14:  # FULL, SUB, SUB2, SYM, SUBSYM
        return None
    if tag == 15:  # COLOR
        r.u8()
        return None
    if tag == 16:  # COLOR_DEF
        o = r.u8()
        r.i += 8 if o & 1 else 6
        if o & 4:
            r.cstr()
        return None
    if tag == 17:  # FONT_DEF
        r.u8()
        r.cstr()
        return None
    if tag == 18:  # EQN_PREFS
        r.u8()
        skip_nibbles(r, r.u8())
        skip_nibbles(r, r.u8())
        for _ in range(r.u8()):
            if r.u8():
                r.u8()
        return None
    if tag == 19:  # ENCODING_DEF
        r.cstr()
        return None
    if tag >= 100:
        r.i += r.u16()
        return None
    raise Unsupported('record %d' % tag)


# ------------------------------------------------------------------ tree → MathML
OPS = set('+-−=<>≤≥≠≈≡±∓×÷·∙∘/\\|∣∥∦⊥∠∡△▵°′″‴%:;,!?⇒⇔→←↔⟹⟺⊂⊃⊆⊇∈∉∋∩∪∖∅∀∃¬∧∨∼~≅≃∝∞∴∵…⋯⋮⋱()[]{}⟨⟩⌊⌋⌈⌉')
FENCES = {0: '⟨⟩', 1: '()', 2: '{}', 3: '[]', 4: '||', 5: '‖‖', 6: '⌊⌋', 7: '⌈⌉', 8: '[[', 9: '[]', 10: '][', 11: '[)', 12: '(]'}
BIG = {16: '∑', 17: '∏', 18: '∐', 19: '⋃', 20: '⋂', 22: '∑'}
SPACE = {0xEF00: '0.05em', 0xEF01: '0.1em', 0xEF02: '0.17em', 0xEF03: '0.28em', 0xEF04: '1em', 0xEF05: '0', 0xEF06: '0', 0xEF07: '0', 0xEF08: '0.1em'}
# MT Extra and other private-use codes seen in the papers, with their Unicode
PUA = {0xEB00: '⇀', 0xEB01: '↼', 0xEB02: '⇁', 0xEB03: '↽', 0xEC00: '⋯', 0xEC01: '⋮', 0xEC02: '⋰', 0xEC03: '⋱', 0xEB06: '⌒', 0xEB05: '⌒',
       0xF8E7: '―', 0xEE04: '′', 0xEE05: '″', 0xEB08: '→', 0xEB0A: '←'}
EMB = {2: ('over', '˙'), 3: ('over', '¨'), 4: ('over', '⃛'), 5: ('sup', '′'), 6: ('sup', '″'), 7: ('pre', '‵'), 8: ('over', '~'), 9: ('over', '^'),
       11: ('over', '→'), 12: ('over', '←'), 13: ('over', '↔'), 14: ('over', '⇀'), 15: ('over', '↼'), 16: ('over', '¯'), 17: ('over', '¯'), 18: ('sup', '‴'), 19: ('over', '⌢'), 20: ('over', '⌣')}


def ch(code):
    if code is None:
        raise Unsupported('no MTCode')
    if 0xE000 <= code <= 0xF8FF:
        if code in PUA:
            return PUA[code]
        raise Unsupported('PUA %04X' % code)
    return chr(code)


class W:
    def __init__(self):
        self.warn = []

    def line(self, node):
        if node is None or node['t'] == 'line' and not node['items']:
            return '<mrow></mrow>'
        if node['t'] == 'pile':
            return self.pile(node)
        if node['t'] != 'line':
            return self.items([node])
        return self.items(node['items'])

    def pile(self, node):
        rows = ''.join(f'<mtr><mtd>{self.line(l)}</mtd></mtr>' for l in node['lines'])
        return f'<mtable columnalign="left">{rows}</mtable>'

    def items(self, items):
        out = []  # list of MathML strings
        buf = []  # pending run of same-kind characters: (kind, text)
        def flush():
            if not buf:
                return
            kind = buf[0][0]
            text = ''.join(t for _, t in buf)
            if kind == 'mn':
                out.append(f'<mn>{escape(text)}</mn>')
            elif kind == 'fn':
                out.append(f'<mi mathvariant="normal">{escape(text)}</mi>')
            elif kind == 'text':
                out.append(f'<mtext>{escape(text)}</mtext>')
            buf.clear()
        for it in items:
            t = it['t']
            if t == 'char':
                if it['tf'] == 24 or (it['c'] in SPACE):
                    flush()
                    w = SPACE.get(it['c'], '0.2em')
                    if w != '0':
                        out.append(f'<mspace width="{w}"/>')
                    continue
                if it['tf'] == 23:  # marker
                    continue
                c = ch(it['c'])
                kind = self.kind(it, c)
                if kind in ('mn', 'fn', 'text') and not it['emb']:
                    if buf and buf[0][0] != kind:
                        flush()
                    buf.append((kind, c))
                    continue
                flush()
                out.append(self.embell(self.token(kind, c, it), it['emb']))
            elif t == 'tmpl':
                flush()
                if it['sel'] in (27, 28, 29):
                    base = out.pop() if out else '<mrow></mrow>'
                    out.append(self.script(base, it))
                else:
                    out.append(self.tmpl(it))
            elif t == 'pile':
                flush()
                out.append(self.pile(it))
            elif t == 'matrix':
                flush()
                out.append(self.matrix(it))
            elif t == 'line':
                flush()
                out.append(self.line(it))
        flush()
        return out[0] if len(out) == 1 else '<mrow>' + ''.join(out) + '</mrow>'

    def kind(self, it, c):
        tf = it['tf']
        if tf == 1 or tf == 12:
            return 'text'
        if c.isdigit() or c == '.' and tf in (2, 8):
            return 'mn'
        if c in OPS or tf in (6, 11, 22) and not c.isalpha():
            return 'mo'
        if tf == 2:
            return 'fn'
        if tf == 7:
            return 'vec'
        if tf == 5 or '\u0391' <= c <= '\u03a9':  # capital Greek stands upright (ΔABC)
            return 'ucg'
        return 'mi'

    def token(self, kind, c, it=None):
        e = escape(c)
        if kind == 'mo':
            return f'<mo>{e}</mo>'
        if kind == 'mn':
            return f'<mn>{e}</mn>'
        if kind == 'vec':
            return f'<mi mathvariant="bold">{e}</mi>'
        if kind == 'ucg':
            return f'<mi mathvariant="normal">{e}</mi>'
        if kind == 'text':
            return f'<mtext>{e}</mtext>'
        if kind == 'fn':
            return f'<mi mathvariant="normal">{e}</mi>'
        return f'<mi>{e}</mi>'

    def embell(self, base, emb):
        for k in emb:
            if k == 10:  # "not": a slash through the character
                base = base.replace('</mo>', '̸</mo>').replace('</mi>', '̸</mi>')
                continue
            if k not in EMB:
                raise Unsupported('embell %d' % k)
            where, c = EMB[k]
            if where == 'over':
                base = f'<mover accent="true">{base}<mo>{c}</mo></mover>'
            elif where == 'sup':
                base = f'<msup>{base}<mo>{c}</mo></msup>'
            else:
                base = f'<mrow><mo>{c}</mo>{base}</mrow>'
        return base

    def slots(self, it, n):
        """The first n line/pile subobjects of a template, and the characters after them."""
        lines = [s for s in it['subs'] if s['t'] in ('line', 'pile')]
        chars = [s for s in it['subs'] if s['t'] == 'char']
        while len(lines) < n:
            lines.append(None)
        return lines, chars

    def script(self, base, it):
        lines, _ = self.slots(it, 2)
        sub, sup = lines[0], lines[1]
        has = lambda x: x is not None and not (x['t'] == 'line' and not x['items'])
        if it['sel'] == 27 or (has(sub) and not has(sup)):
            return f'<msub>{base}{self.line(sub)}</msub>'
        if it['sel'] == 28 or (has(sup) and not has(sub)):
            return f'<msup>{base}{self.line(sup)}</msup>'
        return f'<msubsup>{base}{self.line(sub)}{self.line(sup)}</msubsup>'

    def tmpl(self, it):
        sel = it['sel']
        lines, chars = self.slots(it, 3)
        main = self.line(lines[0])
        if sel in FENCES and sel not in (10, 11) or sel in (8, 9):
            l, r = FENCES.get(sel, '()')
            if len(chars) >= 2:
                l, r = ch(chars[0]['c']), ch(chars[1]['c'])
            elif len(chars) == 1:
                c = ch(chars[0]['c'])
                if it['var'] & 1 and not it['var'] & 2:
                    l, r = c, ''
                elif it['var'] & 2 and not it['var'] & 1:
                    l, r = '', c
            else:
                if it['var'] & 3 == 1:
                    r = ''
                elif it['var'] & 3 == 2:
                    l = ''
            mo = lambda x: f'<mo fence="true" stretchy="true">{escape(x)}</mo>' if x else ''
            return f'<mrow>{mo(l)}{main}{mo(r)}</mrow>'
        if sel == 10:  # root: [radicand][index]
            idx = lines[1]
            if idx is None or idx['t'] == 'line' and not idx['items']:
                return f'<msqrt>{main}</msqrt>'
            return f'<mroot>{main}{self.line(idx)}</mroot>'
        if sel == 11:  # fraction
            return f'<mfrac>{main}{self.line(lines[1])}</mfrac>'
        if sel == 12:
            return f'<mrow class="unl">{main}</mrow>'
        if sel == 13:
            return f'<mrow class="ovl">{main}</mrow>'  # a line over a segment name: CSS, since system fonts cannot stretch an accent
        if sel == 14:  # arrow with text above / below
            a = ch(chars[0]['c']) if chars else '→'
            return f'<munderover><mo stretchy="true">{escape(a)}</mo>{self.line(lines[0])}{self.line(lines[1])}</munderover>'
        if sel == 15 or sel == 21:  # integrals: [main][lower][upper][∫]
            op = ch(chars[0]['c']) if chars else '∫'
            return f'<mrow><msubsup><mo>{escape(op)}</mo>{self.line(lines[1])}{self.line(lines[2])}</msubsup>{main}</mrow>'
        if sel in BIG:
            op = ch(chars[0]['c']) if chars else BIG[sel]
            return f'<mrow><munderover><mo>{escape(op)}</mo>{self.line(lines[1])}{self.line(lines[2])}</munderover>{main}</mrow>'
        if sel == 23:  # lim: [main][lower][upper]
            return f'<munderover>{main}{self.line(lines[1])}{self.line(lines[2])}</munderover>'
        if sel in (24, 25):  # horizontal brace / bracket with a label
            b = ch(chars[0]['c']) if chars else ('⏟' if sel == 24 else '⎵')
            return f'<munder><munder>{main}<mo stretchy="true">{escape(b)}</mo></munder>{self.line(lines[1])}</munder>'
        if sel == 31:  # vector arrow over
            return f'<mover accent="true">{main}<mo stretchy="true">→</mo></mover>'
        if sel == 32:
            return f'<mover accent="true">{main}<mo stretchy="true">~</mo></mover>'
        if sel == 33:
            return f'<mover accent="true">{main}<mo stretchy="true">^</mo></mover>'
        if sel == 34:  # arc
            return f'<mover accent="true">{main}<mo stretchy="true">⌒</mo></mover>'
        if sel == 37:
            return f'<mrow class="bx">{main}</mrow>'
        if sel == 36:
            return f'<mrow class="strike">{main}</mrow>'
        raise Unsupported('template %d' % sel)

    def matrix(self, it):
        cells = [x for x in it['items'] if x['t'] in ('line', 'pile')]
        rows, cols = it['rows'], it['cols']
        if len(cells) < rows * cols:
            raise Unsupported('matrix')
        trs = ''.join('<mtr>' + ''.join(f'<mtd>{self.line(cells[r * cols + c])}</mtd>' for c in range(cols)) + '</mtr>' for r in range(rows))
        return f'<mtable>{trs}</mtable>'


def to_mathml(ole_bytes):
    """OLE bytes of an Equation.DSMT4 object → '<math>…</math>'. Raises Unsupported."""
    native = cfb_stream(ole_bytes, 'Equation Native')
    tree = parse(native)
    w = W()
    body = w.items(tree)
    return f'<math>{body}</math>'
