"""把衛福部「食品營養成分資料集」CSV 轉成 App 用的精簡 JSON。

資料來源：https://data.fda.gov.tw/opendata/exportDataList.do?method=ExportData&InfoId=20&logType=2
（下載後是 zip，裡面的 20_2.csv 就是輸入檔）

用法：python tools/build_foods.py 20_2.csv data/foods.json
"""
import csv
import json
import re
import sys

KCAL_KEYS = ('修正熱量', '熱量')  # 優先用修正熱量（與營養標示算法一致）


def num(s):
    s = (s or '').strip()
    try:
        return float(s)
    except ValueError:
        return None


def main(src, dst):
    foods = {}
    with open(src, encoding='utf-8-sig', newline='') as f:
        r = csv.DictReader(f)
        for row in r:
            fid = row['整合編號']
            food = foods.setdefault(fid, {
                'name': row['樣品名稱'].strip(),
                'alias': row['俗名'].strip(),
                'cat': row['食品分類'].strip(),
                'avg': row['資料類別'].strip() == '樣品平均值',
                'unit': None,
                'n': {},
            })
            food['n'][row['分析項']] = num(row['每100克含量'])
            m = re.match(r'([\d.]+)', row['每單位重'] or '')
            if m and float(m.group(1)) > 0:
                food['unit'] = float(m.group(1))

    entries = []
    monthly = {}
    for fid, food in sorted(foods.items()):
        n = food['n']
        kcal = next((n[k] for k in KCAL_KEYS if n.get(k) is not None), None)
        if kcal is None:
            continue
        e = {**food, 'kcal': kcal, 'protein': n.get('粗蛋白') or 0, 'carb': n.get('總碳水化合物') or 0}
        m = re.match(r'(.+)\(\d+月取樣\)$', food['name'])
        if m:
            monthly.setdefault(m.group(1), []).append(e)
        else:
            entries.append(e)

    # 各月份取樣：已有「平均值」那筆就略過；沒有的話合併成一筆平均
    names = {e['name'] for e in entries}
    for base, group in monthly.items():
        if any(nm.startswith(base.split('(')[0]) and '平均值' in nm for nm in names):
            continue
        units = [g['unit'] for g in group if g['unit']]
        entries.append({
            'name': base, 'alias': group[0]['alias'], 'cat': group[0]['cat'],
            'unit': sum(units) / len(units) if units else None,
            'kcal': sum(g['kcal'] for g in group) / len(group),
            'protein': sum(g['protein'] for g in group) / len(group),
            'carb': sum(g['carb'] for g in group) / len(group),
        })

    cats = []
    out = []
    for e in entries:
        if e['cat'] not in cats:
            cats.append(e['cat'])
        unit = round(e['unit']) if e['unit'] else 0
        out.append([e['name'], e['alias'], round(e['kcal']), round(e['protein'], 1), round(e['carb'], 1), unit, cats.index(e['cat'])])

    with open(dst, 'w', encoding='utf-8') as f:
        json.dump({
            'source': '衛生福利部食品藥物管理署 食品營養成分資料集',
            'fields': ['name', 'alias', 'kcal', 'protein', 'carb', 'unitGrams', 'cat'],
            'cats': cats,
            'foods': out,
        }, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(out)} foods, {len(cats)} categories -> {dst}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
