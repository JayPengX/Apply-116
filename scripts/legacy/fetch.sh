#!/bin/bash
# usage: fetch.sh codesfile outdir
B=https://www.cac.edu.tw/apply116/system/ColQry_116ApplyxForStudent_F75reOza
while read c; do
  f="$2/$c.htm"
  if [ -s "$f" ] && grep -q gsdname "$f"; then continue; fi
  for i in 1 2 3; do
    curl -sSL -m 60 "$B/html/116_$c.htm?v=1.0" -o "$f" && grep -q gsdname "$f" && break
    sleep $((i*5))
  done
  sleep 0.3
done < "$1"
echo done
