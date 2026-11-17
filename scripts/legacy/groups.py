import subprocess, re, json, time, os, sys, urllib.parse
B="https://www.cac.edu.tw/apply116/system/ColQry_116ApplyxForStudent_F75reOza"
D=sys.argv[1]
def post(url, data):
    for i in range(4):
        r=subprocess.run(["curl","-sSL","-m","60",url,"--data",urllib.parse.urlencode(data)],capture_output=True)
        t=r.stdout.decode("utf-8","replace")
        if r.returncode==0 and "流量過大" not in t: return t
        time.sleep(5*(i+1))
    return t
out={}
for g in "ABCDEFGHIJKLMNOPQRS":
    t=post(B+"/findgsdname.php",{"gcode":g,"query":"x"})
    names=[n.strip() for n in re.findall(r"<option value=([^>]*)>",t)]
    names=[n for n in names if n]
    out[g]={}
    for n in names:
        t2=post(B+"/findgsd.php",{"GsdName":n,"gcode":g,"query":"x"})
        out[g][n]=sorted(set(re.findall(r"116_(\d{6})",t2)))
        time.sleep(0.3)
    print(g,len(names),sum(len(v) for v in out[g].values()),flush=True)
    json.dump(out,open(D+"/groups.json","w"),ensure_ascii=False,indent=0)
