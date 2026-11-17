# Task: verify 115學年度 申請入學 一階篩選標準 table images, cell by cell

The official 甄選會 (CAC) "115學年度大學申請入學招生各校系篩選標準一覽表" exists only as one PNG per school.
A machine OCR pass produced draft rows. Your job: read the images yourself and produce a fully verified transcription.
Accuracy matters more than speed: a student will decide where to apply from these numbers.

Base dir: /tmp/claude-0/-home-user/d2e6ab1c-648f-5dc1-9548-607b028915d0/scratchpad/verify
- Full images: ../dl/sieve115/pict/<school>.png (about 2510 px wide)
- Pre-cut vertical slices (1000 px tall, 80 px overlap, in order): crops/<school>_0.png, _1.png, ...
- OCR draft: in/<school>.json  (rows: code, gender, name, quota, mult, cuts)
- Write your result to: out/<school>.json

## Table layout (一般校系 tables)
Columns left to right: 校系代碼 | 性別要求 | 校系名稱 | 招生名額 | 檢定標準 (國文 英文 數學A 數學B 社會 自然 英聽) |
篩選倍率 (國文 英文 數學A 數學B 社會 自然 學測科目組合) | 通過倍率篩選最低級分 (篩選順序一 … 篩選順序六) | 同級分超額篩選.
"--" means empty. Some schools also have other table types further down (e.g. 術科 tables for music/arts/sports, with extra 術科 columns). Include those rows too; put any 術科-related screening in "cuts" exactly as printed and say so in "note".

## Output format: out/<school>.json
A JSON array, one object per table row, in the order they appear in the image:
{"code":"001012","gender":"無","name":"中國文學系","quota":23,
 "mult":{"國":"3","英":"6","社":"8"},            // only non-empty 篩選倍率 cells; key 組合 for 學測科目組合
 "cuts":["社會10","英文10","國文15"],             // 篩選順序一..六 in order, exactly as printed, skip "--"
 "table":"一般",                                  // or a short label for other table types
 "note":""}                                       // anything unusual (e.g. "術科 主修 均標", cell unreadable)
Copy text exactly as printed, including parentheses and plus signs, e.g. "(國文+社會)28", "國英數B社52".
Use half-width digits/letters. Rows split by gender (男/女) are separate objects.

## How to work
1. For each school: look at every slice with the Read tool (slices are wide; if a cell is hard to read, crop and enlarge it with python3 + PIL into a file in your own temp folder, e.g. /tmp/verify_<school>_*.png, and Read that).
2. Compare every row with the OCR draft. The draft is often right, but it has misread digits (e.g. 5.5 vs 3.5, 8 vs S), mangled names, and it is MISSING rows from non-standard tables. Do not trust the draft: every number in your output must be one you read in the image.
3. Every code, quota, 倍率 and cut value must be checked. Where the draft and your reading differ, zoom in on that cell and decide; add "note":"draft said X" for those.
4. Rows at slice boundaries appear twice in the overlap; output them once.
5. Write out/<school>.json for each school as soon as it is done (valid JSON, UTF-8, ensure_ascii False). Validate with: python3 -c "import json;json.load(open('out/<school>.json'))"
6. Do not modify anything outside out/ and your own /tmp files. Do not use the network.

When finished, reply with: schools done, row count per school, how many cells you corrected versus the draft, and any cell you could not read with certainty (code + column).
