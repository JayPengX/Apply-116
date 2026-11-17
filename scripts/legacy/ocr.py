import os; os.environ["OMP_THREAD_LIMIT"]="1"
import sys, json, re
import numpy as np
from PIL import Image
import pytesseract
from multiprocessing import Pool

def groups(idx):
    out=[]
    for i in idx:
        if out and i-out[-1][1]<=2: out[-1][1]=i
        else: out.append([i,i])
    return out

# cell index -> kind. layout: 0 code,1 gender,2 name,3 quota,4-10 檢定(國英數A數B社自英聽),11-17 倍率(國英數A數B社自組合),18-23 cutoffs,24 同級分
def kind(i):
    if i==0 or 11<=i<=17: return "num"
    if i in (1,) or 4<=i<=10 or 18<=i<=23: return "zh"
    return None

def ocr_cell(g,k):
    d=g<110
    if d.sum()<15: return ""
    ys,xs=np.where(d)
    if ys.max()-ys.min()<6 and (xs.max()-xs.min())<40: return "--"
    sub=g[max(ys.min()-6,0):ys.max()+7, max(xs.min()-6,0):xs.max()+7]
    im=Image.fromarray(sub.astype(np.uint8))
    im=im.resize((im.width*3,im.height*3),Image.LANCZOS).point(lambda v:0 if v<150 else 255)
    if k=="num":
        cfg="--psm 7 -c tessedit_char_whitelist=0123456789."
        t=pytesseract.image_to_string(im,lang="eng",config=cfg)
    else:
        lines=len(groups([i for i in range(sub.shape[0]) if (sub[i]<110).any()]))
        t=pytesseract.image_to_string(im,lang="chi_tra",config="--psm "+("7" if lines<=1 else "6"))
    return re.sub(r"\s+","",t)

G=None
def init(path):
    global G
    G=np.array(Image.open(path).convert("L")).astype(np.int16)
def job(a):
    y0,y1,x0,x1,k=a
    return ocr_cell(G[y0+2:y1-1,x0+2:x1-1],k)

def process(path):
    a=np.array(Image.open(path).convert("L")).astype(np.int16); dark=a<100
    H,W=a.shape
    hl=groups(list(np.where(dark.mean(1)>0.5)[0]))
    rows=[]
    for (t0,t1),(b0,b1) in zip(hl,hl[1:]):
        y0,y1=t1+1,b0
        if y1-y0<15: continue
        vl=groups(list(np.where(dark[y0:y1].mean(0)>0.9)[0]))
        if len(vl)!=26: continue
        cells=[(vl[i][1]+1,vl[i+1][0]) for i in range(len(vl)-1)]
        rows.append((y0,y1,cells))
    return rows

if __name__=="__main__":
    outf=sys.argv[1]
    out=json.load(open(outf)) if os.path.exists(outf) else {}
    for path in sys.argv[2:]:
        if path in out: continue
        rows=process(path)
        tasks=[]; idx=[]
        for r,(y0,y1,cells) in enumerate(rows):
            for i,(x0,x1) in enumerate(cells):
                if kind(i): tasks.append((y0,y1,x0,x1,kind(i))); idx.append((r,i))
        with Pool(4,initializer=init,initargs=(path,)) as p: res=p.map(job,tasks,chunksize=4)
        recs=[[None]*25 for _ in rows]
        for (r,i),v in zip(idx,res): recs[r][i]=v
        # drop header rows
        out[path]=[x for x in recs if re.fullmatch(r"\d{6}",x[0] or "")]
        print(path,len(rows),len(out[path]),flush=True)
        json.dump(out,open(outf,"w"),ensure_ascii=False)
