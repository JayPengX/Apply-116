import re, sys, json
from bs4 import BeautifulSoup
def lines(td):
    if td is None: return []
    for br in td.find_all("br"): br.replace_with("\n")
    return [l.strip() for l in td.get_text().split("\n")]
def txt(td):
    if td is None: return ""
    return re.sub(r"[ \t\r\f\v]+"," ",td.get_text("\n")).strip()
def label_val(soup,label):
    for td in soup.find_all("td"):
        t=re.sub(r"\s+","",td.get_text())
        if t==label:
            n=td.find_next_sibling("td")
            return txt(n)
    return None
def pct(s):
    m=re.search(r"(\d+(?:\.\d+)?)%",s or "")
    return float(m.group(1)) if m else None
def parse(html):
    s=BeautifulSoup(html,"html.parser")
    d={}
    d["school"]=s.find(class_="colname").get_text(strip=True)
    d["dept"]=s.find(class_="gsdname").get_text(strip=True)
    codetd=None
    for td in s.find_all("td"):
        if td.get_text(strip=True)=="校系代碼": codetd=td;break
    row=codetd.find_parent("tr"); tds=row.find_all("td",recursive=False)
    d["code"]=tds[1].get_text(strip=True)
    rest=tds[2:]
    tie=rest[-1]; cols=rest[:-1]
    subj=lines(cols[0]); chk=lines(cols[1]); mult=lines(cols[2]); wt=lines(cols[3])
    d["sat_subjects"]=[]
    for i,su in enumerate(subj):
        if not su: continue
        g=lambda a: (a[i] if i<len(a) else "--")
        d["sat_subjects"].append({"subject":su,"threshold":None if g(chk)=="--" else g(chk),
            "screen_multiple":None if g(mult)=="--" else g(mult),"weight":None if g(wt)=="--" else g(wt)})
    d["sat_percent"]=pct(cols[4].get_text())
    items=[x for x in lines(cols[5]) if x]; ichk=lines(cols[6]); ipct=lines(cols[7])
    d["stage2_items"]=[{"item":it,"threshold":None if (ichk[i] if i<len(ichk) else "--")=="--" else ichk[i],
        "percent":pct(ipct[i] if i<len(ipct) else "")} for i,it in enumerate(items)]
    if len(cols)>8:
        ts=lines(cols[8]); tc=lines(cols[9]) if len(cols)>9 else []; tm=lines(cols[10]) if len(cols)>10 else []
        tw=lines(cols[11]) if len(cols)>11 else []
        d["arts_exam"]={"items":[{"item":x,"threshold":(tc[i] if i<len(tc) else None),"screen_multiple":(tm[i] if i<len(tm) else None),"weight":(tw[i] if i<len(tw) else None)} for i,x in enumerate(ts) if x],
            "percent":pct(cols[12].get_text()) if len(cols)>12 else None}
    d["tiebreak_total"]=" ".join(x for x in lines(tie) if x)
    for k,lab in [("quota","招生名額"),("gender","性別要求"),("expected_interviewees","預計甄試人數"),
                  ("indigenous_extra","原住民外加名額"),("offshore_extra","離島外加名額"),("vision_extra","願景計畫外加名額"),
                  ("fee","指定項目甄試費"),("notice_date","寄發(或公告)指定項目甄試通知"),("doc_deadline","繳交資料截止"),
                  ("interview_date","指定項目甄試日期"),("result_date","榜示"),("recheck_deadline","總成績複查截止"),
                  ("tiebreak_screen","同級分(分數)超額篩選方式"),("notes","備註")]:
        v=label_val(s,lab)
        d[k]=re.sub(r"\s*\n\s*"," ",v) if v else v
    for k in ("quota","expected_interviewees","fee"):
        try: d[k]=int(d[k])
        except: pass
    # review data
    rv=None
    for td in s.find_all("td"):
        if "項目：" in td.get_text() and not td.find("td"):
            rv=td; break
    if rv:
        divs=rv.find_all("div",recursive=False) or []
        t=rv.get_text("\n")
        m=re.search(r"項目：\s*(.*?)(?:※|說明：)",t,re.S); d["review_items"]=re.sub(r"\s+"," ",m.group(1)).strip() if m else None
        m=re.search(r"說明：\s*(.*)",t,re.S); d["review_notes"]=re.sub(r"\s*\n\s*"," ",m.group(1)).strip() if m else None
    # 甄試說明
    for td in s.find_all("td"):
        if re.sub(r"\s+","",td.get_text())=="甄試說明":
            n=td.find_next_sibling("td"); d["interview_notes"]=re.sub(r"\s*\n\s*"," ",txt(n)) if n else None; break
    t=s.get_text("\n")
    m=re.search(r"術科說明：(.*?)(?:寄發|\Z)",t,re.S)
    if m: d["arts_notes"]=re.sub(r"\s+"," ",m.group(1)).strip()
    return d
if __name__=="__main__":
    for f in sys.argv[1:]:
        print(json.dumps(parse(open(f,encoding="utf-8").read()),ensure_ascii=False,indent=1))
