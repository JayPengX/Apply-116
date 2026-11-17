"""Build the compact data file the app embeds: build/app-data.json

Sources (see README "資料來源"):
  data/source/departments_116.json   116 校系分則 (甄選會) + 115 一階篩選結果 (double-read, verified)
  data/official/*.json               parsed by scripts/parse_official.py from official CEEC / CAC files

This script also applies reviewed corrections to the 115→116 matching (see MATCH_FIXES).
"""
import json, os, re, difflib, unicodedata, collections, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "source")
OFF = os.path.join(ROOT, "data", "official")
OUT = os.path.join(ROOT, "build")
os.makedirs(OUT, exist_ok=True)

SUBJ = {"國文": "國", "英文": "英", "數學A": "數A", "數學B": "數B", "社會": "社", "自然": "自", "英聽": "聽"}
ORDER = ["國", "英", "數A", "數B", "社", "自"]

# 115→116 pairs the old fuzzy matcher accepted as "same name" but that are different departments.
# Reviewed by hand on 2026-11-17 against the official 115 分發標準一覽表 names.
# Bump when any source data changes (kept fixed so builds are reproducible).
DATA_VERSION = "2026-11-17"

MATCH_FIXES_REMOVE = {
    ("033", "體育學系(公費生)"): "115 申請入學沒有「體育學系(公費生)」（舊比對誤配到「教育學系(公費生)」，已移除）",
    ("035", "教育學系(公費生)"): "115 申請入學沒有「教育學系(公費生)」（舊比對誤配到「體育學系(公費生)」，已移除）",
    ("056", "中國音樂學系擦弦組"): "115 申請入學沒有「擦弦組」（舊比對誤配到「彈弦組」，是不同樂器組，已移除）",
}

# School main-campus city (校本部). Department names that state a campus override this.
CITY = {
    "001": "臺北市", "002": "臺北市", "003": "臺中市", "004": "臺南市", "005": "臺北市", "006": "臺北市",
    "007": "高雄市", "008": "桃園市", "009": "臺中市", "011": "新竹市", "012": "臺中市", "013": "新竹市",
    "014": "新北市", "015": "臺中市", "016": "桃園市", "017": "臺北市", "018": "臺中市", "019": "臺北市",
    "020": "新北市", "021": "基隆市", "022": "高雄市", "023": "彰化縣", "026": "臺中市", "027": "高雄市",
    "028": "臺北市", "030": "桃園市", "031": "臺中市", "032": "臺北市", "033": "臺南市", "034": "花蓮縣",
    "035": "臺北市", "036": "屏東縣", "038": "臺東縣", "039": "桃園市", "040": "桃園市", "041": "嘉義縣",
    "042": "彰化縣", "044": "新北市", "045": "高雄市", "046": "臺北市", "047": "臺北市", "050": "臺北市",
    "051": "臺南市", "056": "新北市", "058": "南投縣", "059": "嘉義縣", "060": "臺中市", "063": "臺南市",
    "065": "新竹市", "079": "新北市", "099": "新北市", "100": "嘉義市", "101": "高雄市", "108": "花蓮縣",
    "109": "臺北市", "110": "桃園市", "112": "臺南市", "113": "臺南市", "130": "宜蘭縣", "134": "臺中市",
    "150": "宜蘭縣", "151": "苗栗縣", "152": "新北市", "153": "金門縣",
}
REGION = {
    "北": ["臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "宜蘭縣"],
    "中": ["苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣"],
    "南": ["嘉義市", "嘉義縣", "臺南市", "高雄市", "屏東縣"],
    "東": ["花蓮縣", "臺東縣"],
    "離島": ["金門縣", "澎湖縣", "連江縣"],
}
CAMPUS = [("臺北校區", "臺北市"), ("台北校區", "臺北市"), ("桃園校區", "桃園市"), ("高雄校區", "高雄市")]

SPECIAL = [  # (category, regex on dept name)
    ("青儲", r"青年儲蓄帳戶"),
    ("扶弱", r"希望組|晨光招生|向日葵|薪火招生|興翼招生|成星招生|政星招生|飛鳶組|展翼組|薪傳組|韶光組"),
    ("公費", r"公費"),
]


def norm(s):
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub(r"[\s\-_–．‧.・()]", "", s).replace("學系", "系").replace("覧", "覽")
    return s


def num(x):
    if x in (None, "", "--", "-"):
        return None
    try:
        v = float(str(x).replace("*", ""))
        return int(v) if v.is_integer() else v
    except ValueError:
        return None


def parse_subject_key(name):
    """'國英數A自' -> ['國','英','數A','自']; '英文' -> ['英']"""
    if name in SUBJ:
        return [SUBJ[name]]
    out, i = [], 0
    while i < len(name):
        for tok in ("數A", "數B", "國", "英", "社", "自"):
            if name.startswith(tok, i):
                out.append(tok)
                i += len(tok)
                break
        else:
            return None
    return out


APCS = {"APCS識讀": "識", "APCS實作": "實", "程式識讀": "識", "程式實作": "實"}


def parse_cut(c):
    raw = c["raw"]
    if c.get("subj"):
        return {"raw": raw, "s": c["subj"], "v": c["v"]}
    body = re.sub(r"[\d.]+$", "", raw).strip("()")
    parts = body.split("+")
    if all(p in APCS for p in parts):
        return {"raw": raw, "s": [APCS[p] for p in parts], "v": c["v"], "apcs": 1}
    return {"raw": raw, "s": None, "v": c["v"]}  # 術科 (music / art / PE)


def date_list(s):
    """'116.5.14 至 116.5.15' / '116.5.14 116.5.16' -> ['05-14','05-15'] (ranges expanded)"""
    s = s or ""
    out = []
    toks = re.findall(r"116\.(\d{1,2})\.(\d{1,2})|(至)", s)
    prev = None
    rng = False
    for m, d, z in toks:
        if z:
            rng = True
            continue
        cur = datetime.date(2027, int(m), int(d))
        if rng and prev:
            x = prev + datetime.timedelta(days=1)
            while x <= cur:
                out.append(x)
                x += datetime.timedelta(days=1)
        else:
            out.append(cur)
        prev = cur
        rng = False
    return sorted(set(x.strftime("%m-%d") for x in out))


def main():
    src = json.load(open(os.path.join(SRC, "departments_116.json")))
    depts = src["departments"]
    pct = json.load(open(os.path.join(OFF, "ceec115_pct.json")))
    stds = json.load(open(os.path.join(OFF, "ceec_standards.json")))["standards"]
    entr = json.load(open(os.path.join(OFF, "cac115_entrance.json")))["depts"]
    vul = set(json.load(open(os.path.join(OFF, "cac116_vulnerable.json")))["codes"])

    names115 = collections.defaultdict(list)
    for code, e in entr.items():
        names115[code[:3]].append((code, e["name"]))

    schools = {}
    out = []
    fixes = []
    for r in depts:
        sid = r["code"][:3]
        schools.setdefault(sid, r["school"])
        name = r["dept"]
        # ---- 116 subjects
        subs = []
        for s in r["sat_subjects"]:
            if s["subject"] == "--":  # 不參採學測 (術科校系)
                continue
            parts = parse_subject_key(s["subject"])
            if parts is None and s["subject"] != "英聽":
                raise SystemExit("unknown subject " + s["subject"])
            k = "聽" if s["subject"] == "英聽" else "".join(parts)
            subs.append({"k": k, "p": None if k == "聽" else parts, "t": s["threshold"],
                         "m": num(s["screen_multiple"]), "w": num(s["weight"])})
        arts = None
        if r.get("arts_exam"):
            items = []
            for it in r["arts_exam"]["items"]:
                if it["item"] in APCS:
                    t = num((it["threshold"] or "").replace("級", ""))
                    subs.append({"k": "APCS" + APCS[it["item"]], "p": [APCS[it["item"]]], "t": t,
                                 "m": num(it["screen_multiple"]), "w": num(it["weight"]), "apcs": 1})
                else:
                    items.append({"i": it["item"], "t": None if it["threshold"] in (None, "--") else it["threshold"],
                                  "m": num(it["screen_multiple"]) or (None if it["screen_multiple"] in (None, "--") else it["screen_multiple"]),
                                  "w": num(it["weight"])})
            if items:
                arts = {"items": items, "p": r["arts_exam"].get("percent")}
        # ---- 115 reference
        ref = r["ref115_sieve"]
        why = r["ref115_why"]
        if ref and (sid, name) in MATCH_FIXES_REMOVE:
            why = MATCH_FIXES_REMOVE[(sid, name)]
            fixes.append((r["code"], name, ref["name"]))
            ref = None
        r115 = None
        if ref:
            via = ref.get("via")
            if not via and norm(ref["name"]) != norm(name):
                via = f"名稱相近的去年「{ref['name']}」（不是完全同名，請自行確認是否同一系組）"
            e = entr.get(ref["code115"])
            entrance = None
            if e:
                entrance = [{"g": x["gender"], "a": x["arts"], "s": x["std"]} for x in e["rows"] if x["cat"] == "招生"]
            r115 = {
                "code": ref["code115"], "name": ref["name"], "via": via, "q": ref["quota"],
                "mult": {k: num(v) for k, v in ref["mult"].items()},
                "cut": [parse_cut(c) for c in ref["cut"]],
                "chg": bool(ref.get("screen_changed")), "table": ref.get("table"),
                "majors": [{"major": m["major"], "q": m.get("quota"), "cut": [parse_cut(c) for c in m["cut"]]}
                           for m in (ref.get("majors") or [])] or None,
                "gender": ref.get("gender"), "entr": entrance,
                "note": ref.get("note") or "",
            }
        near = None
        if not r115:
            cands = sorted(((difflib.SequenceMatcher(None, norm(n), norm(name)).ratio(), c, n)
                            for c, n in names115[sid]), reverse=True)
            base = norm(re.sub(r"[(（][^)）]*[)）]", "", name))
            same_base = [n for score, c, n in cands if norm(re.sub(r"[(（][^)）]*[)）]", "", n)) == base]
            near = (same_base or [n for score, c, n in cands if score >= 0.85])[:2] or None
        city = CITY[sid]
        for tag, cty in CAMPUS:
            if tag in name:
                city = cty
        cats = [c for c, rx in SPECIAL if re.search(rx, name)]
        if arts:
            cats.append("術科")
        if any(s.get("apcs") for s in subs):
            cats.append("APCS")
        out.append({
            "c": r["code"], "sid": sid, "n": name, "g": r["groups"], "q": r["quota"], "ei": r["expected_interviewees"],
            "gen": r["gender"], "sub": subs, "arts": arts, "sp": r["sat_percent"],
            "st2": [{"i": x["item"], "p": x["percent"], "t": x["threshold"]} for x in r["stage2_items"]],
            "rv": r["review_items"], "rn": r["review_notes"], "iv": r["interview_notes"],
            "idate": r["interview_date"], "idays": date_list(r["interview_date"]),
            "dd": r["doc_deadline"], "rd": r["result_date"], "fee": r["fee"],
            "tbS": r["tiebreak_screen"], "tbT": r["tiebreak_total"], "notes": r["notes"],
            "url": r["official_url"], "city": city, "cats": cats, "vul": r["code"] in vul,
            "extra": {k: r[k] for k in ("indigenous_extra", "offshore_extra", "vision_extra") if r[k] not in (None, "無", "--", 0)},
            "r115": r115, "why": why if not r115 else None, "near": near,
        })

    school_list = [{"id": k, "n": v, "pub": bool(re.match(r"^(國立|臺北市立|高雄市立|市立)", v)), "city": CITY[k]}
                   for k, v in sorted(schools.items())]
    std = {y: v for y, v in stds.items() if int(y) >= 113}
    data = {
        "built": DATA_VERSION,
        "fetched116": src.get("fetched"),
        "schools": school_list,
        "regions": REGION,
        "std": std,
        "pct": pct["tables"],
        "depts": out,
    }
    path = os.path.join(OUT, "app-data.json")
    json.dump(data, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    print("depts", len(out), "with 115 ref", sum(1 for d in out if d["r115"]), "fixes", fixes,
          "size", os.path.getsize(path) // 1024, "KB")


if __name__ == "__main__":
    main()
