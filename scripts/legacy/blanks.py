# Find 檢定/gender cells that hold text but OCR returned nothing; cluster them by shape and save one exemplar per cluster.
import os,sys,json; sys.path.insert(0,os.path.dirname(__file__))
from ocr import process, ocr_cell
import numpy as np
from PIL import Image
from multiprocessing import Pool
def feat(g):
    d=g<110
    if d.sum()<15: return None
    ys,xs=np.where(d)
    if ys.max()-ys.min()<8: return None
    sub=d[ys.min():ys.max()+1, xs.min():xs.max()+1]
    return np.array(Image.fromarray((sub*255).astype(np.uint8)).resize((48,16)))>127
def work(path):
    recs=json.load(open(sys.argv[1]))[path]
    G=np.array(Image.open(path).convert("L")).astype(np.int16)
    rows=process(path); codes=[ocr_cell(G[y0+2:y1-1,c[0][0]+2:c[0][1]-1],"num") for y0,y1,c in rows]
    out=[]; ri=0
    for k,rec in enumerate(recs):
        while ri<len(codes) and codes[ri]!=rec[0]: ri+=1
        if ri>=len(codes): break
        y0,y1,c=rows[ri]; ri+=1
        for col in [1]+list(range(4,11)):
            if rec[col]=="" :
                f=feat(G[y0+2:y1-1,c[col][0]+2:c[col][1]-1])
                if f is not None: out.append((path,k,col,f.tolist(),(int(c[col][0]),int(y0),int(c[col][1]),int(y1))))
    return out
if __name__=="__main__":
    paths=list(json.load(open(sys.argv[1])).keys())
    with Pool(4) as p: res=[x for L in p.map(work,paths) for x in L]
    clusters=[]
    for r in res:
        f=np.array(r[3])
        for cl in clusters:
            if (cl["f"]!=f).mean()<0.08: cl["m"].append(r); break
        else: clusters.append({"f":f,"m":[r]})
    print(len(res),"cells",len(clusters),"clusters")
    ex=Image.new("RGB",(80*len(clusters),40),"white")
    for i,cl in enumerate(clusters):
        p,k,col,_,box=cl["m"][0]; ex.paste(Image.open(p).crop(box),(80*i,0)); print(i,len(cl["m"]),col)
    ex.save(sys.argv[2])
    json.dump([[[m[0],m[1],m[2]] for m in cl["m"]] for cl in clusters],open(sys.argv[3],"w"))
