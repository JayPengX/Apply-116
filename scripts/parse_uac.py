"""Parse the official 分發入學 sources into data/official/uac116.json.

Inputs (downloaded from official sites, kept in data/raw/):
  uac116/detail_tables.jsonl.gz   考分會 116 校系分則查詢系統 (uac2.ncku.edu.tw/cross_search), one 系組 per line
                                  (scripts/fetch_uac.py)
  uac115/115_result_school_data.pdf 考分會 115 各系組最低錄取標準及錄取人數一覽表
  ceec115ast/p22.xls              大考中心 115 分科測驗 各科級分人數百分比累計表 (60 級分)
  ceec115ast/p24.xls              大考中心 115 學測(使用於分發入學)各科級分人數百分比累計表 (60 級分)
  ceec115ast/p26.xls              大考中心 115 分科測驗 各科成績標準一覽表

Needs: pip install xlrd ; poppler-utils (pdftotext)
"""
import gzip, html, json, os, re, subprocess
import xlrd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "official")

# Subject keys: 學測 keep the app's keys; 分科 get their own.
SUBJ = {"國文": "國", "英文": "英", "數學A": "數A", "數學B": "數B", "社會": "社", "自然": "自",
        "數學甲": "數甲", "數學乙": "數乙", "歷史": "歷", "地理": "地", "公民與社會": "公", "物理": "物", "化學": "化", "生物": "生",
        "音樂": "音", "美術": "美", "體育": "體"}
SHORT115 = {"國": "國", "英": "英", "數A": "數A", "數B": "數B", "社": "社", "自": "自", "數甲": "數甲", "數乙": "數乙",
            "歷": "歷", "地": "地", "公": "公", "物": "物", "化": "化", "生": "生", "音": "音", "美": "美", "體": "體", "術": "術"}
LEVELS = ["頂標", "前標", "均標", "後標", "底標"]


def clean(t):
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"[\s　]+", "", t)


def subj_key(name):
    name = name.replace(" ", "")
    if name not in SUBJ:
        raise ValueError("unknown subject " + name)
    return SUBJ[name]


def parse_detail(rec):
    tab = rec["table"]
    if not tab:
        return None
    rows = re.findall(r"<tr>(.*?)</tr>", tab, re.S)
    first = re.findall(r"<td[^>]*>(.*?)</td>", rows[1], re.S)
    name, code, quota = clean(first[0]), clean(first[1]), clean(first[2])
    # 檢定: each <li> is one condition; 「或」 joins the 數學 A/B pair
    th = []
    lis = re.findall(r"<li>(.*?)(?=<li>|</ol>)", first[5], re.S)
    for li in lis:
        t = clean(li)
        if not t or t in ("---", "--"):
            continue
        alts = []
        for part in t.split("或"):
            mm = re.match(r"(.+?)\((.+?)\)$", part)
            if not mm:
                raise ValueError(f"{code} 檢定 {t}")
            k, lv = mm.group(1), mm.group(2)
            if k == "英聽":
                alts.append({"k": "聽", "t": lv.replace("Ａ", "A").replace("Ｂ", "B").replace("Ｃ", "C").replace("級", "")})
            else:
                assert lv in LEVELS, (code, t)
                alts.append({"k": subj_key(k), "t": lv})
        th.append(alts)
    # 採計 rows: 「國　文(學測) x 1.50」 + 同分參酌 order
    use = []
    for r in rows[1:]:
        tds = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)
        for i, td in enumerate(tds):
            t = clean(td)
            mm = re.match(r"(.+?)\((學測|分科|術科)\)x(\d\.\d\d)$", t)
            if mm:
                order = clean(tds[i + 1]) if i + 1 < len(tds) else ""
                use.append({"k": subj_key(mm.group(1)), "x": mm.group(2), "w": float(mm.group(3)), "o": int(order) if order.isdigit() else None})
    note = clean(first[-1]) if len(first) > 8 else ""
    return {"c": code, "n": name, "q": int(quota) if quota.isdigit() else None, "th": th, "use": use, "note": note}


def school_of(rec):
    return rec["head"].split("-", 1)[0].strip() if "-" in rec["head"] else None


def parse_result115():
    pdf = os.path.join(RAW, "uac115", "115_result_school_data.pdf")
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout
    out = {}
    lines = txt.splitlines()
    data = re.compile(r"^\d{4}\s")
    for i, line in enumerate(lines):
        m = re.match(r"^(\d{4})\s+(\S+)\s+(?:(?!\S*x\d\.\d\d)(\S+)\s+)?((?:\S+x\d\.\d\d\s+)+)\s*(\d+)\s+([\d.]+|-+)(.*)$", line)
        if not m:
            continue
        code, sch, name, ws, n, cut, rest = m.groups()
        if not name:  # a long name wraps around the data line: the line above holds its start, the line below its end
            above = lines[i - 1].strip() if i and not data.match(lines[i - 1]) else ""
            below = lines[i + 1].strip() if i + 1 < len(lines) and not data.match(lines[i + 1]) else ""
            name = above + below
        w = [{"k": SHORT115[a], "w": float(b)} for a, b in re.findall(r"(\S+?)x(\d\.\d\d)", ws)]
        tie = re.findall(r"(國|英|數A|數B|社|自|數甲|數乙|歷|地|公|物|化|生)\s+(\d+)", rest.split("-----")[0] if "-----" in rest else rest[:30])
        out[code] = {"s": sch, "n": name, "use": w, "adm": int(n), "cut": float(cut) if cut[0].isdigit() else None, "tie": [[a, int(b)] for a, b in tie]}
    return out


def parse_cum(path, first_col_name):
    """{subject_key: {級分: [count, at_or_above]}} for a 60-級分 cumulative table (2 subjects per block)."""
    out = {}
    b = xlrd.open_workbook(path)
    for sh in b.sheets():
        r = 0
        while r < sh.nrows:
            if str(sh.cell_value(r, 0)).strip() == "級分":
                heads = [(c, str(sh.cell_value(r, c)).strip()) for c in range(1, sh.ncols) if str(sh.cell_value(r, c)).strip()]
                rr = r + 3
                while rr < sh.nrows and str(sh.cell_value(rr, 0)).strip().isdigit():
                    lv = int(str(sh.cell_value(rr, 0)).strip())
                    for c, name in heads:
                        k = SUBJ[name.replace(" ", "")]
                        cnt, above = sh.cell_value(rr, c), sh.cell_value(rr, c + 4)
                        if cnt != "":
                            out.setdefault(k, {})[lv] = [int(cnt), int(above)]
                    rr += 1
                r = rr
            else:
                r += 1
    return out


def parse_std(path):
    b = xlrd.open_workbook(path)
    sh = b.sheets()[0]
    out = {}
    for r in range(sh.nrows):
        n = str(sh.cell_value(r, 0)).strip().replace(" ", "")
        if n in SUBJ:
            out[SUBJ[n]] = dict(zip(LEVELS, [int(sh.cell_value(r, c)) for c in range(1, 6)]))
    return out


def main():
    depts = []
    with gzip.open(os.path.join(RAW, "uac116", "detail_tables.jsonl.gz"), "rt", encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            d = parse_detail(rec)
            if d:
                d["s"] = school_of(rec)
                depts.append(d)
    depts.sort(key=lambda d: d["c"])
    res = parse_result115()
    ast = parse_cum(os.path.join(RAW, "ceec115ast", "p22.xls"), "數學甲")
    gsat60 = parse_cum(os.path.join(RAW, "ceec115ast", "p24.xls"), "國文")
    std = parse_std(os.path.join(RAW, "ceec115ast", "p26.xls"))
    json.dump({"depts": depts, "r115": res, "ast": ast, "gsat60": gsat60, "astStd": std}, open(os.path.join(OUT, "uac116.json"), "w"), ensure_ascii=False)
    print(len(depts), "116 系組;", len(res), "115 系組;", "分科", sorted(ast), "學測60", sorted(gsat60), "五標", sorted(std))


if __name__ == "__main__":
    main()
