"""リールの表紙（サムネイル）cover.png を作る。カレントは days/YYYY-MM-DD。
グリッドでは中央の 1080x1440（上下240pxずつ切れる）しか見えないので、文字はその中に収める。
script.json の cover（任意）: {"big": 大きな名前, "sub": 名前の下の一言（\nで改行位置を決める）, "shot": 使う画面}。無ければ service / hook / 最初の shot。"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
NAVY, YELLOW, RED, WHITE = (11, 21, 48), (255, 212, 59), (232, 66, 58), (255, 255, 255)
FONT = str(Path(__file__).resolve().parent / "template" / "fonts" / "NotoSansJP-VF.ttf")

def font(path, size, weight=900):
    f = ImageFont.truetype(path, size)
    f.set_variation_by_axes([weight])
    return f

def wrap(text, measure, width):
    """measure(s) で幅を測り、width に収まるように1行ずつ区切る。"""
    lines, cur = [], ""
    for ch in text:
        if cur and measure(cur + ch) > width:
            lines.append(cur); cur = ch
        else:
            cur += ch
    return lines + ([cur] if cur else [])

def center_text(d, y, text, f, fill, stroke=0):
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=fill, stroke_width=stroke, stroke_fill=NAVY)

def make_cover(S, day: Path, font_path=FONT) -> Path:
    c = S.get("cover", {})
    big, sub = c.get("big", S["service"]), c.get("sub", S["hook"])
    shot = c.get("shot") or next((l["shot"] for l in S["lines"] if l.get("fx") == "shot"), None)
    im = Image.new("RGB", (W, H), NAVY)
    glow = Image.new("RGB", (W, H), NAVY)
    ImageDraw.Draw(glow).ellipse((-200, 500, W + 200, 1500), fill=(30, 70, 150))
    im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(160)), 0.9)
    d = ImageDraw.Draw(im)

    # 画面（公式サイト）を下半分に少し傾けて置く
    p = day / "shots" / f"{shot}.png" if shot else None
    if p and p.exists():
        s = Image.open(p).convert("RGB")
        s.thumbnail((760, 560))
        card = Image.new("RGBA", (s.width + 24, s.height + 24), WHITE); card.paste(s, (12, 12))
        card = card.rotate(-4, expand=True, fillcolor=(0, 0, 0, 0), resample=Image.BICUBIC)
        im.paste(card, ((W - card.width) // 2, 1080), card)

    # 赤ラベル
    lf = font(font_path, 44, 800)
    label = "新サービス｜使う前に30秒"
    lw = d.textlength(label, font=lf)
    d.rounded_rectangle(((W - lw) / 2 - 34, 290, (W + lw) / 2 + 34, 362), 36, fill=RED)
    center_text(d, 296, label, lf, WHITE)

    # 大きな名前（幅に合わせて縮める）
    size = 220
    while size > 90 and d.textlength(big, font=font(font_path, size)) > W - 100:
        size -= 10
    bf = font(font_path, size)
    center_text(d, 400, big, bf, WHITE, stroke=6)
    y = 400 + int(size * 1.35)

    # 結論の一言（黄色、2行まで）
    hf = font(font_path, 88)
    lines = [l for part in sub.split("\n") for l in wrap(part, lambda s: d.textlength(s, font=hf), W - 120)]
    for line in lines[:2]:
        center_text(d, y, line, hf, YELLOW, stroke=5)
        y += 112

    out = day / "cover.png"
    im.save(out)
    return out

if __name__ == "__main__":
    day = Path(".").resolve()
    print(make_cover(json.load(open(day / "script.json", encoding="utf-8")), day))
