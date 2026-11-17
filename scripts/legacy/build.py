import sys, os, json, re, glob, csv, collections
sys.path.insert(0,os.path.dirname(__file__))
from parse import parse
SP=sys.argv[1]; OUT=sys.argv[2]; TPL=sys.argv[3]
DL=SP+"/dl"
GROUPS={"A":"資訊","B":"工程","C":"數理化","D":"醫藥衛生","E":"生命科學","F":"生物資源","G":"地球環境","H":"建築設計","I":"藝術","J":"社會心理","K":"大眾傳播","L":"外語","M":"文史哲","N":"教育","O":"法政","P":"管理","Q":"財經","R":"遊憩運動","S":"其他"}
groups=json.load(open(DL+"/groups/groups.json"))
code_groups=collections.defaultdict(set)
for g,names in groups.items():
    for n,codes in names.items():
        for c in codes: code_groups[c].add(g)
# 115 cutoffs
SUBMAP=[("數學A","數A"),("數學B","數B"),("國文","國"),("英文","英"),("社會","社"),("自然","自"),("數A","數A"),("數B","數B"),("國","國"),("英","英"),("社","社"),("自","自")]
def parse_cut(raw):
    raw=raw or ""
    m0=re.match(r"^(.*?(?:\)|國|英|社|自|文|會|然|數A|數B|學A|學B))([0-9lIi|S$Oo]+)$",raw)
    if m0:
        tail=m0.group(2)
        tail=re.sub(r"^S(?=\d)","",tail)
        tail=tail.translate(str.maketrans("lIi|S$Oo","11118800"))
        raw=m0.group(1)+tail
    m=re.fullmatch(r"\(?(.+?)\)?(\d+(?:\.\d+)?)",raw or "")
    if not m: return None,None
    body=m.group(1).replace("+","").replace("(","").replace(")","")
    subs=[]; i=0
    while i<len(body):
        for a,b in SUBMAP:
            if body.startswith(a,i): subs.append(b); i+=len(a); break
        else: return None,float(m.group(2))
    v=float(m.group(2)); v=int(v) if v.is_integer() else v
    if not subs or len(set(subs))!=len(subs) or v>15*len(subs): return None,v
    return subs,v
p115=collections.defaultdict(list)
VER=SP+"/verify/out"
def mkcuts(raws):
    out=[]
    for raw in raws:
        subj,v=parse_cut(raw)
        out.append({"raw":raw,"subj":subj,"v":v})
    return out
for f in sorted(glob.glob(VER+"/*.json")):
    rows=json.load(open(f))
    for r in rows:
        if not r.get("major") and r.get("instrument"): r["major"]=r["instrument"]
        if not r.get("major"):
            m=re.search(r"主修樂器[:：\s]*([^;；,，\s]+)",r.get("note") or "")
            if m: r["major"]=m.group(1)
        code=r["code"]; L=p115[code]
        same=[x for x in L if x["name"]==r.get("name") and x["gender"]==(r.get("gender") or "無")]
        if r.get("major") and same:
            same[0].setdefault("majors",[]).append({"major":r["major"],"quota":r.get("quota"),"mult":r.get("mult",{}),"cut":mkcuts(r.get("cuts",[]))})
            continue
        e={"name":r.get("name"),"quota":r.get("quota"),"gender":r.get("gender") or "無","mult":r.get("mult",{}),
           "cut":mkcuts(r.get("cuts",[])),"table":r.get("table"),"note":r.get("note") or ""}
        if r.get("major"): e["majors"]=[{"major":r["major"],"quota":r.get("quota"),"mult":r.get("mult",{}),"cut":e["cut"]}]
        L.append(e)
import difflib
def norm(n): return re.sub(r"[\s．‧.・:：,，、]","",(n or "").replace("（","(").replace("）",")").replace("Ｂ","B").replace("Ａ","A"))
def similar(a,b): return difflib.SequenceMatcher(None,norm(a),norm(b)).ratio()
by_school=collections.defaultdict(list)
for code,L in p115.items():
    for x in L: by_school[code[:3]].append(dict(x,code=code))
def diffcost(a,b):
    sm=difflib.SequenceMatcher(None,norm(a),norm(b))
    return sum(max(i2-i1,j2-j1) for t,i1,i2,j1,j2 in sm.get_opcodes() if t!="equal")
MATCH={}; WHY={}
def core(n): return re.sub(r"(學士學位學程|學士班|學系|學程|系)","",norm(n))
def build_matches(depts):
    cands=[]
    for d in depts:
        for i,x in enumerate(by_school.get(d["code"][:3],[])):
            if not x["name"]: continue
            c=diffcost(x["name"],d["dept"])
            if c<=max(1,len(norm(d['dept']))//10):
                g=0 if (d["gender"] in ("男","女") and x["gender"]==d["gender"]) else 1
                cands.append((c,g,d["code"],(d["code"][:3],i)))
    cands.sort()
    used=set()
    def take(code,key,via=None):
        x=by_school[key[0]][key[1]]; used.add(key)
        MATCH[code]={k:x.get(k) for k in ("code","gender","cut","mult","quota","name","majors","table","note")}
        MATCH[code]["code115"]=MATCH[code].pop("code")
        if via: MATCH[code]["via"]=via
    for c,g,code,key in cands:
        if code in MATCH or key in used: continue
        take(code,key)
    # same department, different 組: base names (before 組/parentheses) identical, same special-track markers
    SPECIAL=("公費","青年儲蓄","原住民","APCS","資安","全英","國際","外加")
    def base(n):
        n=norm(n); n=re.sub(r"\([^)]*\)","",n)
        m=re.match(r"(.*?(學士學位學程|學士班|學程|學系|系))",n)
        return m.group(1) if m else n
    def marks(n): return tuple(k for k in SPECIAL if k in norm(n))
    for d in depts:
        if d["code"] in MATCH: continue
        best=None
        for i,x in enumerate(by_school.get(d["code"][:3],[])):
            if not x["name"] or not x["cut"] and not x["mult"]: pass
            if not x["name"]: continue
            if base(x["name"])==base(d["dept"]) and marks(x["name"])==marks(d["dept"]):
                r=difflib.SequenceMatcher(None,norm(x["name"]),norm(d["dept"])).ratio()
                if not best or r>best[0]: best=(r,i)
        if best:
            take(d["code"],(d["code"][:3],best[1]),via=f"同系去年的「{by_school[d['code'][:3]][best[1]]['name']}」")
    # renames stated in the 116 簡章 備註 (the old name appears in the notes)
    for d in depts:
        if d["code"] in MATCH: continue
        txt=norm((d.get("notes") or "")+(d.get("review_notes") or ""))
        hits=[]
        for i,x in enumerate(by_school.get(d["code"][:3],[])):
            if not x["name"] or marks(x["name"])!=marks(d["dept"]): continue
            if norm(x["name"]) in txt and len(norm(x["name"]))>=4: hits.append((len(norm(x["name"])),i))
        if hits:
            hits.sort(reverse=True); i=hits[0][1]
            take(d["code"],(d["code"][:3],i),via=f"簡章備註寫明由去年的「{by_school[d['code'][:3]][i]['name']}」更名或整併")
    for d in depts:
        if d["code"] in MATCH: continue
        cand=None
        for i,x in enumerate(by_school.get(d["code"][:3],[])):
            if (d["code"][:3],i) in used or not x["name"]: continue
            if marks(x["name"])!=marks(d["dept"]): continue
            r=difflib.SequenceMatcher(None,base(x["name"]),base(d["dept"])).ratio()
            if r>=0.75 and (not cand or r>cand[0]): cand=(r,x["name"])
        WHY[d["code"]]="116 新設或改名，115 沒有同名的申請入學校系"+(f"（去年可能對應「{cand[1]}」，請自己確認）" if cand else "")
def pick115(code,dept,gender): return MATCH.get(code)
depts=[]; bad=[]
for f in sorted(glob.glob(DL+"/detail/*.htm")):
    try: d=parse(open(f,encoding="utf-8").read())
    except Exception as e: bad.append((f,str(e))); continue
    depts.append(d)
schools=sorted(set(d["school"] for d in depts))
build_matches(depts)
# full dataset
full=[]
for d in depts:
    x=dict(d); x["groups"]=[GROUPS[g] for g in sorted(code_groups.get(d["code"],[]))]
    x["ref115_sieve"]=pick115(d["code"],d["dept"],d["gender"]); x["ref115_why"]=WHY.get(d["code"])
    x["official_url"]=f"https://www.cac.edu.tw/apply116/system/ColQry_116ApplyxForStudent_F75reOza/html/116_{d['code']}.htm"
    full.append(x)
os.makedirs(OUT,exist_ok=True)
# CSV flat
cols=["code","school","dept","groups","quota","expected_interviewees","gender","sat_first_stage","sat_percent","stage2","arts_exam_percent","review_items","review_notes","interview_date","doc_deadline","result_date","fee","tiebreak_screen","notes","ref115_cutoffs","official_url"]
with open(OUT+"/departments_116.csv","w",newline="",encoding="utf-8-sig") as fh:
    w=csv.writer(fh); w.writerow(cols)
    for x in full:
        sat="; ".join(f"{s['subject']}[檢定{s['threshold'] or '-'} 倍率{s['screen_multiple'] or '-'} 採計{s['weight'] or '-'}]" for s in x["sat_subjects"])
        st2="; ".join(f"{i['item']} {i['percent']}%" for i in x["stage2_items"])
        ref=" > ".join(c["raw"] for c in x["ref115_sieve"]["cut"]) if x["ref115_sieve"] else ""
        w.writerow([x["code"],x["school"],x["dept"],"、".join(x["groups"]),x["quota"],x["expected_interviewees"],x["gender"],sat,x["sat_percent"],st2,
            (x.get("arts_exam") or {}).get("percent"),x.get("review_items"),x.get("review_notes"),x["interview_date"],x["doc_deadline"],x["result_date"],x["fee"],x["tiebreak_screen"],x["notes"],ref,x["official_url"]])
# page data (compact)
SINGLE={"國文":"國","英文":"英","數學A":"數A","數學B":"數B","社會":"社","自然":"自"}
def fnum(v):
    try: return float(v)
    except: return v
for d in full:
    r=d["ref115_sieve"]
    if not r: continue
    m116={}
    for x in d["sat_subjects"]:
        if x["screen_multiple"]: m116[SINGLE.get(x["subject"],"組合")]=fnum(x["screen_multiple"])
    m115={k:fnum(v) for k,v in (r.get("mult") or {}).items() if k in ("國","英","數A","數B","社","自","組合")}
    r["screen_changed"]=bool(m115) and m115!=m116
json.dump({"source":"大學甄選入學委員會 116學年度大學申請入學 校系分則","fetched":"2026-11-10","count":len(full),"departments":full},open(OUT+"/departments_116.json","w"),ensure_ascii=False,indent=1)
def special(d):
    n=d["dept"]; t=(d.get("notes") or "")
    if "青年儲蓄帳戶" in n: return "青年儲蓄帳戶組（限參加青年儲蓄帳戶計畫的學生）"
    if "公費" in n: return "公費生（畢業後要分發服務）"
    if "原住民" in n: return "原住民專班或名額"
    if "運動專長" in n: return "運動專長組"
    if re.search(r"(飛鳶|展翼|薪火招生|嘉星招生|興翼招生|成星招生|晨光招生|日葵聯合招生|揚鷹招生|旭日招生|政星招生|希望組)",n) or re.search(r"限(定)?經濟(或文化)?不利",t):
        return "經濟或文化不利學生專屬組別"
    return None
page=[]
for d in full:
    page.append({"c":d["code"],"s":d["school"],"d":d["dept"],"g":sorted(code_groups.get(d["code"],[])),"q":d["quota"],"n":d["expected_interviewees"],
      "sat":[{"su":s["subject"],"th":s["threshold"],"m":s["screen_multiple"],"w":s["weight"]} for s in d["sat_subjects"]],
      "satp":d["sat_percent"],"st2":[{"i":i["item"],"th":i["threshold"],"p":i["percent"]} for i in d["stage2_items"]],
      "arts":d.get("arts_exam"),"rv":d.get("review_items"),"rn":d.get("review_notes"),"iv":d.get("interview_notes"),
      "idate":d["interview_date"],"ndate":d["notice_date"],"ddl":d["doc_deadline"],"rdate":d["result_date"],"fee":d["fee"],
      "ties":d["tiebreak_screen"],"tiet":d["tiebreak_total"],"notes":d["notes"],"gen":d["gender"],"p115":d["ref115_sieve"],"p115why":d.get("ref115_why"),"sp":special(d)})
SOURCES="資料來源：大學甄選入學委員會 116 學年度校系分則（2026-11-10 抓取）；115 學年度各校系篩選標準一覽表（甄選會只提供圖片，每一格都讀兩次並互相核對）。五標預設為 115 學測，116 學測五標公布後請在左邊更新。"
STD={"國":[13,12,10,9,7],"英":[13,11,8,5,3],"數A":[12,10,8,5,4],"數B":[11,9,5,3,2],"社":[13,12,10,8,7],"自":[13,12,9,7,5]}
import statistics
def selectivity(r):
    if not r or not r["cut"]: return None
    vals=[c["v"]/len(c["subj"]) for c in r["cut"] if c["subj"] and c["v"] is not None]
    return round(sum(vals)/len(vals),1) if vals else None
bys=collections.defaultdict(list)
for x in page:
    x["sel"]=selectivity(x["p115"])
    if x["sel"] is not None and not x["sp"]: bys[x["s"]].append(x["sel"])
smed={k:statistics.median(v) for k,v in bys.items() if len(v)>=3}
order=sorted(smed,key=lambda k:-smed[k])
srank={k:i+1 for i,k in enumerate(order)}
for x in page:
    x["ssel"]=round(smed[x["s"]],1) if x["s"] in smed else None
    x["srank"]=srank.get(x["s"])
print("school ranking top10:",[(k,round(smed[k],1)) for k in order[:10]])
print("bottom5:",[(k,round(smed[k],1)) for k in order[-5:]])
data={"meta":{"schools":len(schools),"ranked":len(order),"fetched":"2026-11-10","sources":SOURCES},"groups":GROUPS,"std115":STD,"departments":page}
s=json.dumps(data,ensure_ascii=False,separators=(",",":")).replace("</","<\\/")
html=open(TPL,encoding="utf-8").read().replace("/*__DATA__*/",s)
open(OUT+"/filter.html","w",encoding="utf-8").write(html)
print("screen changed",sum(1 for d in page if d["p115"] and d["p115"].get("screen_changed")))
print("via",sum(1 for d in page if d["p115"] and d["p115"].get("via")),"none",sum(1 for d in page if not d["p115"]))
nog=sum(1 for d in page if not d["g"]); n115=sum(1 for d in page if d["p115"])
print("depts",len(page),"schools",len(schools),"bad",len(bad),"no group",nog,"with115",n115,"unparsed cuts",sum(1 for d in page if d["p115"] and any(c["subj"] is None for c in d["p115"]["cut"])))
for b in bad[:5]: print(b)
