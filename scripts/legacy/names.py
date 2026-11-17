# OCR the 115 department name + quota cells, and retry empty cutoff cells that contain text.
import os; os.environ["OMP_THREAD_LIMIT"]="1"
import sys,json,re; sys.path.insert(0,os.path.dirname(__file__))
from ocr import process, ocr_cell
import numpy as np
from PIL import Image
import pytesseract
from multiprocessing import Pool
def retry(g):
    d=g<110
    if d.sum()<15: return ""
    ys,xs=np.where(d)
    if ys.max()-ys.min()<8: return "--"
    sub=g[max(ys.min()-10,0):ys.max()+11, max(xs.min()-10,0):xs.max()+11]
    im=Image.fromarray(sub.astype(np.uint8)); im=im.resize((im.width*2,im.height*2),Image.LANCZOS)
    for psm in ("7","6","13"):
        t=re.sub(r"\s+","",pytesseract.image_to_string(im,lang="chi_tra",config="--psm "+psm))
        if t: return t
    return "?"
def work(path):
    recs=json.load(open(sys.argv[1]))[path]
    G=np.array(Image.open(path).convert("L")).astype(np.int16)
    rows=process(path); codes=[ocr_cell(G[y0+2:y1-1,c[0][0]+2:c[0][1]-1],"num") for y0,y1,c in rows]
    out={}; ri=0
    for k,rec in enumerate(recs):
        while ri<len(codes) and codes[ri]!=rec[0]: ri+=1
        if ri>=len(codes): break
        y0,y1,c=rows[ri]; ri+=1
        cell=lambda col: G[y0+2:y1-1,c[col][0]+2:c[col][1]-1]
        e={"name":ocr_cell(cell(2),"zh"),"quota":ocr_cell(cell(3),"num")}
        for col in range(18,24):
            if not rec[col]: e[col]=retry(cell(col))
        out[k]=e
    return path,out
if __name__=="__main__":
    paths=list(json.load(open(sys.argv[1])).keys())
    with Pool(4) as p: res=dict(p.map(work,paths))
    json.dump(res,open(sys.argv[2],"w"),ensure_ascii=False)
