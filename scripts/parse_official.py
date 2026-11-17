"""Parse the official machine-readable sources into JSON.

Inputs (all downloaded from official sites, kept in data/raw/):
  ceec115/p22.xls  大考中心 115學測 各科級分人數百分比累計表
  ceec115/p23.xls  大考中心 115學測 2至4科不同科目組合級分人數百分比累計表
  ceec115/p26.xls  大考中心 各科成績標準一覽表 (五標, 111-115)
  cac115_entrance/standard_*.html  甄選會 115 申請入學 各校系分發標準一覽表
  cac116/116apply_help_vulnerable.pdf  甄選會 116 訂有扶助弱勢招生措施校系一覽表

Outputs: data/official/*.json

Needs: pip install xlrd ; poppler-utils (pdftotext)
"""
import json, os, re, glob, html, subprocess, sys
import xlrd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "official")
os.makedirs(OUT, exist_ok=True)

SHORT = {"國文": "國", "英文": "英", "數學A": "數A", "數學B": "數B", "社會": "社", "自然": "自"}
ORDER = ["國", "英", "數A", "數B", "社", "自"]


def combo_key(names):
    ks = [SHORT[n] for n in names]
    return "".join(sorted(ks, key=ORDER.index))


def parse_pct(path):
    """Return {combo_key: {level: [count_at_this_level, count_at_or_above]}}."""
    out = {}
    book = xlrd.open_workbook(path)
    for sh in book.sheets():
        r = 0
        while r < sh.nrows:
            if str(sh.cell_value(r, 0)).strip() == "級分":
                heads = [(c, str(sh.cell_value(r, c)).strip()) for c in range(1, sh.ncols) if str(sh.cell_value(r, c)).strip()]
                rr = r + 3
                rows = []
                while rr < sh.nrows and str(sh.cell_value(rr, 0)).strip() != "":
                    rows.append(rr)
                    rr += 1
                for c, name in heads:
                    key = combo_key(name.split("、"))
                    tab = {}
                    for x in rows:
                        lv = int(float(sh.cell_value(x, 0)))
                        tab[lv] = [int(sh.cell_value(x, c)), int(sh.cell_value(x, c + 4))]
                    out[key] = tab
                r = rr
            else:
                r += 1
    return out


def parse_std(path):
    """五標 per year: {year: {subject_short: {頂標: lv, ...}}}"""
    book = xlrd.open_workbook(path)
    sh = book.sheet_by_index(0)
    subj_cols = {}
    for c in range(sh.ncols):
        v = str(sh.cell_value(1, c)).strip()
        if v in SHORT:
            subj_cols[SHORT[v]] = c
    out = {}
    year = None
    for r in range(3, sh.nrows):
        y = sh.cell_value(r, 0)
        if isinstance(y, float):
            year = int(y)
        if year is None or year < 111:  # 111 起才分數A/數B
            continue
        lab = str(sh.cell_value(r, 1)).strip()
        if lab not in ("頂標", "前標", "均標", "後標", "底標") or year is None:
            continue
        for s, c in subj_cols.items():
            v = sh.cell_value(r, c)
            if v == "":
                continue
            out.setdefault(year, {}).setdefault(s, {})[lab] = int(float(v))
    return out


def parse_entrance():
    rows = {}
    for fn in sorted(glob.glob(os.path.join(RAW, "cac115_entrance", "standard_*.html"))):
        t = open(fn, encoding="utf-8", errors="ignore").read()
        cur = None
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S | re.I):
            tds = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", x))).strip()
                   for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)]
            if not tds:
                continue
            if re.fullmatch(r"\d{6}", tds[0]):
                cur = (tds[0], tds[1])
                rest = tds[2:]
            elif cur and len(tds) == 6 and tds[0] == "" and tds[1] == "":
                rest = tds[2:]  # continuation row (other gender / quota category)
            elif cur and len(tds) == 4:
                rest = tds
            else:
                continue
            if len(rest) != 4:
                continue
            cat, arts, gender, std = rest
            e = rows.setdefault(cur[0], {"name": cur[1], "rows": []})
            e["rows"].append({"cat": cat, "arts": arts, "gender": gender, "std": std})
    return rows


def parse_vulnerable():
    pdf = os.path.join(RAW, "cac116", "116apply_help_vulnerable.pdf")
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
    return sorted(set(re.findall(r"^\s*\d{3}\s+\S+\s+(\d{6})\s", txt, re.M)))


def main():
    pct = parse_pct(os.path.join(RAW, "ceec115", "p22.xls"))
    pct.update(parse_pct(os.path.join(RAW, "ceec115", "p23.xls")))
    std = parse_std(os.path.join(RAW, "ceec115", "p26.xls"))
    entr = parse_entrance()
    vul = parse_vulnerable()
    json.dump({"source": "大考中心 115學年度學科能力測驗 各科級分人數百分比累計表、2至4科不同科目組合級分人數百分比累計表",
               "url": "https://www.ceec.edu.tw/xmdoc/cont?xsmsid=0J018604485538810196&sid=0Q056289672991900264",
               "note": "每個級分: [該級分人數, 該級分以上累計人數]", "tables": pct},
              open(os.path.join(OUT, "ceec115_pct.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"source": "大考中心 各科成績標準一覽表", "standards": std},
              open(os.path.join(OUT, "ceec_standards.json"), "w"), ensure_ascii=False, indent=1)
    json.dump({"source": "甄選會 115學年度大學申請入學招生 各校系分發標準一覽表",
               "url": "https://www.cac.edu.tw/cacportal/apply_his_report/115/115_entrance_standard/standard_index.php",
               "depts": entr},
              open(os.path.join(OUT, "cac115_entrance.json"), "w"), ensure_ascii=False, indent=0)
    json.dump({"source": "甄選會 116學年度大學「申請入學」訂有扶助弱勢招生措施校系一覽表 (2026-11-03)",
               "codes": vul}, open(os.path.join(OUT, "cac116_vulnerable.json"), "w"), ensure_ascii=False)
    print("pct combos", len(pct), "std years", sorted(std), "entrance", len(entr), "vulnerable", len(vul))


if __name__ == "__main__":
    main()
