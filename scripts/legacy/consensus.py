# Re-crop cells, cluster identical-looking cells, and replace each cell's OCR text with its cluster's majority text.
import os; os.environ["OMP_THREAD_LIMIT"]="1"
import sys, json, re, collections
import numpy as np
from PIL import Image
sys.path.insert(0,os.path.dirname(__file__))
from ocr import process, ocr_cell
import pytesseract

def feat(g):
    d=g<110
    if d.sum()<15: return None
    ys,xs=np.where(d)
    sub=d[ys.min():ys.max()+1, xs.min():xs.max()+1]
    h,w=sub.shape
    im=Image.fromarray((sub*255).astype(np.uint8)).resize((48,16))
    return (h,w,np.array(im)>127)

ocr=json.load(open(sys.argv[1]))
CONS_COLS=[1]+list(range(4,11))
out={}
allcells=collections.defaultdict(list)  # col -> list of (path,ri,feat,text)
for path,recs in ocr.items():
    G=np.array(Image.open(path).convert("L")).astype(np.int16)
    rows=process(path)
    # assign records to rows: read code cell with tesseract
    codes=[]
    for y0,y1,cells in rows:
        x0,x1=cells[0]
        codes.append(ocr_cell(G[y0+2:y1-1,x0+2:x1-1],"num"))
    ri=0; mapped=[]
    for rec in recs:
        while ri<len(codes) and codes[ri]!=rec[0]: ri+=1
        if ri>=len(codes): mapped.append(None); continue
        mapped.append(ri); ri+=1
    out[path]=recs
    for k,(rec,r) in enumerate(zip(recs,mapped)):
        if r is None: continue
        y0,y1,cells=rows[r]
        for c in CONS_COLS:
            x0,x1=cells[c]
            f=feat(G[y0+2:y1-1,x0+2:x1-1])
            if f is not None: allcells[c].append((path,k,f,rec[c]))
    print(path,sum(m is None for m in mapped),"unmapped",flush=True)

changes=0
for c,items in allcells.items():
    # group by size then cluster greedily
    clusters=[]
    for it in items:
        h,w,b=it[2]
        for cl in clusters:
            H,W,B=cl["f"]
            if abs(H-h)<=2 and abs(W-w)<=3 and (B!=b).mean()<0.04:
                cl["m"].append(it); break
        else: clusters.append({"f":it[2],"m":[it]})
    for cl in clusters:
        cnt=collections.Counter(x[3] for x in cl["m"])
        best,n=cnt.most_common(1)[0]
        if n<2 or len(cl["m"])<3: continue
        for path,k,_,t in cl["m"]:
            if t!=best:
                out[path][k][c]=best; changes+=1
    print("col",c,"clusters",len(clusters),flush=True)
print("changes",changes)
json.dump(out,open(sys.argv[2],"w"),ensure_ascii=False)
