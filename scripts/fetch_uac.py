"""Download the 116 分發入學 校系分則 from the official query system (考分會 uac2.ncku.edu.tw/cross_search).

One page per 系組; only the 校系分則 table and the school name are kept, in
data/raw/uac116/detail_tables.jsonl.gz (one JSON line per page). Polite: one request at a time, short pauses.
Run: python3 scripts/fetch_uac.py   (then python3 scripts/parse_uac.py)
"""
import gzip, json, os, re, subprocess, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "raw", "uac116", "detail_tables.jsonl.gz")
BASE = "https://uac2.ncku.edu.tw/cross_search/index.php?c=search&m="


def post(m, data, jar):
    args = ["curl", "-s", "-m", "60", "-b", jar, "-c", jar, "-X", "POST", BASE + m]
    for k, v in data.items():
        args += ["--data-urlencode", f"{k}={v}"]
    for t in range(4):
        r = subprocess.run(args, capture_output=True)
        if r.returncode == 0 and len(r.stdout) > 5000:
            return r.stdout.decode("utf-8", "ignore")
        time.sleep(2 + 3 * t)
    return ""


def keep(page):
    """The school name line and the 校系分則 table of a detail page."""
    t = re.search(r'<table border="1".*?</table>', page, re.S)
    sch = re.search(r"您設定的查詢條件.*?</p>(.*?)重新查詢", page, re.S)
    return {"head": re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", sch.group(1))).strip() if sch else "", "table": t.group(0) if t else ""}


def main():
    jar = "/tmp/uac_cookies.txt"
    home = subprocess.run(["curl", "-s", "-c", jar, "https://uac2.ncku.edu.tw/cross_search/"], capture_output=True).stdout.decode("utf-8", "ignore")
    i = home.find('id="school_id"')
    schools = re.findall(r"value='(\d{3})'>([^<]+)<", home[i:home.find("</select>", i)])
    ids = []
    for sid, _ in schools:
        h = post("result_school", {"D1": "0", "D2": "0", "school_name": sid, "department_cnam": "00000", "my_search": "校系查詢"}, jar)
        ids += [e for e in re.findall(r'data-eid="(\d+)"', h) if e not in ids]
        time.sleep(0.3)
    with gzip.open(OUT, "wt", encoding="utf-8") as f:
        for e in ids:
            f.write(json.dumps({"eid": e, **keep(post("detail", {"dep_id": e}, jar))}, ensure_ascii=False) + "\n")
            time.sleep(0.3)
    print(len(ids), "pages ->", OUT)


if __name__ == "__main__":
    main()
