"""產生 App 圖示（主色底 + 白色的盈餘／赤字長條）。

用法：python tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

PRIMARY = (0, 122, 255)  # #007AFF
WHITE = (255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / 'icons'


def rounded_bar(d, x, w, base, end, r):
    """資料端圓角、基準線直角的長條"""
    top, bottom = (end, base) if end < base else (base, end)
    d.rectangle([x, top, x + w, bottom], fill=WHITE)
    # 用底色把資料端的兩個角挖圓
    if end < base:
        d.rectangle([x, top, x + w, top + r], fill=PRIMARY)
        d.rounded_rectangle([x, top, x + w, top + 2 * r], radius=r, fill=WHITE)
    else:
        d.rectangle([x, bottom - r, x + w, bottom], fill=PRIMARY)
        d.rounded_rectangle([x, bottom - 2 * r, x + w, bottom], radius=r, fill=WHITE)


def draw(size):
    s = 1024
    img = Image.new('RGB', (s, s), PRIMARY)
    d = ImageDraw.Draw(img)
    base = 560
    w = 150
    r = 44
    rounded_bar(d, 232, w, base, 270, r)   # 盈餘（往上）
    rounded_bar(d, 437, w, base, 770, r)   # 赤字（往下）
    rounded_bar(d, 642, w, base, 360, r)   # 盈餘（往上）
    d.rounded_rectangle([200, base - 12, 824, base + 12], radius=12, fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    for size in (180, 192, 512):
        draw(size).save(OUT / f'icon-{size}.png', optimize=True)
        print('icon', size)
